/**
 * Plugin de autenticacao e autorizacao do Fastify.
 *
 * Substitui a repeticao de `if (!user) return 401` espalhada pelo servidor atual
 * por um hook unico. A rota declara o que exige; o hook verifica antes de
 * qualquer handler rodar.
 *
 * Diferenca central em relacao a base atual: aqui a rota e negada por omissao.
 * Uma rota que esqueca de declarar `publica: true` exige sessao — o esquecimento
 * falha fechado, nao aberto.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { naoAutenticado, naoAutorizado } from '../errors.js';
import { resolverSessao, type UsuarioAutenticado } from '../auth/sessoes.js';
import { CABECALHO_APP, lerCookie } from '../auth/cookie.js';
import {
  carregarContexto,
  exigirModulo,
  type ContextoAutorizacao,
} from '../rbac/autorizacao.js';
import type { AcaoPermissao, ModuloPlataforma } from '../db/schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuario: UsuarioAutenticado | null;
    autorizacao: ContextoAutorizacao | null;
    /** Como a sessao chegou. Cookie exige protecao contra CSRF; Bearer nao. */
    origemSessao: 'cabecalho' | 'cookie' | null;
    /** Dados de contexto para a trilha de auditoria. */
    contextoAuditoria: {
      usuarioId: string | null;
      usuarioNome: string | null;
      perfil: UsuarioAutenticado['perfil'] | null;
      sessaoId: string | null;
      enderecoIp: string | null;
      agenteUsuario: string | null;
    };
  }
  interface FastifyContextConfig {
    /** Rota acessivel sem sessao. Precisa ser declarado explicitamente. */
    publica?: boolean;
    /** Modulo e acao exigidos. Verificados antes do handler. */
    exige?: { modulo: ModuloPlataforma; acao: AcaoPermissao };
  }
}

/**
 * Extrai o token: primeiro do cabecalho, depois do cookie httpOnly.
 *
 * A ordem importa. Uma integracao que mande Bearer explicitamente nao deve ter
 * o token trocado pelo cookie que o navegador anexou por conta propria.
 */
function extrairToken(req: FastifyRequest): { token: string; origem: 'cabecalho' | 'cookie' } | null {
  const cabecalho = req.headers.authorization;
  if (cabecalho) {
    const [esquema, valor] = cabecalho.split(' ');
    if (valor && esquema?.toLowerCase() === 'bearer' && valor.trim()) {
      return { token: valor.trim(), origem: 'cabecalho' };
    }
  }

  const doCookie = lerCookie(req);
  return doCookie ? { token: doCookie, origem: 'cookie' } : null;
}

/** Metodos que nao alteram estado dispensam a protecao contra CSRF. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function preencherContexto(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  req.usuario = null;
  req.autorizacao = null;
  req.origemSessao = null;

  const enderecoIp = req.ip ?? null;
  const agenteUsuario = req.headers['user-agent'] ?? null;

  const credencial = extrairToken(req);
  const usuario = await resolverSessao(credencial?.token ?? null);

  req.contextoAuditoria = {
    usuarioId: usuario?.id ?? null,
    usuarioNome: usuario?.nome ?? null,
    perfil: usuario?.perfil ?? null,
    sessaoId: usuario?.sessaoId ?? null,
    enderecoIp,
    agenteUsuario: typeof agenteUsuario === 'string' ? agenteUsuario : null,
  };

  if (!usuario) return;

  req.usuario = usuario;
  req.origemSessao = credencial?.origem ?? null;
  req.autorizacao = await carregarContexto(usuario.id, usuario.perfil, usuario.area);
}

async function verificarAcesso(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const config = req.routeOptions?.config ?? {};

  if (config.publica === true) return;

  // Os arquivos estaticos da interface (HTML, JS, CSS) sao publicos: sao a
  // casca, e nao contem dado nenhum. Exigir sessao para baixa-los impediria a
  // propria tela de login de carregar. O que exige sessao e /api — e e ali que
  // os dados estao.
  //
  // A regra e por prefixo, e nao por lista de arquivos: qualquer rota nova
  // sob /api continua negada por omissao.
  if (!req.url.startsWith('/api/') && METODOS_SEGUROS.has(req.method)) return;

  if (!req.usuario || !req.autorizacao) {
    throw naoAutenticado();
  }

  // CSRF: quando a sessao veio do cookie, o navegador a anexa sozinho — e um
  // formulario hospedado em outro site tambem consegue disparar a requisicao.
  // O que ele NAO consegue e definir um cabecalho proprio sem passar pela
  // verificacao de origem. Exigir o cabecalho nas escritas fecha esse caminho.
  if (req.origemSessao === 'cookie' && !METODOS_SEGUROS.has(req.method)) {
    if (req.headers[CABECALHO_APP] !== '1') {
      throw naoAutorizado(
        'Requisicao de escrita sem identificacao de origem da aplicacao.',
        { cabecalho: CABECALHO_APP },
      );
    }
  }

  if (config.exige) {
    exigirModulo(req.autorizacao, config.exige.modulo, config.exige.acao);
  }
}

export const pluginAutenticacao = fp(
  async (app: FastifyInstance) => {
    // Decorar com null reserva o campo no objeto de requisicao (evita
    // deoptimizacao). O valor real e preenchido no hook onRequest, antes de
    // qualquer handler. O cast existe porque a sobrecarga tipada de
    // decorateRequest nao aceita null diretamente.
    app.decorateRequest('usuario', null as never);
    app.decorateRequest('autorizacao', null as never);
    app.decorateRequest('origemSessao', null as never);
    app.decorateRequest('contextoAuditoria', null as never);

    // Resolve a sessao para todas as rotas, inclusive as publicas: o login
    // precisa saber o IP, e a trilha precisa do contexto mesmo em falha.
    app.addHook('onRequest', preencherContexto);
    // Verifica o acesso depois, ja com o contexto carregado.
    app.addHook('onRequest', verificarAcesso);
  },
  { name: 'autenticacao' },
);
