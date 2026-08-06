/**
 * Homologacao controlada de um quadro do Monday.
 *
 * Executa DUAS sincronizacoes consecutivas do mesmo quadro e produz o relatorio
 * exigido: metricas completas da primeira, e as sete provas da segunda.
 *
 * Por que duas: a primeira mostra o que entrou; a segunda prova que rodar de
 * novo NAO duplica, NAO reescreve o que nao mudou, e NAO perde proveniencia.
 * Uma execucao sozinha nao distingue "upsert idempotente" de "insert que ainda
 * nao colidiu".
 *
 * Escopo travado por PERFIL: o script so aceita quadros com perfil declarado
 * abaixo, e recusa a execucao se o board do perfil divergir do configurado em
 * `quadros.ts`. Sem `--quadro`, homologa `processos`.
 *
 * Uso:
 *   MONDAY_TOKEN=... DATABASE_URL=... npx tsx scripts/homologar-monday.ts
 *   ... --quadro notificacoes     homologa outro quadro (padrao: processos)
 *   ... --competencia 2026-07     recorta por competencia
 *   ... --simular                 le e transforma sem gravar
 *   ... --pre-confirmacao         so os quatro itens locais; nao toca a rede
 *   ... --saida relatorio.md      grava o relatorio em arquivo
 *
 * O token vem SO de variavel de ambiente. Nunca por argumento: argumento
 * aparece em `ps` e no historico do shell.
 */
import { promises as fs } from 'node:fs';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import { config } from '../src/config.js';
import {
  QUADROS,
  mesmoTitulo,
  type ChaveQuadro,
  type TituloAmbiguo,
} from '../src/integracoes/monday/quadros.js';
import { sincronizarQuadro } from '../src/integracoes/monday/sincronizar.js';
import { recusarEscrita, testarConexao } from '../src/integracoes/monday/cliente.js';
import {
  analisarCoberturaJudicializacao,
  COLUNAS_DE_CLASSIFICACAO,
  levantarRotulos,
  type LevantamentoRotulos,
} from '../src/integracoes/monday/rotulos.js';
import type { ResumoExecucao } from '../src/integracoes/execucoes.js';

/**
 * Perfil de homologacao de um quadro.
 *
 * O board fica AQUI, e nao so em `quadros.ts`, de proposito: a homologacao
 * compara os dois e recusa a execucao se divergirem. Alterar o id em um lugar
 * so nao consegue redirecionar a carga — precisaria de duas alteracoes
 * deliberadas, em arquivos diferentes.
 */
interface PerfilHomologacao {
  board: string;
  rotulo: string;
  /** Colunas publicadas na amostra anonimizada. */
  colunasAmostra: string[];
  /** Colunas digitadas a mao: varridas em busca de CPF/CNPJ. */
  textoLivre: string[];
  /** Coluna alterada na prova 5 para simular mudanca na origem. */
  campoDeTeste: string;
  /**
   * Titulo da coluna que alimenta classificacao de judicializacao.
   *
   * So processos tem. Nos demais quadros a secao de cobertura nao se aplica —
   * e forcar uma analise de judicializacao sobre um quadro de notificacoes
   * produziria numero sem significado.
   */
  colunaClassificacao?: string;
}

const PERFIS: Record<string, PerfilHomologacao> = {
  processos: {
    board: '5959705266',
    rotulo: 'Processos Judiciais',
    colunasAmostra: [
      'id_origem', 'numero', 'ano', 'tipo', 'motivo', 'posicao', 'situacao',
      'situacao_comite', 'atuacao', 'interno', 'comarca', 'valor_causa',
      'data_citacao', 'judicializado', 'revisao_necessaria',
      'fonte', 'versao', 'data_referencia', 'extraido_em',
    ],
    textoLivre: ['motivo', 'tipo', 'situacao', 'situacao_comite'],
    campoDeTeste: 'situacao',
    colunaClassificacao: 'MEU TRABALHO',
  },
  notificacoes: {
    board: '5630368737',
    rotulo: 'Notificações a Clientes',
    colunasAmostra: [
      'id_origem', 'cliente_nome', 'torre', 'unidade', 'grupo', 'modelo',
      'estagio', 'estagio_detalhe', 'situacao', 'data_notificacao',
      'data_solucao', 'total_dias',
      'fonte', 'versao', 'data_referencia', 'extraido_em',
    ],
    textoLivre: ['situacao', 'estagio_detalhe', 'modelo'],
    // `situacao` NAO serve aqui: o board 5630368737 nao tem coluna SITUAÇÃO, e
    // um campo nulo em todos os registros faz a prova 5 comparar null com null.
    // `estagio_detalhe` guarda o rotulo bruto de ESTÁGIOS, preenchido em toda a
    // carga — a ida e volta passa a provar alguma coisa.
    campoDeTeste: 'estagio_detalhe',
  },
  distratos: {
    board: '18404493605',
    rotulo: 'Distratos e Desistências',
    colunasAmostra: [
      'id_origem', 'categoria', 'motivo', 'situacao', 'torre', 'unidade',
      'grupo', 'data_solicitacao', 'data_conclusao', 'total_dias',
      'fonte', 'versao', 'data_referencia', 'extraido_em',
    ],
    textoLivre: ['motivo', 'situacao'],
    campoDeTeste: 'situacao',
  },
  retomadas: {
    board: '18413057491',
    rotulo: 'Retomadas',
    colunasAmostra: [
      'id_origem', 'categoria', 'motivo', 'situacao', 'torre', 'unidade',
      'grupo', 'data_solicitacao', 'data_conclusao', 'total_dias',
      'fonte', 'versao', 'data_referencia', 'extraido_em',
    ],
    textoLivre: ['motivo', 'situacao'],
    campoDeTeste: 'situacao',
  },
  honorarios: {
    board: '7231876117',
    rotulo: 'Honorários Extrajudiciais',
    colunasAmostra: [
      'id_origem', 'tipo', 'motivo', 'situacao', 'unidade', 'grupo',
      'fonte', 'versao', 'data_referencia', 'extraido_em',
    ],
    textoLivre: ['motivo', 'situacao', 'tipo'],
    campoDeTeste: 'situacao',
  },
  entregas: {
    board: '18410779605',
    rotulo: 'Controle de Entrega Carpe Diem',
    colunasAmostra: [
      'id_origem', 'tipo', 'situacao', 'unidade', 'grupo',
      'fonte', 'versao', 'data_referencia', 'extraido_em',
    ],
    textoLivre: ['situacao', 'tipo'],
    campoDeTeste: 'situacao',
  },
};

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

