/**
 * Levantamento dos rotulos reais de um quadro do Monday.
 *
 * Por que isto existe: as listas de termos que classificam judicializacao,
 * suspensao, arquivamento e resolucao foram derivadas das regras do projeto —
 * nao dos rotulos que a equipe realmente usa no quadro. Enquanto ninguem olhar
 * os valores reais, toda classificacao e uma aposta.
 *
 * A regra desta camada e a mesma do resto do sistema: **o que nao se reconhece
 * nao e presumido**. Rotulo fora das listas vira `revisao_necessaria`, com
 * quantidade e registros afetados, e uma PROPOSTA de regra — que nao e
 * aplicada. Alterar metodologia de classificacao muda indicador de comite, e
 * isso depende de aprovacao humana, nunca de inferencia.
 *
 * A leitura sai de `registros_brutos`, e nao das colunas ja transformadas: e o
 * payload original que tem TODAS as colunas, inclusive as que ninguem mapeou —
 * responsavel, por exemplo. Levantar rotulo a partir do dado ja interpretado
 * mostraria apenas o que a interpretacao deixou passar.
 */
import { sql } from 'kysely';
import { db } from '../../db/pool.js';
import { classificarJudicializacao, prepararTexto } from './transformacao.js';
import type { ItemMonday } from './cliente.js';

/** Um valor distinto encontrado numa coluna, com quantas vezes apareceu. */
export interface RotuloEncontrado {
  valor: string;
  ocorrencias: number;
  /** Ate 5 identificadores de origem, para localizar os registros. */
  exemplos: string[];
}

export interface ColunaLevantada {
  id: string;
  titulo: string;
  tipo: string;
  /** Campo do Patrono que consome esta coluna, quando ha. */
  campoPatrono: string | null;
  /** Itens em que a coluna veio preenchida. */
  preenchidos: number;
  vazios: number;
  rotulos: RotuloEncontrado[];
}

export interface LevantamentoRotulos {
  execucaoId: string;
  itens: number;
  colunas: ColunaLevantada[];
  /** Titulos de grupo distintos — a competencia sai daqui, nao de data. */
  grupos: RotuloEncontrado[];
}

/**
 * Colunas que alimentam classificacao e nao apenas exibicao.
 *
 * Sao as que precisam de cobertura verificada: um rotulo novo aqui muda
 * indicador; um rotulo novo em MOTIVO muda apenas o texto exibido.
 */
export const COLUNAS_DE_CLASSIFICACAO = [
  'MEU TRABALHO',
  'STATUS (PARA COMITÊ)',
  'TIPO DE AÇÃO',
  'ATUAÇÃO',
  'POSIÇÃO',
] as const;

function acumular(
  mapa: Map<string, { ocorrencias: number; exemplos: string[] }>,
  valor: string,
  idOrigem: string,
): void {
  const atual = mapa.get(valor) ?? { ocorrencias: 0, exemplos: [] };
  atual.ocorrencias++;
  if (atual.exemplos.length < 5) atual.exemplos.push(idOrigem);
  mapa.set(valor, atual);
}

