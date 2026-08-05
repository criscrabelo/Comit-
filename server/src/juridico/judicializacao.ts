/**
 * Regra de judicializacao: configuravel por fonte, versionada e com vigencia.
 *
 * O problema que este modulo resolve. "Esta judicializado?" e a pergunta que
 * alimenta a taxa de judicializacao — indicador de comite. Ate aqui a resposta
 * saia de listas de termos embutidas no codigo, lendo uma coluna de um quadro
 * do Monday. Trocar de fonte significaria reescrever a logica; mudar de
 * criterio significaria alterar codigo sem versao, sem vigencia e sem autor.
 *
 * O desenho agora tem tres camadas, e a ordem entre elas importa:
 *
 *   1. POLITICA — a regra, guardada no banco, por (fonte, escopo, vigencia).
 *      Trocar o Monday pelo Sienge e cadastrar uma politica nova.
 *   2. APURACAO — o que CADA fonte concluiu sobre CADA registro. Na transicao
 *      as duas coexistem: nenhuma sobrescreve a outra.
 *   3. CONSOLIDACAO — qual conclusao vale operacionalmente, por precedencia,
 *      e se houve divergencia.
 *
 * Tres invariantes que este modulo nao negocia:
 *
 *   - **Politica `proposta` nao classifica nada.** So `aprovada` produz efeito.
 *     Sem politica aprovada alcancando o registro, ele fica em
 *     `revisao_necessaria` — nao vira `false` por omissao.
 *   - **Divergencia nao escolhe sozinha.** A precedencia decide o que EXIBIR;
 *     as duas conclusoes continuam gravadas e a divergencia fica sinalizada.
 *   - **Reprocessar o passado usa a politica da epoca**, nao a atual. E por isso
 *     que a busca recebe uma data em vez de olhar so o que esta vigente hoje.
 */
import { sql } from 'kysely';
import { db } from '../db/pool.js';
import type {
  FonteDado,
  SituacaoPolitica,
  TipoPoliticaJudicializacao,
} from '../db/schema.js';
import { classificarJudicializacao, prepararTexto } from '../integracoes/monday/transformacao.js';

/** Entidade a que as apuracoes se referem. Hoje so processos; o campo existe
 *  para que distratos e notificacoes possam entrar sem migracao nova. */
export const ENTIDADE_PROCESSOS = 'processos_judiciais';

export interface Politica {
  id: string;
  versao: string;
  fonte: FonteDado;
  escopo: string;
  tipo: TipoPoliticaJudicializacao;
  configuracao: Record<string, unknown>;
  precedencia: number;
  vigente_de: string;
  vigente_ate: string | null;
  situacao: SituacaoPolitica;
  justificativa: string;
}

/** Conclusao de UMA fonte sobre UM registro. */
export interface Apuracao {
  fonte: FonteDado;
  politicaId: string | null;
  politicaVersao: string | null;
  /** `null` = a politica olhou e nao concluiu. Diferente de `false`. */
  judicializado: boolean | null;
  revisaoNecessaria: boolean;
  motivo: string;
  valorObservado: string | null;
}