/**
 * Quadro a homologar.
 *
 * `processos` continua sendo o padrao — a homologacao ja aprovada roda sem
 * argumento nenhum, e um comando registrado em documentacao nao muda de
 * significado por causa desta generalizacao.
 */
const QUADRO = (argumento('quadro') ?? 'processos') as ChaveQuadro;

if (!(QUADRO in PERFIS)) {
  console.error(
    `\n✗ Quadro "${QUADRO}" nao tem perfil de homologacao.\n` +
      `  Autorizados: ${Object.keys(PERFIS).join(', ')}\n`,
  );
  process.exit(1);
}

const PERFIL = PERFIS[QUADRO]!;
const BOARD_ESPERADO = PERFIL.board;
const TABELA = QUADROS[QUADRO].destino;

const linhas: string[] = [];
const escrever = (texto = '') => {
  linhas.push(texto);
  console.log(texto);
};

interface ItemConfirmacao {
  rotulo: string;
  ok: boolean;
  detalhe: string;
}

/**
 * Os quatro itens exigidos antes de sincronizar.
 *
 * Falha em qualquer um interrompe: a carga nao comeca. E deliberado que a
 * verificacao do bloqueio de escrita rode ANTES da primeira consulta — provar
 * depois nao prova que a carga foi segura, so que continua sendo.
 */
