/**
 * Versoes que um backup precisa carregar para ser restauravel com seguranca.
 *
 * Restaurar um dump sobre um esquema diferente do de origem e a forma mais
 * silenciosa de corromper dado: as tabelas existem, os nomes batem, e uma
 * coluna que mudou de significado passa despercebida por meses.
 *
 * A versao do esquema aqui e o checksum combinado das migracoes aplicadas —
 * conteudo, nao numero. Renomear ou editar uma migracao ja aplicada muda o
 * checksum e a divergencia aparece.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { db } from '../db/pool.js';
import { logger } from '../logging.js';

export interface Migracao {
  nome: string;
  checksum: string;
}

export interface Versoes {
  aplicacao: string;
  banco: string;
  /** Checksum combinado das migracoes aplicadas no banco. */
  esquema: string;
  /** Migracoes registradas no banco, em ordem. */
  aplicadas: Migracao[];
  /** Migracoes presentes no codigo mas ainda nao aplicadas. */
  pendentes: string[];
  /** Aplicadas cujo arquivo mudou depois. Sinal de esquema adulterado. */
  divergentes: string[];
}

const RAIZ_MIGRACOES = fileURLToPath(new URL('../../migrations/', import.meta.url));

/** Migracoes que existem no codigo, com o checksum do arquivo. */
export function migracoesDoCodigo(): Migracao[] {
  return readdirSync(RAIZ_MIGRACOES)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((nome) => ({
      nome,
      checksum: createHash('sha256')
        .update(readFileSync(RAIZ_MIGRACOES + nome))
        .digest('hex'),
    }));
}

/** Combina a lista numa unica versao comparavel. */
export function versaoDoEsquema(migracoes: Migracao[]): string {
  const combinado = migracoes.map((m) => `${m.nome}:${m.checksum}`).join('\n');
  return createHash('sha256').update(combinado).digest('hex');
}

