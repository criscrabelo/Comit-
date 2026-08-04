/**
 * Motor de relacionamento Monday × Sienge.
 *
 * Fluxo de decisão:
 *
 *   registros (A de uma fonte, candidatos B de outra)
 *        │
 *        ├─ 1. bloqueios de CONJUNTO ─── >1 candidato ──► AMBÍGUO
 *        │                                                (inconsistência obrigatória,
 *        │                                                 nenhum escolhido)
 *        ├─ 2. bloqueios do PAR ──────── documento conflitante,
 *        │                               homônimo, empreendimento/unidade
 *        │                               ambíguos, sem identificador
 *        │                                            ──► BLOQUEADO
 *        │
 *        └─ 3. apura critérios em ordem de prioridade:
 *              CPF/CNPJ válido → contrato → empr+unidade → ids → nome completo
 *                    │
 *                    └─ score ─┬─ ≥60 sem conflito ──► AUTOMÁTICO  (confiança alta)
 *                              ├─ ≥25 sem conflito ──► SUGERIDO    (confiança média)
 *                              └─ <25 ou conflito ──► RECUSADO    (confiança baixa)
 *
 * Nada é vinculado por primeiro nome. Nada ambíguo é resolvido sozinho.
 */
import { avaliarDocumento } from '../dominio/documento.js';
import { normalizarNome, normalizarContrato } from '../integracoes/monday/transformacao.js';
import {
  avaliarConfianca,
  PESOS,
  situacaoPorConfianca,
  type AvaliacaoConfianca,
  type Criterio,
} from './criterios.js';
import {
  bloqueiosDeConjunto,
  bloqueiosDoPar,
  bloqueiosFinanceiros,
  type Bloqueio,
  type LadoRegistro,
} from './bloqueios.js';

export type SituacaoVinculo =
  | 'automatico'
  | 'sugerido'
  | 'recusado'
  | 'ambiguo'
  | 'bloqueado'
  | 'aceito'
  | 'rejeitado'
  | 'desfeito';

export interface ResultadoVinculo {
  situacao: SituacaoVinculo;
  avaliacao: AvaliacaoConfianca;
  bloqueios: Bloqueio[];
  /** Todos os candidatos considerados, preservados mesmo quando ambíguo. */
  candidatos: LadoRegistro[];
  /** Lado escolhido. `null` em ambíguo, bloqueado e recusado. */
  escolhido: LadoRegistro | null;
  /** Chave que sustentou o vínculo, para a trilha. */
  chaveUsada: string | null;
  /** true quando exige inconsistência obrigatória. */
  exigeInconsistencia: boolean;
}

/**
 * Apura os critérios atendidos e conflitantes entre dois registros.
 *
 * Segue a ordem de prioridade: cada nível é avaliado independentemente, e a soma
 * dos pesos produz o score. Não há atalho — um documento igual não dispensa
 * conferir o contrato, porque um contrato divergente é conflito.
 */
