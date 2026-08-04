/**
 * Configuracao por ambiente.
 *
 * Regra obrigatoria: nenhuma credencial vive no codigo-fonte. Tudo vem de
 * variavel de ambiente. Este modulo valida na partida — o servidor recusa
 * subir com configuracao invalida em vez de falhar depois, em producao.
 */
import { z } from 'zod';

const paraLista = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3131),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  CORS_ORIGINS: z.string().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatoria'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  SESSAO_DURACAO_HORAS: z.coerce.number().int().positive().max(720).default(12),
  SESSAO_INATIVIDADE_MINUTOS: z.coerce.number().int().positive().default(60),

  MONDAY_TOKEN: z.string().optional(),
  MONDAY_API_VERSION: z.string().default('2024-10'),

  SIENGE_SUBDOMAIN: z.string().optional(),
  SIENGE_USER: z.string().optional(),
  SIENGE_PASSWORD: z.string().optional(),
  SIENGE_HABILITADO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SIENGE_REQUISICOES_POR_MINUTO: z.coerce.number().int().positive().default(60),
});

const bruto = esquema.safeParse(process.env);

if (!bruto.success) {
  const detalhe = bruto.error.issues
    .map((i) => `  ${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Configuracao de ambiente invalida:\n${detalhe}`);
}

const env = bruto.data;

const origens = paraLista(env.CORS_ORIGINS);

// CORS aberto e uma das falhas do servidor atual (server.js:84).
//
// Curinga e recusado em qualquer ambiente que nao seja development — inclusive
// em teste, para que ninguem passe a depender dele.
if (env.NODE_ENV !== 'development' && origens.includes('*')) {
  throw new Error(
    'CORS_ORIGINS nao pode conter "*" fora de development. Liste as origens explicitamente.',
  );
}

// A lista explicita e obrigatoria em producao. Em teste os modulos sao
// importados sem servir HTTP, e exigir a variavel ali so acrescentaria
// cerimonia sem ganho de seguranca.
if (env.NODE_ENV === 'production' && origens.length === 0) {
  throw new Error(
    'CORS_ORIGINS e obrigatoria em producao: liste as origens permitidas.',
  );
}

export const config = {
  ambiente: env.NODE_ENV,
  ehProducao: env.NODE_ENV === 'production',
  ehTeste: env.NODE_ENV === 'test',
  porta: env.PORT,
  nivelLog: env.LOG_LEVEL,

  corsOrigens: origens,

  banco: {
    url: env.DATABASE_URL,
    poolMax: env.DATABASE_POOL_MAX,
  },

  sessao: {
    duracaoHoras: env.SESSAO_DURACAO_HORAS,
    inatividadeMinutos: env.SESSAO_INATIVIDADE_MINUTOS,
  },

  monday: {
    /** Ausencia de token = integracao desligada. Nunca exposto ao navegador. */
    token: env.MONDAY_TOKEN?.trim() || null,
    versaoApi: env.MONDAY_API_VERSION,
    get habilitado() {
      return Boolean(env.MONDAY_TOKEN?.trim());
    },
  },

  sienge: {
    subdominio: env.SIENGE_SUBDOMAIN?.trim() || null,
    usuario: env.SIENGE_USER?.trim() || null,
    senha: env.SIENGE_PASSWORD || null,
    /**
     * Conector nasce desligado. So liga quando a rotina de verificacao de
     * ambiente confirmar endpoints e parametros reais (ver src/integracoes/sienge).
     */
    habilitado: env.SIENGE_HABILITADO,
    requisicoesPorMinuto: env.SIENGE_REQUISICOES_POR_MINUTO,
    get credenciaisPresentes() {
      return Boolean(
        env.SIENGE_SUBDOMAIN?.trim() && env.SIENGE_USER?.trim() && env.SIENGE_PASSWORD,
      );
    },
  },
} as const;

export type Config = typeof config;