async function confirmarAntesDeSincronizar(): Promise<ItemConfirmacao[]> {
  const itens: ItemConfirmacao[] = [];

  // 1. token_configurado
  const temToken = config.monday.habilitado;
  itens.push({
    rotulo: '`token_configurado: true`',
    ok: temToken,
    detalhe: temToken
      ? 'MONDAY_TOKEN presente no ambiente (valor nunca exibido)'
      : 'MONDAY_TOKEN AUSENTE',
  });

  // 2. somente leitura — provado ANTES de qualquer chamada
  const escritas = [
    'mutation { create_item(board_id: 1, item_name: "x") { id } }',
    'subscription { events { id } }',
    'query Q { boards { id } } mutation M { delete_item(item_id: 1) { id } }',
  ];
  const aceitas = escritas.filter((c) => {
    try {
      recusarEscrita(c);
      return true;
    } catch {
      return false;
    }
  });
  let leituraAceita = true;
  try {
    recusarEscrita('query { boards(ids: [1]) { items_page { items { id } } } }');
  } catch {
    leituraAceita = false;
  }
  itens.push({
    rotulo: 'integração em modo somente leitura',
    ok: aceitas.length === 0 && leituraAceita,
    detalhe:
      aceitas.length === 0
        ? 'trava no transporte (`consultar`), antes de qualquer requisição'
        : `ACEITOU escrita: ${aceitas.join('; ')}`,
  });

  // 3. quadro configurado
  const quadroOk = String(QUADROS[QUADRO].idPadrao) === BOARD_ESPERADO;
  itens.push({
    rotulo: `quadro configurado = ${BOARD_ESPERADO}`,
    ok: quadroOk,
    detalhe: quadroOk
      ? `${QUADROS[QUADRO].nome} — \`${QUADROS[QUADRO].idPadrao}\``
      : `configurado como ${QUADROS[QUADRO].idPadrao}`,
  });

  // 4. nenhuma mutation ou subscription permitida.
  //
  // Inspeciona as consultas que o pipeline realmente usa, submetendo cada uma
  // a PROPRIA trava — e nao a um regex paralelo. Uma segunda implementacao da
  // regra poderia divergir da primeira, e a divergencia passaria despercebida
  // justamente aqui, onde ela importa.
  //
  // Comentarios sao removidos antes: o codigo da trava traz um exemplo de
  // consulta comentado, e le-lo como consulta do pipeline seria falso positivo.
  const { readFileSync } = await import('node:fs');
  const fonteCliente = readFileSync(
    new URL('../src/integracoes/monday/cliente.ts', import.meta.url).pathname,
    'utf8',
  );
  const semComentarios = fonteCliente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const consultasDoPipeline = [...semComentarios.matchAll(/`([^`]*\{[^`]*)`/g)]
    .map((m) => m[1]!)
    .filter((c) => /\b(query|mutation|subscription)\b/i.test(c));

  const suspeitas = consultasDoPipeline.filter((c) => {
    try {
      recusarEscrita(c);
      return false;
    } catch {
      return true;
    }
  });

  itens.push({
    rotulo: 'nenhuma mutation ou subscription no pipeline',
    ok: suspeitas.length === 0 && consultasDoPipeline.length > 0,
    detalhe:
      suspeitas.length === 0
        ? `${consultasDoPipeline.length} consulta(s) do pipeline, todas aceitas pela trava`
        : `${suspeitas.length} consulta(s) recusada(s) pela propria trava`,
  });

  const falhou = itens.filter((i) => !i.ok);
  if (falhou.length) {
    throw new Error(
      'Pré-confirmação falhou; NADA foi sincronizado:\n' +
        falhou.map((f) => `  ✗ ${f.rotulo}: ${f.detalhe}`).join('\n'),
    );
  }

  // `--pre-confirmacao` para aqui, ANTES de qualquer trafego de rede.
  //
  // Os quatro itens acima sao todos locais: presenca da variavel, comportamento
  // da trava, id do quadro e as consultas do proprio pipeline. Poder audita-los
  // sem alcancar a API separa duas coisas que sao facilmente confundidas quando
  // a rede falha — "a pre-confirmacao nao passou" e "a pre-confirmacao passou,
  // mas nao foi possivel chegar ao Monday". Sao diagnosticos diferentes, e o
  // segundo nao e defeito do produto.
  if (temFlag('pre-confirmacao')) return itens;

  // Só agora a credencial é exercitada de fato.
  const conexao = await testarConexao();
  if (!conexao.ok) {
    throw new Error(`O token nao autenticou no Monday: ${conexao.erro ?? 'sem detalhe'}`);
  }
  itens.push({
    rotulo: 'credencial autenticada',
    ok: true,
    detalhe: `conta: ${conexao.conta ?? '—'}`,
  });

  return itens;
}

/** Estado de uma tabela, para comparar entre as duas execucoes. */
interface Fotografia {
  total: number;
  vivos: number;
  ausentes: number;
  versaoMaxima: number;
  versoesAcima1: number;
  semFonte: number;
  semIdOrigem: number;
  idsOrigemDistintos: number;
  somaHistorico: number;
  atualizadoMax: string | null;
}

async function fotografar(): Promise<Fotografia> {
  const r = await sql<Fotografia>`
    SELECT
      count(*)::int                                              AS total,
      count(*) FILTER (WHERE ausente_desde IS NULL)::int         AS vivos,
      count(*) FILTER (WHERE ausente_desde IS NOT NULL)::int     AS ausentes,
      coalesce(max(versao), 0)::int                              AS "versaoMaxima",
      count(*) FILTER (WHERE versao > 1)::int                    AS "versoesAcima1",
      count(*) FILTER (WHERE fonte IS DISTINCT FROM 'monday')::int AS "semFonte",
      count(*) FILTER (WHERE id_origem IS NULL)::int             AS "semIdOrigem",
      count(DISTINCT id_origem)::int                             AS "idsOrigemDistintos",
      coalesce(sum(jsonb_array_length(historico)), 0)::int        AS "somaHistorico",
      max(atualizado_em)::text                                   AS "atualizadoMax"
    FROM ${sql.table(TABELA)}
    WHERE fonte = 'monday'
  `.execute(db);
  return r.rows[0]!;
}

function formatarResumo(titulo: string, r: ResumoExecucao, f: Fotografia): void {
  escrever(`### ${titulo}`);
  escrever();
  escrever('| Métrica | Valor |');
  escrever('| --- | --- |');
  escrever(`| Identificador da execução | \`${r.id}\` |`);
  escrever(`| Quadro | ${PERFIL.rotulo} — board \`${BOARD_ESPERADO}\` |`);
  escrever(`| Início | ${r.iniciada_em.toISOString()} |`);
  escrever(`| Conclusão | ${r.finalizada_em.toISOString()} |`);
  escrever(`| Duração | ${(r.duracao_ms / 1000).toFixed(2)} s |`);
  escrever(`| **Quantidade recebida** (lidos da origem) | **${r.lidos}** |`);
  escrever(`| **Páginas consultadas** | **${r.paginas ?? '—'}** |`);
  escrever(`| **Último cursor** | ${r.ultimo_cursor ? `\`${r.ultimo_cursor}\`` : '`null` — leitura chegou ao fim'} |`);
  escrever(`| **Quantidade normalizada** | **${r.normalizados ?? '—'}** |`);
  escrever(`| **Incluída** | **${r.incluidos}** |`);
  escrever(`| **Atualizada** (conteúdo mudou) | **${r.atualizados}** |`);
  escrever(`| **Inalterada** (reconhecida, nada a mudar) | **${r.inalterados}** |`);
  escrever(`| **Ignorada** | **${r.ignorados}** |`);
  escrever(`| **Duplicada** | **${r.duplicados}** |`);
  escrever(`| **Com erro** | **${r.comErro}** |`);
  escrever(`| **Data de referência** | ${r.data_referencia ?? '—'} |`);
  escrever(`| **Último dado válido (antes desta execução)** | ${r.ultimo_dado_valido_em?.toISOString() ?? 'nenhum — primeira carga'} |`);
  escrever(`| Status | ${r.status}${r.parcial ? ' (parcial)' : ''} |`);
  escrever(`| Contabilidade fecha | ${r.contabilidade_fecha ? 'sim' : 'NÃO'} |`);
  escrever();

  if (r.motivos_ignorados.length) {
    escrever('**Ignorados, por motivo** — nenhum descarte é silencioso:');
    escrever();
    escrever('| Motivo | Quantidade |');
    escrever('| --- | --- |');
    for (const m of r.motivos_ignorados) {
      escrever(`| ${m.motivo} | ${m.quantidade} |`);
    }
    escrever();
  }

  escrever('**Estado da tabela após a execução:**');
  escrever();
  escrever('| Item | Valor |');
  escrever('| --- | --- |');
  escrever(`| Registros com \`fonte = 'monday'\` | ${f.total} |`);
  escrever(`| Vivos / marcados ausentes | ${f.vivos} / ${f.ausentes} |`);
  escrever(`| \`id_origem\` distintos | ${f.idsOrigemDistintos} |`);
  escrever(`| Maior versão | ${f.versaoMaxima} |`);
  escrever(`| Registros com versão > 1 | ${f.versoesAcima1} |`);
  escrever(`| Entradas de histórico acumuladas | ${f.somaHistorico} |`);
  escrever(`| Sem \`fonte\` correta / sem \`id_origem\` | ${f.semFonte} / ${f.semIdOrigem} |`);
  escrever();
}

