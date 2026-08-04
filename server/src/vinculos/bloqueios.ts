/**
 * Bloqueios automáticos do motor de relacionamento.
 *
 * Onze situações em que o vínculo automático é PROIBIDO, mesmo que o score
 * pareça suficiente. A verificação acontece antes do cálculo de confiança: um
 * bloqueio não é um score baixo, é uma recusa.
 *
 * Cada bloqueio devolve o motivo em texto, porque "não vinculei" sem dizer por
 * que é inútil para quem revisa.
 */
import { avaliarDocumento } from '../dominio/documento.js';
import { normalizarNome } from '../integracoes/monday/transformacao.js';
import type { Criterio } from './criterios.js';

/** Um lado da comparação: o registro como veio da sua fonte. */
export interface LadoRegistro {
  fonte: 'monday' | 'sienge' | 'cvcrm' | 'manual' | 'migracao' | 'consolidacao';
  idOrigem: string;
  cpfCnpj?: string | null;
  nome?: string | null;
  contrato?: string | null;
  empreendimentoId?: string | null;
  empreendimentoNome?: string | null;
  unidade?: string | null;
  torre?: string | null;
  idsRelacionados?: Record<string, string | null | undefined>;
  dataReferencia?: string | null;
  /** Natureza do valor financeiro, quando houver. */
  naturezaValor?: string | null;
  valor?: number | null;
}

export type CodigoBloqueio =
  | 'cpf_cnpj_diferentes'
  | 'cpf_cnpj_invalido'
  | 'multiplos_contratos_candidatos'
  | 'contrato_de_clientes_diferentes'
  | 'empreendimento_ambiguo'
  | 'unidade_ambigua'
  | 'mesmo_nome_documentos_diferentes'
  | 'identificadores_minimos_ausentes'
  | 'multiplas_correspondencias'
  | 'datas_referencia_incompativeis'
  | 'naturezas_valor_diferentes';

export interface Bloqueio {
  codigo: CodigoBloqueio;
  motivo: string;
  /** Registrado como critério conflitante no vínculo. */
  criterio?: Criterio;
}

/**
 * Janela em que duas posições financeiras são consideradas da mesma data.
 *
 * Zero: posição financeira de dias diferentes NÃO é comparável. Um dia de
 * diferença já muda juros, multa e pode conter pagamento. Comparar produziria
 * uma "divergência" que é só defasagem de leitura.
 */
const TOLERANCIA_DIAS_POSICAO = 0;

/**
 * Bloqueios que dependem apenas dos dois registros.
 *
 * `candidatos` e ambiguidade são avaliados separadamente, em `bloqueiosDeConjunto`,
 * porque dependem do conjunto de candidatos, não do par.
 */