function ordenar(mapa: Map<string, { ocorrencias: number; exemplos: string[] }>): RotuloEncontrado[] {
  return [...mapa.entries()]
    .map(([valor, d]) => ({ valor, ocorrencias: d.ocorrencias, exemplos: d.exemplos }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias || a.valor.localeCompare(b.valor));
}

/**
 * Levanta os rotulos distintos de cada coluna da execucao.
 *
 * `mapaPorCampo` liga campo do Patrono ao id da coluna resolvido no quadro; e
 * usado apenas para anotar quem consome o que — o levantamento cobre TODAS as
 * colunas, mapeadas ou nao.
 */
export async function levantarRotulos(
  execucaoId: string,
  mapaPorCampo: Map<string, string>,
  titulosPorId: Map<string, { titulo: string; tipo: string }>,
): Promise<LevantamentoRotulos> {
  const brutos = await sql<{ id_origem: string | null; payload: ItemMonday }>`
    SELECT id_origem, payload FROM registros_brutos
    WHERE execucao_id = ${execucaoId}
    ORDER BY id
  `.execute(db);

  const campoPorColuna = new Map<string, string>();
  for (const [campo, coluna] of mapaPorCampo) {
    if (!campoPorColuna.has(coluna)) campoPorColuna.set(coluna, campo);
  }

  const porColuna = new Map<
    string,
    { preenchidos: number; vazios: number; valores: Map<string, { ocorrencias: number; exemplos: string[] }> }
  >();
  const grupos = new Map<string, { ocorrencias: number; exemplos: string[] }>();

  for (const linha of brutos.rows) {
    const item = linha.payload;
    const idOrigem = linha.id_origem ?? item.id ?? '?';

    if (item.group?.title) acumular(grupos, item.group.title.trim(), idOrigem);

    for (const cv of item.column_values ?? []) {
      const registro =
        porColuna.get(cv.id) ?? { preenchidos: 0, vazios: 0, valores: new Map() };

      // Espelho e formula vem com `text` vazio; o valor util esta em
      // `display_value`. Ignorar isso faria colunas inteiras parecerem vazias.
      const bruto = (cv.text || (cv as { display_value?: string }).display_value || '').trim();

      if (bruto) {
        registro.preenchidos++;
        acumular(registro.valores, bruto, idOrigem);
      } else {
        registro.vazios++;
      }

      porColuna.set(cv.id, registro);
    }
  }

  const colunas: ColunaLevantada[] = [...porColuna.entries()]
    .map(([id, d]) => {
      const meta = titulosPorId.get(id);
      return {
        id,
        titulo: meta?.titulo ?? `(sem titulo: ${id})`,
        tipo: meta?.tipo ?? 'desconhecido',
        campoPatrono: campoPorColuna.get(id) ?? null,
        preenchidos: d.preenchidos,
        vazios: d.vazios,
        rotulos: ordenar(d.valores),
      };
    })
    .sort((a, b) => a.titulo.localeCompare(b.titulo));

  return {
    execucaoId,
    itens: brutos.rows.length,
    colunas,
    grupos: ordenar(grupos),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cobertura das regras de classificacao
// ═══════════════════════════════════════════════════════════════════════════

export type Cobertura = 'judicializado' | 'nao_judicializado' | 'revisao_necessaria';

export interface RotuloAnalisado extends RotuloEncontrado {
  cobertura: Cobertura;
  /** Proposta de regra, quando o rotulo nao esta coberto. NAO aplicada. */
  proposta: PropostaDeRegra | null;
}

export interface PropostaDeRegra {
  rotulo: string;
  /** Lista sugerida. Sugestao, nao decisao. */
  lista: 'TERMOS_JUDICIAL' | 'TERMOS_NAO_JUDICIAL' | 'indefinida';
  termoSugerido: string | null;
  justificativa: string;
  registrosAfetados: number;
  exemplos: string[];
}

/**
 * Palavras que sugerem a direcao de um rotulo nao coberto.
 *
 * Usadas SO para montar a proposta que vai ao humano. Nenhuma delas classifica
 * nada: o rotulo nao coberto continua em `revisao_necessaria` ate a aprovacao.
 */
const INDICIOS_JUDICIAL = [
  'acao', 'processo', 'ajuiz', 'citac', 'sentenca', 'audiencia', 'recurso',
  'execucao', 'liminar', 'penhora', 'peticao', 'vara', 'juiz', 'tribunal',
];
const INDICIOS_NAO_JUDICIAL = [
  'acordo', 'negociac', 'cobranca', 'notificac', 'analise', 'aguardando',
  'encaminh', 'advogado', 'documenta', 'extraj', 'arquivad', 'suspens',
  'finalizad', 'encerrad', 'resolvid', 'baixa',
];

function propor(rotulo: RotuloEncontrado): PropostaDeRegra {
  const texto = prepararTexto(rotulo.valor);

  const judicial = INDICIOS_JUDICIAL.filter((t) => texto.includes(t));
  const naoJudicial = INDICIOS_NAO_JUDICIAL.filter((t) => texto.includes(t));

  let lista: PropostaDeRegra['lista'] = 'indefinida';
  let termo: string | null = null;
  let justificativa: string;

  if (judicial.length && !naoJudicial.length) {
    lista = 'TERMOS_JUDICIAL';
    termo = judicial[0]!;
    justificativa =
      `O rótulo contém "${judicial[0]}", que indica etapa processual. ` +
      'Se a equipe confirmar que este status significa processo em curso na Justiça, ' +
      `incluir "${judicial[0]}" em TERMOS_JUDICIAL.`;
  } else if (naoJudicial.length && !judicial.length) {
    lista = 'TERMOS_NAO_JUDICIAL';
    termo = naoJudicial[0]!;
    justificativa =
      `O rótulo contém "${naoJudicial[0]}", que indica etapa anterior ou posterior ao processo. ` +
      `Se a equipe confirmar, incluir "${naoJudicial[0]}" em TERMOS_NAO_JUDICIAL.`;
  } else if (judicial.length && naoJudicial.length) {
    justificativa =
      `O rótulo contém indícios dos dois lados (${judicial.join(', ')} e ${naoJudicial.join(', ')}). ` +
      'Precisa de decisão da equipe: não há como inferir sem ambiguidade.';
  } else {
    justificativa =
      'O rótulo não contém nenhum termo reconhecível pelas regras atuais. ' +
      'A equipe precisa informar o que ele significa antes de qualquer classificação.';
  }

  return {
    rotulo: rotulo.valor,
    lista,
    termoSugerido: termo,
    justificativa,
    registrosAfetados: rotulo.ocorrencias,
    exemplos: rotulo.exemplos,
  };
}

export interface AnaliseCobertura {
  coluna: string;
  total: number;
  cobertos: number;
  emRevisao: number;
  registrosEmRevisao: number;
  rotulos: RotuloAnalisado[];
  propostas: PropostaDeRegra[];
}

/**
 * Confronta os rotulos reais com as regras de judicializacao vigentes.
 *
 * NAO altera regra nenhuma. Devolve o que esta coberto, o que nao esta, quantos
 * registros cada rotulo nao coberto afeta, e uma proposta por rotulo — para que
 * a decisao seja tomada com o numero na frente, e nao no escuro.
 */
export function analisarCoberturaJudicializacao(
  coluna: string,
  rotulos: RotuloEncontrado[],
): AnaliseCobertura {
  const analisados: RotuloAnalisado[] = rotulos.map((r) => {
    const { judicializado, revisaoNecessaria } = classificarJudicializacao(r.valor);

    const cobertura: Cobertura = revisaoNecessaria
      ? 'revisao_necessaria'
      : judicializado
        ? 'judicializado'
        : 'nao_judicializado';

    return {
      ...r,
      cobertura,
      proposta: cobertura === 'revisao_necessaria' ? propor(r) : null,
    };
  });

  const emRevisao = analisados.filter((a) => a.cobertura === 'revisao_necessaria');

  return {
    coluna,
    total: analisados.length,
    cobertos: analisados.length - emRevisao.length,
    emRevisao: emRevisao.length,
    registrosEmRevisao: emRevisao.reduce((s, a) => s + a.ocorrencias, 0),
    rotulos: analisados,
    propostas: emRevisao.map((a) => a.proposta!),
  };
}