/** Amostra anonimizada: prova o formato sem expor cliente real. */
async function amostraAnonimizada(): Promise<void> {
  // As colunas vem do perfil do quadro. Um `SELECT *` publicaria qualquer
  // coluna nova que o esquema ganhasse — inclusive uma que carregue dado
  // pessoal —, e a amostra e o unico lugar do relatorio com dado real.
  const colunas = PERFIL.colunasAmostra.map((c) => sql.ref(c));
  const linhasAmostra = await sql<Record<string, unknown>>`
    SELECT ${sql.join(colunas, sql`, `)}
    FROM ${sql.table(TABELA)}
    WHERE fonte = 'monday' AND ausente_desde IS NULL
    ORDER BY criado_em
    LIMIT 3
  `.execute(db);

  escrever('## Amostra anonimizada');
  escrever();
  if (!linhasAmostra.rows.length) {
    escrever('_Nenhum registro para amostrar._');
    escrever();
    return;
  }

  escrever('Sem CPF, CNPJ ou nome completo. Número do processo reduzido aos quatro');
  escrever('últimos dígitos, valor da causa substituído, `id_origem` reduzido, e os');
  escrever('campos de texto livre passam por uma varredura de documento — `MOTIVO` é');
  escrever('digitado à mão e pode conter um CPF que ninguém previu.');
  escrever();
  const mascaradas = linhasAmostra.rows.map((l) => {
    const m: Record<string, unknown> = { ...l };

    if ('id_origem' in m) m.id_origem = mascararId(String(m.id_origem ?? ''));
    if ('numero' in m) m.numero = mascararProcesso(m.numero as string | null);
    if ('valor_causa' in m) m.valor_causa = m.valor_causa === null ? null : '***';
    // ATUAÇÃO traz "EXTERNO <escritório>", que pode ser nome de pessoa.
    if ('atuacao' in m) m.atuacao = mascararAtuacao(m.atuacao as string | null);
    // Nome de cliente e nome completo: nao entra na amostra de jeito nenhum.
    if ('cliente_nome' in m) m.cliente_nome = m.cliente_nome === null ? null : '***';

    for (const campo of PERFIL.textoLivre) {
      if (campo in m) m[campo] = varrerTextoLivre(m[campo] as string | null);
    }

    return m;
  });

  escrever('```json');
  escrever(JSON.stringify(mascaradas, null, 2));
  escrever('```');
  escrever();

  // A conferência é sobre o que SAI, não sobre o que entrou. Rodá-la na origem
  // acusaria dado pessoal que a máscara já removeu — e o alerta perderia
  // sentido justamente por ser sempre verdadeiro.
  const naOrigem = varrerDocumentos(JSON.stringify(linhasAmostra.rows));
  const naSaida = varrerDocumentos(JSON.stringify(mascaradas));

  escrever(
    naSaida.length === 0
      ? '_Varredura da amostra publicada: nenhum CPF ou CNPJ presente._'
      : `> ⚠️ **A amostra publicada ainda contém possível documento:** ${naSaida.join('; ')}`,
  );
  if (naOrigem.length) {
    escrever();
    escrever(
      `> ${naOrigem.join('; ')} foram encontrados nos campos de texto livre da ORIGEM e ` +
        'removidos da amostra. Vale avisar o jurídico: documento digitado em campo ' +
        'livre não é protegido por nenhum mascaramento de coluna.',
    );
  }
  escrever();
}

/**
 * Remove sequencias com cara de documento de texto digitado a mao.
 *
 * `MOTIVO` e campo livre. Alguem pode ter escrito "cobranca do CPF 123.456.789-00"
 * e nenhum mapeamento previu isso. A varredura e sobre o VALOR, nao sobre o nome
 * do campo — e o que pega o caso nao previsto.
 */
function varrerTextoLivre(texto: string | null): string | null {
  if (!texto) return texto;
  return texto
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento removido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento removido]');
}

/** "EXTERNO Dra. Fulana de Tal" → "EXTERNO Dra. F." */
function mascararAtuacao(valor: string | null): string | null {
  if (!valor) return valor;
  const externo = /^(EXTERNO)\s+(.+)$/i.exec(valor.trim());
  if (!externo) return valor;

  const termos = externo[2]!.split(/\s+/);
  const tratamento = /^(dr|dra|sr|sra)\.?$/i.test(termos[0] ?? '') ? termos.shift() : null;
  const inicial = termos[0] ? `${termos[0][0]}.` : '';
  return [externo[1], tratamento, inicial].filter(Boolean).join(' ');
}

/** Procura sequencias com cara de CPF ou CNPJ num texto serializado. */
function varrerDocumentos(texto: string): string[] {
  const achados: string[] = [];
  const padroes = [
    ['CPF', /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g],
    ['CNPJ', /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g],
  ] as const;

  for (const [rotulo, padrao] of padroes) {
    const encontrados = texto.match(padrao);
    if (encontrados) achados.push(`${encontrados.length} ${rotulo}`);
  }
  return achados;
}

