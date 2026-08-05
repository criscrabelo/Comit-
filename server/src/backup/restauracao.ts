/**
 * Restauracao.
 *
 * A parte perigosa do backup nao e gerar: e restaurar. Restaurar o arquivo
 * errado, no ambiente errado, sem ter salvo o que estava ali, e a forma mais
 * rapida de transformar um incidente pequeno em perda definitiva.
 *
 * Por isso o procedimento tem doze passos, e nenhum deles e opcional:
 *
 *    1. selecao do backup
 *    2. checksum do arquivo
 *    3. versao da aplicacao e do banco
 *    4. migracoes: o esquema do backup cabe neste codigo?
 *    5. ambiente de origem
 *    6. alerta de impacto — o que vai ser perdido
 *    7. confirmacao expressa, digitada
 *    8. backup preventivo do estado atual
 *    9. restauracao
 *   10. verificacoes de integridade
 *   11. resultado detalhado
 *   12. registro de auditoria
 *
 * Os passos 1 a 6 sao executaveis SOZINHOS, por `avaliar()`. E o que permite a
 * interface mostrar o impacto antes de pedir confirmacao — em vez de perguntar
 * "tem certeza?" sobre uma coisa que a pessoa nao viu.
 *
 * Destino `isolado` cria um banco novo, restaura ali e nao encosta no banco em
 * uso. E o unico destino que dispensa confirmacao reforcada, porque nao ha o
 * que perder.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from '../logging.js';
import { auditar } from '../audit/registrar.js';
import { conflito, entradaInvalida, ErroApi, naoAutorizado, naoEncontrado } from '../errors.js';
import { checksumConfere, decifrarArquivo, ErroCofre, somaDoArquivo } from './cofre.js';
import { compararEsquema, levantarVersoes, type Migracao } from './versoes.js';
import {
  bancoDaUrl,
  binario,
  executarBackup,
  mascarar,
  urlComBanco,
  type ContextoBackup,
} from './servico.js';
import type { Database } from '../db/schema.js';

const executar = promisify(execFile);

/** Frase que a pessoa precisa digitar para restaurar sobre o banco em uso. */
export const CONFIRMACAO_PRODUCAO = 'SUBSTITUIR DADOS DE PRODUCAO';

export type Destino = 'isolado' | 'producao';

// ═══════════════════════════════════════════════════════════════════════════
// Passos 1 a 6 — avaliacao, sem tocar em nada
// ═══════════════════════════════════════════════════════════════════════════

export interface Avaliacao {
  backup: {
    id: string;
    rotulo: string;
    ambiente: string;
    tipo: string;
    iniciado_em: Date;
    versao_aplicacao: string;
    versao_banco: string;
    versao_esquema: string;
    tamanho_bytes: number | null;
    total_registros: number | null;
    contagens: Record<string, number>;
  };
  destino: Destino;
  banco_destino: string;
  /** Passo 2. */
  checksum: { confere: boolean; esperado: string | null; obtido: string | null; mensagem: string };
  /** Passos 3 e 4. */
  esquema: { compativel: boolean; ressalvas: string[]; impedimentos: string[] };
  /** Passo 5. */
  ambiente: { origem: string; destino: string; mesmo: boolean; alerta: string | null };
  /** Passo 6 — o que se perde. */
  impacto: {
    registros_atuais: number;
    registros_no_backup: number | null;
    diferenca: number | null;
    tabelas_que_perdem: Array<{ tabela: string; atual: number; no_backup: number }>;
    texto: string;
  };
  /** Ensaio isolado que habilita o corte. Null impede a restauracao em producao. */
  ensaio: { id: string; em: Date } | null;
  /** Passo 7 — o que precisa ser digitado. */
  confirmacao_exigida: string | null;
  plano_corte_exigido: boolean;
  pode_prosseguir: boolean;
  impedimentos: string[];
}

async function carregarBackup(id: string) {
  const b = await db
    .selectFrom('backups')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!b) throw naoEncontrado('Backup nao encontrado.');
  if (b.status === 'expurgado') {
    throw conflito('Este backup foi expurgado pela retencao; o arquivo nao existe mais.');
  }
  if (b.status !== 'concluido' && b.status !== 'corrompido') {
    throw conflito(`Backup com status "${b.status}" nao pode ser restaurado.`);
  }
  return b;
}

function caminhoDo(b: { arquivo: string | null; local_armazenamento: string | null }): string {
  if (!b.arquivo) throw conflito('Este backup nao tem arquivo associado.');
  return join(b.local_armazenamento ?? config.backup.diretorio, b.arquivo);
}

