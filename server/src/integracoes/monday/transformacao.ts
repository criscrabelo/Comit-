/**
 * Transformacao dos itens do Monday em registros do dominio.
 *
 * Cada regra aqui foi extraida do codigo em producao, com a origem citada.
 * Nenhuma regra nova foi inventada — as que existem foram descobertas na
 * pratica, contra os quadros reais da Coevo, e perde-las seria regressao.
 *
 * O valor bruto de origem e sempre preservado: a transformacao produz o
 * normalizado, nunca substitui o original.
 */
import type { ItemMonday, ValorColuna } from './cliente.js';

/**
 * Le uma coluna do item.
 *
 * Colunas mirror e formula vem com `text` vazio — o valor visivel esta em
 * `display_value`. Regra de js/monday-sync.js:90-96, ausente no code-drop
 * paralelo e no adaptador Python.
 */
export function lerColuna(item: ItemMonday, idColuna: string | null | undefined): string {
  if (!idColuna) return '';
  const coluna = item.column_values?.find((c: ValorColuna) => c.id === idColuna);
  if (!coluna) return '';
  return (coluna.text || coluna.display_value || '').trim();
}

/** Le por campo do dominio, usando o mapa resolvido do quadro. */
export function lerCampo(
  item: ItemMonday,
  mapa: Map<string, string>,
  campo: string,
): string {
  return lerColuna(item, mapa.get(campo));
}

/**
 * Le uma coluna de LIGACAO e devolve os `id_origem` dos itens apontados.
 *
 * Separado de `lerCampo` de proposito: `lerColuna` devolve o texto visivel, e
 * numa ligacao o texto visivel e o NOME do item ligado. Nome nao e chave — no
 * quadro de Retomadas o item `SIETE 44-C` aponta para a notificacao
 * `SIETE 44C`, e casar por nome erraria esse par. O id e o que a origem
 * garante.
 *
 * Devolve lista vazia quando a coluna nao existe no quadro, quando existe e
 * esta vazia, ou quando a API nao devolveu o campo. Os tres casos significam
 * "nenhuma ligacao declarada" — e nenhum deles significa "nao houve
 * notificacao".
 */
export function lerVinculo(
  item: ItemMonday,
  mapa: Map<string, string>,
  campo: string,
): string[] {
  const idColuna = mapa.get(campo);
  if (!idColuna) return [];

  const coluna = item.column_values?.find((c) => c.id === idColuna);
  const ligados = coluna?.linked_item_ids;
  if (!Array.isArray(ligados)) return [];

  // Deduplicado e ordenado: a ordem em que a API devolve as ligacoes nao e
  // estavel, e uma reordenacao faria o upsert enxergar mudanca de conteudo
  // onde nao houve — inflando `versao` e o historico a cada carga.
  return [...new Set(ligados.map((id) => String(id).trim()).filter(Boolean))].sort();
}

// ── Normalizacao de texto ───────────────────────────────────────────────────

/**
 * Normaliza nome para comparacao: sem acento, sem pontuacao, sem espaco duplo,
 * maiusculas. Conforme references/metodologia.md secao Normalizacao.
 *
 * ATENCAO: normalizar NAO autoriza unir nomes parecidos. A metodologia proibe
 * uniao automatica por semelhanca — nome so vincula por igualdade exata do
 * normalizado, e mesmo assim como ultimo recurso.
 */
