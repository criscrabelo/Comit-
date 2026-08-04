/**
 * Catalogo de inconsistencias.
 *
 * Os 17 tipos de schemas/inconsistencias.schema.json, mais tres extensoes
 * documentadas em DECISOES.md. Cada tipo declara a gravidade padrao, a area
 * responsavel pelo tratamento e o rotulo que aparece na interface.
 *
 * Por que existe uma camada de traducao: a auditoria mostrou que nenhum dos
 * scripts da skill produz um objeto conforme ao proprio schema —
 * `analisar_cobrancas.py` emite strings livres, e `validar_vinculos.py` e
 * `validar_documentos.py` omitem `fonte` e `detectado_em`, que sao obrigatorios.
 * Sem normalizar, a Central de Inconsistencias nao poderia ser populada.
 */
import type {
  AreaOrganizacional,
  GravidadeInconsistencia,
  TipoInconsistencia,
} from '../db/schema.js';

export interface DefinicaoTipo {
  tipo: TipoInconsistencia;
  rotulo: string;
  gravidadePadrao: GravidadeInconsistencia;
  /** Area que trata por padrao. A atribuicao pode ser alterada na interface. */
  areaResponsavel: AreaOrganizacional;
  /** O que fazer. Aparece na tela de tratamento. */
  orientacao: string;
  /**
   * true = enquanto aberta, os indicadores que dependem deste registro ficam
   * "sem dado" com motivo declarado, em vez de exibir um numero possivelmente
   * errado.
   */
  bloqueiaIndicador: boolean;
}

