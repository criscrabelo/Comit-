/**
 * Critérios objetivos de confiança do vínculo.
 *
 * Princípio: a confiança tem de ser **auditável**, não opinativa. Cada critério
 * tem peso fixo, e o vínculo registra quais foram atendidos, quais foram
 * contrariados e com que valores. Quem discordar depois consegue apontar
 * exatamente onde.
 *
 * Ordem de prioridade das chaves (references/relacionamento-dados.md):
 *   1. CPF/CNPJ válido      2. número do contrato    3. empreendimento+unidade
 *   4. identificadores relacionados                  5. nome completo normalizado
 */
import type { ConfiancaVinculo, RegraVinculo } from '../db/schema.js';

export const VERSAO_REGRA_VINCULO = 'vinculo-1.0.0';

/**
 * Pesos.
 *
 * Escolhidos para que a soma reproduza a ordem de prioridade documentada:
 * documento validado sozinho já alcança confiança alta; contrato sozinho fica em
 * média; nome sozinho fica em baixa e nunca vincula.
 */
export const PESOS = {
  /** Documento validado por dígito verificador e igual nos dois lados. */
  cpf_cnpj: 60,
  /** Número de contrato normalizado e igual. */
  contrato: 30,
  /**
   * Empreendimento resolvido pelo mesmo identificador interno.
   *
   * 15 + 15 = 30 de propósito: empreendimento+unidade é a chave de nível 3 e
   * precisa alcançar confiança MÉDIA por si. Com pesos menores (12+12=24) ela
   * ficava abaixo do limiar e virava recusa — o terceiro nível de prioridade
   * seria inútil na prática.
   */
  empreendimento: 15,
  /** Unidade igual, dentro do mesmo empreendimento. */
  unidade: 15,
  /** Identificador relacionado (reserva, unidade externa, notificação). */
  id_relacionado: 10,
  /** Nome completo normalizado e idêntico, com dois ou mais termos. */
  nome_completo: 8,
  /** Datas de referência compatíveis reforçam, mas não sustentam sozinhas. */
  data_compativel: 3,
} as const;

export type NomeCriterio = keyof typeof PESOS;

/** Limiares de confiança. */
export const LIMIARES = {
  /** ≥ 60 → vínculo automático permitido. Só o documento válido alcança. */
  alta: 60,
  /** ≥ 25 → sugestão aguardando revisão humana. */
  media: 25,
} as const;

export interface Criterio {
  nome: NomeCriterio | string;
  peso: number;
  /** Valor do lado A, como comparado. */
  valor_a: unknown;
  /** Valor do lado B, como comparado. */
  valor_b: unknown;
  /** Por que este critério foi considerado atendido ou conflitante. */
  observacao?: string;
}

export interface AvaliacaoConfianca {
  score: number;
  confianca: ConfiancaVinculo;
  /** Regra que representa o critério de maior peso atendido. */
  regra: RegraVinculo;
  atendidos: Criterio[];
  conflitantes: Criterio[];
  /** true quando algum critério conflitante impede vínculo automático. */
  temConflito: boolean;
  versaoRegra: string;
}

/** Critério de maior peso → regra registrada no vínculo. */
const CRITERIO_PARA_REGRA: Record<string, RegraVinculo> = {
  cpf_cnpj: 'cpf_cnpj',
  contrato: 'contrato',
  empreendimento: 'empr_unidade',
  unidade: 'empr_unidade',
  id_relacionado: 'id_relacionado',
  nome_completo: 'nome',
  data_compativel: 'sem_vinculo',
};

/**
 * Calcula score e confiança a partir dos critérios apurados.
 *
 * Regras que a função impõe, e não apenas calcula:
 *
 *  - Qualquer critério conflitante rebaixa para **baixa**, independente do
 *    score. Um documento igual não compensa um contrato apontando para outro
 *    cliente: o conflito indica que a hipótese está errada, não fraca.
 *  - Nome sozinho nunca passa de **baixa**, mesmo somando datas compatíveis.
 *    É a regra "nunca vincular apenas pelo nome", imposta aqui e não confiada ao
 *    chamador.
 */
export function avaliarConfianca(
  atendidos: Criterio[],
  conflitantes: Criterio[],
): AvaliacaoConfianca {
  const score = Math.min(
    100,
    atendidos.reduce((soma, c) => soma + c.peso, 0),
  );

  const temConflito = conflitantes.length > 0;

  // A regra é o critério de maior peso efetivamente atendido.
  const maiorPeso = [...atendidos].sort((a, b) => b.peso - a.peso)[0];
  const regra: RegraVinculo = maiorPeso
    ? (CRITERIO_PARA_REGRA[maiorPeso.nome] ?? 'sem_vinculo')
    : 'sem_vinculo';

  let confianca: ConfiancaVinculo;

  if (temConflito) {
    // Conflito não é ruído: é sinal de que a hipótese está errada.
    confianca = 'baixa';
  } else if (score >= LIMIARES.alta) {
    confianca = 'alta';
  } else if (score >= LIMIARES.media) {
    confianca = 'media';
  } else {
    confianca = 'baixa';
  }

  // Nome como única sustentação nunca sobe de baixa, qualquer que seja o score.
  const sustentacoes = atendidos.filter((c) => c.nome !== 'data_compativel');
  const somenteNome =
    sustentacoes.length > 0 && sustentacoes.every((c) => c.nome === 'nome_completo');
  if (somenteNome) confianca = 'baixa';

  return {
    score,
    confianca,
    regra,
    atendidos,
    conflitantes,
    temConflito,
    versaoRegra: VERSAO_REGRA_VINCULO,
  };
}

/**
 * Comportamento esperado por nível de confiança.
 * Traduz a confiança na situação persistida do vínculo.
 */
export function situacaoPorConfianca(
  confianca: ConfiancaVinculo,
): 'automatico' | 'sugerido' | 'recusado' {
  if (confianca === 'alta') return 'automatico';
  if (confianca === 'media') return 'sugerido';
  return 'recusado';
}

/** Documentação dos critérios, para a interface e para o relatório de entrega. */
export function documentarCriterios() {
  return {
    versao_regra: VERSAO_REGRA_VINCULO,
    limiares: {
      alta: `score >= ${LIMIARES.alta} e nenhum critério conflitante`,
      media: `score entre ${LIMIARES.media} e ${LIMIARES.alta - 1}, sem conflito`,
      baixa: `score < ${LIMIARES.media}, OU qualquer critério conflitante, OU sustentação apenas por nome`,
      ambiguo: 'duas ou mais correspondências possíveis no mesmo nível de chave',
    },
    comportamento: {
      alta: 'vínculo automático permitido',
      media: 'vínculo sugerido, aguardando revisão humana',
      baixa: 'não vincular automaticamente',
      ambiguo: 'gerar inconsistência obrigatória, sem escolher',
    },
    pesos: PESOS,
    observacoes: [
      'Documento só pontua se validado por dígito verificador.',
      'Nome exige dois ou mais termos: primeiro nome nunca vincula.',
      'Data compatível reforça, mas não sustenta vínculo sozinha.',
      'Conflito rebaixa para baixa independentemente do score.',
    ],
  };
}