export async function avaliar(
  backupId: string,
  destino: Destino,
  contexto: ContextoBackup,
): Promise<Avaliacao> {
  const b = await carregarBackup(backupId);
  const atual = await levantarVersoes();
  const impedimentos: string[] = [];

  // ── Passo 2: checksum ────────────────────────────────────────────────────
  let checksumResultado: Avaliacao['checksum'];
  try {
    const obtido = await somaDoArquivo(caminhoDo(b));
    const confere = Boolean(b.checksum) && checksumConfere(b.checksum!, obtido.sha256);
    checksumResultado = {
      confere,
      esperado: b.checksum,
      obtido: obtido.sha256,
      mensagem: confere
        ? 'Arquivo integro.'
        : 'O arquivo nao confere com o checksum registrado: foi alterado ou corrompido.',
    };
    if (!confere) impedimentos.push(checksumResultado.mensagem);
  } catch {
    checksumResultado = {
      confere: false,
      esperado: b.checksum,
      obtido: null,
      mensagem: `Arquivo nao encontrado em ${caminhoDo(b)}.`,
    };
    impedimentos.push(checksumResultado.mensagem);
  }

  // ── Passos 3 e 4: versao e migracoes ─────────────────────────────────────
  const esquema = compararEsquema(
    {
      versaoEsquema: b.versao_esquema,
      migracoes: (b.migracoes as Migracao[]) ?? [],
      versaoBanco: b.versao_banco,
    },
    atual,
  );
  impedimentos.push(...esquema.impedimentos);

  // ── Passo 5: ambiente ────────────────────────────────────────────────────
  const mesmoAmbiente = b.ambiente === config.ambiente;
  const ambiente = {
    origem: b.ambiente,
    destino: config.ambiente,
    mesmo: mesmoAmbiente,
    alerta: mesmoAmbiente
      ? null
      : `Este backup veio do ambiente "${b.ambiente}" e o destino e "${config.ambiente}".`,
  };

  // Restaurar backup de outro ambiente SOBRE o banco em uso e recusado. Em
  // banco isolado e permitido: e justamente como se investiga um problema de
  // producao sem tocar em producao.
  if (!mesmoAmbiente && destino === 'producao') {
    impedimentos.push(
      `Recusado: backup de "${b.ambiente}" nao pode substituir o banco de "${config.ambiente}". ` +
        'Para examina-lo, restaure num banco isolado.',
    );
  }

  // ── Passo 6: impacto ─────────────────────────────────────────────────────
  const impacto = await medirImpacto(
    destino,
    (b.contagens as Record<string, number>) ?? {},
    b.total_registros === null ? null : Number(b.total_registros),
  );

  let ensaio: { id: string; em: Date } | null = null;

  if (destino === 'producao') {
    // Requisito B15.1: ensaio isolado validado antes do corte.
    ensaio = await ensaioValidoDe(backupId);
    if (!ensaio) {
      impedimentos.push(
        'Nenhuma restauracao isolada bem-sucedida deste backup nas ultimas ' +
          `${VALIDADE_DO_ENSAIO_HORAS} horas. Restaure primeiro num banco isolado, confira o ` +
          'relatorio, e so entao substitua o banco em uso.',
      );
    }
    if (!config.backup.permitirRestauracaoProducao) {
      impedimentos.push(
        'PERMITIR_RESTAURACAO_PRODUCAO nao esta ligada neste servidor. ' +
          'A trava existe para que uma restauracao sobre o banco em uso exija ' +
          'um ato deliberado de quem opera a infraestrutura, e nao apenas um clique.',
      );
    }
    if (b.status === 'corrompido') {
      impedimentos.push('Backup marcado como corrompido nao substitui o banco em uso.');
    }
  }

  return {
    backup: {
      id: b.id,
      rotulo: b.rotulo,
      ambiente: b.ambiente,
      tipo: b.tipo,
      iniciado_em: new Date(b.iniciado_em),
      versao_aplicacao: b.versao_aplicacao,
      versao_banco: b.versao_banco,
      versao_esquema: b.versao_esquema,
      tamanho_bytes: b.tamanho_bytes === null ? null : Number(b.tamanho_bytes),
      total_registros: b.total_registros === null ? null : Number(b.total_registros),
      contagens: (b.contagens as Record<string, number>) ?? {},
    },
    destino,
    banco_destino: destino === 'producao' ? bancoDaUrl(config.banco.url) : '(banco novo, criado na hora)',
    checksum: checksumResultado,
    esquema,
    ambiente,
    impacto,
    ensaio: ensaio ? { id: ensaio.id, em: ensaio.em } : null,
    confirmacao_exigida: destino === 'producao' ? CONFIRMACAO_PRODUCAO : null,
    plano_corte_exigido: destino === 'producao',
    pode_prosseguir: impedimentos.length === 0,
    impedimentos,
  };
}

/**
 * Passo 6: o que se perde.
 *
 * Comparacao tabela a tabela entre o que existe agora e o que o backup tem.
 * "Restaurar vai apagar 412 registros de notificacoes" e uma informacao
 * acionavel; "tem certeza?" nao e.
 */