export function bloqueiosDoPar(a: LadoRegistro, b: LadoRegistro): Bloqueio[] {
  const bloqueios: Bloqueio[] = [];

  const docA = avaliarDocumento(a.cpfCnpj);
  const docB = avaliarDocumento(b.cpfCnpj);

  // 1. Documento inválido não serve como chave — nem para vincular, nem para
  //    separar. Bloqueia porque a identidade fica indeterminada.
  if ((a.cpfCnpj && !docA.valido) || (b.cpfCnpj && !docB.valido)) {
    const lado = a.cpfCnpj && !docA.valido ? a : b;
    const doc = a.cpfCnpj && !docA.valido ? docA : docB;
    bloqueios.push({
      codigo: 'cpf_cnpj_invalido',
      motivo: `${lado.fonte}/${lado.idOrigem}: ${doc.motivo}. Documento inválido não serve como chave de vínculo.`,
      criterio: {
        nome: 'cpf_cnpj',
        peso: 0,
        valor_a: docA.valido ? 'válido' : docA.motivo,
        valor_b: docB.valido ? 'válido' : docB.motivo,
        observacao: 'documento reprovado na validação por dígito verificador',
      },
    });
  }

  // 2. Dois documentos válidos e DIFERENTES: são pessoas distintas. Nenhuma
  //    coincidência de nome ou unidade muda isso.
  if (docA.valido && docB.valido && docA.digitos !== docB.digitos) {
    bloqueios.push({
      codigo: 'cpf_cnpj_diferentes',
      motivo:
        'Os dois registros têm documentos válidos e diferentes: são pessoas distintas. ' +
        'Nenhum outro critério pode sobrepor isso.',
      criterio: {
        nome: 'cpf_cnpj',
        peso: 0,
        // Nunca registra o documento em claro na trilha.
        valor_a: `${docA.tipo} terminado em ${docA.digitos?.slice(-2)}`,
        valor_b: `${docB.tipo} terminado em ${docB.digitos?.slice(-2)}`,
        observacao: 'documentos válidos e distintos',
      },
    });
  }

  // 3. Mesmo nome completo com documentos diferentes: homônimos. Vincular
  //    fundiria duas pessoas numa só.
  const nomeA = normalizarNome(a.nome);
  const nomeB = normalizarNome(b.nome);
  if (
    nomeA &&
    nomeA === nomeB &&
    docA.valido &&
    docB.valido &&
    docA.digitos !== docB.digitos
  ) {
    bloqueios.push({
      codigo: 'mesmo_nome_documentos_diferentes',
      motivo: `"${a.nome}" aparece com dois documentos válidos distintos: são homônimos, não a mesma pessoa.`,
      criterio: {
        nome: 'nome_completo',
        peso: 0,
        valor_a: a.nome,
        valor_b: b.nome,
        observacao: 'nome idêntico, documentos distintos',
      },
    });
  }

  // 4. Identificadores mínimos: sem documento, sem contrato e sem
  //    empreendimento+unidade, o único resto seria o nome — e nome sozinho não
  //    vincula.
  const temDocumento = docA.valido && docB.valido;
  const temContrato = Boolean(a.contrato && b.contrato);
  const temEmprUnidade = Boolean(
    a.empreendimentoId && b.empreendimentoId && a.unidade && b.unidade,
  );
  const temIdRelacionado = Object.entries(a.idsRelacionados ?? {}).some(
    ([chave, valor]) => valor && b.idsRelacionados?.[chave] === valor,
  );

  if (!temDocumento && !temContrato && !temEmprUnidade && !temIdRelacionado) {
    bloqueios.push({
      codigo: 'identificadores_minimos_ausentes',
      motivo:
        'Faltam os identificadores mínimos: sem documento válido, sem contrato, sem empreendimento+unidade ' +
        'e sem identificador relacionado. Nome completo sozinho não vincula.',
    });
  }

  // 5. Empreendimento ambíguo: nomes que não resolvem para o mesmo
  //    identificador interno. Comparar por texto é o erro que fragmentava o
  //    histórico na base antiga.
  if (
    a.empreendimentoId &&
    b.empreendimentoId &&
    a.empreendimentoId !== b.empreendimentoId
  ) {
    bloqueios.push({
      codigo: 'empreendimento_ambiguo',
      motivo:
        `Empreendimentos diferentes: "${a.empreendimentoNome ?? a.empreendimentoId}" e ` +
        `"${b.empreendimentoNome ?? b.empreendimentoId}". O vínculo exigiria o mesmo ativo.`,
      criterio: {
        nome: 'empreendimento',
        peso: 0,
        valor_a: a.empreendimentoNome ?? a.empreendimentoId,
        valor_b: b.empreendimentoNome ?? b.empreendimentoId,
      },
    });
  }

  // 6. Unidade ambígua: mesmo empreendimento, unidades diferentes.
  if (
    a.empreendimentoId &&
    a.empreendimentoId === b.empreendimentoId &&
    a.unidade &&
    b.unidade &&
    normalizarNome(a.unidade) !== normalizarNome(b.unidade)
  ) {
    bloqueios.push({
      codigo: 'unidade_ambigua',
      motivo: `Mesmo empreendimento, unidades diferentes: "${a.unidade}" e "${b.unidade}".`,
      criterio: {
        nome: 'unidade',
        peso: 0,
        valor_a: a.unidade,
        valor_b: b.unidade,
      },
    });
  }

  return bloqueios;
}

/**
 * Bloqueios que dependem do CONJUNTO de candidatos.
 *
 * Ambiguidade não é propriedade de um par: é propriedade do conjunto. Dois
 * candidatos igualmente plausíveis significam que a chave usada não distingue.
 */
export function bloqueiosDeConjunto(
  candidatos: LadoRegistro[],
  contexto: { contratosCandidatos?: number; clientesPorContrato?: number } = {},
): Bloqueio[] {
  const bloqueios: Bloqueio[] = [];

  // 7. Mais de uma correspondência possível.
  if (candidatos.length > 1) {
    bloqueios.push({
      codigo: 'multiplas_correspondencias',
      motivo:
        `${candidatos.length} correspondências possíveis: ` +
        candidatos.map((c) => `${c.fonte}/${c.idOrigem}`).join(', ') +
        '. Nenhuma foi escolhida automaticamente.',
    });
  }

  // 8. Mais de um contrato candidato para o mesmo registro.
  if ((contexto.contratosCandidatos ?? 0) > 1) {
    bloqueios.push({
      codigo: 'multiplos_contratos_candidatos',
      motivo: `${contexto.contratosCandidatos} contratos candidatos. O número de contrato não distingue neste caso.`,
    });
  }

  // 9. Contrato associado a clientes diferentes: problema na origem, não no
  //    relacionamento.
  if ((contexto.clientesPorContrato ?? 0) > 1) {
    bloqueios.push({
      codigo: 'contrato_de_clientes_diferentes',
      motivo:
        `O mesmo contrato aparece vinculado a ${contexto.clientesPorContrato} clientes distintos. ` +
        'Corrigir na origem antes de vincular.',
    });
  }

  return bloqueios;
}