export const TIPOS: Record<TipoInconsistencia, DefinicaoTipo> = {
  cliente_sem_identificacao: {
    tipo: 'cliente_sem_identificacao',
    rotulo: 'Cliente sem identificacao',
    gravidadePadrao: 'alta',
    areaResponsavel: 'juridico',
    orientacao:
      'Registro sem CPF/CNPJ, contrato ou unidade. Informe um identificador na origem para que o cliente possa ser contado uma unica vez.',
    bloqueiaIndicador: true,
  },
  cpf_cnpj_invalido: {
    tipo: 'cpf_cnpj_invalido',
    rotulo: 'CPF/CNPJ invalido',
    gravidadePadrao: 'alta',
    areaResponsavel: 'juridico',
    orientacao:
      'O documento tem digito verificador invalido e por isso nao serve como chave de vinculo. Corrija na origem.',
    bloqueiaIndicador: false,
  },
  contrato_ausente: {
    tipo: 'contrato_ausente',
    rotulo: 'Contrato ausente',
    gravidadePadrao: 'media',
    areaResponsavel: 'juridico',
    orientacao: 'Sem numero de contrato o vinculo com o Sienge cai para empreendimento + unidade.',
    bloqueiaIndicador: false,
  },
  unidade_ausente: {
    tipo: 'unidade_ausente',
    rotulo: 'Unidade ausente',
    gravidadePadrao: 'media',
    areaResponsavel: 'comercial',
    orientacao: 'Sem unidade nao e possivel calcular exposicao por unidade.',
    bloqueiaIndicador: false,
  },
  empreendimento_ausente: {
    tipo: 'empreendimento_ausente',
    rotulo: 'Empreendimento ausente',
    gravidadePadrao: 'alta',
    areaResponsavel: 'comercial',
    orientacao:
      'Registro sem empreendimento nao entra em nenhum indicador por empreendimento nem no consolidado por ativo.',
    bloqueiaIndicador: true,
  },
  duplicidade: {
    tipo: 'duplicidade',
    rotulo: 'Duplicidade',
    gravidadePadrao: 'media',
    areaResponsavel: 'juridico',
    orientacao: 'Dois registros identicos na mesma carga. Verifique a origem.',
    bloqueiaIndicador: false,
  },
  vinculo_ambiguo: {
    tipo: 'vinculo_ambiguo',
    rotulo: 'Vinculo ambiguo',
    gravidadePadrao: 'critica',
    areaResponsavel: 'juridico',
    orientacao:
      'Mais de um candidato possivel no mesmo nivel de vinculo. A plataforma NAO escolhe automaticamente: confirme qual e o correto.',
    bloqueiaIndicador: true,
  },
  grafia_divergente: {
    tipo: 'grafia_divergente',
    rotulo: 'Grafia divergente',
    gravidadePadrao: 'baixa',
    areaResponsavel: 'juridico',
    orientacao:
      'Mesmo documento com nomes escritos de formas diferentes. Nomes semelhantes nunca sao unidos automaticamente.',
    bloqueiaIndicador: false,
  },
  contrato_divergente: {
    tipo: 'contrato_divergente',
    rotulo: 'Contrato divergente',
    gravidadePadrao: 'media',
    areaResponsavel: 'juridico',
    orientacao: 'A mesma unidade aparece vinculada a mais de um contrato.',
    bloqueiaIndicador: true,
  },
  saldo_duplicado: {
    tipo: 'saldo_duplicado',
    rotulo: 'Saldo duplicado',
    gravidadePadrao: 'critica',
    areaResponsavel: 'financeiro',
    orientacao:
      'O mesmo saldo aparece em mais de um registro na mesma data. Somar duplicaria a exposicao financeira.',
    bloqueiaIndicador: true,
  },
  conflito_datas: {
    tipo: 'conflito_datas',
    rotulo: 'Conflito de datas',
    gravidadePadrao: 'media',
    areaResponsavel: 'juridico',
    orientacao:
      'Datas incoerentes entre si (por exemplo, solucao anterior a notificacao). Confira a cronologia na origem.',
    bloqueiaIndicador: false,
  },
  conflito_monday_cvcrm: {
    tipo: 'conflito_monday_cvcrm',
    rotulo: 'Divergencia Monday x CVCRM',
    gravidadePadrao: 'media',
    areaResponsavel: 'comercial',
    orientacao: 'Os dois valores estao preservados. A precedencia de reserva e do CVCRM.',
    bloqueiaIndicador: false,
  },
  conflito_cvcrm_sienge: {
    tipo: 'conflito_cvcrm_sienge',
    rotulo: 'Divergencia CVCRM x Sienge',
    gravidadePadrao: 'media',
    areaResponsavel: 'financeiro',
    orientacao: 'Os dois valores estao preservados. A precedencia financeira e do Sienge.',
    bloqueiaIndicador: false,
  },
  ausencia_carteira_referencia: {
    tipo: 'ausencia_carteira_referencia',
    rotulo: 'Sem carteira de referencia',
    gravidadePadrao: 'alta',
    areaResponsavel: 'financeiro',
    orientacao:
      'Sem carteira de referencia nao existe denominador: a inadimplencia percentual NAO pode ser calculada.',
    bloqueiaIndicador: true,
  },
  ausencia_percentual_perda: {
    tipo: 'ausencia_percentual_perda',
    rotulo: 'Sem percentual de perda aprovado',
    gravidadePadrao: 'alta',
    areaResponsavel: 'financeiro',
    orientacao:
      'A PDD financeira exige percentual de perda aprovado por faixa. Percentual nunca e presumido.',
    bloqueiaIndicador: true,
  },
  processo_sem_notificacao: {
    tipo: 'processo_sem_notificacao',
    rotulo: 'Processo sem notificacao',
    gravidadePadrao: 'media',
    areaResponsavel: 'juridico',
    orientacao:
      'Existe processo judicial sem notificacao correspondente. Afeta o denominador da taxa de judicializacao.',
    bloqueiaIndicador: false,
  },
  acordo_sem_confirmacao: {
    tipo: 'acordo_sem_confirmacao',
    rotulo: 'Acordo sem confirmacao',
    gravidadePadrao: 'media',
    areaResponsavel: 'juridico',
    orientacao:
      'Acordo registrado sem confirmacao de vigencia. Acordo apenas proposto nao conta como resolvido.',
    bloqueiaIndicador: false,
  },

  // ── Extensoes ao schema da skill (ver DECISOES.md) ────────────────────────
  conflito_monday_sienge: {
    tipo: 'conflito_monday_sienge',
    rotulo: 'Divergencia Monday x Sienge',
    gravidadePadrao: 'alta',
    areaResponsavel: 'financeiro',
    orientacao:
      'Os dois valores estao preservados. A precedencia financeira e do Sienge; confirme qual esta correto na origem.',
    bloqueiaIndicador: false,
  },
  divergencia_valor: {
    tipo: 'divergencia_valor',
    rotulo: 'Divergencia de valor',
    gravidadePadrao: 'alta',
    areaResponsavel: 'financeiro',
    orientacao: 'Valores diferentes para o mesmo campo. Nenhum foi sobrescrito.',
    bloqueiaIndicador: false,
  },
  falha_importacao: {
    tipo: 'falha_importacao',
    rotulo: 'Falha de importacao',
    gravidadePadrao: 'alta',
    areaResponsavel: 'ti',
    orientacao:
      'Uma fonte falhou. O ultimo dado valido foi preservado e a atualizacao esta sinalizada como parcial.',
    bloqueiaIndicador: false,
  },
};

