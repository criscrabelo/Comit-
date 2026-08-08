/**
 * Pool PostgreSQL e acesso tipado via Kysely.
 *
 * As regras da metodologia (posicao x movimentacao, deduplicacao de carteira,
 * cliente unico) sao agregacoes que ficam escritas em SQL — auditaveis e
 * testaveis. Kysely da tipagem sem esconder o SQL.
 */
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../logging.js';
import type { Database } from './schema.js';

// `numeric` do PostgreSQL chega como string no driver por padrao, para nao
// perder precisao. Valores financeiros do Patrono cabem com folga em double,
// mas a conversao e feita de forma explicita no dominio, nao aqui — manter a
// string evita arredondamento silencioso em saldo e carteira.
// `int8` (bigint) e convertido para number: contadores de execucao nunca se
// aproximam de 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

// `date` (sem hora) chega como Date por padrao, interpretado no fuso do
// processo. Um prazo de habite-se em 2026-12-31 vira 2026-12-30T... a oeste de
// Greenwich — o dia muda por causa do fuso do servidor, e a tela mostra a data
// errada. Mantendo a string, a data e exatamente a que foi gravada. E o que os
// tipos em db/schema.ts ja declaravam (`Dia` e string).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

// Guarda do modo sem banco (`PATRONO_SEM_BANCO=1`, ver config.ts): sem esta
// recusa, um Pool com string vazia seria criado e a falha apareceria mais tarde,
// como erro de conexao, longe da causa.
if (!config.banco.url) {
  throw new Error(
    'DATABASE_URL nao configurada: o acesso ao banco foi importado em modo sem ' +
      'banco (PATRONO_SEM_BANCO=1). Esse modo serve so para ferramenta que nao ' +
      'toca o banco, como scripts/descobrir-quadro.ts.',
  );
}

export const pool = new pg.Pool({
  connectionString: config.banco.url,
  max: config.banco.poolMax,
  // Falhar rapido na partida em vez de pendurar a requisicao.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  application_name: 'patrono-backend',
});

pool.on('error', (erro) => {
  logger.error({ erro: erro.message }, 'Erro em conexao ociosa do pool PostgreSQL');
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

/** Verificacao de saude do banco: usada pelo health check e pelos testes. */
export async function verificarBanco(): Promise<{ ok: boolean; versao?: string; erro?: string }> {
  try {
    const r = await sql<{ versao: string }>`select version() as versao`.execute(db);
    return { ok: true, versao: r.rows[0]?.versao };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

export async function fecharBanco(): Promise<void> {
  await db.destroy();
}

export { sql };
