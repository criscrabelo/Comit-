/**
 * O caminho de produção das migrações: `npm run migrate:up` em banco novo.
 *
 * Por que existe: os testes rodam sobre `scripts/recriar-banco.sh`, que aplica
 * cada arquivo numa transação própria. Produção usa `node-pg-migrate`, que por
 * padrão envolve a execução INTEIRA numa transação só — e aí a 015 usa o valor
 * de enum que a 014 acabou de criar, sem commit no meio. O PostgreSQL recusa:
 * `unsafe use of new value "sistema" of enum type modulo_plataforma`.
 *
 * O defeito não aparecia em nenhum lugar: em banco já migrado não há o que
 * aplicar, e o caminho de teste não é o de produção. Só aparecia em banco novo,
 * que é exatamente o primeiro contato de quem vai instalar a plataforma.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const executar = promisify(execFile);

const BANCO = 'patrono_migracao_producao';

/** Conexão de manutenção, para criar e derrubar o banco do teste. */
function urlAdministrativa(): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/postgres';
  return url.toString();
}

function urlDoTeste(): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${BANCO}`;
  return url.toString();
}

async function comandoAdministrativo(sql: string): Promise<void> {
  const cliente = new Client({ connectionString: urlAdministrativa() });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

afterAll(async () => {
  await comandoAdministrativo(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
});

describe('migrações aplicam em banco novo pelo caminho de produção', () => {
  it('`npm run migrate:up` completa as 17 migrações sem erro de enum', async () => {
    await comandoAdministrativo(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    await comandoAdministrativo(`CREATE DATABASE ${BANCO}`);

    // O comando é o mesmo que o README manda rodar. Reproduzir a invocação com
    // flags próprias aqui provaria apenas que ESTA invocação funciona, e o
    // defeito era justamente a invocação declarada no package.json.
    const { stdout } = await executar('npm', ['run', 'migrate:up'], {
      cwd: new URL('../', import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: urlDoTeste() },
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    expect(stdout).toContain('Migrations complete!');

    const cliente = new Client({ connectionString: urlDoTeste() });
    await cliente.connect();
    try {
      const aplicadas = await cliente.query<{ total: string }>(
        'SELECT count(*)::text AS total FROM pgmigrations',
      );
      expect(Number(aplicadas.rows[0]!.total)).toBe(17);

      // O valor de enum que o defeito impedia de usar precisa existir E estar
      // efetivamente concedido — a 015 é quem consome o que a 014 criou.
      const permissoes = await cliente.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM permissoes_perfil WHERE modulo = 'sistema'`,
      );
      expect(Number(permissoes.rows[0]!.total)).toBeGreaterThan(0);
    } finally {
      await cliente.end();
    }
  }, 180_000);
});