/** Ordem de exibicao na triagem: mais grave primeiro. */
export const ORDEM_GRAVIDADE: Record<GravidadeInconsistencia, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

export function definicao(tipo: TipoInconsistencia): DefinicaoTipo {
  return TIPOS[tipo];
}

/**
 * Traduz uma mensagem livre em tipo do catalogo.
 *
 * Necessario porque `analisar_cobrancas.py` produz apenas texto
 * (ex: "cliente sem identificador", "VERANO: ausencia de carteira de
 * referencia"). Sem esta traducao, essas inconsistencias nao poderiam ser
 * tipadas nem atribuidas a ninguem.
 *
 * Devolve `null` quando nao reconhece — o chamador registra como
 * `divergencia_valor` com a mensagem original preservada, nunca descarta.
 */
export function traduzirMensagem(mensagem: string): TipoInconsistencia | null {
  const t = mensagem
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  if (/cliente sem identificador|sem identificacao/.test(t)) return 'cliente_sem_identificacao';
  if (/cpf|cnpj|documento invalido/.test(t)) return 'cpf_cnpj_invalido';
  if (/empreendimento vazio|empreendimento ausente/.test(t)) return 'empreendimento_ausente';
  if (/carteira de referencia/.test(t)) return 'ausencia_carteira_referencia';
  if (/percentual de perda|percentual de perda aprovado/.test(t)) return 'ausencia_percentual_perda';
  // Precisa vir ANTES da regra generica de duplicidade: a mensagem real de
  // analisar_cobrancas.py e "saldo financeiro deduplicado por contrato", e
  // "deduplicado" contem "duplicad".
  if (/saldo\b.*duplicad/.test(t)) return 'saldo_duplicado';
  if (/vinculo ambiguo|ambiguidade/.test(t)) return 'vinculo_ambiguo';
  if (/contrato divergente/.test(t)) return 'contrato_divergente';
  if (/contrato ausente|sem contrato/.test(t)) return 'contrato_ausente';
  if (/unidade ausente|sem unidade/.test(t)) return 'unidade_ausente';
  if (/duplicidade|duplicad/.test(t)) return 'duplicidade';
  if (/grafia/.test(t)) return 'grafia_divergente';
  if (/data|cronologia|posterior a data de corte/.test(t)) return 'conflito_datas';
  if (/processo sem notificacao/.test(t)) return 'processo_sem_notificacao';
  if (/acordo sem confirmacao/.test(t)) return 'acordo_sem_confirmacao';

  return null;
}
