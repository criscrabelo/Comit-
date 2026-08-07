/**
 * Transformacao dos payloads do Sienge em registros de dominio.
 *
 * Os nomes de campo aqui foram lidos das RESPOSTAS REAIS da API na homologacao
 * de 06/08/2026 (docs/evidencias/homologacao-sienge.md), nao da documentacao.
 * Onde os dois divergem, vale a resposta real — inclusive `adress`, que o
 * Sienge grafa assim mesmo.
 *
 * Regras que esta camada respeita, e que nao sao estilo:
 *
 *   - Valor monetario nunca vira `number` no caminho de gravacao. O saldo real
 *     do ambiente e `341233.7699999997`; gravar como float propaga o residuo
 *     para o indicador. Vai como string de duas casas para `numeric(18,2)`.
 *   - Campo ausente e `null`, nunca zero. "Sem dado nunca e zero" e regra do
 *     banco, e comeca aqui.
 *   - CPF/CNPJ passa por validacao de digito verificador antes de virar chave
 *     de vinculo. Documento invalido grava, mas NAO vincula.
 */
import { avaliarDocumento } from '../../dominio/documento.js';
import { normalizarNome } from '../monday/transformacao.js';
import type { FaixaAtraso } from '../../db/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Formatos de resposta, conforme observado na API real
// ─────────────────────────────────────────────────────────────────────────────

export interface EmpresaSienge {
  id: number;
  name?: string | null;
  cnpj?: string | null;
  tradeName?: string | null;
}

export interface EmpreendimentoSienge {
  id: number;
  name?: string | null;
  commercialName?: string | null;
  cnpj?: string | null;
  type?: string | null;
  /** Grafia da API, com o erro de digitacao preservado. */
  adress?: string | null;
  creationDate?: string | null;
  modificationDate?: string | null;
  companyId?: number | null;
  companyName?: string | null;
}

export interface ClienteSienge {
  id: number;
  name?: string | null;
  personType?: string | null;
  /** Ausente no payload quando a pessoa e juridica. */
  cpf?: string | null;
  cnpj?: string | null;
  createdAt?: string | null;
  modifiedAt?: string | null;
}

export interface TituloSienge {
  receivableBillId: number;
  customerId?: number | null;
  companyId?: number | null;
  documentId?: string | null;
  documentNumber?: string | null;
  issueDate?: string | null;
  receivableBillValue?: number | null;
  defaulting?: boolean | null;
  subjudice?: boolean | null;
  payOffDate?: string | null;
  unityName?: string | null;
  note?: string | null;
}

export interface ParcelaSienge {
  receivableBillId: number;
  installmentId: number;
  conditionTypeId?: string | null;
  dueDate?: string | null;
  balanceDue?: number | null;
  generatedBoleto?: boolean | null;
  carrierId?: number | null;
}

export interface ComissaoSienge {
  commissionID: number;
  companyId?: number | null;
  companyName?: string | null;
  enterpriseID?: number | null;
  enterpriseName?: string | null;
  customerID?: number | null;
  brokerID?: number | null;
  brokerName?: string | null;
  billingBrokerId?: number | null;
  billingBrokerName?: string | null;
  value?: number | null;
  installmentStatus?: string | null;
  dueDate?: string | null;
  salesContractNumber?: string | null;
  unitName?: string | null;
}