async function medirImpacto(
  destino: Destino,
  contagensBackup: Record<string, number>,
  totalBackup: number | null,
): Promise<Avaliacao['impacto']> {
  if (destino === 'isolado') {
    return {
      registros_atuais: 0,
      registros_no_backup: totalBackup,
      diferenca: null,
      tabelas_que_perdem: [],
      texto:
        'Restauracao em banco isolado: o banco em uso nao e alterado. ' +
        'Nada e perdido — o backup e aberto ao lado, para conferencia.',
    };
  }

  const { contarTudo } = await import('./servico.js');
  const atual = await contarTudo();

  const perdem = Object.entries(atual.contagens)
    .map(([tabela, n]) => ({ tabela, atual: n, no_backup: contagensBackup[tabela] ?? 0 }))
    .filter((t) => t.atual > t.no_backup)
    .sort((a, b) => b.atual - b.no_backup - (a.atual - a.no_backup));

  const diferenca = totalBackup === null ? null : atual.total - totalBackup;

  const texto =
    perdem.length === 0
      ? `O banco atual tem ${atual.total} registro(s) e o backup tem ${totalBackup ?? '?'}. ` +
        'Nenhuma tabela perde registros nesta restauracao.'
      : `SUBSTITUICAO TOTAL do banco em uso. Hoje ha ${atual.total} registro(s); ` +
        `o backup tem ${totalBackup ?? '?'}. ` +
        `${perdem.length} tabela(s) ficarao com menos registros, entre elas ` +
        perdem
          .slice(0, 5)
          .map((t) => `${t.tabela} (${t.atual} → ${t.no_backup})`)
          .join(', ') +
        '. Tudo que foi gravado depois do backup sera perdido.';

  return {
    registros_atuais: atual.total,
    registros_no_backup: totalBackup,
    diferenca,
    tabelas_que_perdem: perdem.slice(0, 30),
    texto,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Passos 7 a 12 — execucao
// ═══════════════════════════════════════════════════════════════════════════

export interface PedidoRestauracao {
  backupId: string;
  destino: Destino;
  /** Passo 7. Exigida no destino `producao`. */
  confirmacao?: string | null;
  justificativa?: string | null;
  /**
   * Plano de corte: quem para a aplicacao, em que janela, quem confere depois,
   * e como se volta atras. Obrigatorio em producao — requisito B15.1.
   */
  planoCorte?: string | null;
  /** Nome do banco isolado. Gerado quando ausente. */
  bancoIsolado?: string | null;
  /** Perfil de quem pediu — a checagem fina fica nas rotas. */
  perfil?: string | null;
}

/**
 * Requisito B15.1 — ensaio antes do corte.
 *
 * Substituir o banco em uso exige uma restauracao ISOLADA bem-sucedida do
 * MESMO backup, feita antes. Ninguem deve descobrir que o arquivo nao presta
 * com o banco de producao ja substituido.
 *
 * A janela existe porque um ensaio de tres meses atras nao diz nada sobre o
 * estado atual do arquivo no disco.
 */
const VALIDADE_DO_ENSAIO_HORAS = 72;

async function ensaioValidoDe(backupId: string): Promise<{ id: string; em: Date } | null> {
  const limite = new Date(Date.now() - VALIDADE_DO_ENSAIO_HORAS * 3_600_000);

  const ensaio = await db
    .selectFrom('restauracoes')
    .select(['id', 'iniciada_em'])
    .where('backup_id', '=', backupId)
    .where('destino', '=', 'isolado')
    // `concluida_com_ressalvas` NAO serve como ensaio: se a conferencia
    // divergiu no banco isolado, divergira tambem no de producao.
    .where('status', '=', 'concluida')
    .where('iniciada_em', '>=', limite)
    .orderBy('iniciada_em', 'desc')
    .executeTakeFirst();

  return ensaio ? { id: ensaio.id, em: new Date(ensaio.iniciada_em) } : null;
}

export interface RelatorioRestauracao {
  id: string;
  status: string;
  destino: Destino;
  banco_destino: string;
  backup: { id: string; rotulo: string; ambiente: string };
  backup_preventivo: { id: string; rotulo: string } | null;
  validacoes: {
    checksum: boolean;
    versao: boolean;
    migracoes: boolean;
    ambiente: boolean;
  };
  integridade: Record<string, unknown>;
  divergencias: string[];
  ressalvas: string[];
  duracao_ms: number | null;
  iniciada_em: Date;
  concluida_em: Date | null;
  erro: string | null;
  /** Schema com o estado anterior, quando houve corte em producao. */
  schema_preservado: string | null;
  /** Como voltar atras, se algo deu errado. */
  como_reverter: string | null;
}

function nomeDeBancoIsolado(): string {
  const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${bancoDaUrl(config.banco.url)}_restauracao_${carimbo}`;
}

/** Nome de banco seguro: o valor entra em DDL, que nao aceita parametro. */
function validarNomeDeBanco(nome: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(nome)) {
    throw entradaInvalida(
      'Nome de banco invalido. Use apenas letras minusculas, numeros e sublinhado.',
      { nome },
    );
  }
  return nome;
}

export async function restaurar(
  pedido: PedidoRestauracao,
  contexto: ContextoBackup,
): Promise<RelatorioRestauracao> {
  const comeco = Date.now();
  const avaliacao = await avaliar(pedido.backupId, pedido.destino, contexto);
  const b = await carregarBackup(pedido.backupId);

  const bancoDestino =
    pedido.destino === 'producao'
      ? bancoDaUrl(config.banco.url)
      : validarNomeDeBanco(pedido.bancoIsolado ?? nomeDeBancoIsolado());

  // ── Passo 7: confirmacao expressa ────────────────────────────────────────
  if (pedido.destino === 'producao') {
    if ((pedido.confirmacao ?? '').trim() !== CONFIRMACAO_PRODUCAO) {
      await registrarRecusa(avaliacao, bancoDestino, pedido, contexto, [
        `Confirmacao ausente ou incorreta. Digite exatamente: ${CONFIRMACAO_PRODUCAO}`,
      ]);
      throw naoAutorizado(
        `Restauracao sobre o banco em uso exige a confirmacao literal "${CONFIRMACAO_PRODUCAO}".`,
        { confirmacao_exigida: CONFIRMACAO_PRODUCAO },
      );
    }
    if (!(pedido.justificativa ?? '').trim()) {
      throw entradaInvalida(
        'Informe a justificativa. Substituir o banco em uso e um ato que precisa de motivo registrado.',
      );
    }
    // Requisito B15.1: plano de corte declarado. Sem ele, "restaurar producao"
    // vira uma acao sem hora marcada, sem quem confere e sem volta combinada.
    if ((pedido.planoCorte ?? '').trim().length < 20) {
      throw entradaInvalida(
        'Informe o plano de corte: quem para a aplicacao, em que janela, quem confere ' +
          'depois e como se volta atras.',
        { campo: 'plano_corte' },
      );
    }
  }

  if (!avaliacao.pode_prosseguir) {
    await registrarRecusa(avaliacao, bancoDestino, pedido, contexto, avaliacao.impedimentos);
    throw new ErroApi('conflito', 'A restauracao foi recusada na validacao. Nada foi alterado.', {
      impedimentos: avaliacao.impedimentos,
    });
  }

  // ── Passo 8: backup preventivo ───────────────────────────────────────────
  //
  // So faz sentido quando ha o que perder. Em banco isolado o banco em uso nao
  // e tocado, e um preventivo ali seria cerimonia sem funcao.
  let preventivo: { id: string; rotulo: string } | null = null;
  if (pedido.destino === 'producao') {
    const feito = await executarBackup(
      {
        tipo: 'preventivo',
        origem: 'restauracao',
        // Protegido: e a unica volta possivel se a restauracao estiver errada.
        // A retencao nao pode expurga-lo por conta propria.
        protegido: true,
        motivo: `Estado anterior a restauracao do backup ${b.rotulo}`,
      },
      contexto,
    );
    preventivo = { id: feito.id, rotulo: feito.rotulo };
  }

  const registro = await db
    .insertInto('restauracoes')
    .values({
      backup_id: pedido.backupId,
      destino: pedido.destino,
      banco_destino: bancoDestino,
      ambiente_destino: config.ambiente,
      ambiente_origem: b.ambiente,
      status: 'em_andamento',
      solicitada_por: contexto.usuarioId,
      solicitada_por_nome: contexto.usuarioNome,
      confirmacao: pedido.confirmacao ?? null,
      justificativa: pedido.justificativa ?? null,
      plano_corte: pedido.planoCorte ?? null,
      ensaio_id: avaliacao.ensaio?.id ?? null,
      backup_preventivo_id: preventivo?.id ?? null,
      checksum_conferido: avaliacao.checksum.confere,
      versao_conferida: avaliacao.esquema.impedimentos.length === 0,
      migracoes_conferidas: avaliacao.esquema.impedimentos.length === 0,
      ambiente_conferido: true,
    } as never)
    .returningAll()
    .executeTakeFirstOrThrow();

  await auditar({
    usuarioId: contexto.usuarioId,
    usuarioNome: contexto.usuarioNome,
    sessaoId: contexto.sessaoId ?? null,
    enderecoIp: contexto.enderecoIp ?? null,
    acao: 'restauracao_solicitada',
    recurso: 'restauracoes',
    recursoId: registro.id,
    modulo: 'sistema',
    detalhe: {
      backup: b.rotulo,
      destino: pedido.destino,
      banco_destino: bancoDestino,
      backup_preventivo: preventivo?.rotulo ?? null,
      justificativa: pedido.justificativa ?? null,
      impacto: avaliacao.impacto.texto,
    },
  });

  const temporario = join(tmpdir(), `patrono-restauracao-${registro.id}.dump`);
  let schemaPreservado: string | null = null;

  // Capturado ANTES da restauracao. Depois dela o catalogo ja foi substituido
  // pelo do backup, e estas linhas nao existem mais para serem lidas — foi
  // exatamente assim que o registro do preventivo se perdeu na primeira versao.
  const catalogoASalvar =
    pedido.destino === 'producao'
      ? await db
          .selectFrom('backups')
          .selectAll()
          .where('id', 'in', [pedido.backupId, preventivo?.id].filter(Boolean) as string[])
          .execute()
      : [];

  // O ensaio tambem e uma linha de `restauracoes`, e some com o restore. Sem
  // reinseri-lo, a chave estrangeira `ensaio_id` da restauracao atual nao teria
  // para onde apontar — e a operacao falharia DEPOIS de ja ter substituido o
  // banco, que e o pior momento possivel para falhar.
  const ensaioASalvar =
    pedido.destino === 'producao' && avaliacao.ensaio
      ? await db
          .selectFrom('restauracoes')
          .selectAll()
          .where('id', '=', avaliacao.ensaio.id)
          .execute()
      : [];

  try {
    // ── Passo 9: restauracao ───────────────────────────────────────────────
    const decifrado = await decifrarArquivo(caminhoDo(b), temporario, config.backup.chave!);

    // O checksum do claro so e conferivel aqui, com a chave. Prova que a
    // decifragem devolveu byte a byte o que o pg_dump gerou.
    if (b.checksum_claro && !checksumConfere(b.checksum_claro, decifrado.checksumClaro)) {
      throw new ErroCofre(
        'autenticacao_falhou',
        'O conteudo decifrado nao confere com o registrado na criacao do backup.',
      );
    }

    const urlDestino =
      pedido.destino === 'producao' ? config.banco.url : urlComBanco(config.banco.url, bancoDestino);

    if (pedido.destino === 'isolado') {
      await criarBancoVazio(bancoDestino);
    }

    // Restaurar em duas etapas, e nao com `pg_restore --clean`.
    //
    // `--clean` derruba objeto por objeto e ESBARRA em tabela particionada:
    // `fotografias_diarias` e `registros_brutos` tem restricao herdada pelas
    // particoes, e o PostgreSQL recusa derruba-la isoladamente
    // ("cannot drop inherited constraint"). A restauracao morria no meio.
    //
    // Recriar o schema resolve na raiz e ainda e mais fiel: nao sobra objeto do
    // estado anterior que o dump nao conheca.
    //
    // A DIFERENCA ENTRE OS DOIS DESTINOS IMPORTA (requisito B15.2):
    //
    //   isolado  — banco recem-criado, nada a preservar: DROP SCHEMA.
    //   producao — o estado anterior e RENOMEADO, nao apagado. Fica no mesmo
    //              banco, sob `antes_<carimbo>`. Rollback passa a ser um
    //              ALTER SCHEMA, sem depender de restaurar arquivo nenhum e
    //              sem a janela em que nao existe volta.
    //
    // As etapas rodam numa UNICA transacao do psql — `-c` executa antes do
    // `-f`, e `--single-transaction` envolve os dois. Ou o banco inteiro volta,
    // ou nada muda. E o que torna segura uma restauracao interrompida.
    const sqlTemporario = temporario + '.sql';
    const carimbo = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    schemaPreservado = pedido.destino === 'producao' ? `antes_${carimbo}` : null;

    // Renomear `public` leva junto as EXTENSOES que moram nele — `citext` e
    // `pgcrypto`. O dump traz `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA
    // public`, que vira no-op porque a extensao ainda existe, so que noutro
    // schema: e a restauracao morre em "type public.citext does not exist".
    //
    // Por isso as extensoes sao trazidas de volta logo apos o rename. Elas nao
    // fazem falta no schema preservado: colunas e defaults referenciam tipo e
    // funcao por OID, que acompanha a mudanca de schema.
    const prepararSchema = schemaPreservado
      ? `ALTER SCHEMA public RENAME TO ${schemaPreservado};
         CREATE SCHEMA public;
         DO $rec$
         DECLARE e record;
         BEGIN
           FOR e IN
             SELECT x.extname FROM pg_extension x
             JOIN pg_namespace n ON n.oid = x.extnamespace
             WHERE n.nspname = '${schemaPreservado}'
           LOOP
             EXECUTE format('ALTER EXTENSION %I SET SCHEMA public', e.extname);
           END LOOP;
         END
         $rec$;`
      : 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;';

    try {
      await executar(
        binario('pg_restore'),
        ['--file', sqlTemporario, '--no-owner', '--no-privileges', temporario],
        { maxBuffer: 64 * 1024 * 1024 },
      );

      var { stderr } = await executar(
        binario('psql'),
        [
          '--dbname', urlDestino,
          '--single-transaction',
          '--set', 'ON_ERROR_STOP=1',
          '--quiet',
          '-c', prepararSchema,
          '-f', sqlTemporario,
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      );
    } finally {
      await fs.rm(sqlTemporario, { force: true }).catch(() => {});
    }

    // Restaurar sobre o banco em uso substitui TAMBEM o catalogo de backups,
    // que volta como estava no momento do dump. Consequencia: o registro do
    // backup preventivo — a unica volta possivel — desaparece, e a propria
    // restauracao some da trilha.
    //
    // O catalogo precisa sobreviver a restauracao que ele descreve. Por isso
    // as linhas sao reinseridas logo depois.
    if (pedido.destino === 'producao') {
      await reconciliarCatalogo(urlDestino, catalogoASalvar, ensaioASalvar);
    }

    // ── Passo 10: verificacoes de integridade ──────────────────────────────
    const integridade = await conferirIntegridade(
      urlDestino,
      (b.contagens as Record<string, number>) ?? {},
    );

    const divergencias = [...integridade.divergencias];
    if (stderr && stderr.trim()) {
      // pg_restore avisa sobre objetos ausentes no --clean de um banco novo.
      // Sao esperados; o que nao for, entra como divergencia.
      const relevantes = stderr
        .split('\n')
        .filter((l) => l.trim() && !/does not exist|nao existe|skipping/i.test(l))
        .slice(0, 20);
      if (relevantes.length) divergencias.push(...relevantes.map(mascarar));
    }

    const status = divergencias.length ? 'concluida_com_ressalvas' : 'concluida';
    const duracao = Date.now() - comeco;

    const conclusao = {
      status,
      concluida_em: new Date(),
      duracao_ms: duracao,
      integridade: JSON.stringify(integridade.resumo),
      divergencias: JSON.stringify(divergencias),
      schema_preservado: schemaPreservado,
    };

    // Insert-com-conflito, e nao UPDATE puro: numa restauracao sobre o banco em
    // uso, a linha aberta no inicio foi substituida junto com o resto do
    // catalogo. Um UPDATE simples afetaria zero linhas e a restauracao nao
    // deixaria registro nenhum de si mesma.
    await db
      .insertInto('restauracoes')
      .values({
        ...registro,
        solicitada_por: null,
        backup_preventivo_id: preventivo?.id ?? null,
        ...conclusao,
        integridade: JSON.stringify(integridade.resumo),
        divergencias: JSON.stringify(divergencias),
      } as never)
      .onConflict((oc) => oc.column('id').doUpdateSet(conclusao as never))
      .execute();

    // Marca o backup como testado: e o que separa "temos backup" de "sabemos
    // que o backup funciona".
    await db
      .updateTable('backups')
      .set({ restauracao_testada_em: new Date() } as never)
      .where('id', '=', pedido.backupId)
      .execute();

    await auditar({
      usuarioId: contexto.usuarioId,
      usuarioNome: contexto.usuarioNome,
      sessaoId: contexto.sessaoId ?? null,
      enderecoIp: contexto.enderecoIp ?? null,
      acao: 'backup_restaurado',
      recurso: 'restauracoes',
      recursoId: registro.id,
      modulo: 'sistema',
      resultado: status === 'concluida' ? 'sucesso' : 'erro',
      detalhe: {
        backup: b.rotulo,
        destino: pedido.destino,
        banco_destino: bancoDestino,
        duracao_ms: duracao,
        registros_restaurados: integridade.resumo.total_restaurado,
        divergencias: divergencias.length,
      },
    });

    logger.info(
      { restauracao: registro.id, banco: bancoDestino, status, duracao },
      'Restauracao concluida',
    );

    return montarRelatorio({
      id: registro.id,
      status,
      destino: pedido.destino,
      bancoDestino,
      backup: b,
      preventivo,
      avaliacao,
      integridade: integridade.resumo,
      divergencias,
      duracao,
      erro: null,
      schemaPreservado,
    });
  } catch (erro) {
    const mensagem = mascarar(erro instanceof Error ? erro.message : String(erro));
    const interrompida = /timeout|ECONNRESET|SIGTERM|SIGKILL/i.test(mensagem);

    await db
      .updateTable('restauracoes')
      .set({
        status: interrompida ? 'interrompida' : 'erro',
        concluida_em: new Date(),
        duracao_ms: Date.now() - comeco,
        erro: mensagem.slice(0, 2000),
      } as never)
      .where('id', '=', registro.id)
      .execute();

    await auditar({
      usuarioId: contexto.usuarioId,
      usuarioNome: contexto.usuarioNome,
      sessaoId: contexto.sessaoId ?? null,
      enderecoIp: contexto.enderecoIp ?? null,
      acao: 'backup_restaurado',
      recurso: 'restauracoes',
      recursoId: registro.id,
      modulo: 'sistema',
      resultado: 'erro',
      detalhe: { backup: b.rotulo, erro: mensagem.slice(0, 500) },
    });

    logger.error({ restauracao: registro.id, erro: mensagem }, 'Restauracao falhou');

    throw new ErroApi(
      'erro_interno',
      `A restauracao falhou: ${mensagem.slice(0, 300)}` +
        (preventivo
          ? ` O estado anterior esta no backup preventivo ${preventivo.rotulo}.`
          : ' O banco em uso nao foi alterado.'),
      { restauracao_id: registro.id, backup_preventivo: preventivo?.rotulo ?? null },
    );
  } finally {
    // O dump em claro nunca fica no disco depois da operacao.
    await fs.rm(temporario, { force: true }).catch(() => {});
  }
}

async function registrarRecusa(
  avaliacao: Avaliacao,
  bancoDestino: string,
  pedido: PedidoRestauracao,
  contexto: ContextoBackup,
  motivos: string[],
): Promise<void> {
  const r = await db
    .insertInto('restauracoes')
    .values({
      backup_id: pedido.backupId,
      destino: pedido.destino,
      banco_destino: bancoDestino,
      ambiente_destino: config.ambiente,
      ambiente_origem: avaliacao.backup.ambiente,
      status: 'recusada',
      concluida_em: new Date(),
      solicitada_por: contexto.usuarioId,
      solicitada_por_nome: contexto.usuarioNome,
      confirmacao: pedido.confirmacao ?? null,
      justificativa: pedido.justificativa ?? null,
      checksum_conferido: avaliacao.checksum.confere,
      versao_conferida: avaliacao.esquema.impedimentos.length === 0,
      migracoes_conferidas: avaliacao.esquema.impedimentos.length === 0,
      ambiente_conferido: avaliacao.ambiente.mesmo,
      divergencias: JSON.stringify(motivos),
    } as never)
    .returning('id')
    .executeTakeFirstOrThrow();

  await auditar({
    usuarioId: contexto.usuarioId,
    usuarioNome: contexto.usuarioNome,
    sessaoId: contexto.sessaoId ?? null,
    enderecoIp: contexto.enderecoIp ?? null,
    acao: 'restauracao_recusada',
    recurso: 'restauracoes',
    recursoId: r.id,
    modulo: 'sistema',
    resultado: 'negado',
    detalhe: { backup: avaliacao.backup.rotulo, destino: pedido.destino, motivos },
  });
}

/**
 * Reinsere no banco restaurado os metadados dos backups que importam agora.
 *
 * Sem isto, depois de restaurar producao a plataforma nao saberia que existe um
 * backup preventivo do estado anterior — e o operador ficaria com um arquivo no
 * disco sem nada que o explique, exatamente no pior momento para investigar.
 *
 * As referencias a usuario sao anuladas: o usuario que pediu a restauracao pode
 * nao existir no estado restaurado, e uma chave estrangeira quebrada aqui
 * derrubaria a reconciliacao inteira. O nome de quem pediu fica preservado na
 * coluna desnormalizada, que e o que interessa para auditar.
 */
async function reconciliarCatalogo(
  urlDestino: string,
  linhas: Array<Record<string, unknown>>,
  ensaios: Array<Record<string, unknown>> = [],
): Promise<void> {
  if (!linhas.length && !ensaios.length) return;

  const pool = new pg.Pool({ connectionString: urlDestino, max: 2 });
  const alvo = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  try {
    for (const linha of linhas) {
      await alvo
        .insertInto('backups')
        .values({
          ...linha,
          iniciado_por: null,
          expurgado_por: null,
          migracoes: JSON.stringify(linha.migracoes),
          contagens: JSON.stringify(linha.contagens),
          detalhe: JSON.stringify({
            ...(linha.detalhe as Record<string, unknown>),
            reconciliado_apos_restauracao: true,
          }),
        } as never)
        .onConflict((oc) => oc.column('rotulo').doNothing())
        .execute();
    }

    for (const ensaio of ensaios) {
      await alvo
        .insertInto('restauracoes')
        .values({
          ...ensaio,
          solicitada_por: null,
          integridade: JSON.stringify(ensaio.integridade),
          divergencias: JSON.stringify(ensaio.divergencias),
          detalhe: JSON.stringify(ensaio.detalhe),
        } as never)
        .onConflict((oc) => oc.column('id').doNothing())
        .execute();
    }
  } catch (erro) {
    // Reconciliacao que falha nao invalida a restauracao — os dados voltaram.
    // Mas o operador precisa saber que o catalogo ficou incompleto.
    logger.error(
      { erro: mascarar(erro instanceof Error ? erro.message : String(erro)) },
      'Restauracao concluida, mas o catalogo de backups nao pode ser reconciliado. ' +
        'O arquivo do backup preventivo continua no armazenamento.',
    );
  } finally {
    await alvo.destroy();
  }
}

/** Cria o banco isolado. Recusa sobrescrever um banco que ja exista. */
async function criarBancoVazio(nome: string): Promise<void> {
  const existente = await sql<{ existe: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${nome}) AS existe
  `.execute(db);

  if (existente.rows[0]?.existe) {
    throw conflito(
      `O banco "${nome}" ja existe. Escolha outro nome ou remova-o antes — ` +
        'restaurar por cima apagaria o que estiver ali.',
    );
  }

  // CREATE DATABASE nao roda dentro de transacao, e o pool do Kysely nao
  // garante conexao fora dela. `createdb` e o caminho direto e previsivel.
  await executar(binario('createdb'), ['--maintenance-db', config.banco.url, nome]);
}

/**
 * Passo 10: verificacoes de integridade.
 *
 * Conecta no banco RESTAURADO — nao no de origem — e compara com as contagens
 * gravadas no backup. Sem isto, "restauracao concluida" significaria apenas
 * que o pg_restore terminou sem erro, o que nao e a mesma coisa que os dados
 * terem voltado.
 */
async function conferirIntegridade(
  urlDestino: string,
  contagensEsperadas: Record<string, number>,
): Promise<{ resumo: Record<string, unknown>; divergencias: string[] }> {
  const pool = new pg.Pool({ connectionString: urlDestino, max: 2 });
  const alvo = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  const divergencias: string[] = [];

  try {
    const tabelas = await sql<{ nome: string }>`
      SELECT tablename AS nome FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `.execute(alvo);

    const contagens: Record<string, number> = {};
    let total = 0;

    for (const { nome } of tabelas.rows) {
      const r = await sql<{ n: number }>`SELECT count(*)::int AS n FROM ${sql.table(nome)}`.execute(alvo);
      const n = r.rows[0]?.n ?? 0;
      contagens[nome] = n;
      total += n;
    }

    // Tabela por tabela. Divergencia numa unica tabela ja invalida a promessa.
    for (const [tabela, esperado] of Object.entries(contagensEsperadas)) {
      const obtido = contagens[tabela];
      if (obtido === undefined) {
        divergencias.push(`Tabela ausente no banco restaurado: ${tabela}.`);
      } else if (obtido !== esperado) {
        divergencias.push(`${tabela}: esperado ${esperado} registro(s), restaurado ${obtido}.`);
      }
    }

    const faltando = Object.keys(contagensEsperadas).filter((t) => !(t in contagens));
    const sobrando = Object.keys(contagens).filter((t) => !(t in contagensEsperadas));

    // Verificacoes que vao alem da contagem: sem elas, um banco com o numero
    // certo de linhas erradas passaria.
    const [usuarios, permissoes, trilha, proveniencia] = await Promise.all([
      sql<{ n: number }>`SELECT count(*)::int AS n FROM usuarios WHERE status = 'ativo'`.execute(alvo),
      sql<{ n: number }>`SELECT count(*)::int AS n FROM permissoes_perfil`.execute(alvo),
      sql<{ n: number }>`SELECT count(*)::int AS n FROM logs_auditoria`.execute(alvo),
      sql<{ n: number }>`
        SELECT count(*)::int AS n FROM tabelas_de_negocio
      `.execute(alvo),
    ]);

    if ((permissoes.rows[0]?.n ?? 0) === 0) {
      divergencias.push('Nenhuma permissao de perfil restaurada: ninguem conseguiria operar.');
    }

    // Proveniencia so faz sentido se as colunas existirem de fato. Conferimos
    // numa tabela de negocio real, e nao apenas no catalogo.
    const colunasProveniencia = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notificacoes'
        AND column_name IN ('fonte', 'id_origem', 'historico', 'versao', 'extraido_em')
    `.execute(alvo);

    if ((colunasProveniencia.rows[0]?.n ?? 0) < 5) {
      divergencias.push(
        'Colunas de proveniencia ausentes em notificacoes: o esquema restaurado esta incompleto.',
      );
    }

    return {
      resumo: {
        tabelas: tabelas.rows.length,
        total_restaurado: total,
        contagens,
        tabelas_faltando: faltando,
        tabelas_a_mais: sobrando,
        usuarios_ativos: usuarios.rows[0]?.n ?? 0,
        permissoes_perfil: permissoes.rows[0]?.n ?? 0,
        registros_auditoria: trilha.rows[0]?.n ?? 0,
        tabelas_de_negocio: proveniencia.rows[0]?.n ?? 0,
        colunas_proveniencia_conferidas: colunasProveniencia.rows[0]?.n ?? 0,
      },
      divergencias,
    };
  } finally {
    await alvo.destroy();
  }
}

function montarRelatorio(dados: {
  id: string;
  status: string;
  destino: Destino;
  bancoDestino: string;
  backup: { id: string; rotulo: string; ambiente: string };
  preventivo: { id: string; rotulo: string } | null;
  avaliacao: Avaliacao;
  integridade: Record<string, unknown>;
  divergencias: string[];
  duracao: number;
  erro: string | null;
  schemaPreservado: string | null;
}): RelatorioRestauracao {
  return {
    id: dados.id,
    status: dados.status,
    destino: dados.destino,
    banco_destino: dados.bancoDestino,
    backup: {
      id: dados.backup.id,
      rotulo: dados.backup.rotulo,
      ambiente: dados.backup.ambiente,
    },
    backup_preventivo: dados.preventivo,
    validacoes: {
      checksum: dados.avaliacao.checksum.confere,
      versao: dados.avaliacao.esquema.impedimentos.length === 0,
      migracoes: dados.avaliacao.esquema.impedimentos.length === 0,
      ambiente: dados.avaliacao.ambiente.mesmo,
    },
    integridade: dados.integridade,
    divergencias: dados.divergencias,
    ressalvas: dados.avaliacao.esquema.ressalvas,
    duracao_ms: dados.duracao,
    iniciada_em: new Date(Date.now() - dados.duracao),
    concluida_em: new Date(),
    erro: dados.erro,
    schema_preservado: dados.schemaPreservado,
    como_reverter: dados.schemaPreservado
      ? `Rollback imediato: ALTER SCHEMA public RENAME TO descartado_${dados.id.slice(0, 8)}; ` +
        `ALTER SCHEMA ${dados.schemaPreservado} RENAME TO public; ` +
        `(o estado anterior esta preservado ali). ` +
        `Alternativa: restaurar o backup preventivo "${dados.preventivo?.rotulo ?? '—'}". ` +
        `Descarte o schema preservado apenas depois de fechada a janela de corte.`
      : dados.destino === 'isolado'
        ? `O banco em uso nao foi alterado. Para descartar, remova o banco "${dados.bancoDestino}".`
        : null,
  };
}

/** Historico de restauracoes, para a tela e para o relatorio de continuidade. */
export async function listarRestauracoes(limite = 50) {
  return db
    .selectFrom('restauracoes as r')
    .innerJoin('backups as b', 'b.id', 'r.backup_id')
    .select([
      'r.id', 'r.destino', 'r.banco_destino', 'r.ambiente_destino', 'r.ambiente_origem',
      'r.status', 'r.iniciada_em', 'r.concluida_em', 'r.duracao_ms',
      'r.solicitada_por_nome', 'r.justificativa', 'r.divergencias', 'r.erro',
      'b.rotulo as backup_rotulo', 'b.iniciado_em as backup_em',
    ])
    .orderBy('r.iniciada_em', 'desc')
    .limit(Math.min(limite, 200))
    .execute();
}

export async function detalharRestauracao(id: string) {
  const r = await db
    .selectFrom('restauracoes')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!r) throw naoEncontrado('Restauracao nao encontrada.');
  return r;
}
