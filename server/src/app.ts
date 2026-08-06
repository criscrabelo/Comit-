/**
 * Montagem da aplicacao.
 *
 * Correcoes estruturais em relacao ao server.js atual:
 *   - CORS por lista de origens, nunca "*" (server.js:84)
 *   - limite de tamanho de corpo por rota (ausente no code-drop)
 *   - limite de requisicoes por origem
 *   - formato uniforme de erro, sem vazar rastro de pilha
 *   - toda rota exige sessao por omissao (ver plugins/autenticacao.ts)
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import estaticos from '@fastify/static';
import { config } from './config.js';
import { logger } from './logging.js';
import { ErroApi } from './errors.js';
import { verificarBanco } from './db/pool.js';
import { pluginAutenticacao } from './plugins/autenticacao.js';
import { rotasAutenticacao } from './auth/rotas.js';
import { rotasInconsistencias } from './inconsistencias/rotas.js';
import { rotasMonday } from './integracoes/monday/rotas.js';
import { rotasSienge } from './integracoes/sienge/rotas.js';
import { rotasMigracao } from './migracao/rotas.js';
import { rotasDados } from './dados/rotas.js';
import { rotasBackup } from './backup/rotas.js';

/** 1 MiB cobre com folga qualquer carga legitima da API. */
const TAMANHO_MAXIMO_CORPO = 1_048_576;

export async function criarApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // O tipo concreto do pino parametriza FastifyInstance e faz o tipo de
    // retorno divergir do FastifyInstance padrao usado nas assinaturas. O
    // logger em si e o mesmo — apenas o tipo e alargado.
    loggerInstance: logger as unknown as FastifyBaseLogger,
    bodyLimit: TAMANHO_MAXIMO_CORPO,
    trustProxy: config.ehProducao,
    disableRequestLogging: false,
    ajv: { customOptions: { removeAdditional: 'all', coerceTypes: true } },
  });

  await app.register(cors, {
    origin: config.corsOrigens.length > 0 ? config.corsOrigens : config.ambiente === 'development',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // O limite de login e mais rigoroso e vive em auth/tentativas.ts, porque
    // precisa contar por conta, nao apenas por origem.
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({
      erro: {
        codigo: 'excesso_de_tentativas',
        mensagem: 'Muitas requisicoes. Aguarde um instante.',
        detalhe: {},
      },
    }),
  });

  // Os tratadores de erro sao registrados ANTES das rotas: em Fastify, o
  // contexto de um plugin e montado no momento do register, e um tratador
  // definido depois nao alcanca os contextos ja criados. Registrar antes
  // garante o formato uniforme de erro em toda a API.
  registrarTratadoresDeErro(app);

  await app.register(pluginAutenticacao);

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/api/saude', { config: { publica: true } }, async (_req, reply) => {
    const banco = await verificarBanco();

    if (!banco.ok) {
      reply.code(503);
      return {
        estado: 'degradado',
        banco: { ok: false },
        integracoes: {
          monday: config.monday.habilitado ? 'configurada' : 'desligada',
          sienge: config.sienge.habilitado ? 'configurada' : 'desligada',
        },
      };
    }

    return {
      estado: 'ok',
      ambiente: config.ambiente,
      banco: { ok: true },
      // Nunca expoe o valor das credenciais, apenas se estao presentes.
      integracoes: {
        monday: config.monday.habilitado ? 'configurada' : 'desligada',
        sienge: config.sienge.habilitado
          ? 'configurada'
          : config.sienge.credenciaisPresentes
            ? 'credenciais_presentes_aguardando_verificacao'
            : 'desligada',
      },
    };
  });

  await app.register(rotasAutenticacao);
  await app.register(rotasInconsistencias);
  await app.register(rotasMonday);
  await app.register(rotasSienge);
  await app.register(rotasMigracao);
  await app.register(rotasDados);
  await app.register(rotasBackup);

  // ── Interface, na mesma origem ────────────────────────────────────────────
  //
  // Servir a SPA daqui elimina a dependencia do server.js legado e faz `/api`
  // ser mesma origem por construcao — o cookie de sessao e SameSite=Strict, e
  // com origens diferentes ele simplesmente nao seria enviado.
  //
  // Registrado por ultimo: as rotas de API ja estao no roteador, e o curinga
  // abaixo so alcanca o que sobrou.
  const raizDaInterface = fileURLToPath(new URL('../../', import.meta.url));
  if (existsSync(raizDaInterface + 'index.html')) {
    await app.register(estaticos, {
      root: raizDaInterface,
      // Lista fechada: sem isto, o curinga serviria `server/`, `docs/` e o
      // proprio `.git` para quem pedisse.
      // `js/vendor/` guarda bibliotecas empacotadas localmente (Chart.js),
      // eliminando o CDN externo da pagina que exibe dado de cliente.
      allowedPath: (caminho) =>
        caminho === '/' ||
        /^\/(index\.html|js\/(vendor\/)?[\w.-]+\.js|css\/[\w.-]+\.css)$/.test(caminho),
      index: ['index.html'],
      // A SPA nao usa rotas de historico; um caminho desconhecido deve dar 404,
      // nao devolver a pagina inteira com status 200.
      wildcard: false,
    });
  }

  return app;
}

/**
 * Formato uniforme de erro, conforme references/patrono-api.md:
 *   { "erro": { "codigo": "...", "mensagem": "...", "detalhe": {} } }
 */
function registrarTratadoresDeErro(app: FastifyInstance): void {
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      erro: { codigo: 'nao_encontrado', mensagem: 'Recurso nao encontrado.', detalhe: {} },
    });
  });

  app.setErrorHandler((erroBruto, req, reply) => {
    const erro = erroBruto as Error & { statusCode?: number; validation?: unknown };

    if (erro instanceof ErroApi) {
      // Erro de negocio esperado: nao poluir o log com nivel de erro.
      req.log.info({ codigo: erro.codigo, rota: req.url }, erro.message);
      return reply.code(erro.status).send(erro.paraResposta());
    }

    if (erro.statusCode === 413) {
      return reply.code(413).send({
        erro: { codigo: 'entrada_invalida', mensagem: 'Corpo da requisicao muito grande.', detalhe: {} },
      });
    }

    if (erro.validation) {
      return reply.code(400).send({
        erro: { codigo: 'entrada_invalida', mensagem: 'Requisicao invalida.', detalhe: {} },
      });
    }

    // Erro inesperado: registra o detalhe no log, devolve mensagem generica.
    // Rastro de pilha nunca vai para o cliente.
    req.log.error({ erro: erro.message, pilha: erro.stack, rota: req.url }, 'Erro nao tratado');
    return reply.code(500).send({
      erro: {
        codigo: 'erro_interno',
        mensagem: 'Erro interno. A ocorrencia foi registrada.',
        detalhe: {},
      },
    });
  });
}
