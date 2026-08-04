/**
 * Apoio dos testes que rodam contra PostgreSQL REAL.
 *
 * Sem mock de banco: as regras a testar (idempotencia, deduplicacao de carteira,
 * posicao x movimentacao, trilha append-only) sao regras do BANCO. Testa-las
 * contra um mock nao provaria nada — provaria apenas que o mock concorda consigo
 * mesmo.
 *
 * Exige DATABASE_URL apontando para um banco descartavel.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sql } from 'kysely';
import { db } from '../../src/db/pool.js';

const executar = promisify(execFile);

/** Tabelas limpas entre testes, na ordem que respeita as chaves estrangeiras. */
const TABELAS_LIMPAVEIS = [
  'registros_brutos',
  'vinculos_fontes',
  'inconsistencias',
  'notificacoes',
  'processos_judiciais',
  'distratos',
  'honorarios',
  'acordos',
  'resolucoes',
  'fatos',
  'riscos',
  'regulatorios',
  'pagamentos',
  'parcelas',
  'titulos_receber',
  'saldos_financeiros',
  'carteiras_referencia',
  'comissoes',
  'percentuais_perda',
  'contratos',
  'reservas',
  'unidades',
  'clientes',
  'empreendimentos_fontes',
  'empreendimentos',
  'execucoes_importacao',
  'comites',
  'competencias',
  'memorias_calculo',
  'indicadores_calculados',
  'metas_historicas',
  'escopos_area',
  'escopos_empreendimento',
  'escopos_tipo_informacao',
  'permissoes_usuario',
  'sessoes',
  'tokens_recuperacao',
  'tentativas_autenticacao',
] as const;

/**
 * Limpa os dados preservando o esquema.
 *
 * `logs_auditoria` e `fotografias_diarias` recusam DELETE por gatilho (sao
 * append-only por exigencia do produto), entao a limpeza usa TRUNCATE, que nao
 * dispara gatilho de linha. Isso vale para teste; em producao ninguem trunca.
 */
export async function limparDados(): Promise<void> {
  await sql`
    TRUNCATE TABLE
      logs_auditoria,
      fotografias_diarias,
      ${sql.raw(TABELAS_LIMPAVEIS.join(', '))},
      usuarios
    RESTART IDENTITY CASCADE
  `.execute(db);

  // O CASCADE alcanca `integracoes`, que referencia `usuarios` em
  // ambiente_verificado_por. Ressemeia as tres linhas de configuracao criadas
  // pela migracao 004 — sem elas, os testes de estado de integracao nao
  // encontrariam a linha para atualizar.
  await db
    .insertInto('integracoes')
    .values([
      { sistema: 'monday', estado: 'desconectada', habilitada: false },
      { sistema: 'sienge', estado: 'desconectada', habilitada: false },
      { sistema: 'cvcrm', estado: 'desconectada', habilitada: false },
    ])
    .onConflict((oc) => oc.column('sistema').doNothing())
    .execute();
}

/** Recria o banco de teste do zero, aplicando todas as migracoes. */
export async function recriarBanco(): Promise<void> {
  await executar('./scripts/recriar-banco.sh', [], {
    env: { ...process.env },
    cwd: new URL('../../', import.meta.url).pathname,
  });
}

export interface ComiteDeTeste {
  competenciaRef: string;
  comiteId: string;
}

/** Cria competencia e comite para os testes que precisam de recorte. */
export async function criarComite(ref = '2026-07'): Promise<ComiteDeTeste> {
  const [ano, mes] = ref.split('-').map(Number);
  const inicio = `${ref}-01`;
  const fim = new Date(Date.UTC(ano!, mes!, 0)).toISOString().slice(0, 10);

  await db
    .insertInto('competencias')
    .values({ ref, rotulo: `Competencia ${ref}`, inicio, fim })
    .onConflict((oc) => oc.doNothing())
    .execute();

  const comite = await db
    .insertInto('comites')
    .values({ competencia_ref: ref, rotulo: `Comite ${ref}` })
    .onConflict((oc) => oc.column('competencia_ref').doUpdateSet({ atualizado_em: new Date() }))
    .returning('id')
    .executeTakeFirstOrThrow();

  return { competenciaRef: ref, comiteId: comite.id };
}

/** Cria um empreendimento minimo, com proveniencia. */
export async function criarEmpreendimento(nome: string, idExterno?: string): Promise<string> {
  const linha = await db
    .insertInto('empreendimentos')
    .values({
      nome,
      nome_normalizado: nome.toUpperCase(),
      fonte: 'manual',
      id_origem: idExterno ?? `manual-${nome.toUpperCase()}`,
    })
    .onConflict((oc) => oc.column('nome_normalizado').doUpdateSet({ nome }))
    .returning('id')
    .executeTakeFirstOrThrow();

  return linha.id;
}

export async function contar(tabela: string, condicao?: string): Promise<number> {
  const r = await sql<{ total: number }>`
    SELECT count(*)::int AS total FROM ${sql.table(tabela)}
    ${condicao ? sql`WHERE ${sql.raw(condicao)}` : sql``}
  `.execute(db);
  return r.rows[0]?.total ?? 0;
}