export function normalizarNome(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor
    .normalize('NFD')
    // Remove marcas diacriticas combinantes (escape explicito para nao depender
    // de caractere literal no arquivo-fonte).
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Mantem apenas digitos. Usado em CPF/CNPJ e numero de contrato. */
export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * Normaliza numero de contrato preservando letras (alguns contratos as tem),
 * removendo separadores e espaco.
 */
export function normalizarContrato(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return limpo || null;
}

// ── Valores numericos e monetarios ──────────────────────────────────────────

/**
 * Converte texto do Monday em numero.
 *
 * Trata as duas convencoes que aparecem nos quadros: pt-BR (1.234,56) e
 * en (1234.56). Devolve `null` quando nao ha valor — nunca zero, porque zero
 * e um valor legitimo e confundi-lo com ausencia falsearia indicador.
 */
export function paraNumero(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;

  // Remove simbolo de moeda e espacos (inclusive o espaco fino do pt-BR).
  // \u00a0 = espaco inquebravel, \u2009 = espaco fino: aparecem em valores
  // formatados em pt-BR e nem todo \s cobre os dois de forma consistente.
  let limpo = texto.replace(/R\$/gi, '').replace(/[\s\u00a0\u2009\u202f]/g, '');
  if (!limpo) return null;

  const temVirgula = limpo.includes(',');
  const temPonto = limpo.includes('.');

  if (temVirgula && temPonto) {
    // O ultimo separador e o decimal.
    limpo =
      limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
        ? limpo.replace(/\./g, '').replace(',', '.')
        : limpo.replace(/,/g, '');
  } else if (temVirgula) {
    // Virgula unica: decimal em pt-BR, exceto quando e separador de milhar
    // (ex: "1,234" com exatamente 3 digitos depois).
    const partes = limpo.split(',');
    limpo =
      partes.length === 2 && partes[1]!.length === 3
        ? limpo.replace(/,/g, '')
        : limpo.replace(',', '.');
  }

  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/** Inteiro, ou `null`. Usado em dias de atraso e contagens. */
export function paraInteiro(valor: string | null | undefined): number | null {
  const n = paraNumero(valor);
  if (n === null) return null;
  return Math.trunc(n);
}

/**
 * Converte texto em data ISO (YYYY-MM-DD).
 *
 * Aceita ISO e dd/mm/yyyy. Recusa data invalida em vez de aproximar — data
 * errada em indicador de periodo e pior do que data ausente.
 */
export function paraData(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (!texto) return null;

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validarData(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const brasileira = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brasileira) {
    return validarData(Number(brasileira[3]), Number(brasileira[2]), Number(brasileira[1]));
  }

  return null;
}

function validarData(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita 31/02 e afins: o Date normalizaria para marco em silencio.
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return `${ano.toString().padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function paraBooleano(valor: string | null | undefined): boolean | null {
  if (!valor) return null;
  const t = normalizarNome(valor);
  if (['SIM', 'S', 'TRUE', 'V', 'X', 'OK'].includes(t)) return true;
  if (['NAO', 'N', 'FALSE', 'F'].includes(t)) return false;
  return null;
}

// ── Empreendimento, torre e unidade ─────────────────────────────────────────

export interface LocalizacaoExtraida {
  empreendimento: string;
  torre: string | null;
  unidade: string | null;
}

/**
 * Separa empreendimento, torre e unidade.
 *
 * Regra de js/monday-sync.js:544-555, descoberta contra os quadros reais:
 *   "AURORA TORRE B"        -> empreendimento AURORA, torre TORRE B
 *   item "AURORA 1105B"     -> unidade 1105B
 *   item "MORATTA APTO 703A"-> unidade APTO 703A
 *
 * Sem isso, cada torre viraria um empreendimento diferente e o historico do
 * mesmo ativo ficaria fragmentado.
 */
export function extrairLocalizacao(
  nomeEmpreendimento: string,
  nomeItem: string,
): LocalizacaoExtraida {
  const bruto = (nomeEmpreendimento || '').trim();

  // Remove o sufixo de torre do nome do empreendimento.
  const base = bruto.replace(/\s+TORRE\s+[A-Z]$/i, '').trim();

  const casaTorre = bruto.match(/\bTORRE\s+([A-Z])\b/i);
  const torre = casaTorre ? `TORRE ${casaTorre[1]!.toUpperCase()}` : null;

  // A unidade e o nome do item sem o prefixo do empreendimento.
  //
  // O prefixo so e removido quando termina em fronteira de palavra. Sem a
  // condicao, o empreendimento `ALAMEDA` cortava o item `ALAMEDAS 406A` no meio
  // da palavra e produzia a unidade `S 406A` — visto no board 18404493605.
  // Quando o nome nao e prefixo do item, o nome do item inteiro vira a unidade:
  // e informacao incompleta, mas verdadeira, e nao um identificador inventado.
  let unidade: string | null = null;
  const item = (nomeItem || '').trim();
  if (item) {
    if (base) {
      const escapado = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      unidade = item.replace(new RegExp(`^${escapado}(?=\\s|$)\\s*`, 'i'), '').trim() || item;
    } else {
      unidade = item;
    }
  }

  return { empreendimento: base || bruto, torre, unidade };
}

// ── Estagio da notificacao ──────────────────────────────────────────────────

export type EstagioNotificacao = 'Resolvida' | 'Encerrada' | 'Em Andamento';

/**
 * Rotulos terminais que NAO sao resolucao.
 *
 * O caso acabou, mas nao com o desfecho que se queria: o cliente distratou, ou
 * a unidade entrou em processo de retomada. Contar isso como resolvido
 * inflaria a taxa de resolucao de notificacoes, que e indicador de comite.
 *
 * Vieram dos rotulos REAIS do board 5630368737 (`Distratado`, 27 ocorrencias;
 * `A Retomar`, 3), apontados na homologacao e decididos pela Coevo em
 * 06/08/2026.
 *
 * `Unidade retomada` (passado) continua como resolucao, e nao como encerramento:
 * ali a retomada se concretizou. `A Retomar` (futuro) e o caso encaminhado.
 *
 * `Recompra` TAMBEM encerra — e a distincao que sustenta isso e entre dois
 * objetos diferentes:
 *
 *   - a NOTIFICACAO e o ciclo de cobranca com o cliente inadimplente. Quando a
 *     recompra e acordada, esse ciclo acabou: nao ha mais o que cobrar dele.
 *   - a RECOMPRA e o processo da unidade ate a revenda, que leva de seis meses
 *     a dois anos. Ele continua, e e acompanhado no quadro de distratos e
 *     retomadas, com `categoria = 'recompra'`.
 *
 * Deixar a notificacao aberta durante todo o processo de recompra inflaria o
 * prazo de notificacao ate um numero sem sentido — um caso de cobranca de tres
 * dias e um de setecentos ficariam na mesma media. Encerrar aqui nao encerra a
 * recompra; encerra a cobranca, que e do que a notificacao trata.
 *
 * Regra em docs/REGRA-SAIDA-DE-CLIENTE.md.
 */
const ESTAGIOS_ENCERRAM_SEM_RESOLVER = [/distratad/i, /^\s*a\s+retomar/i, /re-?compra/i];

/**
 * Normaliza o estagio para os valores usados nos indicadores.
 *
 * Regra de js/monday-sync.js:557-560, estendida com o terceiro estado. O rotulo
 * BRUTO tambem e preservado (coluna estagio_detalhe), porque o wireframe exige
 * fidelidade ao rotulo de origem — "RE-COMPRA" e exibido como "Recompra", mas o
 * valor da fonte continua registrado.
 */
export function normalizarEstagio(bruto: string | null | undefined): EstagioNotificacao {
  const texto = bruto ?? '';
  if (/resolvid|unidade retomada/i.test(texto)) return 'Resolvida';
  if (ESTAGIOS_ENCERRAM_SEM_RESOLVER.some((r) => r.test(texto))) return 'Encerrada';
  return 'Em Andamento';
}

/** O caso esta fechado — resolvido ou nao. E o que autoriza registrar a data. */
export function estagioEncerra(estagio: EstagioNotificacao): boolean {
  return estagio === 'Resolvida' || estagio === 'Encerrada';
}

/**
 * Separa unidade e nome do cliente no titulo do item de recompra.
 *
 * O quadro `6149480325` nomeia os itens como `304 C - GUSTAVO` ou
 * `RIVALFREDO - 033 BELLA`: unidade e pessoa no mesmo texto, separadas por
 * hifen cercado de espacos. Nem todos seguem o padrao — `501 B` vem so com a
 * unidade —, e nesse caso o nome fica nulo em vez de virar a unidade repetida.
 *
 * O hifen precisa de espaco dos dois lados: `SIETE 44-C` e uma unidade so, e
 * cortar ali produziria a unidade `SIETE 44` e o cliente `C`.
 */
export function separarUnidadeCliente(nomeItem: string | null | undefined): {
  unidade: string | null;
  cliente: string | null;
} {
  const texto = (nomeItem ?? '').trim();
  if (!texto) return { unidade: null, cliente: null };

  const partes = texto.split(/\s+-\s+/);
  if (partes.length < 2) return { unidade: texto, cliente: null };

  const [primeiro, ...resto] = partes as [string, ...string[]];
  const segundo = resto.join(' - ').trim();

  // `RIVALFREDO - 033 BELLA` inverte a ordem. Quem comeca com digito e a
  // unidade; o outro lado e a pessoa.
  if (!/^\d/.test(primeiro) && /^\d/.test(segundo)) {
    return { unidade: segundo, cliente: primeiro.trim() || null };
  }
  return { unidade: primeiro.trim() || null, cliente: segundo || null };
}

// ── Distrato, desistencia, retomada e recompra ──────────────────────────────

export type CategoriaDistrato = 'distrato' | 'desistencia' | 'retomada' | 'recompra';

/**
 * Classifica pelo titulo do GRUPO do quadro.
 *
 * Regra de js/monday-sync.js:357-362. Distrato e Desistencia sao categorias
 * distintas — o code-drop paralelo perdeu essa distincao e passou a contar as
 * duas juntas.
 */
export function classificarCategoriaDistrato(
  tituloGrupo: string | null | undefined,
  quadro: 'distratos' | 'retomadas',
): CategoriaDistrato {
  const grupo = (tituloGrupo ?? '').toUpperCase();

  // O quadro dedicado de retomadas classifica tudo como retomada, exceto
  // recompra, que tem grupo proprio.
  if (quadro === 'retomadas') {
    return grupo.includes('RECOMPRA') || grupo.includes('RE-COMPRA') ? 'recompra' : 'retomada';
  }

  if (grupo.includes('RECOMPRA') || grupo.includes('RE-COMPRA')) return 'recompra';
  if (grupo.includes('RETOMADA')) return 'retomada';
  if (grupo.includes('DESIST')) return 'desistencia';
  return 'distrato';
}

// ── Judicializacao ──────────────────────────────────────────────────────────

/**
 * Termos que caracterizam judicializacao.
 * references/regras-classificacao.md linhas 4-6.
 */
const TERMOS_JUDICIAL = [
  'processo judicial',
  'acao judicial',
  'acao ajuizada',
  'ajuizad',
  'processo distribuido',
  'distribuido',
  'execucao judicial',
  'execucao',
  'cumprimento de sentenca',
  'citac',
];

/**
 * Termos que NAO judicializam, mesmo parecendo.
 * references/regras-classificacao.md linhas 8-10.
 *
 * "Enviar para advogado" nao e processo judicial. Confundir os dois inflaria a
 * taxa de judicializacao.
 */
const TERMOS_NAO_JUDICIAL = [
  'enviar para advogado',
  'para advogado',
  'encaminhado ao juridico',
  'encaminh',
  'analise juridica',
  'documentacao para processo',
  'aguardando ajuizamento',
  'possivel processo',
  // 'extraj' e o resultado de neutralizar "extrajudicial" (ver prepararTexto).
  // Cobre "cobranca extrajudicial", "execucao extrajudicial" e variacoes.
  'extraj',
];

/**
 * Termos fortes: vencem a exclusao quando presentes.
 *
 * "execucao" NAO entra aqui de proposito: existe execucao extrajudicial de
 * garantia, que nao e judicializacao. Ela permanece apenas na lista positiva,
 * consultada somente quando nenhuma exclusao casou.
 */
const TERMOS_JUDICIAL_FORTES = ['judicial', 'ajuizad'];

/**
 * Prepara o texto para classificacao.
 *
 * O ponto critico: a palavra "extrajudicial" CONTEM "judicial". Sem neutralizar,
 * toda cobranca extrajudicial seria classificada como judicializada, inflando a
 * taxa de judicializacao — o erro que references/regras-classificacao.md existe
 * para evitar. Trocar por "extraj" remove a colisao e ainda serve de marcador
 * de exclusao.
 */
export function prepararTexto(situacao: string | null | undefined): string {
  return normalizarNome(situacao).toLowerCase().replace(/extrajudicial/g, 'extraj');
}

export interface ClassificacaoJudicial {
  judicializado: boolean;
  /** true quando o termo nao permite decidir — vira 'Revisao necessaria'. */
  revisaoNecessaria: boolean;
}

/**
 * Classifica judicializacao a partir da situacao.
 *
 * Duvida NAO vira "sim" nem "nao" em silencio: vira revisao necessaria, para
 * decisao humana (regras-classificacao.md linha 12).
 */
export function classificarJudicializacao(
  situacao: string | null | undefined,
): ClassificacaoJudicial {
  const texto = prepararTexto(situacao);

  if (!texto) return { judicializado: false, revisaoNecessaria: true };

  const temExclusao = TERMOS_NAO_JUDICIAL.some((t) => texto.includes(t));
  const temForte = TERMOS_JUDICIAL_FORTES.some((t) => texto.includes(t));

  if (temExclusao && !temForte) {
    return { judicializado: false, revisaoNecessaria: false };
  }

  if (TERMOS_JUDICIAL.some((t) => texto.includes(t))) {
    // Termo positivo E termo de exclusao ao mesmo tempo: ambiguo de verdade.
    return { judicializado: true, revisaoNecessaria: temExclusao };
  }

  // Situacao preenchida mas que nao casa com nenhuma lista: nao presumir.
  return { judicializado: false, revisaoNecessaria: true };
}

// ── Atuacao (INTERNO / EXTERNO) ─────────────────────────────────────────────

/**
 * Interpreta a coluna LOCAL do quadro de processos.
 *
 * ATENCAO: essa coluna e ATUACAO (INTERNO / EXTERNO <nome do escritorio>), NAO
 * comarca. Reaproveita-la como comarca produziria um indicador geografico
 * inteiramente falso.
 */
export function interpretarAtuacao(valor: string | null | undefined): {
  atuacao: string | null;
  interno: boolean | null;
} {
  const texto = (valor ?? '').trim();
  if (!texto) return { atuacao: null, interno: null };

  const normalizado = normalizarNome(texto);
  if (normalizado.startsWith('INTERNO')) return { atuacao: texto, interno: true };
  if (normalizado.startsWith('EXTERNO')) return { atuacao: texto, interno: false };
  return { atuacao: texto, interno: null };
}

// ── Competencia ─────────────────────────────────────────────────────────────

const MESES: Record<string, string> = {
  JANEIRO: '01', FEVEREIRO: '02', MARCO: '03', ABRIL: '04',
  MAIO: '05', JUNHO: '06', JULHO: '07', AGOSTO: '08',
  SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12',
};

/**
 * Deriva a competencia (YYYY-MM) do titulo do grupo.
 *
 * O mes da notificacao vem do TITULO DO GRUPO, nao de coluna de data — regra do
 * quadro real, herdada de js/monday-sync.js. Aceita "JULHO 2026", "JULHO/2026",
 * "2026-07" e "07/2026".
 */
export function competenciaDoGrupo(tituloGrupo: string | null | undefined): string | null {
  const bruto = (tituloGrupo ?? '').trim();
  if (!bruto) return null;

  const iso = bruto.match(/\b(\d{4})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const numerica = bruto.match(/\b(0?[1-9]|1[0-2])\s*[/\-]\s*(\d{4})\b/);
  if (numerica) return `${numerica[2]}-${numerica[1]!.padStart(2, '0')}`;

  const normalizado = normalizarNome(bruto);
  for (const [nome, numero] of Object.entries(MESES)) {
    if (!normalizado.includes(nome)) continue;
    const ano = normalizado.match(/\b(20\d{2})\b/);
    if (ano) return `${ano[1]}-${numero}`;
  }

  return null;
}
