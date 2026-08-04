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
import { naoAutenticado } from '../errors.js';
import { resolverSessao, type UsuarioAutenticado } from '../auth/sessoes.js';
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

/** Extrai o token do cabecalho Authorization: Bearer <token>. */
function extrairToken(req: FastifyRequest): string | null {
  const cabecalho = req.headers.authorization;
  if (!cabecalho) return null;
  const [esquema, valor] = cabecalho.split(' ');
  if (!valor || esquema?.toLowerCase() !== 'bearer') return null;
  return valor.trim() || null;
}

async function preencherContexto(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  req.usuario = null;
  req.autorizacao = null;

  const enderecoIp = req.ip ?? null;
  const agenteUsuario = req.headers['user-agent'] ?? null;

  const usuario = await resolverSessao(extrairToken(req));

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
  req.autorizacao = await carregarContexto(usuario.id, usuario.perfil, usuario.area);
}

async function verificarAcesso(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const config = req.routeOptions?.config ?? {};

  if (config.publica === true) return;

  if (!req.usuario || !req.autorizacao) {
    throw naoAutenticado();
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
    app.decorateRequest('contextoAuditoria', null as never);

    // Resolve a sessao para todas as rotas, inclusive as publicas: o login
    // precisa saber o IP, e a trilha precisa do contexto mesmo em falha.
    app.addHook('onRequest', preencherContexto);
    // Verifica o acesso depois, ja com o contexto carregado.
    app.addHook('onRequest', verificarAcesso);
  },
  { name: 'autenticacao' },
);