async function versaoDaAplicacao(): Promise<string> {
  try {
    const pacote = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    ) as { version?: string };
    return pacote.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Migracoes aplicadas segundo o banco.
 *
 * Duas origens possiveis: `migracoes_aplicadas`, preenchida por
 * scripts/recriar-banco.sh, e `pgmigrations`, do node-pg-migrate usado em
 * producao. Lemos as duas e unimos — um ambiente pode ter passado pelos dois
 * caminhos ao longo da vida.
 */
async function migracoesDoBanco(): Promise<Migracao[]> {
  const encontradas = new Map<string, string>();

  try {
    const linhas = await sql<{ nome: string; checksum: string }>`
      SELECT nome, checksum FROM migracoes_aplicadas ORDER BY nome
    `.execute(db);
    for (const l of linhas.rows) encontradas.set(l.nome, l.checksum);
  } catch {
    // Tabela ainda nao existe: banco anterior a migracao 015.
  }

  try {
    const linhas = await sql<{ name: string }>`
      SELECT name FROM pgmigrations ORDER BY id
    `.execute(db);
    for (const l of linhas.rows) {
      // node-pg-migrate guarda o nome sem extensao; casamos com o arquivo.
      const nome = l.name.endsWith('.sql') ? l.name : `${l.name}.sql`;
      if (!encontradas.has(nome)) encontradas.set(nome, 'desconhecido');
    }
  } catch {
    // Sem node-pg-migrate neste ambiente.
  }

  return [...encontradas.entries()]
    .map(([nome, checksum]) => ({ nome, checksum }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function versaoDoBanco(): Promise<string> {
  const r = await sql<{ versao: string }>`SELECT version() AS versao`.execute(db);
  const bruto = r.rows[0]?.versao ?? '';
  // "PostgreSQL 16.13 (Ubuntu...)" → "16.13". A distribuicao nao interessa para
  // compatibilidade; a versao maior interessa muito.
  return /PostgreSQL (\d+\.\d+)/.exec(bruto)?.[1] ?? bruto.slice(0, 60);
}

export async function levantarVersoes(): Promise<Versoes> {
  const [aplicacao, banco, doBanco] = await Promise.all([
    versaoDaAplicacao(),
    versaoDoBanco(),
    migracoesDoBanco(),
  ]);

  const doCodigo = migracoesDoCodigo();
  const porNome = new Map(doCodigo.map((m) => [m.nome, m.checksum]));
  const aplicadasPorNome = new Set(doBanco.map((m) => m.nome));

  const divergentes = doBanco
    .filter((m) => {
      const noCodigo = porNome.get(m.nome);
      // 'desconhecido' vem do pgmigrations, que nao guarda checksum. Nao da
      // para chamar de divergente o que nao se pode comparar.
      return noCodigo && m.checksum !== 'desconhecido' && noCodigo !== m.checksum;
    })
    .map((m) => m.nome);

  if (divergentes.length) {
    logger.warn(
      { migracoes: divergentes },
      'Migracoes aplicadas cujo arquivo mudou depois. O esquema pode nao ser o que o codigo descreve.',
    );
  }

  return {
    aplicacao,
    banco,
    esquema: versaoDoEsquema(doBanco),
    aplicadas: doBanco,
    pendentes: doCodigo.filter((m) => !aplicadasPorNome.has(m.nome)).map((m) => m.nome),
    divergentes,
  };
}

export interface Compatibilidade {
  compativel: boolean;
  /** Restauravel, mas com ressalva que precisa ser lida antes. */
  ressalvas: string[];
  impedimentos: string[];
}

/**
 * Compara o esquema de um backup com o esquema atual.
 *
 * A regra: o backup pode ser MAIS ANTIGO que o codigo (basta migrar depois de
 * restaurar). Nao pode ser MAIS NOVO — o codigo em execucao nao conhece
 * colunas que ainda nao existem para ele, e a aplicacao quebraria de formas
 * dificeis de diagnosticar.
 */
export function compararEsquema(
  doBackup: { versaoEsquema: string; migracoes: Migracao[]; versaoBanco: string },
  atual: Versoes,
): Compatibilidade {
  const ressalvas: string[] = [];
  const impedimentos: string[] = [];

  if (doBackup.versaoEsquema === atual.esquema) {
    return { compativel: true, ressalvas: [], impedimentos: [] };
  }

  const noBackup = new Set(doBackup.migracoes.map((m) => m.nome));
  const noCodigo = new Set(migracoesDoCodigo().map((m) => m.nome));

  const soNoBackup = [...noBackup].filter((n) => !noCodigo.has(n)).sort();
  const soNoCodigo = [...noCodigo].filter((n) => !noBackup.has(n)).sort();

  if (soNoBackup.length) {
    impedimentos.push(
      `O backup foi feito com ${soNoBackup.length} migracao(oes) que esta versao da ` +
        `aplicacao nao conhece: ${soNoBackup.join(', ')}. Restaurar um esquema mais novo ` +
        'do que o codigo quebraria a aplicacao. Atualize a aplicacao antes de restaurar.',
    );
  }

  if (soNoCodigo.length) {
    ressalvas.push(
      `O backup e anterior a ${soNoCodigo.length} migracao(oes): ${soNoCodigo.join(', ')}. ` +
        'Apos restaurar, aplique as migracoes pendentes antes de subir a aplicacao.',
    );
  }

  // Checksum diferente com a mesma lista significa migracao editada depois de
  // aplicada. Nao impede, mas exige olho: o esquema real pode nao ser o
  // descrito pelo arquivo.
  const alteradas = doBackup.migracoes
    .filter((m) => {
      const atualChecksum = migracoesDoCodigo().find((c) => c.nome === m.nome)?.checksum;
      return atualChecksum && m.checksum !== 'desconhecido' && atualChecksum !== m.checksum;
    })
    .map((m) => m.nome);

  if (alteradas.length) {
    ressalvas.push(
      `Migracao(oes) com conteudo diferente do arquivo atual: ${alteradas.join(', ')}. ` +
        'O esquema restaurado pode divergir do que o codigo espera.',
    );
  }

  const maiorBackup = Number(doBackup.versaoBanco.split('.')[0]);
  const maiorAtual = Number(atual.banco.split('.')[0]);
  if (Number.isFinite(maiorBackup) && Number.isFinite(maiorAtual) && maiorBackup > maiorAtual) {
    impedimentos.push(
      `O backup veio do PostgreSQL ${doBackup.versaoBanco} e o destino roda ${atual.banco}. ` +
        'O pg_restore nao le formato de versao maior.',
    );
  }

  return { compativel: impedimentos.length === 0, ressalvas, impedimentos };
}