function mascararId(id: string): string {
  const so = id.replace(/^monday:/, '');
  return so.length > 4 ? `***${so.slice(-4)}` : '***';
}

function mascararProcesso(numero: string | null): string | null {
  if (!numero) return null;
  const digitos = numero.replace(/\D/g, '');
  return digitos.length > 4 ? `**********${digitos.slice(-4)}` : '****';
}

/**
 * Relata os rotulos REAIS encontrados, coluna a coluna.
 *
 * Sai de `registros_brutos`, que tem todas as colunas — inclusive as que
 * ninguem mapeou. E como `responsavel` aparece sem ter sido previsto.
 */
function relatarRotulos(
  l: LevantamentoRotulos,
  ausentes: string[],
  ambiguos: TituloAmbiguo[],
): void {
  escrever('## Rótulos reais encontrados');
  escrever();
  escrever(`Levantados de ${l.itens} item(ns) da primeira leitura, a partir do payload`);
  escrever('original — não do dado já interpretado.');
  escrever();

  if (ausentes.length) {
    escrever(
      `> **Colunas do mapa não encontradas no quadro:** ${ausentes.join(', ')}. ` +
        'Gravadas como nulas, nunca presumidas.',
    );
    escrever();
  }

  // Titulo repetido: a resolucao por titulo escolheu, e a escolha aparece.
  if (ambiguos.length) {
    escrever('> **Títulos repetidos no quadro.** A resolução por título pressupõe que o');
    escrever('> título identifique a coluna. Aqui ele não identifica, e o desempate');
    escrever('> — a primeira coluna que não for espelho — decidiu. A escolha está');
    escrever('> declarada abaixo para conferência, não para ser aceita em silêncio.');
    escrever();
    escrever('| Título | Colunas com esse título | Escolhida hoje |');
    escrever('| --- | --- | --- |');
    for (const a of ambiguos) {
      const lista = a.colunas.map((c) => `\`${c.id}\` (${c.tipo})`).join(' · ');
      escrever(`| \`${a.titulo}\` | ${lista} | \`${a.vencedora}\` |`);
    }
    escrever();
  }

  // Grupos primeiro: a competência sai daqui, não de coluna de data.
  escrever('### Grupos');
  escrever();
  escrever('| Grupo | Itens |');
  escrever('| --- | --- |');
  for (const g of l.grupos) escrever(`| ${g.valor} | ${g.ocorrencias} |`);
  escrever();

  escrever('### Colunas');
  escrever();
  for (const c of l.colunas) {
    const consumo = c.campoPatrono ? `→ \`${c.campoPatrono}\`` : '_(não mapeada)_';
    escrever(`#### ${c.titulo} ${consumo}`);
    escrever();
    escrever(
      `\`${c.id}\` · tipo \`${c.tipo}\` · ` +
        `${c.preenchidos} preenchido(s), ${c.vazios} vazio(s) · ` +
        `${c.rotulos.length} valor(es) distinto(s)`,
    );
    escrever();

    if (!c.rotulos.length) {
      escrever('_Coluna vazia em todos os itens._');
      escrever();
      continue;
    }

    // Coluna de texto livre e digitada a mao e pode conter nome de parte ou
    // documento — a NOME DA PARTE / REFERENCIA do board real contem exatamente
    // isso. Este relatorio e evidencia versionada: os valores NAO sao
    // listados, so a contagem. A regra da amostra ("sem CPF/CNPJ/nome
    // completo") vale para o relatorio inteiro, nao so para a secao da
    // amostra.
    if (c.tipo === 'text') {
      escrever('_Valores não listados: texto livre pode conter nome ou documento');
      escrever('digitado à mão, e este relatório é evidência versionada._');
      escrever();
      continue;
    }

    // Demais colunas de muitos valores (data, numero) tem valor quase distinto
    // por item; listar todos seria despejar a base. As de classificação são
    // listadas inteiras.
    // Comparacao pela forma canonica: o quadro real tem `'MEU TRABALHO'` com
    // aspas e `STATUS (para comitê)` em caixa mista. Com `includes` cru as duas
    // deixavam de ser reconhecidas como colunas de classificacao.
    const ehClassificacao = (COLUNAS_DE_CLASSIFICACAO as readonly string[]).some((t) =>
      mesmoTitulo(t, c.titulo),
    );
    const limite = ehClassificacao ? c.rotulos.length : 15;

    escrever('| Valor | Ocorrências |');
    escrever('| --- | --- |');
    for (const r of c.rotulos.slice(0, limite)) {
      escrever(`| ${r.valor} | ${r.ocorrencias} |`);
    }
    if (c.rotulos.length > limite) {
      escrever(`| _… mais ${c.rotulos.length - limite} valor(es)_ | |`);
    }
    escrever();
  }

  // ── Cobertura das regras ────────────────────────────────────────────────
  //
  // So se aplica a quadros que alimentam a classificacao de judicializacao.
  // Rodar esta analise sobre um quadro de notificacoes produziria uma taxa de
  // judicializacao de notificacoes — numero sem significado nenhum.
  if (!PERFIL.colunaClassificacao) {
    escrever('> Este quadro não alimenta a classificação de judicialização.');
    escrever('> A análise de cobertura não se aplica.');
    escrever();
    return;
  }

  const tituloClassificacao = PERFIL.colunaClassificacao;
  const situacao = l.colunas.find((c) => mesmoTitulo(c.titulo, tituloClassificacao));
  if (!situacao) {
    escrever(`> **Coluna ${tituloClassificacao} não encontrada.** A classificação de`);
    escrever('> judicialização depende dela; sem a coluna, todos os registros');
    escrever('> ficam em revisão necessária.');
    escrever();
    return;
  }

  const analise = analisarCoberturaJudicializacao(situacao.titulo, situacao.rotulos);

  escrever('### Cobertura das regras de judicialização');
  escrever();
  escrever(
    `${analise.cobertos} de ${analise.total} rótulo(s) cobertos pelas regras atuais. ` +
      `${analise.emRevisao} rótulo(s) sem cobertura, afetando ` +
      `**${analise.registrosEmRevisao} registro(s)**.`,
  );
  escrever();
  escrever('| Rótulo | Ocorrências | Classificação |');
  escrever('| --- | --- | --- |');
  for (const r of analise.rotulos) {
    const marca = {
      judicializado: '⚖️ judicializado',
      nao_judicializado: '— não judicializado',
      revisao_necessaria: '⚠️ **revisão necessária**',
    }[r.cobertura];
    escrever(`| ${r.valor} | ${r.ocorrencias} | ${marca} |`);
  }
  escrever();

  if (!analise.propostas.length) {
    escrever('Todos os rótulos reais estão cobertos. Nenhuma regra precisa mudar.');
    escrever();
    return;
  }

  escrever('### Propostas de regra — AGUARDANDO APROVAÇÃO');
  escrever();
  escrever('> Nenhuma delas foi aplicada. Os registros afetados estão gravados com');
  escrever('> `revisao_necessaria = true` e `judicializado = false`: o que não se');
  escrever('> reconhece não é presumido. Alterar a metodologia muda a taxa de');
  escrever('> judicialização, que é indicador de comitê.');
  escrever();

  for (const p of analise.propostas) {
    escrever(`**\`${p.rotulo}\`** — ${p.registrosAfetados} registro(s)`);
    escrever();
    escrever(`- **Lista sugerida:** ${p.lista === 'indefinida' ? '_indefinida_' : `\`${p.lista}\``}`);
    if (p.termoSugerido) escrever(`- **Termo sugerido:** \`${p.termoSugerido}\``);
    escrever(`- **Justificativa:** ${p.justificativa}`);
    escrever(`- **Exemplos (id de origem):** ${p.exemplos.join(', ')}`);
    escrever();
  }
}

