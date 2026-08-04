/**
 * Rotas de autenticacao.
 *
 * Correcoes em relacao ao code-drop paralelo:
 *   - resposta e tempo identicos para usuario inexistente e senha errada
 *     (elimina a enumeracao de usuario de server.js:369)
 *   - limite de tentativas por conta e por origem
 *   - troca de senha encerra todas as outras sessoes
 *   - token de recuperacao no banco, com hash e uso unico
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { entradaInvalida, ErroApi, naoAutenticado } from '../errors.js';
import { auditar } from '../audit/registrar.js';
import {
  consumirTempoVerificacao,
  gerarHashSenha,
  validarForcaSenha,
  verificarSenha,
} from './senha.js';
import {
  criarSessao,
  listarSessoesAtivas,
  revogarSessao,
  revogarSessoesDoUsuario,
} from './sessoes.js';
import { limparFalhas, registrarTentativa, verificarLimite } from './tentativas.js';
import { cookieDeRemocao, montarCookie } from './cookie.js';

const MENSAGEM_CREDENCIAL = 'Usuario ou senha incorretos.';

const esquemaLogin = z.object({
  usuario: z.string().min(1).max(64),
  senha: z.string().min(1).max(256),
});

const esquemaTrocaSenha = z.object({
  senha_atual: z.string().min(1).max(256),
  senha_nova: z.string().min(1).max(256),
});

const esquemaSolicitarRecuperacao = z.object({
  usuario: z.string().min(1).max(64),
});

const esquemaAplicarRecuperacao = z.object({
  token: z.string().min(20).max(200),
  senha_nova: z.string().min(1).max(256),
});

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function rotasAutenticacao(app: FastifyInstance): Promise<void> {
  // ── Login ─────────────────────────────────────────────────────────────────
  app.post('/api/auth/login', { config: { publica: true } }, async (req, reply) => {
    const corpo = esquemaLogin.safeParse(req.body);
    if (!corpo.success) {
      throw entradaInvalida('Informe usuario e senha.');
    }

    const usuarioInformado = corpo.data.usuario.trim().toLowerCase();
    const ip = req.contextoAuditoria.enderecoIp;

    const limite = await verificarLimite(usuarioInformado, ip);
    if (!limite.permitido) {
      await auditar({
        ...req.contextoAuditoria,
        acao: 'login_negado',
        resultado: 'negado',
        detalhe: { usuario: usuarioInformado, motivo: 'excesso_de_tentativas', ...limite },
      });
      reply.header('Retry-After', String(limite.esperarSegundos));
      throw new ErroApi(
        'excesso_de_tentativas',
        `Muitas tentativas. Tente novamente em ${limite.esperarSegundos} segundos.`,
        { esperar_segundos: limite.esperarSegundos },
      );
    }

    const usuario = await db
      .selectFrom('usuarios')
      .select([
        'id',
        'usuario',
        'nome',
        'perfil',
        'area',
        'status',
        'hash_senha',
        'acesso_expira_em',
      ])
      .where('usuario', '=', usuarioInformado)
      .executeTakeFirst();

    // Usuario inexistente consome o mesmo tempo de uma verificacao real e
    // devolve a mesma mensagem. Sem isso, o tempo de resposta revela quais
    // contas existem.
    if (!usuario) {
      await consumirTempoVerificacao();
      await registrarTentativa(usuarioInformado, ip, false);
      await auditar({
        ...req.contextoAuditoria,
        acao: 'login_negado',
        resultado: 'negado',
        detalhe: { usuario: usuarioInformado, motivo: 'usuario_inexistente' },
      });
      throw new ErroApi('credenciais_invalidas', MENSAGEM_CREDENCIAL);
    }

    const { ok, precisaRehash } = await verificarSenha(corpo.data.senha, usuario.hash_senha);

    if (!ok) {
      await registrarTentativa(usuarioInformado, ip, false);
      await auditar({
        ...req.contextoAuditoria,
        acao: 'login_negado',
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        perfil: usuario.perfil,
        resultado: 'negado',
        detalhe: { motivo: 'senha_incorreta' },
      });
      throw new ErroApi('credenciais_invalidas', MENSAGEM_CREDENCIAL);
    }

    // Conta valida mas sem acesso: mensagem propria, porque aqui a pessoa ja
    // provou ser quem diz — nao ha o que enumerar.
    if (usuario.status !== 'ativo') {
      await registrarTentativa(usuarioInformado, ip, false);
      await auditar({
        ...req.contextoAuditoria,
        acao: 'login_negado',
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        perfil: usuario.perfil,
        resultado: 'negado',
        detalhe: { motivo: `status_${usuario.status}` },
      });
      throw new ErroApi(
        'credenciais_invalidas',
        usuario.status === 'pendente'
          ? 'Seu acesso ainda nao foi liberado. Procure a administracao.'
          : 'Seu acesso esta inativo. Procure a administracao.',
      );
    }

    if (usuario.acesso_expira_em && new Date(usuario.acesso_expira_em) <= new Date()) {
      await registrarTentativa(usuarioInformado, ip, false);
      throw new ErroApi('credenciais_invalidas', 'Seu acesso de convidado venceu.');
    }

    // Endurecimento de custo ao longo do tempo, sem invalidar ninguem.
    if (precisaRehash) {
      const { hash, algoritmo } = await gerarHashSenha(corpo.data.senha);
      await db
        .updateTable('usuarios')
        .set({ hash_senha: hash, algoritmo_senha: algoritmo })
        .where('id', '=', usuario.id)
        .execute();
    }

    const sessao = await criarSessao(usuario.id, {
      enderecoIp: ip,
      agenteUsuario: req.contextoAuditoria.agenteUsuario,
    });

    await Promise.all([
      registrarTentativa(usuarioInformado, ip, true),
      limparFalhas(usuarioInformado, ip),
      db
        .updateTable('usuarios')
        .set({ ultimo_acesso_em: new Date() })
        .where('id', '=', usuario.id)
        .execute(),
      auditar({
        ...req.contextoAuditoria,
        acao: 'login',
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        perfil: usuario.perfil,
        sessaoId: sessao.sessaoId,
      }),
    ]);

    // A interface usa o cookie httpOnly e nunca ve o token. O token no corpo
    // continua para integracoes e testes, que nao tem navegador para guardar
    // cookie — nao e o caminho da SPA.
    reply.header('Set-Cookie', montarCookie(sessao.token, sessao.expiraEm));

    return {
      token: sessao.token,
      expira_em: sessao.expiraEm.toISOString(),
      usuario: {
        id: usuario.id,
        usuario: usuario.usuario,
        nome: usuario.nome,
        perfil: usuario.perfil,
        area: usuario.area,
      },
    };
  });

  // ── Quem sou eu ───────────────────────────────────────────────────────────
  app.get('/api/auth/eu', async (req) => {
    const ctx = req.autorizacao;
    if (!req.usuario || !ctx) throw naoAutenticado();

    return {
      usuario: {
        id: req.usuario.id,
        usuario: req.usuario.usuario,
        nome: req.usuario.nome,
        perfil: req.usuario.perfil,
        area: req.usuario.area,
      },
      // O cliente usa isto para montar o menu. A decisao real acontece no
      // servidor a cada requisicao — isto e apresentacao, nao autorizacao.
      permissoes: [...ctx.permissoes],
      escopo: {
        areas: [...ctx.areas],
        todos_empreendimentos: ctx.todosEmpreendimentos,
        empreendimentos: [...ctx.empreendimentos],
        ve_documento_completo: ctx.tiposCompletos.has('dado_pessoal') || req.usuario.perfil === 'gestora',
      },
    };
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  app.post('/api/auth/logout', async (req, reply) => {
    if (!req.usuario) throw naoAutenticado();

    await revogarSessao(req.usuario.sessaoId, {
      motivo: 'logout',
      porUsuarioId: req.usuario.id,
    });
    await auditar({ ...req.contextoAuditoria, acao: 'logout' });

    reply.header('Set-Cookie', cookieDeRemocao());
    return { encerrada: true };
  });

  // ── Sessoes ativas ────────────────────────────────────────────────────────
  app.get('/api/auth/sessoes', async (req) => {
    if (!req.usuario) throw naoAutenticado();

    const sessoes = await listarSessoesAtivas(req.usuario.id);
    return {
      sessoes: sessoes.map((s) => ({
        id: s.id,
        atual: s.id === req.usuario!.sessaoId,
        criada_em: s.criada_em,
        ultima_atividade: s.ultima_atividade,
        expira_em: s.expira_em,
        endereco_ip: s.endereco_ip,
        agente_usuario: s.agente_usuario,
      })),
    };
  });

  app.delete<{ Params: { id: string } }>('/api/auth/sessoes/:id', async (req) => {
    if (!req.usuario) throw naoAutenticado();

    // Encerrar sessao alheia exige administrar a base; a propria, nao.
    const alvo = await db
      .selectFrom('sessoes')
      .select(['id', 'usuario_id'])
      .where('id', '=', req.params.id)
      .executeTakeFirst();

    if (!alvo || alvo.usuario_id !== req.usuario.id) {
      // Nao revela a existencia de sessao de outra pessoa.
      throw new ErroApi('nao_encontrado', 'Sessao nao encontrada.');
    }

    await revogarSessao(alvo.id, { motivo: 'encerrada_pelo_usuario', porUsuarioId: req.usuario.id });
    await auditar({
      ...req.contextoAuditoria,
      acao: 'sessao_revogada',
      recurso: 'sessoes',
      recursoId: alvo.id,
    });

    return { encerrada: true };
  });

  // ── Troca de senha ────────────────────────────────────────────────────────
  app.post('/api/auth/senha', async (req) => {
    if (!req.usuario) throw naoAutenticado();

    const corpo = esquemaTrocaSenha.safeParse(req.body);
    if (!corpo.success) throw entradaInvalida('Informe a senha atual e a nova senha.');

    const forca = validarForcaSenha(corpo.data.senha_nova);
    if (!forca.ok) throw entradaInvalida(forca.motivo!);

    const atual = await db
      .selectFrom('usuarios')
      .select(['id', 'hash_senha'])
      .where('id', '=', req.usuario.id)
      .executeTakeFirstOrThrow();

    const { ok } = await verificarSenha(corpo.data.senha_atual, atual.hash_senha);
    if (!ok) {
      throw new ErroApi('credenciais_invalidas', 'A senha atual esta incorreta.');
    }

    if (corpo.data.senha_atual === corpo.data.senha_nova) {
      throw entradaInvalida('A nova senha precisa ser diferente da atual.');
    }

    const { hash, algoritmo } = await gerarHashSenha(corpo.data.senha_nova);

    await db
      .updateTable('usuarios')
      .set({ hash_senha: hash, algoritmo_senha: algoritmo, senha_alterada_em: new Date() })
      .where('id', '=', req.usuario.id)
      .execute();

    // A correcao central: trocar a senha encerra as outras sessoes. A sessao
    // atual e mantida para nao expulsar quem acabou de trocar.
    const encerradas = await revogarSessoesDoUsuario(req.usuario.id, {
      motivo: 'senha_alterada',
      porUsuarioId: req.usuario.id,
      exceto: req.usuario.sessaoId,
    });

    await auditar({
      ...req.contextoAuditoria,
      acao: 'senha_alterada',
      detalhe: { sessoes_encerradas: encerradas },
    });

    return { alterada: true, sessoes_encerradas: encerradas };
  });

  // ── Recuperacao de senha ──────────────────────────────────────────────────
  app.post('/api/auth/recuperacao', { config: { publica: true } }, async (req) => {
    const corpo = esquemaSolicitarRecuperacao.safeParse(req.body);
    if (!corpo.success) throw entradaInvalida('Informe o usuario.');

    const usuarioInformado = corpo.data.usuario.trim().toLowerCase();

    const usuario = await db
      .selectFrom('usuarios')
      .select(['id', 'nome', 'status'])
      .where('usuario', '=', usuarioInformado)
      .executeTakeFirst();

    // Resposta identica exista ou nao a conta: nao serve para descobrir usuarios.
    const resposta = {
      solicitado: true,
      mensagem: 'Se o usuario existir, a administracao sera acionada para liberar a troca de senha.',
    };

    if (!usuario || usuario.status === 'inativo') return resposta;

    const token = randomBytes(32).toString('base64url');
    await db
      .insertInto('tokens_recuperacao')
      .values({
        usuario_id: usuario.id,
        hash_token: hashToken(token),
        expira_em: new Date(Date.now() + 3_600_000),
      })
      .execute();

    await auditar({
      ...req.contextoAuditoria,
      acao: 'senha_recuperada',
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      detalhe: { etapa: 'token_emitido' },
    });

    // Envio de e-mail nao faz parte da Fase 1. Em development o token e
    // devolvido para permitir testar o fluxo ponta a ponta; em qualquer outro
    // ambiente ele so existe no banco, para a administracao entregar.
    return config.ambiente === 'development' ? { ...resposta, token_debug: token } : resposta;
  });

  app.post('/api/auth/recuperacao/aplicar', { config: { publica: true } }, async (req) => {
    const corpo = esquemaAplicarRecuperacao.safeParse(req.body);
    if (!corpo.success) throw entradaInvalida('Informe o token e a nova senha.');

    const forca = validarForcaSenha(corpo.data.senha_nova);
    if (!forca.ok) throw entradaInvalida(forca.motivo!);

    const hash = hashToken(corpo.data.token);
    const registro = await db
      .selectFrom('tokens_recuperacao as t')
      .innerJoin('usuarios as u', 'u.id', 't.usuario_id')
      .select(['t.id as token_id', 't.hash_token', 't.expira_em', 't.usado_em', 'u.id as usuario_id', 'u.nome'])
      .where('t.hash_token', '=', hash)
      .executeTakeFirst();

    const invalido = new ErroApi('entrada_invalida', 'Token invalido ou vencido.');

    if (!registro) throw invalido;
    const a = Buffer.from(registro.hash_token, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw invalido;
    if (registro.usado_em) throw invalido;
    if (new Date(registro.expira_em) <= new Date()) throw invalido;

    const { hash: hashSenha, algoritmo } = await gerarHashSenha(corpo.data.senha_nova);

    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('tokens_recuperacao')
        .set({ usado_em: new Date() })
        .where('id', '=', registro.token_id)
        .execute();

      await trx
        .updateTable('usuarios')
        .set({
          hash_senha: hashSenha,
          algoritmo_senha: algoritmo,
          senha_alterada_em: new Date(),
          // Recuperacao tambem serve de primeiro acesso: libera o cadastro.
          status: 'ativo',
        })
        .where('id', '=', registro.usuario_id)
        .execute();
    });

    // Recuperacao encerra TODAS as sessoes, inclusive as de quem tenha entrado
    // com a senha antiga.
    const encerradas = await revogarSessoesDoUsuario(registro.usuario_id, {
      motivo: 'senha_recuperada',
    });

    await auditar({
      ...req.contextoAuditoria,
      acao: 'senha_recuperada',
      usuarioId: registro.usuario_id,
      usuarioNome: registro.nome,
      detalhe: { etapa: 'senha_aplicada', sessoes_encerradas: encerradas },
    });

    return { alterada: true, sessoes_encerradas: encerradas };
  });
}
