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

  // ── Backup e restauracao ──────────────────────────────────────────────────
  // Diretorio FORA do repositorio. Backup dentro do repositorio acaba num
  // `git add -A` e vaza a base inteira para o controle de versao.
  BACKUP_DIRETORIO: z.string().default('/var/backups/patrono'),
  // Segundo destino, para a copia redundante. Vazio = so a copia primaria.
  BACKUP_DIRETORIO_REDUNDANTE: z.string().optional(),
  // Chave de cifra em repouso. Nunca no codigo, nunca no repositorio. Sem ela
  // o backup e recusado: gravar a base em claro seria pior que nao gravar.
  BACKUP_CHAVE: z.string().optional(),
  // Hora do backup diario (0-23), no fuso do servidor. Vazio = sem agendamento.
  BACKUP_HORA_DIARIA: z.coerce.number().int().min(0).max(23).optional(),
  // Trava adicional para restaurar sobre o banco em uso. Mesmo com perfil e
  // permissao, sem esta variavel a restauracao em producao e recusada.
  PERMITIR_RESTAURACAO_PRODUCAO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Caminho do pg_dump/pg_restore, quando nao estiverem no PATH.
  PG_BIN: z.string().optional(),
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

  backup: {
    diretorio: env.BACKUP_DIRETORIO,
    diretorioRedundante: env.BACKUP_DIRETORIO_REDUNDANTE?.trim() || null,
    /** Nunca logada, nunca devolvida por endpoint, nunca gravada em metadado. */
    chave: env.BACKUP_CHAVE || null,
    // Le a propria propriedade, e nao a variavel de ambiente: assim continua
    // coerente se a chave for trocada em execucao (ambiente de teste), em vez
    // de responder sobre um valor que ninguem mais esta usando.
    get cifraConfigurada(): boolean {
      return Boolean(this.chave && this.chave.length >= 16);
    },
    horaDiaria: env.BACKUP_HORA_DIARIA ?? null,
    permitirRestauracaoProducao: env.PERMITIR_RESTAURACAO_PRODUCAO,
    binarios: env.PG_BIN?.trim() || null,
  },
} as const;

export type Config = typeof config;