/** As sete provas exigidas na segunda execução. */
async function provas(
  primeira: ResumoExecucao,
  segunda: ResumoExecucao,
  antes: Fotografia,
  depois: Fotografia,
): Promise<number> {
  escrever('## Provas da segunda execução');
  escrever();
  escrever('| # | Prova | Resultado | Evidência |');
  escrever('| --- | --- | --- | --- |');

  let falhas = 0;
  const prova = (n: number, texto: string, ok: boolean, evidencia: string) => {
    if (!ok) falhas++;
    escrever(`| ${n} | ${texto} | ${ok ? '✅' : '❌'} | ${evidencia} |`);
  };

  // 1. Ausência de duplicação.
  prova(
    1,
    'Ausência de duplicação',
    depois.total === antes.total && depois.idsOrigemDistintos === depois.total,
    `${antes.total} → ${depois.total} registros; ${depois.idsOrigemDistintos} \`id_origem\` distintos`,
  );

  // 2. Upsert idempotente: a segunda não inclui nada de novo.
  prova(
    2,
    'Upsert idempotente',
    segunda.incluidos === 0 && segunda.atualizados === 0 && segunda.lidos === primeira.lidos,
    `2ª execução: ${segunda.incluidos} incluídos, ${segunda.atualizados} atualizados, ` +
      `${segunda.inalterados} inalterados sobre ${segunda.lidos} lidos`,
  );

  // 3. Fonte e id_origem preservados.
  prova(
    3,
    'Preservação de `fonte` e `id_origem`',
    depois.semFonte === 0 && depois.semIdOrigem === 0,
    `${depois.semFonte} sem fonte correta, ${depois.semIdOrigem} sem \`id_origem\``,
  );

  // 4. Registros inalterados não geram versão nova.
  //
  // É o teste mais informativo: o gatilho só incrementa `versao` quando algum
  // campo muda de fato. Se a versão subiu sem o dado mudar, o upsert está
  // reescrevendo o que não devia — e toda a trilha de histórico vira ruído.
  prova(
    4,
    'Registros inalterados não geram versões indevidas',
    depois.somaHistorico === antes.somaHistorico && depois.versaoMaxima === antes.versaoMaxima,
    `histórico ${antes.somaHistorico} → ${depois.somaHistorico}; versão máxima ${antes.versaoMaxima} → ${depois.versaoMaxima}`,
  );

  // 5. Registros alterados são atualizados corretamente.
  const alterado = await conferirAtualizacao();
  prova(
    5,
    'Registros alterados são atualizados corretamente',
    alterado.ok,
    alterado.evidencia,
  );

  // 6. Falha posterior não apaga o último dado válido.
  const falha = await conferirFalhaNaoApaga(depois);
  prova(6, 'Falha posterior não apaga o último dado válido', falha.ok, falha.evidencia);

  // 7. Mutation e subscription continuam bloqueadas.
  const bloqueio = await conferirBloqueio();
  prova(7, 'Mutation e subscription continuam bloqueadas', bloqueio.ok, bloqueio.evidencia);

  escrever();
  return falhas;
}