export interface SaldoSienge {
  totalOriginalValue?: number | null;
  totalAdjustedValue?: number | null;
  totalAdditionalValue?: number | null;
  totalCurrentDebitBalanceValue?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valor monetario como string de duas casas, para `numeric(18,2)`.
 *
 * O Sienge devolve JSON, e JSON so tem float. `341233.7699999997` chega assim
 * porque foi assim que o float representou 341233.77 — o dado nao esta errado,
 * a representacao esta. Arredondar aqui, uma vez, no limite do sistema, e o
 * que impede o residuo de viajar ate o indicador de comite.
 *
 * `null` continua `null`: ausencia de valor nao e zero.
 */
export function paraDecimal(valor: number | string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return null;
  return numero.toFixed(2);
}

/** Data `yyyy-MM-dd` do Sienge. Qualquer outra forma vira `null`, nunca hoje. */
export function paraDia(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const so = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(so) ? so : null;
}

/** Dias de atraso em relacao a uma data de referencia. Futuro nao atrasa. */
export function diasDeAtraso(vencimento: string | null, referencia: string): number | null {
  const dia = paraDia(vencimento);
  if (!dia) return null;
  const ms = Date.parse(`${referencia}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`);
  const dias = Math.floor(ms / 86_400_000);
  return dias > 0 ? dias : 0;
}

/**
 * Faixa de atraso.
 *
 * As faixas sao as do enum `faixa_atraso` da migracao 001. Zero dia nao tem
 * faixa: em dia nao e uma faixa de atraso, e a ausencia dela.
 */
export function faixaDeAtraso(dias: number | null): FaixaAtraso | null {
  if (dias === null || dias <= 0) return null;
  if (dias <= 30) return '1-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  if (dias <= 120) return '91-120';
  return '>120';
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformacoes por entidade
//
// Cada uma devolve os campos do dominio. A proveniencia (fonte, id_origem,
// valor_original, execucao) e responsabilidade do upsert, nao daqui.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmpreendimentoTransformado {
  nome: string;
  nome_normalizado: string;
  empresa: string | null;
  tipo: string | null;
  origem_cadastro: string;
  ativo_para_importacao: boolean;
}

/**
 * Empreendimento.
 *
 * `name` e o nome oficial; `commercialName` costuma vir nulo no ambiente da
 * Coevo. Nome vazio nao existe no destino (`NOT NULL`), e inventar um rotulo
 * esconderia o defeito — o chamador ignora o registro com motivo declarado.
 */
export function transformarEmpreendimento(
  bruto: EmpreendimentoSienge,
): EmpreendimentoTransformado | null {
  const nome = (bruto.commercialName || bruto.name || '').trim();
  if (!nome) return null;

  return {
    nome,
    nome_normalizado: normalizarNome(nome),
    empresa: bruto.companyName?.trim() || null,
    tipo: bruto.type?.trim() || null,
    // A carga nao decide o ciclo de vida do empreendimento: `status` fica no
    // padrao do banco. Sobrescrever com um chute mudaria a classificacao de
    // carteira sem ninguem ter decidido.
    origem_cadastro: 'integracao',
    ativo_para_importacao: true,
  };
}

export interface ClienteTransformado {
  nome: string;
  nome_normalizado: string;
  cpf_cnpj: string | null;
  cpf_cnpj_valido: boolean | null;
  tipo_pessoa: 'PF' | 'PJ' | null;
}

/**
 * Cliente.
 *
 * O documento vem em `cpf` OU `cnpj` — para pessoa juridica a chave `cpf` nem
 * existe no payload. O tipo declarado pela API (`personType`) e conferido
 * contra o documento que efetivamente veio; divergencia nao e resolvida aqui,
 * o vinculo simplesmente nao ganha confianca alta sem documento valido.
 */
export function transformarCliente(bruto: ClienteSienge): ClienteTransformado | null {
  const nome = (bruto.name ?? '').trim();
  if (!nome) return null;

  const avaliado = avaliarDocumento(bruto.cpf ?? bruto.cnpj ?? null);

  return {
    nome,
    nome_normalizado: normalizarNome(nome),
    cpf_cnpj: avaliado.digitos,
    // `null` quando nao veio documento: nao e "invalido", e desconhecido.
    cpf_cnpj_valido: avaliado.digitos === null ? null : avaliado.valido,
    tipo_pessoa: avaliado.tipo ?? null,
  };
}

export interface TituloTransformado {
  empresa: string | null;
  numero_titulo: string | null;
  situacao: string | null;
  valor_nominal: string | null;
  saldo_atualizado: string | null;
  data_fato: string | null;
}

/**
 * Titulo do contas a receber.
 *
 * `situacao` e derivada dos sinalizadores que a API ja entrega prontos, em
 * ordem de gravidade: sub judice pesa mais que inadimplencia, e quitado
 * encerra a discussao. O criterio fica visivel numa funcao, e nao espalhado
 * por consultas de tela.
 *
 * `saldo_atualizado` NAO e preenchido aqui: o valor do titulo e o original,
 * e o saldo presente vem de outro endpoint, com correcao a uma data. Copiar
 * um no outro faria o painel apresentar valor original como se fosse saldo.
 */
export function transformarTitulo(
  bruto: TituloSienge,
  nomeEmpresa: string | null,
): TituloTransformado {
  const situacao = bruto.payOffDate
    ? 'quitado'
    : bruto.subjudice
      ? 'sub_judice'
      : bruto.defaulting
        ? 'inadimplente'
        : 'em_dia';

  return {
    empresa: nomeEmpresa,
    numero_titulo: bruto.documentNumber?.trim() || String(bruto.receivableBillId),
    situacao,
    valor_nominal: paraDecimal(bruto.receivableBillValue),
    saldo_atualizado: null,
    data_fato: paraDia(bruto.issueDate),
  };
}

export interface ParcelaTransformada {
  numero_parcela: string | null;
  vencimento: string | null;
  valor_nominal: string | null;
  saldo_atualizado: string | null;
  saldo_vencido: string | null;
  juros: string | null;
  multa: string | null;
  dias_atraso: number | null;
  faixa: FaixaAtraso | null;
  status: string | null;
}

/**
 * Parcela.
 *
 * `balanceDue` e o saldo da parcela — nao o valor original, que a API nao
 * devolve neste endpoint. `valor_nominal` fica nulo de proposito: preenche-lo
 * com o saldo faria "valor original" e "saldo" serem o mesmo numero, e a
 * amortizacao desapareceria do relatorio.
 *
 * Juros e multa ficam nulos porque o Sienge NAO os separa (§10 do
 * levantamento): so existe o agregado `totalAdditionalValue`, no saldo do
 * cliente. Gravar zero afirmaria que nao ha juros — e isso ninguem sabe.
 */
export function transformarParcela(
  bruto: ParcelaSienge,
  dataReferencia: string,
): ParcelaTransformada {
  const vencimento = paraDia(bruto.dueDate);
  const saldo = paraDecimal(bruto.balanceDue);
  const quitada = saldo !== null && Number(saldo) === 0;

  // Parcela quitada nao esta atrasada, por mais antigo que seja o vencimento.
  const dias = quitada ? 0 : diasDeAtraso(vencimento, dataReferencia);

  return {
    numero_parcela: String(bruto.installmentId),
    vencimento,
    valor_nominal: null,
    saldo_atualizado: saldo,
    saldo_vencido: dias !== null && dias > 0 ? saldo : null,
    juros: null,
    multa: null,
    dias_atraso: dias,
    faixa: faixaDeAtraso(dias),
    status: quitada ? 'quitada' : dias !== null && dias > 0 ? 'vencida' : 'a_vencer',
  };
}

export interface ComissaoTransformada {
  beneficiario: string | null;
  valor: string | null;
  data_evento: string | null;
  status: string | null;
}

/**
 * Comissao. MOVIMENTACAO: soma eventos, nunca posicao numa data.
 *
 * Beneficiario e o corretor faturado quando existe (`billingBrokerName`), e o
 * corretor da venda quando nao — a API traz os dois e eles divergem quando a
 * comissao e paga a terceiro.
 */
export function transformarComissao(bruto: ComissaoSienge): ComissaoTransformada {
  return {
    beneficiario: bruto.billingBrokerName?.trim() || bruto.brokerName?.trim() || null,
    valor: paraDecimal(bruto.value),
    data_evento: paraDia(bruto.dueDate),
    status: bruto.installmentStatus?.trim() || null,
  };
}

export interface SaldoTransformado {
  saldo_atualizado: string | null;
  saldo_contratual: string | null;
  saldo_vencido: string | null;
}

/**
 * Saldo devedor presente do cliente. POSICAO numa data.
 *
 * `totalAdditionalValue` (acrescimos) NAO vira `saldo_vencido`: acrescimo e
 * juros/multa/correcao agregados, e saldo vencido e a parte da divida ja
 * vencida. Sao coisas diferentes, e o Sienge nao entrega a segunda aqui.
 */
export function transformarSaldo(bruto: SaldoSienge): SaldoTransformado {
  return {
    saldo_atualizado: paraDecimal(bruto.totalCurrentDebitBalanceValue),
    saldo_contratual: paraDecimal(bruto.totalOriginalValue),
    saldo_vencido: null,
  };
}
