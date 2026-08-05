/**
 * Homologacao controlada do Monday — quadro Processos Judiciais (5959705266).
 *
 * Executa DUAS sincronizacoes consecutivas do mesmo quadro e produz o relatorio
 * exigido: metricas completas da primeira, e as sete provas da segunda.
 *
 * Por que duas: a primeira mostra o que entrou; a segunda prova que rodar de
 * novo NAO duplica, NAO reescreve o que nao mudou, e NAO perde proveniencia.
 * Uma execucao sozinha nao distingue "upsert idempotente" de "insert que ainda
 * nao colidiu".
 *
 * Escopo travado neste script: SO o quadro de processos. Os demais quadros
 * ficam de fora ate a aprovacao desta homologacao.
 *
 * Uso:
 *   MONDAY_TOKEN=... DATABASE_URL=... npx tsx scripts/homologar-monday.ts
 *   ... --competencia 2026-07     recorta por competencia
 *   ... --simular                 le e transforma sem gravar
 *   ... --saida relatorio.md      grava o relatorio em arquivo
 *
 * O token vem SO de variavel de ambiente. Nunca por argumento: argumento
 * aparece em `ps` e no historico do shell.
 */
import { promises as fs } from 'node:fs';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import { config } from '../src/config.js';
import { QUADROS } from '../src/integracoes/monday/quadros.js';
import { sincronizarQuadro } from '../src/integracoes/monday/sincronizar.js';
import { recusarEscrita, testarConexao } from '../src/integracoes/monday/cliente.js';
import {
  analisarCoberturaJudicializacao,
  COLUNAS_DE_CLASSIFICACAO,
  levantarRotulos,
  type LevantamentoRotulos,
} from '../src/integracoes/monday/rotulos.js';
import type { ResumoExecucao } from '../src/integracoes/execucoes.js';

const QUADRO = 'processos' as const;
const BOARD_ESPERADO = '5959705266';
const TABELA = 'processos_judiciais';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

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
    rotulo: 'quadro configurado = 5959705266',
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
  escrever(`| Quadro | Processos Judiciais — board \`${BOARD_ESPERADO}\` |`);
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
  const linhasAmostra = await sql<Record<string, unknown>>`
    SELECT id_origem, numero, ano, tipo, motivo, posicao, situacao,
           situacao_comite, atuacao, interno, comarca, valor_causa,
           data_citacao, judicializado, revisao_necessaria,
           fonte, versao, data_referencia, extraido_em
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
  const mascaradas = linhasAmostra.rows.map((l) => ({
    ...l,
    id_origem: mascararId(String(l.id_origem ?? '')),
    numero: mascararProcesso(l.numero as string | null),
    valor_causa: l.valor_causa === null ? null : '***',
    motivo: varrerTextoLivre(l.motivo as string | null),
    tipo: varrerTextoLivre(l.tipo as string | null),
    situacao: varrerTextoLivre(l.situacao as string | null),
    situacao_comite: varrerTextoLivre(l.situacao_comite as string | null),
    // ATUAÇÃO traz "EXTERNO <escritório>", que pode ser nome de pessoa.
    atuacao: mascararAtuacao(l.atuacao as string | null),
  }));

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
function relatarRotulos(l: LevantamentoRotulos, ausentes: string[]): void {
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

    // Colunas de texto livre têm valor distinto por item; listar todos seria
    // despejar a base. As de classificação são listadas inteiras.
    const ehClassificacao = (COLUNAS_DE_CLASSIFICACAO as readonly string[]).includes(c.titulo);
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
  const situacao = l.colunas.find((c) => c.titulo === 'MEU TRABALHO');
  if (!situacao) {
    escrever('> **Coluna MEU TRABALHO não encontrada.** A classificação de');
    escrever('> judicialização depende dela; sem a coluna, todos os processos');
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
  const alvo = await sql<{ id: string; situacao: string | null; versao: number }>`
    SELECT id, situacao, versao FROM ${sql.table(TABELA)}
    WHERE fonte = 'monday' AND ausente_desde IS NULL
    ORDER BY criado_em LIMIT 1
  `.execute(db);

  const registro = alvo.rows[0];
  if (!registro) return { ok: false, evidencia: 'nenhum registro para testar' };

  const original = registro.situacao;
  const versaoAntes = registro.versao;

  await sql`
    UPDATE ${sql.table(TABELA)} SET situacao = 'DIVERGENCIA DE TESTE' WHERE id = ${registro.id}
  `.execute(db);

  const r = await sincronizarQuadro({
    quadro: QUADRO,
    competenciaRef: argumento('competencia') ?? null,
    comiteId: null,
    usuarioId: null,
  });

  const depois = await sql<{ situacao: string | null; versao: number }>`
    SELECT situacao, versao FROM ${sql.table(TABELA)} WHERE id = ${registro.id}
  `.execute(db);

  const voltou = depois.rows[0]?.situacao === original;
  const versaoSubiu = (depois.rows[0]?.versao ?? 0) > versaoAntes;

  return {
    ok: voltou && versaoSubiu && r.atualizados >= 1,
    evidencia:
      `situação alterada no banco e devolvida pela origem (\`${original ?? 'null'}\`); ` +
      `versão ${versaoAntes} → ${depois.rows[0]?.versao}; ${r.atualizados} atualizado(s)`,
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

async function principal(): Promise<void> {
  const def = QUADROS[QUADRO];

  if (String(def.idPadrao) !== BOARD_ESPERADO) {
    throw new Error(
      `O quadro de processos está configurado como ${def.idPadrao}, e a homologação ` +
        `foi autorizada apenas para ${BOARD_ESPERADO}. Nada foi executado.`,
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
  escrever(`**Quadro:** Processos Judiciais — board \`${BOARD_ESPERADO}\`  `);
  escrever(`**Ambiente:** ${config.ambiente}  `);
  escrever(`**Competência:** ${competencia ?? 'todas'}  `);
  escrever(`**Executado em:** ${new Date().toISOString()}  `);
  escrever(`**Versão da API do Monday:** ${config.monday.versaoApi}`);
  escrever();
  escrever('> Nenhum dado foi alterado no Monday. O proxy recusa `mutation` e');
  escrever('> `subscription` antes de qualquer chamada — ver prova 7.');
  escrever();

  escrever('## Pré-confirmação');
  escrever();
  escrever('| Item | Resultado |');
  escrever('| --- | --- |');
  for (const item of preConfirmacao) {
    escrever(`| ${item.rotulo} | ${item.ok ? '✅' : '❌'} ${item.detalhe} |`);
  }
  escrever();

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
    relatarRotulos(levantamento, mapaResolvido.ausentes);
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
      ? '**As sete provas passaram.** A homologação do quadro de Processos Judiciais está pronta para aprovação.'
      : `**${falhas} prova(s) falharam.** A homologação NÃO deve ser aprovada nesta condição.`,
  );

  const saida = argumento('saida');
  if (saida) {
    await fs.writeFile(saida, linhas.join('\n') + '\n');
    console.log(`\n→ relatório gravado em ${saida}`);
  }

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