/**
 * Prova 5 — altera um registro no BANCO, roda de novo e confere que o upsert
 * devolveu o valor da origem.
 *
 * Simula divergência sem tocar no Monday: o que se está provando é que o
 * upsert corrige o destino, não que alguém consiga editar a origem.
 */
async function conferirAtualizacao(): Promise<{ ok: boolean; evidencia: string }> {
  // A coluna alterada vem do perfil: cada quadro tem a sua, e `situacao` nem
  // existe em todos.
  const campo = sql.ref(PERFIL.campoDeTeste);

  const alvo = await sql<{ id: string; alvo: string | null; versao: number }>`
    SELECT id, ${campo} AS alvo, versao FROM ${sql.table(TABELA)}
    WHERE fonte = 'monday' AND ausente_desde IS NULL
    ORDER BY criado_em LIMIT 1
  `.execute(db);

  const registro = alvo.rows[0];
  if (!registro) return { ok: false, evidencia: 'nenhum registro para testar' };

  const original = registro.alvo;
  const versaoAntes = registro.versao;

  await sql`
    UPDATE ${sql.table(TABELA)} SET ${campo} = 'DIVERGENCIA DE TESTE' WHERE id = ${registro.id}
  `.execute(db);

  const r = await sincronizarQuadro({
    quadro: QUADRO,
    competenciaRef: argumento('competencia') ?? null,
    comiteId: null,
    usuarioId: null,
  });

  const depois = await sql<{ alvo: string | null; versao: number }>`
    SELECT ${campo} AS alvo, versao FROM ${sql.table(TABELA)} WHERE id = ${registro.id}
  `.execute(db);

  const voltou = depois.rows[0]?.alvo === original;
  const versaoSubiu = (depois.rows[0]?.versao ?? 0) > versaoAntes;

  return {
    ok: voltou && versaoSubiu && r.atualizados >= 1,
    evidencia:
      `\`${PERFIL.campoDeTeste}\` alterado no banco e devolvido pela origem ` +
      `(\`${original ?? 'null'}\`); versão ${versaoAntes} → ${depois.rows[0]?.versao}; ` +
      `${r.atualizados} atualizado(s)`,
  };
}

/**
 * Prova 6 — a falha é simulada apontando o cliente para um quadro inexistente.
 *
 * O que se verifica não é a mensagem de erro: é que a contagem de registros
 * vivos NÃO muda, e que `ultima_carga_valida_em` NÃO avança.
 */
async function conferirFalhaNaoApaga(antes: Fotografia): Promise<{ ok: boolean; evidencia: string }> {
  const validoAntes = await sql<{ em: string | null }>`
    SELECT ultima_carga_valida_em::text AS em FROM integracoes WHERE sistema = 'monday'
  `.execute(db);

  const idOriginal = QUADROS[QUADRO].idPadrao;
  let resultado: ResumoExecucao;
  try {
    // Quadro inexistente: o cliente lanca, e o fluxo cai no caminho de falha.
    (QUADROS[QUADRO] as { idPadrao: string }).idPadrao = '1';
    resultado = await sincronizarQuadro({
      quadro: QUADRO,
      competenciaRef: argumento('competencia') ?? null,
      comiteId: null,
      usuarioId: null,
    });
  } finally {
    (QUADROS[QUADRO] as { idPadrao: string }).idPadrao = idOriginal;
  }

  const depois = await fotografar();
  const validoDepois = await sql<{ em: string | null }>`
    SELECT ultima_carga_valida_em::text AS em FROM integracoes WHERE sistema = 'monday'
  `.execute(db);

  const preservou = depois.vivos === antes.vivos && depois.total === antes.total;
  const naoAvancou = validoAntes.rows[0]?.em === validoDepois.rows[0]?.em;

  return {
    ok: preservou && naoAvancou && resultado.status === 'erro',
    evidencia:
      `após falha: ${depois.vivos} vivos (era ${antes.vivos}); ` +
      `\`ultima_carga_valida_em\` ${naoAvancou ? 'não avançou' : 'AVANÇOU — erro'}; ` +
      `status \`${resultado.status}\``,
  };
}