export function apurarCriterios(
  a: LadoRegistro,
  b: LadoRegistro,
): { atendidos: Criterio[]; conflitantes: Criterio[] } {
  const atendidos: Criterio[] = [];
  const conflitantes: Criterio[] = [];

  // ── Nível 1: CPF/CNPJ validado ───────────────────────────────────────────
  const docA = avaliarDocumento(a.cpfCnpj);
  const docB = avaliarDocumento(b.cpfCnpj);

  if (docA.valido && docB.valido) {
    if (docA.digitos === docB.digitos) {
      atendidos.push({
        nome: 'cpf_cnpj',
        peso: PESOS.cpf_cnpj,
        // Nunca o documento em claro: só a forma e o final.
        valor_a: `${docA.tipo} ***${docA.digitos?.slice(-2)}`,
        valor_b: `${docB.tipo} ***${docB.digitos?.slice(-2)}`,
        observacao: 'documento validado por dígito verificador e idêntico',
      });
    }
    // Documentos diferentes já viram bloqueio em bloqueiosDoPar; não duplicar
    // aqui como conflito, para não contar o mesmo fato duas vezes.
  }

  // ── Nível 2: número do contrato ──────────────────────────────────────────
  const contratoA = normalizarContrato(a.contrato);
  const contratoB = normalizarContrato(b.contrato);

  if (contratoA && contratoB) {
    if (contratoA === contratoB) {
      atendidos.push({
        nome: 'contrato',
        peso: PESOS.contrato,
        valor_a: a.contrato,
        valor_b: b.contrato,
        observacao: 'número de contrato normalizado e idêntico',
      });
    } else {
      // Contrato divergente é conflito de verdade: rebaixa a confiança.
      conflitantes.push({
        nome: 'contrato',
        peso: 0,
        valor_a: a.contrato,
        valor_b: b.contrato,
        observacao: 'números de contrato diferentes',
      });
    }
  }

  // ── Nível 3: empreendimento + unidade ────────────────────────────────────
  if (a.empreendimentoId && b.empreendimentoId && a.empreendimentoId === b.empreendimentoId) {
    atendidos.push({
      nome: 'empreendimento',
      peso: PESOS.empreendimento,
      valor_a: a.empreendimentoNome ?? a.empreendimentoId,
      valor_b: b.empreendimentoNome ?? b.empreendimentoId,
      observacao: 'mesmo identificador interno de empreendimento',
    });

    const unidadeA = normalizarNome(a.unidade);
    const unidadeB = normalizarNome(b.unidade);
    if (unidadeA && unidadeA === unidadeB) {
      atendidos.push({
        nome: 'unidade',
        peso: PESOS.unidade,
        valor_a: a.unidade,
        valor_b: b.unidade,
        observacao: 'unidade idêntica no mesmo empreendimento',
      });
    }
  }

  // ── Nível 4: identificadores relacionados ────────────────────────────────
  for (const [chave, valorA] of Object.entries(a.idsRelacionados ?? {})) {
    const valorB = b.idsRelacionados?.[chave];
    if (valorA && valorB && valorA === valorB) {
      atendidos.push({
        nome: 'id_relacionado',
        peso: PESOS.id_relacionado,
        valor_a: `${chave}=${valorA}`,
        valor_b: `${chave}=${valorB}`,
        observacao: `identificador relacionado ${chave} coincide`,
      });
      // Um identificador relacionado basta; somar vários inflaria o score.
      break;
    }
  }

  // ── Nível 5: nome completo normalizado (último recurso) ──────────────────
  const nomeA = normalizarNome(a.nome);
  const nomeB = normalizarNome(b.nome);

  if (nomeA && nomeA === nomeB) {
    // Nome completo exige DOIS OU MAIS termos. Primeiro nome nunca vincula —
    // regra imposta aqui, não confiada a quem chama.
    const termos = nomeA.split(' ').filter(Boolean);
    if (termos.length >= 2) {
      atendidos.push({
        nome: 'nome_completo',
        peso: PESOS.nome_completo,
        valor_a: a.nome,
        valor_b: b.nome,
        observacao: `nome completo normalizado idêntico (${termos.length} termos)`,
      });
    } else {
      conflitantes.push({
        nome: 'nome_completo',
        peso: 0,
        valor_a: a.nome,
        valor_b: b.nome,
        observacao: 'apenas um termo: primeiro nome não vincula',
      });
    }
  }

  // ── Reforço: datas de referência compatíveis ─────────────────────────────
  if (a.dataReferencia && b.dataReferencia && a.dataReferencia === b.dataReferencia) {
    atendidos.push({
      nome: 'data_compativel',
      peso: PESOS.data_compativel,
      valor_a: a.dataReferencia,
      valor_b: b.dataReferencia,
      observacao: 'mesma data de referência',
    });
  }

  return { atendidos, conflitantes };
}

/** Descreve a chave que sustentou o vínculo, para a trilha. */
function descreverChave(a: LadoRegistro, atendidos: Criterio[]): string | null {
  const principal = [...atendidos]
    .filter((c) => c.nome !== 'data_compativel')
    .sort((x, y) => y.peso - x.peso)[0];

  if (!principal) return null;

  switch (principal.nome) {
    case 'cpf_cnpj':
      return `documento ${String(principal.valor_a)}`;
    case 'contrato':
      return `contrato ${a.contrato}`;
    case 'empreendimento':
    case 'unidade':
      return `${a.empreendimentoNome ?? a.empreendimentoId} / ${a.unidade}`;
    case 'id_relacionado':
      return String(principal.valor_a);
    case 'nome_completo':
      return `nome ${a.nome}`;
    default:
      return null;
  }
}

export interface OpcoesRelacionamento {
  /** Quantos contratos foram encontrados como candidatos. */
  contratosCandidatos?: number;
  /** Quantos clientes distintos o contrato aponta. */
  clientesPorContrato?: number;
}

/**
 * Relaciona um registro com os candidatos encontrados na outra fonte.
 *
 * Devolve a decisão SEM persistir. Persistência e geração de inconsistência
 * ficam em `servico.ts`, para que o motor possa ser testado isoladamente.
 */