/** O que vale operacionalmente depois de olhar todas as fontes. */
export interface Consolidacao {
  judicializado: boolean;
  revisaoNecessaria: boolean;
  /** Fonte cuja conclusao prevaleceu. `null` quando ninguem concluiu. */
  fonte: FonteDado | null;
  politicaId: string | null;
  divergente: boolean;
  motivo: string;
  apuracoes: Apuracao[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Busca de politica
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Politicas APROVADAS que alcancam o escopo numa data, em ordem de precedencia.
 *
 * `escopo` casa com o valor exato ou com `*`, que vale para todo o conector.
 * A data e parametro, e nao `CURRENT_DATE`, porque reapurar uma competencia
 * fechada tem de usar o criterio que valia naquele mes — do contrario o numero
 * do comite de marco mudaria sozinho quando a regra fosse trocada em agosto.
 */
export async function politicasVigentes(
  escopo: string,
  data: string,
  fonte?: FonteDado,
): Promise<Politica[]> {
  let consulta = db
    .selectFrom('politicas_judicializacao')
    .selectAll()
    .where('situacao', '=', 'aprovada')
    .where((eb) => eb.or([eb('escopo', '=', escopo), eb('escopo', '=', '*')]))
    .where('vigente_de', '<=', data)
    .where((eb) => eb.or([eb('vigente_ate', 'is', null), eb('vigente_ate', '>=', data)]));

  if (fonte) consulta = consulta.where('fonte', '=', fonte);

  const linhas = await consulta
    .orderBy('precedencia', 'asc')
    // Escopo especifico ganha de `*` quando a precedencia empata: quem escreveu
    // uma regra so para `processos` foi mais deliberado que quem escreveu para
    // o conector inteiro.
    .orderBy(sql`CASE WHEN escopo = '*' THEN 1 ELSE 0 END`, 'asc')
    .orderBy('vigente_de', 'desc')
    .execute();

  return linhas as unknown as Politica[];
}

/** Politicas `proposta` do escopo — as que podem ser simuladas, nunca aplicadas. */
export async function politicasPropostas(escopo: string): Promise<Politica[]> {
  const linhas = await db
    .selectFrom('politicas_judicializacao')
    .selectAll()
    .where('situacao', '=', 'proposta')
    .where((eb) => eb.or([eb('escopo', '=', escopo), eb('escopo', '=', '*')]))
    .orderBy('precedencia', 'asc')
    .execute();

  return linhas as unknown as Politica[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Avaliacao
// ═══════════════════════════════════════════════════════════════════════════

export interface EntradaAvaliacao {
  /** Rotulo cru da coluna de situacao, como a fonte apresentou. */
  situacao?: string | null;
  /** Grupo/estagio, quando a politica olhar para ele. */
  grupo?: string | null;
}

function normalizar(valor: string): string {
  return prepararTexto(valor);
}

/**
 * Aplica UMA politica a UM registro.
 *
 * Nao grava nada e nao decide precedencia — devolve apenas o que esta politica
 * conclui. Serve tanto para a apuracao real quanto para a simulacao de uma
 * politica ainda em proposta, e e essa reutilizacao que garante que a simulacao
 * mostra o efeito verdadeiro, e nao uma aproximacao paralela.
 */
export function avaliar(politica: Politica, entrada: EntradaAvaliacao): Apuracao {
  const base = {
    fonte: politica.fonte,
    politicaId: politica.id,
    politicaVersao: politica.versao,
    valorObservado: entrada.situacao ?? null,
  };

  switch (politica.tipo) {
    case 'premissa_de_escopo': {
      // O escopo E o criterio: o rotulo nao entra na conta. Se a configuracao
      // disser `judicializado: false`, o escopo passa a significar o contrario
      // — util para um quadro de cobranca extrajudicial, por exemplo.
      const valor = politica.configuracao['judicializado'];
      const judicializado = valor === undefined ? true : Boolean(valor);

      return {
        ...base,
        judicializado,
        revisaoNecessaria: false,
        motivo:
          `Premissa do escopo "${politica.escopo}" (politica ${politica.versao}, fonte ` +
          `${politica.fonte}): todo registro deste escopo e ` +
          `${judicializado ? '' : 'nao '}judicializado.`,
      };
    }

    case 'por_rotulo': {
      const mapa = (politica.configuracao['rotulos'] ?? {}) as Record<string, unknown>;
      const bruto = (entrada.situacao ?? '').trim();

      if (!bruto) {
        return {
          ...base,
          judicializado: null,
          revisaoNecessaria: true,
          motivo: `Situacao vazia e a politica ${politica.versao} decide por rotulo. Nao ha o que classificar.`,
        };
      }

      // Comparacao pelo texto preparado dos dois lados: o mapa foi digitado por
      // uma pessoa, e exigir acento e caixa identicos ao Monday transformaria
      // um erro de digitacao em registro sem classificacao.
      const alvo = normalizar(bruto);
      for (const [rotulo, valor] of Object.entries(mapa)) {
        if (normalizar(rotulo) === alvo) {
          return {
            ...base,
            judicializado: Boolean(valor),
            revisaoNecessaria: false,
            motivo: `Rotulo "${bruto}" mapeado pela politica ${politica.versao} como ${
              valor ? 'judicializado' : 'nao judicializado'
            }.`,
          };
        }
      }

      return {
        ...base,
        judicializado: null,
        revisaoNecessaria: true,
        motivo:
          `Rotulo "${bruto}" nao consta no mapa da politica ${politica.versao}. ` +
          'Rotulo novo na origem exige decisao — nao e presumido.',
      };
    }

    case 'por_termos': {
      // Reproduz o comportamento historico. Existe para que uma apuracao antiga
      // continue explicavel pelo criterio que a produziu.
      const { judicializado, revisaoNecessaria } = classificarJudicializacao(entrada.situacao);

      return {
        ...base,
        judicializado: revisaoNecessaria ? null : judicializado,
        revisaoNecessaria,
        motivo: revisaoNecessaria
          ? `Situacao "${entrada.situacao ?? ''}" nao casa com as listas de termos da politica ${politica.versao}.`
          : `Listas de termos da politica ${politica.versao} classificaram "${entrada.situacao ?? ''}" como ${
              judicializado ? 'judicializado' : 'nao judicializado'
            }.`,
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Consolidacao entre fontes
// ═══════════════════════════════════════════════════════════════════════════

/** Sem politica aprovada, o registro fica em revisao. Nunca vira `false` calado. */
const SEM_POLITICA: Consolidacao = {
  judicializado: false,
  revisaoNecessaria: true,
  fonte: null,
  politicaId: null,
  divergente: false,
  motivo:
    'Nenhuma politica de judicializacao aprovada alcanca este registro. ' +
    'A classificacao fica em revisao ate que uma politica seja aprovada.',
  apuracoes: [],
};

/**
 * Decide o valor operacional a partir das conclusoes de todas as fontes.
 *
 * As apuracoes chegam ja ordenadas por precedencia. A primeira que CONCLUI
 * decide; as demais permanecem gravadas. Se duas fontes concluirem valores
 * diferentes, `divergente` fica verdadeiro — e ai a plataforma exibe o valor da
 * fonte de maior precedencia E mantem a divergencia aberta. Escolher em
 * silencio seria apagar metade da informacao.
 */
export function consolidar(apuracoes: Apuracao[]): Consolidacao {
  if (apuracoes.length === 0) return SEM_POLITICA;

  const conclusivas = apuracoes.filter((a) => a.judicializado !== null);

  if (conclusivas.length === 0) {
    return {
      judicializado: false,
      revisaoNecessaria: true,
      fonte: null,
      politicaId: null,
      divergente: false,
      motivo: apuracoes.map((a) => `[${a.fonte}] ${a.motivo}`).join(' | '),
      apuracoes,
    };
  }

  const vencedora = conclusivas[0]!;
  const divergente = conclusivas.some((a) => a.judicializado !== vencedora.judicializado);

  const motivo = divergente
    ? `Divergencia entre fontes. Prevalece ${vencedora.fonte} por precedencia: ` +
      conclusivas.map((a) => `${a.fonte}=${a.judicializado ? 'sim' : 'nao'}`).join(', ') +
      '. As duas conclusoes ficam preservadas e a divergencia, aberta.'
    : vencedora.motivo;

  return {
    judicializado: vencedora.judicializado === true,
    // Divergencia entre fontes e exatamente o caso que precisa de olho humano.
    revisaoNecessaria: divergente,
    fonte: vencedora.fonte,
    politicaId: vencedora.politicaId,
    divergente,
    motivo,
    apuracoes,
  };
}

/**
 * Caminho completo: busca politicas, avalia cada fonte e consolida.
 *
 * `valoresPorFonte` traz o que cada fonte informou sobre o registro. Na fase
 * atual so o Monday preenche; quando o Sienge entrar, basta acrescentar a
 * chave — nenhuma logica muda, que era o requisito da transicao.
 */
export async function apurar(
  escopo: string,
  data: string,
  valoresPorFonte: Partial<Record<FonteDado, EntradaAvaliacao>>,
): Promise<Consolidacao> {
  const politicas = await politicasVigentes(escopo, data);
  if (politicas.length === 0) return SEM_POLITICA;

  const apuracoes: Apuracao[] = [];
  for (const politica of politicas) {
    const entrada = valoresPorFonte[politica.fonte];
    // Politica de uma fonte que nao trouxe dado para este registro nao produz
    // apuracao: ausencia de dado nao e conclusao.
    if (entrada === undefined) continue;
    apuracoes.push(avaliar(politica, entrada));
  }

  return consolidar(apuracoes);
}

// ═══════════════════════════════════════════════════════════════════════════
// Persistencia das apuracoes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Grava a conclusao de cada fonte sobre um registro.
 *
 * Uma linha por (entidade, registro, fonte), atualizada no lugar. O historico
 * de como a classificacao mudou ao longo do tempo vive no `historico` do
 * proprio registro e nos logs de auditoria; duplicar aqui produziria uma
 * segunda linha do tempo para manter em sincronia.
 */
export async function gravarApuracoes(
  entidade: string,
  registroId: string,
  apuracoes: Apuracao[],
  execucaoId?: string,
): Promise<void> {
  if (apuracoes.length === 0) return;

  await db
    .insertInto('judicializacao_apuracoes')
    .values(
      apuracoes.map((a) => ({
        entidade,
        registro_id: registroId,
        fonte: a.fonte,
        politica_id: a.politicaId,
        judicializado: a.judicializado,
        revisao_necessaria: a.revisaoNecessaria,
        motivo: a.motivo,
        valor_observado: a.valorObservado,
        execucao_id: execucaoId ?? null,
      })),
    )
    .onConflict((oc) =>
      oc.columns(['entidade', 'registro_id', 'fonte']).doUpdateSet((eb) => ({
        politica_id: eb.ref('excluded.politica_id'),
        judicializado: eb.ref('excluded.judicializado'),
        revisao_necessaria: eb.ref('excluded.revisao_necessaria'),
        motivo: eb.ref('excluded.motivo'),
        valor_observado: eb.ref('excluded.valor_observado'),
        execucao_id: eb.ref('excluded.execucao_id'),
        apurado_em: sql`now()`,
      })),
    )
    .execute();
}

/** Apuracoes ja gravadas para um registro, em ordem de precedencia da politica. */
export async function apuracoesDe(entidade: string, registroId: string): Promise<Apuracao[]> {
  const linhas = await db
    .selectFrom('judicializacao_apuracoes as a')
    .leftJoin('politicas_judicializacao as p', 'p.id', 'a.politica_id')
    .select([
      'a.fonte',
      'a.politica_id',
      'a.judicializado',
      'a.revisao_necessaria',
      'a.motivo',
      'a.valor_observado',
      'p.versao as politica_versao',
    ])
    .where('a.entidade', '=', entidade)
    .where('a.registro_id', '=', registroId)
    .orderBy(sql`coalesce(p.precedencia, 1000)`, 'asc')
    .execute();

  return linhas.map((l) => ({
    fonte: l.fonte,
    politicaId: l.politica_id,
    politicaVersao: l.politica_versao ?? null,
    judicializado: l.judicializado,
    revisaoNecessaria: l.revisao_necessaria,
    motivo: l.motivo,
    valorObservado: l.valor_observado,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Ciclo de vida da politica
// ═══════════════════════════════════════════════════════════════════════════

export class ErroPolitica extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroPolitica';
  }
}

/**
 * Aprova uma politica proposta.
 *
 * Encerra a vigencia da politica aprovada anterior do mesmo par (fonte,
 * escopo) no dia anterior ao inicio da nova — sem isso o gatilho de
 * sobreposicao recusaria a aprovacao, que e o comportamento desejado, mas o
 * operador teria de fazer a conta de datas na mao.
 *
 * Aprovar NAO reclassifica registro nenhum. A reapuracao e um passo separado e
 * explicito: aprovar e decidir o criterio; reapurar e aplica-lo, e quem aprova
 * deve poder ver o efeito antes que ele alcance a tela.
 */
export async function aprovar(
  politicaId: string,
  usuarioId: string,
): Promise<Politica> {
  return db.transaction().execute(async (trx) => {
    const politica = await trx
      .selectFrom('politicas_judicializacao')
      .selectAll()
      .where('id', '=', politicaId)
      .executeTakeFirst();

    if (!politica) throw new ErroPolitica(`Politica ${politicaId} nao encontrada.`);
    if (politica.situacao === 'aprovada') {
      throw new ErroPolitica(`Politica ${politica.versao} ja esta aprovada.`);
    }
    if (politica.situacao === 'revogada') {
      throw new ErroPolitica(
        `Politica ${politica.versao} foi revogada e nao pode ser aprovada. Crie uma versao nova.`,
      );
    }

    const anteriores = await trx
      .selectFrom('politicas_judicializacao')
      .select(['id', 'versao', 'vigente_de'])
      .where('situacao', '=', 'aprovada')
      .where('fonte', '=', politica.fonte)
      .where('escopo', '=', politica.escopo)
      .where((eb) =>
        eb.or([eb('vigente_ate', 'is', null), eb('vigente_ate', '>=', politica.vigente_de)]),
      )
      .execute();

    for (const anterior of anteriores) {
      if (anterior.vigente_de >= politica.vigente_de) {
        throw new ErroPolitica(
          `A politica ${anterior.versao} comeca em ${anterior.vigente_de}, em ou depois do inicio da nova ` +
            `(${politica.vigente_de}). Encerrar a anterior produziria vigencia negativa — ajuste as datas.`,
        );
      }

      await trx
        .updateTable('politicas_judicializacao')
        .set({ vigente_ate: sql<string>`(${politica.vigente_de}::date - 1)` })
        .where('id', '=', anterior.id)
        .execute();
    }

    const aprovada = await trx
      .updateTable('politicas_judicializacao')
      .set({
        situacao: 'aprovada',
        aprovada_por: usuarioId,
        aprovada_em: sql<Date>`now()`,
      })
      .where('id', '=', politicaId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return aprovada as unknown as Politica;
  });
}

/** Revoga uma politica. Exige motivo: revogacao sem motivo nao e auditavel. */
export async function revogar(
  politicaId: string,
  usuarioId: string,
  motivo: string,
): Promise<void> {
  if (!motivo.trim()) throw new ErroPolitica('Revogacao exige motivo.');

  await db
    .updateTable('politicas_judicializacao')
    .set({
      situacao: 'revogada',
      revogada_por: usuarioId,
      revogada_em: sql<Date>`now()`,
      revogada_motivo: motivo,
    })
    .where('id', '=', politicaId)
    .execute();
}