/** Prova 7 — o proxy recusa mutation e subscription. */
async function conferirBloqueio(): Promise<{ ok: boolean; evidencia: string }> {
  const { recusarEscrita } = await import('../src/integracoes/monday/cliente.js');

  const casos = [
    'mutation { create_item(board_id: 1, item_name: "x") { id } }',
    'subscription { events { id } }',
    '  MUTATION  { change_column_value(item_id: 1) { id } }',
    'query Q { boards { id } } mutation M { delete_item(item_id: 1) { id } }',
  ];

  const recusados: string[] = [];
  for (const consulta of casos) {
    try {
      recusarEscrita(consulta);
      recusados.push(`ACEITOU: ${consulta.slice(0, 40)}`);
    } catch {
      // Recusa esperada.
    }
  }

  // Uma consulta legítima continua passando — senão o bloqueio seria só uma
  // forma cara de desligar a integração.
  let leituraOk = true;
  try {
    recusarEscrita('query { boards(ids: [1]) { items_page { items { id } } } }');
  } catch {
    leituraOk = false;
  }

  return {
    ok: recusados.length === 0 && leituraOk,
    evidencia: recusados.length
      ? recusados.join('; ')
      : `${casos.length} tentativas de escrita recusadas; consulta de leitura aceita`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════

async function gravarSaida(): Promise<void> {
  const saida = argumento('saida');
  if (!saida) return;
  await fs.writeFile(saida, linhas.join('\n') + '\n');
  console.log(`\n→ relatório gravado em ${saida}`);
}

async function principal(): Promise<void> {
  const def = QUADROS[QUADRO];

  if (String(def.idPadrao) !== BOARD_ESPERADO) {
    throw new Error(
      `O quadro "${QUADRO}" está configurado como ${def.idPadrao}, e o perfil de ` +
        `homologação autoriza apenas ${BOARD_ESPERADO}. Nada foi executado.`,
    );
  }

  if (!config.monday.habilitado) {
    throw new Error(
      'MONDAY_TOKEN não está no ambiente. A homologação não roda sem ele.\n' +
        'Configure APENAS por variável de ambiente:\n' +
        '  MONDAY_TOKEN=... DATABASE_URL=... npx tsx scripts/homologar-monday.ts',
    );
  }

  const competencia = argumento('competencia') ?? null;

  // ── Pré-confirmação: quatro itens, antes de qualquer leitura ──────────────
  //
  // Nada é sincronizado enquanto os quatro não fecharem. Uma verificação que
  // acontece depois da carga não é verificação: é constatação.
  const preConfirmacao = await confirmarAntesDeSincronizar();

  escrever('# Homologação controlada do Monday');
  escrever();
  escrever(`**Quadro:** ${PERFIL.rotulo} — board \`${BOARD_ESPERADO}\`  `);
  escrever(`**Ambiente:** ${config.ambiente}  `);
  escrever(`**Competência:** ${competencia ?? 'todas'}  `);
  escrever(`**Executado em:** ${new Date().toISOString()}  `);
  escrever(`**Versão da API do Monday:** ${config.monday.versaoApi}`);
  escrever();
  escrever('> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e');
  escrever(
    temFlag('pre-confirmacao')
      ? '> `subscription` antes de qualquer chamada — ver item 2 da pré-confirmação.'
      : '> `subscription` antes de qualquer chamada — ver prova 7.',
  );
  escrever();

  escrever('## Pré-confirmação');
  escrever();
  escrever('| Item | Resultado |');
  escrever('| --- | --- |');
  for (const item of preConfirmacao) {
    escrever(`| ${item.rotulo} | ${item.ok ? '✅' : '❌'} ${item.detalhe} |`);
  }
  escrever();

  if (temFlag('pre-confirmacao')) {
    escrever(
      '_Execução limitada à pré-confirmação: nenhuma leitura foi feita e nada foi gravado._',
    );
    escrever();
    await gravarSaida();
    return;
  }

  if (temFlag('simular')) {
    escrever('_Execução em modo simulação: nada foi gravado._');
    escrever();
  }

  // ── Primeira execução ─────────────────────────────────────────────────────
  escrever('## Primeira execução');
  escrever();
  let mapaResolvido: {
    porCampo: Map<string, string>;
    titulosPorId: Map<string, { titulo: string; tipo: string }>;
    ausentes: string[];
    ambiguos: TituloAmbiguo[];
  } | null = null;

  const primeira = await sincronizarQuadro({
    quadro: QUADRO,
    competenciaRef: competencia,
    comiteId: null,
    usuarioId: null,
    simular: temFlag('simular'),
    aoResolverColunas: (dados) => {
      mapaResolvido = dados;
    },
  });
  const apos1 = await fotografar();
  formatarResumo('Resultado', primeira, apos1);

  // ── Rótulos reais ─────────────────────────────────────────────────────────
  if (mapaResolvido) {
    const levantamento = await levantarRotulos(
      primeira.id,
      mapaResolvido.porCampo,
      mapaResolvido.titulosPorId,
    );
    relatarRotulos(levantamento, mapaResolvido.ausentes, mapaResolvido.ambiguos);
  }

  if (temFlag('simular')) {
    escrever('_Simulação encerrada. A segunda execução exige gravação._');
    return;
  }

  // ── Segunda execução ──────────────────────────────────────────────────────
  escrever('## Segunda execução');
  escrever();
  const segunda = await sincronizarQuadro({
    quadro: QUADRO,
    competenciaRef: competencia,
    comiteId: null,
    usuarioId: null,
  });
  const apos2 = await fotografar();
  formatarResumo('Resultado', segunda, apos2);

  const falhas = await provas(primeira, segunda, apos1, apos2);

  await amostraAnonimizada();

  // ── Inconsistências ───────────────────────────────────────────────────────
  const inconsistencias = await db
    .selectFrom('inconsistencias')
    .select(['tipo', 'gravidade', 'descricao', 'ocorrencias'])
    .where('fonte', '=', 'monday')
    .orderBy('detectado_em', 'desc')
    .limit(30)
    .execute();

  escrever('## Inconsistências encontradas');
  escrever();
  if (!inconsistencias.length) {
    escrever('Nenhuma inconsistência registrada nesta homologação.');
  } else {
    escrever('| Tipo | Gravidade | Ocorrências | Descrição |');
    escrever('| --- | --- | --- | --- |');
    for (const i of inconsistencias) {
      escrever(
        `| ${i.tipo} | ${i.gravidade} | ${i.ocorrencias} | ${i.descricao.slice(0, 140)} |`,
      );
    }
  }
  escrever();

  escrever('---');
  escrever();
  escrever(
    falhas === 0
      ? `**As sete provas passaram.** A homologação do quadro ${PERFIL.rotulo} está pronta para aprovação.`
      : `**${falhas} prova(s) falharam.** A homologação NÃO deve ser aprovada nesta condição.`,
  );

  await gravarSaida();

  if (falhas > 0) process.exitCode = 1;
}

principal()
  .then(() => fecharBanco())
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(async (erro) => {
    console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)}`);
    await fecharBanco().catch(() => {});
    process.exit(1);
  });