export function relacionar(
  registro: LadoRegistro,
  candidatos: LadoRegistro[],
  opcoes: OpcoesRelacionamento = {},
): ResultadoVinculo {
  // ── Sem candidato: nada a decidir ────────────────────────────────────────
  if (candidatos.length === 0) {
    return {
      situacao: 'recusado',
      avaliacao: avaliarConfianca([], []),
      bloqueios: [
        {
          codigo: 'identificadores_minimos_ausentes',
          motivo: 'Nenhum candidato encontrado na outra fonte.',
        },
      ],
      candidatos: [],
      escolhido: null,
      chaveUsada: null,
      exigeInconsistencia: false,
    };
  }

  // ── 1. Ambiguidade primeiro: é propriedade do conjunto ───────────────────
  const deConjunto = bloqueiosDeConjunto(candidatos, opcoes);

  if (candidatos.length > 1) {
    // Avalia cada candidato para a fila de revisão saber o que estava em jogo,
    // mas NÃO elege nenhum.
    const avaliacoes = candidatos.map((c) => {
      const { atendidos, conflitantes } = apurarCriterios(registro, c);
      return avaliarConfianca(atendidos, conflitantes);
    });

    // A avaliação registrada é a do melhor candidato — para dimensionar o caso,
    // não para escolhê-lo.
    const melhor = avaliacoes.reduce((a, b) => (b.score > a.score ? b : a));

    return {
      situacao: 'ambiguo',
      avaliacao: { ...melhor, confianca: 'baixa' },
      bloqueios: deConjunto,
      candidatos,
      escolhido: null,
      chaveUsada: null,
      // Ambiguidade sempre gera inconsistência: é obrigatório.
      exigeInconsistencia: true,
    };
  }

  const candidato = candidatos[0]!;

  // ── 2. Bloqueios do par ──────────────────────────────────────────────────
  const doPar = bloqueiosDoPar(registro, candidato);
  const todosBloqueios = [...deConjunto, ...doPar];

  const { atendidos, conflitantes } = apurarCriterios(registro, candidato);

  if (todosBloqueios.length > 0) {
    // Os critérios dos bloqueios entram como conflitantes, para que a trilha
    // mostre o que contrariou.
    const conflitosDeBloqueio = todosBloqueios
      .map((b) => b.criterio)
      .filter((c): c is Criterio => Boolean(c));

    return {
      situacao: 'bloqueado',
      avaliacao: avaliarConfianca(atendidos, [...conflitantes, ...conflitosDeBloqueio]),
      bloqueios: todosBloqueios,
      candidatos,
      escolhido: null,
      chaveUsada: null,
      // Documento conflitante e contrato de clientes diferentes são problemas
      // na origem: precisam de inconsistência. Ausência de identificador é
      // apenas falta de dado.
      exigeInconsistencia: todosBloqueios.some(
        (b) => b.codigo !== 'identificadores_minimos_ausentes',
      ),
    };
  }

  // ── 3. Confiança ─────────────────────────────────────────────────────────
  const avaliacao = avaliarConfianca(atendidos, conflitantes);
  const situacao = situacaoPorConfianca(avaliacao.confianca);

  return {
    situacao,
    avaliacao,
    bloqueios: [],
    candidatos,
    // Só o vínculo automático elege sozinho. Sugerido registra o candidato mas
    // aguarda revisão; recusado não elege.
    escolhido: situacao === 'automatico' ? candidato : situacao === 'sugerido' ? candidato : null,
    chaveUsada: descreverChave(registro, atendidos),
    exigeInconsistencia: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Comparação financeira
// ═══════════════════════════════════════════════════════════════════════════

export type ClassificacaoFinanceira =
  | 'valores_iguais'
  | 'data_referencia_incompativel'
  | 'natureza_valor_incompativel'
  | 'divergencia_valor_a_validar'
  | 'divergencia_confirmada';

export interface ElementosComparaveis {
  /** Contrato confirmado igual nos dois lados. */
  contratoConfirmado: boolean;
  /** Parcela ou posição identificada igual. */
  parcelaConfirmada: boolean;
  /** Natureza do valor igual. */
  naturezaConfirmada: boolean;
  /** Datas de referência iguais. */
  dataConfirmada: boolean;
  /** Pagamentos no intervalo entre as datas, quando conhecidos. */
  pagamentosApurados: boolean;
  /** Juros, multa e correção apurados no intervalo. */
  encargosApurados: boolean;
  /** Renegociação, acordo, distrato ou retomada verificados. */
  eventosContratuaisApurados: boolean;
}

export interface ResultadoComparacaoFinanceira {
  classificacao: ClassificacaoFinanceira;
  /** Diferença absoluta entre os valores. `null` quando não comparável. */
  diferenca: number | null;
  bloqueios: Bloqueio[];
  /** O que falta apurar para poder concluir. */
  pendencias: string[];
  /** Texto pronto para a descrição da inconsistência. */
  explicacao: string;
}

/**
 * Compara dois valores financeiros SEM concluir divergência prematuramente.
 *
 * Regra central: valores diferentes **não** são divergência. Antes de concluir é
 * preciso que contrato, parcela, natureza e data coincidam, e que pagamentos,
 * encargos e eventos contratuais do intervalo estejam apurados.
 *
 * Enquanto isso não acontecer, a classificação fica em um dos estados
 * intermediários — nunca em "divergência confirmada".
 */
export function compararFinanceiro(
  a: LadoRegistro,
  b: LadoRegistro,
  elementos: Partial<ElementosComparaveis> = {},
): ResultadoComparacaoFinanceira {
  const bloqueios = bloqueiosFinanceiros(a, b);
  const pendencias: string[] = [];

  const valorA = a.valor ?? null;
  const valorB = b.valor ?? null;
  const diferenca =
    valorA !== null && valorB !== null ? Math.abs(valorA - valorB) : null;

  // Natureza incompatível impede qualquer comparação.
  if (bloqueios.some((x) => x.codigo === 'naturezas_valor_diferentes')) {
    return {
      classificacao: 'natureza_valor_incompativel',
      diferenca: null,
      bloqueios,
      pendencias: ['naturezas de valor diferentes: a comparação não se aplica'],
      explicacao:
        `Não é possível comparar "${a.naturezaValor}" com "${b.naturezaValor}": ` +
        'são naturezas financeiras distintas.',
    };
  }

  // Datas diferentes: classificação intermediária, nunca conclusão.
  if (bloqueios.some((x) => x.codigo === 'datas_referencia_incompativeis')) {
    return {
      classificacao: 'data_referencia_incompativel',
      diferenca,
      bloqueios,
      pendencias: [
        'apurar pagamentos ocorridos entre as duas datas',
        'apurar juros, multa e correção do intervalo',
        'verificar renegociação, acordo, distrato ou retomada no período',
      ],
      explicacao:
        `Os valores se referem a datas diferentes (${a.dataReferencia ?? 'sem data'} e ` +
        `${b.dataReferencia ?? 'sem data'}). A diferença de ` +
        (diferenca !== null ? `R$ ${diferenca.toFixed(2)} ` : '') +
        'pode ser apenas defasagem de leitura, não erro de valor. ' +
        'Não classificada como divergência.',
    };
  }

  // Datas iguais e valores iguais: nada a fazer.
  if (diferenca !== null && diferenca < 0.01) {
    return {
      classificacao: 'valores_iguais',
      diferenca: 0,
      bloqueios: [],
      pendencias: [],
      explicacao: 'Valores coincidem na mesma data de referência.',
    };
  }

  // Datas iguais, valores diferentes. Só é divergência confirmada se TODOS os
  // elementos comparáveis estiverem validados.
  const exigidos: Array<[keyof ElementosComparaveis, string]> = [
    ['contratoConfirmado', 'confirmar que é o mesmo contrato'],
    ['parcelaConfirmada', 'confirmar que é a mesma parcela ou posição'],
    ['naturezaConfirmada', 'confirmar a natureza do valor'],
    ['dataConfirmada', 'confirmar a data de referência'],
    ['pagamentosApurados', 'apurar pagamentos ocorridos'],
    ['encargosApurados', 'apurar juros, multa e correção'],
    ['eventosContratuaisApurados', 'verificar renegociação, acordo, distrato ou retomada'],
  ];

  for (const [chave, descricao] of exigidos) {
    if (elementos[chave] !== true) pendencias.push(descricao);
  }

  if (pendencias.length > 0) {
    return {
      classificacao: 'divergencia_valor_a_validar',
      diferenca,
      bloqueios,
      pendencias,
      explicacao:
        `Valores diferentes na mesma data de referência (${a.dataReferencia}): ` +
        `${a.fonte} informa ${valorA}, ${b.fonte} informa ${valorB}. ` +
        `Diferença de R$ ${diferenca?.toFixed(2) ?? '—'}. ` +
        `Ainda falta apurar: ${pendencias.join('; ')}. ` +
        'Classificada como divergência A VALIDAR, não confirmada.',
    };
  }

  return {
    classificacao: 'divergencia_confirmada',
    diferenca,
    bloqueios: [],
    pendencias: [],
    explicacao:
      `Divergência confirmada em ${a.naturezaValor ?? 'valor'} na data ${a.dataReferencia}: ` +
      `${a.fonte} informa ${valorA}, ${b.fonte} informa ${valorB}, diferença de ` +
      `R$ ${diferenca?.toFixed(2) ?? '—'}. Contrato, parcela, natureza, data, pagamentos, ` +
      'encargos e eventos contratuais foram verificados e os valores são comparáveis.',
  };
}