/**
 * Bloqueios específicos da comparação FINANCEIRA.
 *
 * Separados dos demais porque não impedem o vínculo de identidade — impedem
 * concluir que existe divergência de valor. É a regra "não conclua divergência
 * apenas porque os valores são diferentes".
 */
export function bloqueiosFinanceiros(a: LadoRegistro, b: LadoRegistro): Bloqueio[] {
  const bloqueios: Bloqueio[] = [];

  // 10. Datas de referência incompatíveis. Posição financeira de dias
  //     diferentes não é comparável: juros correm, multa incide, pagamento
  //     pode ter ocorrido no meio.
  if (a.dataReferencia && b.dataReferencia) {
    const diasDeDiferenca = Math.abs(
      (Date.parse(b.dataReferencia) - Date.parse(a.dataReferencia)) / 86_400_000,
    );
    if (diasDeDiferenca > TOLERANCIA_DIAS_POSICAO) {
      bloqueios.push({
        codigo: 'datas_referencia_incompativeis',
        motivo:
          `Posições de datas diferentes: ${a.dataReferencia} (${a.fonte}) e ${b.dataReferencia} (${b.fonte}), ` +
          `${Math.round(diasDeDiferenca)} dia(s) de diferença. Os valores não são comparáveis sem apurar ` +
          'pagamentos, juros, multa e correção no intervalo.',
        criterio: {
          nome: 'data_referencia',
          peso: 0,
          valor_a: a.dataReferencia,
          valor_b: b.dataReferencia,
          observacao: `${Math.round(diasDeDiferenca)} dia(s) de diferença`,
        },
      });
    }
  } else {
    // Ausência de data de referência também impede concluir.
    bloqueios.push({
      codigo: 'datas_referencia_incompativeis',
      motivo:
        'Falta data de referência em ao menos um dos lados. Sem ela não é possível afirmar que os ' +
        'valores se referem ao mesmo instante.',
      criterio: {
        nome: 'data_referencia',
        peso: 0,
        valor_a: a.dataReferencia ?? null,
        valor_b: b.dataReferencia ?? null,
      },
    });
  }

  // 11. Naturezas diferentes: saldo vencido não se compara com saldo atualizado,
  //     nem carteira com contas a receber.
  if (a.naturezaValor && b.naturezaValor && a.naturezaValor !== b.naturezaValor) {
    bloqueios.push({
      codigo: 'naturezas_valor_diferentes',
      motivo:
        `Naturezas diferentes: "${a.naturezaValor}" e "${b.naturezaValor}". ` +
        'Valores de naturezas distintas não são comparáveis.',
      criterio: {
        nome: 'natureza_valor',
        peso: 0,
        valor_a: a.naturezaValor,
        valor_b: b.naturezaValor,
      },
    });
  }

  return bloqueios;
}

/** Catálogo dos bloqueios, para documentação e interface. */
export function documentarBloqueios(): Array<{ codigo: CodigoBloqueio; descricao: string }> {
  return [
    { codigo: 'cpf_cnpj_diferentes', descricao: 'Documentos válidos e distintos nos dois lados' },
    { codigo: 'cpf_cnpj_invalido', descricao: 'Documento reprovado no dígito verificador' },
    { codigo: 'multiplos_contratos_candidatos', descricao: 'Mais de um contrato candidato' },
    { codigo: 'contrato_de_clientes_diferentes', descricao: 'Contrato apontando para clientes distintos' },
    { codigo: 'empreendimento_ambiguo', descricao: 'Empreendimentos diferentes entre os lados' },
    { codigo: 'unidade_ambigua', descricao: 'Mesmo empreendimento com unidades diferentes' },
    { codigo: 'mesmo_nome_documentos_diferentes', descricao: 'Homônimos com documentos distintos' },
    { codigo: 'identificadores_minimos_ausentes', descricao: 'Nenhum identificador mínimo presente' },
    { codigo: 'multiplas_correspondencias', descricao: 'Duas ou mais correspondências possíveis' },
    { codigo: 'datas_referencia_incompativeis', descricao: 'Posições financeiras de datas diferentes' },
    { codigo: 'naturezas_valor_diferentes', descricao: 'Valores de naturezas financeiras distintas' },
  ];
}
