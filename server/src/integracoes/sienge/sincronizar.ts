/**
 * Carga incremental do Sienge.
 *
 * O desenho nao e "ler tudo, todo dia": a franquia do plano Start e de 1.000
 * requisicoes REST por dia e o custo do excedente NAO foi validado
 * contratualmente. Cada etapa PLANEJA seu custo antes de gastar, e a carga
 * para com estado salvo quando o orcamento acaba — em vez de estourar a
 * franquia em silencio ou abandonar o progresso.
 *
 * ## O que a homologacao de 06/08/2026 mudou no desenho
 *
 * O levantamento (§4.4) dizia que `customerId` era obrigatorio em titulos, o
 * que forcaria 3.257 requisicoes — tres dias de franquia — para uma carga
 * completa. A sonda provou o contrario: a listagem geral existe e devolve os
 * 5.149 titulos paginados. A carga de titulos caiu de 3.257 para ~26
 * requisicoes. E o motivo de sondar em vez de confiar no documento.
 *
 * Parcelas continuam caras: nao ha listagem geral, e sao 5.149 requisicoes,
 * uma por titulo. Por isso elas sao a unica etapa com RETOMADA — processa o
 * que couber no orcamento do dia, salva onde parou, continua amanha.
 *
 * ## Posicao x movimentacao
 *
 * Titulo, parcela e saldo sao POSICAO numa data: gravados com
 * `data_referencia` e nunca somados entre datas. Comissao e MOVIMENTACAO:
 * gravada com `data_fato`. A separacao e fisica (tabelas distintas, migracao
 * 006); aqui ela aparece em qual data cada etapa carimba.
 */
import { db } from '../../db/pool.js';
import { logger } from '../../logging.js';
import {
  Execucao,
  gravarBruto,
  iniciarExecucao,
  type ResumoExecucao,
} from '../execucoes.js';
import { persistirLote, type RegistroParaUpsert } from '../upsert.js';
import {
  LIMITE_POR_PAGINA,
  ler,
  orcamentoRestante,
  type PaginaSienge,
} from './cliente.js';
import {
  paraDia,
  transformarCliente,
  transformarComissao,
  transformarEmpreendimento,
  transformarParcela,
  transformarTitulo,
  type ClienteSienge,
  type ComissaoSienge,
  type EmpreendimentoSienge,
  type EmpresaSienge,
  type ParcelaSienge,
  type TituloSienge,
} from './transformacao.js';

/** Versao das regras de transformacao. Muda quando a interpretacao muda. */
export const VERSAO_REGRA = 'sienge-1.0.0';

/**
 * Folga que a carga NUNCA consome.
 *
 * Deixar o orcamento zerado inviabilizaria uma consulta pontual urgente no
 * mesmo dia — saldo de um cliente que ligou, por exemplo. A carga em lote nao
 * tem prioridade sobre o atendimento.
 */
const RESERVA_PARA_CONSULTA_PONTUAL = 50;

export type EtapaCarga = 'empresas' | 'empreendimentos' | 'clientes' | 'titulos' | 'parcelas' | 'comissoes';

export const ETAPAS: EtapaCarga[] = [
  'empresas',
  'empreendimentos',
  'clientes',
  'titulos',
  'parcelas',
  'comissoes',
];

export interface OpcoesCarga {
  /** Subconjunto de etapas. Vazio ou ausente = todas. */
  etapas?: EtapaCarga[];
  /**
   * Corte da carga incremental de clientes, `yyyy-MM-dd`.
   *
   * Ausente = usa a ultima carga valida registrada; sem ela, carga completa.
   */
  modificadosApos?: string | null;
  /** Le e transforma sem gravar. Consome franquia igual — a API nao sabe. */
  simular?: boolean;
  usuarioId?: string | null;
  /**
   * Teto de requisicoes desta execucao, alem do orcamento diario global.
   * Serve para uma carga deliberadamente pequena sem mexer na configuracao.
   */
  tetoDeRequisicoes?: number;
}

/** O que a carga sabe ANTES de gastar: quanto custa e se cabe. */
export interface PlanoEtapa {
  etapa: EtapaCarga;
  /** Total de registros na origem, quando conhecido sem custo adicional. */
  registrosNaOrigem: number | null;
  requisicoesEstimadas: number;
  cabe: boolean;
  motivo: string | null;
}

export interface ResultadoEtapa {
  etapa: EtapaCarga;
  executada: boolean;
  motivo: string | null;
  requisicoes: number;
  lidos: number;
  incluidos: number;
  atualizados: number;
  inalterados: number;
  ignorados: number;
  /** Preenchido quando a etapa parou por orcamento e salvou onde parou. */
  retomarDe?: number | null;
}

export interface ResultadoCarga {
  execucao: ResumoExecucao;
  etapas: ResultadoEtapa[];
  orcamento: {
    tetoDiario: number;
    saldoInicial: number;
    consumidas: number;
    saldoFinal: number;
    reservaPreservada: number;
  };
  /** Onde a proxima carga deve retomar, por etapa. */
  retomada: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contador de requisicoes desta carga
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envelope de leitura que conta e respeita o teto local.
 *
 * O orcamento diario global vive no cliente HTTP e vale para o processo
 * inteiro. Este contador e da CARGA: e o que permite dizer, no relatorio, o
 * que esta execucao gastou, e parar antes da reserva de consulta pontual.
 */
class Consumo {
  private usadas = 0;

  constructor(
    private readonly teto: number,
    private readonly reserva: number,
  ) {}

  get total(): number {
    return this.usadas;
  }

  /** Quantas requisicoes esta carga ainda pode fazer. */
  disponivel(): number {
    const doDia = Math.max(0, orcamentoRestante() - this.reserva);
    return Math.max(0, Math.min(this.teto - this.usadas, doDia));
  }

  registrar(): void {
    this.usadas++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retomada: onde cada etapa parou
//
// Vive em `integracoes.configuracao`, que a migracao 004 declara como
// "nunca contem credencial" — um marcador de progresso cabe ali. Guardar em
// memoria perderia o progresso a cada reinicio, e a etapa de parcelas leva
// varios dias para completar.
// ─────────────────────────────────────────────────────────────────────────────

interface EstadoCarga {
  /** Ultimo `receivableBillId` cujas parcelas foram carregadas. */
  parcelas_ate_titulo?: number;
  /** Corte da ultima carga incremental de clientes bem-sucedida. */
  clientes_ate?: string;
}

async function lerEstado(): Promise<EstadoCarga> {
  const linha = await db
    .selectFrom('integracoes')
    .select('configuracao')
    .where('sistema', '=', 'sienge')
    .executeTakeFirst();

  const cfg = (linha?.configuracao as Record<string, unknown> | null) ?? {};
  return ((cfg.carga as EstadoCarga | undefined) ?? {}) as EstadoCarga;
}

async function gravarEstado(parcial: EstadoCarga): Promise<void> {
  const linha = await db
    .selectFrom('integracoes')
    .select('configuracao')
    .where('sistema', '=', 'sienge')
    .executeTakeFirst();

  const cfg = (linha?.configuracao as Record<string, unknown> | null) ?? {};
  const carga = { ...((cfg.carga as EstadoCarga | undefined) ?? {}), ...parcial };

  await db
    .updateTable('integracoes')
    .set({
      configuracao: JSON.stringify({ ...cfg, carga }),
      atualizado_em: new Date(),
    })
    .where('sistema', '=', 'sienge')
    .execute();
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapas
// ─────────────────────────────────────────────────────────────────────────────

/** Hoje, em `yyyy-MM-dd`. Data de referencia das posicoes desta carga. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Le uma listagem inteira, pagina a pagina, dentro do que o consumo permite.
 *
 * Devolve `completa: false` quando o orcamento acabou no meio — e a diferenca
 * entre "a origem tem 285 registros" e "eu li 285 registros", que e
 * exatamente o que separa uma carga completa de uma parcial.
 */
async function lerListagem<T>(
  endpoint: 'companies' | 'enterprises' | 'customers' | 'receivable_bills' | 'commissions',
  parametrosBase: Record<string, string | number | undefined>,
  consumo: Consumo,
): Promise<{ itens: T[]; paginas: number; total: number | null; completa: boolean }> {
  const itens: T[] = [];
  let paginas = 0;
  let total: number | null = null;
  let offset = 0;

  for (;;) {
    if (consumo.disponivel() <= 0) {
      return { itens, paginas, total, completa: false };
    }

    consumo.registrar();
    const pagina = await ler<PaginaSienge<T>>({
      endpoint,
      parametros: { ...parametrosBase, limit: LIMITE_POR_PAGINA, offset },
    });

    paginas++;
    total = pagina.resultSetMetadata?.count ?? total;
    itens.push(...pagina.results);

    if (pagina.results.length === 0) break;
    if (total !== null && itens.length >= total) break;
    // Pagina menor que o limite: a API chegou ao fim antes do count declarado.
    if (pagina.results.length < LIMITE_POR_PAGINA) break;

    offset += LIMITE_POR_PAGINA;
  }

  return { itens, paginas, total, completa: true };
}

/** Contadores de uma etapa, no formato do resultado. */
function etapaVazia(etapa: EtapaCarga, motivo: string): ResultadoEtapa {
  return {
    etapa,
    executada: false,
    motivo,
    requisicoes: 0,
    lidos: 0,
    incluidos: 0,
    atualizados: 0,
    inalterados: 0,
    ignorados: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carga incremental completa.
 *
 * Retorna sempre — inclusive quando o orcamento acaba na primeira etapa. Uma
 * carga que para por orcamento NAO e erro: e o comportamento projetado, e o
 * resultado diz onde retomar.
 */
export async function sincronizarSienge(opcoes: OpcoesCarga = {}): Promise<ResultadoCarga> {
  const etapasPedidas = opcoes.etapas?.length ? opcoes.etapas : ETAPAS;
  const dataReferencia = hoje();
  const saldoInicial = orcamentoRestante();

  const consumo = new Consumo(
    opcoes.tetoDeRequisicoes ?? Number.MAX_SAFE_INTEGER,
    RESERVA_PARA_CONSULTA_PONTUAL,
  );

  const execucao = await iniciarExecucao({
    fonte: 'sienge',
    escopo: etapasPedidas.join('+'),
    destino: 'financeiro',
    usuarioId: opcoes.usuarioId ?? null,
    versaoRegra: VERSAO_REGRA,
  });

  const estado = await lerEstado();
  const resultados: ResultadoEtapa[] = [];
  const retomada: Record<string, number> = {};

  /** Mapa id da empresa → nome. Preenchido pela etapa de empresas. */
  const empresasPorId = new Map<number, string>();
  /** Mapa id do cliente no Sienge → id interno. Preenchido por clientes. */
  const clientesPorIdSienge = new Map<number, string>();

  try {
    // ── Empresas ────────────────────────────────────────────────────────────
    //
    // Nao tem tabela propria: no modelo, empresa e o campo texto `empresa` de
    // empreendimentos e titulos. A etapa existe para montar o mapa id → nome
    // com UMA requisicao, em vez de gravar o nome errado ou deixar nulo.
    if (etapasPedidas.includes('empresas')) {
      const r = await executarEtapa('empresas', consumo, resultados, async (marcar) => {
        const { itens, paginas } = await lerListagem<EmpresaSienge>('companies', {}, consumo);
        marcar(paginas);
        for (const e of itens) {
          if (e.id !== undefined && e.name) empresasPorId.set(e.id, e.name.trim());
        }
        execucao.registrarLidos(itens.length);
        for (let i = 0; i < itens.length; i++) execucao.registrarIgnorado('empresa_e_mapa_de_apoio');
        return { lidos: itens.length, incluidos: 0, atualizados: 0, inalterados: 0, ignorados: itens.length };
      });
      if (!r) resultados.push(etapaVazia('empresas', 'orcamento insuficiente'));
    }

    // ── Empreendimentos ─────────────────────────────────────────────────────
    if (etapasPedidas.includes('empreendimentos')) {
      const r = await executarEtapa('empreendimentos', consumo, resultados, async (marcar) => {
        const { itens, paginas, completa } = await lerListagem<EmpreendimentoSienge>(
          'enterprises', {}, consumo,
        );
        marcar(paginas);
        if (!completa) execucao.marcarParcial();

        execucao.registrarLidos(itens.length);
        await gravarBruto(
          execucao.id, 'sienge', 'enterprises',
          itens.map((i) => ({ idOrigem: String(i.id), payload: i })),
        );

        // `empreendimentos.nome_normalizado` tem indice UNICO GLOBAL (migracao
        // 003) — pensado para a escala do Monday, onde um nome identifica um
        // projeto so. O portfolio do Sienge tem 285 empreendimentos em 43
        // empresas distintas, e a sonda de 06/08/2026 achou 5 nomes repetidos
        // entre projetos DIFERENTES (ex.: "FGLASS" em tres ids distintos:
        // 95, 208, 99971). Inserir o segundo colidiria com a constraint e
        // abortaria a transacao INTEIRA — os outros 283 nao entrariam.
        //
        // A escolha aqui: preserva a constraint (decisao estrutural que exige
        // deliberacao humana, nao um patch silencioso), mantem o primeiro
        // registro que ocupa o nome, e ignora os demais com o motivo — visivel
        // no relatorio, nao descartado. Ver DECISOES.md.
        const nomesOcupados = await mapearNomesNormalizadosOcupados();

        const registros: RegistroParaUpsert[] = [];
        let ignorados = 0;
        for (const bruto of itens) {
          const campos = transformarEmpreendimento(bruto);
          if (!campos) {
            execucao.registrarIgnorado('empreendimento_sem_nome', String(bruto.id));
            ignorados++;
            continue;
          }

          const idOrigem = String(bruto.id);
          const ocupante = nomesOcupados.get(campos.nome_normalizado);
          // Colisao so importa quando o nome pertence a OUTRO id_origem. O
          // proprio registro, revisitado numa carga seguinte, deve atualizar
          // normalmente — e o que o ON CONFLICT (fonte, id_origem) resolve.
          if (ocupante && ocupante !== idOrigem) {
            execucao.registrarIgnorado(
              `empreendimento_nome_duplicado (ja ocupado por id_origem=${ocupante})`,
              idOrigem,
            );
            ignorados++;
            continue;
          }
          nomesOcupados.set(campos.nome_normalizado, idOrigem);

          registros.push({
            idOrigem,
            campos: campos as unknown as Record<string, unknown>,
            valorOriginal: bruto,
            dataReferencia,
            dataFato: paraDia(bruto.creationDate),
          });
        }

        if (opcoes.simular) {
          for (let i = 0; i < registros.length; i++) execucao.registrarIgnorado('simulacao');
          return { lidos: itens.length, incluidos: 0, atualizados: 0, inalterados: 0, ignorados: ignorados + registros.length };
        }

        const upsert = await persistirLote('empreendimentos', 'sienge', registros, execucao, {
          versaoRegra: VERSAO_REGRA,
        });
        await vincularFontesEmpreendimentos(registros, upsert.ids);

        return {
          lidos: itens.length,
          incluidos: upsert.incluidos,
          atualizados: upsert.atualizados,
          inalterados: upsert.inalterados,
          ignorados,
        };
      });
      if (!r) resultados.push(etapaVazia('empreendimentos', 'orcamento insuficiente'));
    }

    // ── Clientes (incremental) ──────────────────────────────────────────────
    //
    // O corte incremental e o que torna a carga diaria viavel: 3.257 clientes
    // ativos custam 17 requisicoes na carga completa, mas so 1 quando apenas
    // 57 mudaram no periodo.
    if (etapasPedidas.includes('clientes')) {
      const corte = opcoes.modificadosApos ?? estado.clientes_ate ?? null;

      const r = await executarEtapa('clientes', consumo, resultados, async (marcar) => {
        const { itens, paginas, completa } = await lerListagem<ClienteSienge>(
          'customers',
          { onlyActive: 'true', ...(corte ? { modifiedAfter: corte } : {}) },
          consumo,
        );
        marcar(paginas);
        if (!completa) execucao.marcarParcial();

        execucao.registrarLidos(itens.length);
        await gravarBruto(
          execucao.id, 'sienge', 'customers',
          itens.map((i) => ({ idOrigem: String(i.id), payload: i })),
        );

        const registros: RegistroParaUpsert[] = [];
        let ignorados = 0;
        for (const bruto of itens) {
          const campos = transformarCliente(bruto);
          if (!campos) {
            execucao.registrarIgnorado('cliente_sem_nome', String(bruto.id));
            ignorados++;
            continue;
          }
          registros.push({
            idOrigem: String(bruto.id),
            campos: {
              ...campos,
              // Documento validado por digito verificador e vinculo de
              // confianca ALTA; sem ele, o registro grava mas nao vincula.
              regra_vinculo: campos.cpf_cnpj_valido ? 'cpf_cnpj' : 'sem_vinculo',
              confianca_vinculo: campos.cpf_cnpj_valido ? 'alta' : 'baixa',
            },
            valorOriginal: bruto,
            dataReferencia,
            dataFato: paraDia(bruto.createdAt),
          });
        }

        if (opcoes.simular) {
          for (let i = 0; i < registros.length; i++) execucao.registrarIgnorado('simulacao');
          return { lidos: itens.length, incluidos: 0, atualizados: 0, inalterados: 0, ignorados: ignorados + registros.length };
        }

        const upsert = await persistirLote('clientes', 'sienge', registros, execucao, {
          versaoRegra: VERSAO_REGRA,
        });

        registros.forEach((reg, i) => {
          const id = upsert.ids[i];
          if (id) clientesPorIdSienge.set(Number(reg.idOrigem), id);
        });

        // O corte so avanca quando a leitura foi ate o fim. Avancar numa
        // leitura truncada pularia para sempre os clientes nao lidos.
        if (completa) await gravarEstado({ clientes_ate: dataReferencia });

        return {
          lidos: itens.length,
          incluidos: upsert.incluidos,
          atualizados: upsert.atualizados,
          inalterados: upsert.inalterados,
          ignorados,
        };
      });
      if (!r) resultados.push(etapaVazia('clientes', 'orcamento insuficiente'));
    }

    // ── Titulos ─────────────────────────────────────────────────────────────
    //
    // Listagem geral, confirmada por sonda em 06/08/2026 contra o que o
    // levantamento afirmava. 5.149 titulos em ~26 requisicoes.
    if (etapasPedidas.includes('titulos')) {
      const r = await executarEtapa('titulos', consumo, resultados, async (marcar) => {
        const { itens, paginas, completa } = await lerListagem<TituloSienge>(
          'receivable_bills', {}, consumo,
        );
        marcar(paginas);
        if (!completa) execucao.marcarParcial();

        execucao.registrarLidos(itens.length);
        await gravarBruto(
          execucao.id, 'sienge', 'receivable-bills',
          itens.map((i) => ({ idOrigem: String(i.receivableBillId), payload: i })),
        );

        const clientes = await mapearClientes(itens.map((t) => t.customerId));
        const registros: RegistroParaUpsert[] = itens.map((bruto) => {
          const clienteId = bruto.customerId != null ? clientes.get(bruto.customerId) ?? null : null;
          return {
            idOrigem: String(bruto.receivableBillId),
            campos: {
              ...transformarTitulo(bruto, empresasPorId.get(bruto.companyId ?? -1) ?? null),
              cliente_id: clienteId,
              // Identificador do cliente na propria origem: vinculo direto,
              // sem heuristica. Sem cliente carregado ainda, fica sem vinculo
              // — e a proxima carga o resolve, sem inventar agora.
              regra_vinculo: clienteId ? 'id_relacionado' : 'sem_vinculo',
              confianca_vinculo: clienteId ? 'alta' : 'baixa',
            },
            valorOriginal: bruto,
            dataReferencia,
            dataFato: paraDia(bruto.issueDate),
          };
        });

        if (opcoes.simular) {
          for (let i = 0; i < registros.length; i++) execucao.registrarIgnorado('simulacao');
          return { lidos: itens.length, incluidos: 0, atualizados: 0, inalterados: 0, ignorados: registros.length };
        }

        const upsert = await persistirLote('titulos_receber', 'sienge', registros, execucao, {
          versaoRegra: VERSAO_REGRA,
        });

        return {
          lidos: itens.length,
          incluidos: upsert.incluidos,
          atualizados: upsert.atualizados,
          inalterados: upsert.inalterados,
          ignorados: 0,
        };
      });
      if (!r) resultados.push(etapaVazia('titulos', 'orcamento insuficiente'));
    }

    // ── Parcelas (a etapa cara, com retomada) ───────────────────────────────
    //
    // Uma requisicao por titulo, sem listagem geral: 5.149 requisicoes, mais
    // de cinco dias de franquia. Processa o que couber, salva onde parou.
    if (etapasPedidas.includes('parcelas')) {
      const r = await executarEtapa('parcelas', consumo, resultados, async (marcar) => {
        const desde = estado.parcelas_ate_titulo ?? 0;

        // Ordem por id de origem numerico: a retomada precisa de ordem
        // estavel, e ordem alfabetica colocaria o titulo 1000 antes do 999.
        const titulos = await db
          .selectFrom('titulos_receber')
          .select(['id', 'id_origem', 'cliente_id'])
          .where('fonte', '=', 'sienge')
          .where('ausente_desde', 'is', null)
          .where((eb) => eb.cast(eb.ref('id_origem'), 'integer'), '>', desde)
          .orderBy((eb) => eb.cast(eb.ref('id_origem'), 'integer'))
          .execute();

        if (titulos.length === 0) {
          // Ciclo completo: reinicia para a proxima carga reler os saldos.
          if (desde > 0) await gravarEstado({ parcelas_ate_titulo: 0 });
          return {
            lidos: 0, incluidos: 0, atualizados: 0, inalterados: 0, ignorados: 0,
            requisicoes: 0,
            observacao: desde > 0
              ? `ciclo concluido ate o titulo ${desde}; proxima carga recomeca do inicio`
              : 'nenhum titulo carregado ainda — rode a etapa de titulos antes',
          };
        }

        let requisicoes = 0;
        let lidos = 0;
        let incluidos = 0;
        let atualizados = 0;
        let inalterados = 0;
        let ultimoConcluido = desde;
        let parouPorOrcamento = false;

        for (const titulo of titulos) {
          if (consumo.disponivel() <= 0) {
            parouPorOrcamento = true;
            break;
          }

          consumo.registrar();
          requisicoes++;

          const pagina = await ler<PaginaSienge<ParcelaSienge>>({
            endpoint: 'installments',
            parametrosDeCaminho: { receivableBillId: titulo.id_origem! },
          });

          const itens = pagina.results ?? [];
          lidos += itens.length;
          execucao.registrarLidos(itens.length);

          const registros: RegistroParaUpsert[] = itens.map((bruto) => ({
            // Parcela nao tem id global: o par titulo+parcela e a identidade.
            // Usar so `installmentId` colidiria entre titulos diferentes.
            idOrigem: `${bruto.receivableBillId}:${bruto.installmentId}`,
            campos: {
              ...transformarParcela(bruto, dataReferencia),
              titulo_id: titulo.id,
              cliente_id: titulo.cliente_id,
              regra_vinculo: 'id_relacionado',
              confianca_vinculo: 'alta',
            },
            valorOriginal: bruto,
            dataReferencia,
            dataFato: paraDia(bruto.dueDate),
          }));

          if (!opcoes.simular && registros.length) {
            const upsert = await persistirLote('parcelas', 'sienge', registros, execucao, {
              versaoRegra: VERSAO_REGRA,
            });
            incluidos += upsert.incluidos;
            atualizados += upsert.atualizados;
            inalterados += upsert.inalterados;
          } else if (opcoes.simular) {
            for (let i = 0; i < registros.length; i++) execucao.registrarIgnorado('simulacao');
          }

          ultimoConcluido = Number(titulo.id_origem);
        }

        marcar(requisicoes);

        // Salva a retomada SEMPRE — inclusive quando terminou a lista. Se o
        // processo cair na proxima etapa, o progresso desta continua valendo.
        if (!opcoes.simular) await gravarEstado({ parcelas_ate_titulo: ultimoConcluido });
        if (parouPorOrcamento) execucao.marcarParcial();
        retomada.parcelas = ultimoConcluido;

        return {
          lidos, incluidos, atualizados, inalterados, ignorados: 0, requisicoes,
          retomarDe: ultimoConcluido,
          observacao: parouPorOrcamento
            ? `parou por orcamento no titulo ${ultimoConcluido}; faltam ${titulos.length - requisicoes} titulo(s)`
            : `todos os ${requisicoes} titulo(s) pendentes processados`,
        };
      });
      if (!r) resultados.push(etapaVazia('parcelas', 'orcamento insuficiente'));
    }

    // ── Comissoes (movimentacao) ────────────────────────────────────────────
    if (etapasPedidas.includes('comissoes')) {
      const r = await executarEtapa('comissoes', consumo, resultados, async (marcar) => {
        const { itens, paginas, completa } = await lerListagem<ComissaoSienge>(
          'commissions', { commissionFilterType: 'ALL' }, consumo,
        );
        marcar(paginas);
        if (!completa) execucao.marcarParcial();

        execucao.registrarLidos(itens.length);
        await gravarBruto(
          execucao.id, 'sienge', 'commissions',
          itens.map((i) => ({ idOrigem: String(i.commissionID), payload: i })),
        );

        const empreendimentos = await mapearEmpreendimentos(itens.map((c) => c.enterpriseID));
        const registros: RegistroParaUpsert[] = itens.map((bruto) => {
          const emprId = bruto.enterpriseID != null
            ? empreendimentos.get(bruto.enterpriseID) ?? null
            : null;
          return {
            idOrigem: String(bruto.commissionID),
            campos: {
              ...transformarComissao(bruto),
              empreendimento_id: emprId,
              regra_vinculo: emprId ? 'id_relacionado' : 'sem_vinculo',
              confianca_vinculo: emprId ? 'alta' : 'baixa',
            },
            valorOriginal: bruto,
            // MOVIMENTACAO: o que importa e quando o evento ocorre, nao a
            // data em que se leu. `data_referencia` fica nula de proposito —
            // comissao nao e posicao numa data.
            dataReferencia: null,
            dataFato: paraDia(bruto.dueDate),
          };
        });

        if (opcoes.simular) {
          for (let i = 0; i < registros.length; i++) execucao.registrarIgnorado('simulacao');
          return { lidos: itens.length, incluidos: 0, atualizados: 0, inalterados: 0, ignorados: registros.length };
        }

        const upsert = await persistirLote('comissoes', 'sienge', registros, execucao, {
          versaoRegra: VERSAO_REGRA,
        });

        return {
          lidos: itens.length,
          incluidos: upsert.incluidos,
          atualizados: upsert.atualizados,
          inalterados: upsert.inalterados,
          ignorados: 0,
        };
      });
      if (!r) resultados.push(etapaVazia('comissoes', 'orcamento insuficiente'));
    }

    execucao.registrarDataReferencia(dataReferencia);
    execucao.registrarLeitura({ paginas: consumo.total, ultimoCursor: null });

    const resumo = await execucao.finalizar();

    return {
      execucao: resumo,
      etapas: resultados,
      orcamento: {
        tetoDiario: saldoInicial,
        saldoInicial,
        consumidas: consumo.total,
        saldoFinal: orcamentoRestante(),
        reservaPreservada: RESERVA_PARA_CONSULTA_PONTUAL,
      },
      retomada: { ...retomada, ...(await lerEstado()) as Record<string, number> },
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error({ erro: mensagem }, 'Carga do Sienge falhou');
    execucao.marcarFalhaDeFonte('sienge', mensagem);

    // Falha NAO apaga o ultimo dado valido: nenhuma etapa executa DELETE, e
    // `ultima_carga_valida_em` so avanca em carga completa (execucoes.ts).
    const resumo = await execucao.finalizar({ status: 'erro', mensagem });

    return {
      execucao: resumo,
      etapas: resultados,
      orcamento: {
        tetoDiario: saldoInicial,
        saldoInicial,
        consumidas: consumo.total,
        saldoFinal: orcamentoRestante(),
        reservaPreservada: RESERVA_PARA_CONSULTA_PONTUAL,
      },
      retomada,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Apoio
// ─────────────────────────────────────────────────────────────────────────────

interface SaidaEtapa {
  lidos: number;
  incluidos: number;
  atualizados: number;
  inalterados: number;
  ignorados: number;
  requisicoes?: number;
  retomarDe?: number | null;
  observacao?: string;
}

/**
 * Executa uma etapa contabilizando requisicoes e capturando o resultado.
 *
 * Devolve `null` quando nao havia orcamento para comecar — o chamador
 * registra a etapa como nao executada, com motivo. Comecar uma etapa que nao
 * cabe produziria carga pela metade sem ninguem ter decidido isso.
 */
async function executarEtapa(
  etapa: EtapaCarga,
  consumo: Consumo,
  destino: ResultadoEtapa[],
  corpo: (marcar: (requisicoes: number) => void) => Promise<SaidaEtapa>,
): Promise<boolean> {
  if (consumo.disponivel() <= 0) return false;

  let requisicoes = 0;
  const marcar = (n: number) => {
    requisicoes = n;
  };

  const saida = await corpo(marcar);

  destino.push({
    etapa,
    executada: true,
    motivo: saida.observacao ?? null,
    requisicoes: saida.requisicoes ?? requisicoes,
    lidos: saida.lidos,
    incluidos: saida.incluidos,
    atualizados: saida.atualizados,
    inalterados: saida.inalterados,
    ignorados: saida.ignorados,
    retomarDe: saida.retomarDe ?? null,
  });

  return true;
}

/**
 * Nomes normalizados de empreendimento ja gravados, de QUALQUER fonte.
 *
 * `empreendimentos.nome_normalizado` e unico global — ver o comentario na
 * etapa de empreendimentos. Mapeia nome → `id_origem` do dono atual, para a
 * carga saber se o candidato pode entrar ou se colide com um projeto que ja
 * existe sob outro identificador (de outra empresa, ou de outra fonte).
 */
async function mapearNomesNormalizadosOcupados(): Promise<Map<string, string>> {
  const linhas = await db
    .selectFrom('empreendimentos')
    .select(['nome_normalizado', 'id_origem'])
    .where('id_origem', 'is not', null)
    .execute();

  const mapa = new Map<string, string>();
  for (const l of linhas) {
    if (l.id_origem) mapa.set(l.nome_normalizado, l.id_origem);
  }
  return mapa;
}

/** Mapa id do cliente no Sienge → id interno, para os títulos vincularem. */
async function mapearClientes(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
  const chaves = [...new Set(ids.filter((i): i is number => i != null))].map(String);
  const mapa = new Map<number, string>();
  if (!chaves.length) return mapa;

  const linhas = await db
    .selectFrom('clientes')
    .select(['id', 'id_origem'])
    .where('fonte', '=', 'sienge')
    .where('id_origem', 'in', chaves)
    .execute();

  for (const l of linhas) {
    if (l.id_origem) mapa.set(Number(l.id_origem), l.id);
  }
  return mapa;
}

/** Mapa id do empreendimento no Sienge → id interno, via `empreendimentos_fontes`. */
async function mapearEmpreendimentos(
  ids: Array<number | null | undefined>,
): Promise<Map<number, string>> {
  const chaves = [...new Set(ids.filter((i): i is number => i != null))].map(String);
  const mapa = new Map<number, string>();
  if (!chaves.length) return mapa;

  const linhas = await db
    .selectFrom('empreendimentos_fontes')
    .select(['empreendimento_id', 'id_externo'])
    .where('fonte', '=', 'sienge')
    .where('id_externo', 'in', chaves)
    .where('vigente_ate', 'is', null)
    .execute();

  for (const l of linhas) mapa.set(Number(l.id_externo), l.empreendimento_id);
  return mapa;
}

/**
 * Registra a correspondencia empreendimento ↔ id do Sienge.
 *
 * `empreendimentos_fontes` e o que permite a um empreendimento ter id no
 * Sienge E no Monday sem que um sobrescreva o outro. Sem esta tabela, o
 * vinculo teria de sair de nome normalizado — regra de confianca BAIXA para
 * algo que a origem entrega com identificador proprio.
 */
async function vincularFontesEmpreendimentos(
  registros: RegistroParaUpsert[],
  ids: string[],
): Promise<void> {
  const pares = registros
    .map((r, i) => ({ idExterno: r.idOrigem, empreendimentoId: ids[i] }))
    .filter((p): p is { idExterno: string; empreendimentoId: string } => Boolean(p.empreendimentoId));

  if (!pares.length) return;

  const existentes = await db
    .selectFrom('empreendimentos_fontes')
    .select('id_externo')
    .where('fonte', '=', 'sienge')
    .where('id_externo', 'in', pares.map((p) => p.idExterno))
    .where('vigente_ate', 'is', null)
    .execute();

  const jaTem = new Set(existentes.map((e) => e.id_externo));
  const novos = pares.filter((p) => !jaTem.has(p.idExterno));
  if (!novos.length) return;

  await db
    .insertInto('empreendimentos_fontes')
    .values(
      novos.map((p) => ({
        empreendimento_id: p.empreendimentoId,
        fonte: 'sienge' as const,
        id_externo: p.idExterno,
      })),
    )
    .execute();
}

/**
 * Planejamento: quanto custa a carga, ANTES de gastar.
 *
 * Consulta apenas metadados (uma requisicao por listagem, `limit=1`) para
 * saber o total de cada origem e estimar o custo real. Custa ~4 requisicoes e
 * evita comecar uma carga de 5.000 que nao cabe.
 */
export async function planejarCarga(): Promise<{
  planos: PlanoEtapa[];
  totalEstimado: number;
  saldoDisponivel: number;
  cabeCompleta: boolean;
}> {
  const saldo = Math.max(0, orcamentoRestante() - RESERVA_PARA_CONSULTA_PONTUAL);
  const planos: PlanoEtapa[] = [];

  const contar = async (
    endpoint: 'companies' | 'enterprises' | 'customers' | 'receivable_bills' | 'commissions',
    parametros: Record<string, string | number | undefined> = {},
  ): Promise<number | null> => {
    try {
      const pagina = await ler<PaginaSienge<unknown>>({
        endpoint,
        parametros: { ...parametros, limit: 1, offset: 0 },
      });
      return pagina.resultSetMetadata?.count ?? null;
    } catch {
      return null;
    }
  };

  const paginasPara = (total: number | null) =>
    total === null ? 1 : Math.max(1, Math.ceil(total / LIMITE_POR_PAGINA));

  const empresas = await contar('companies');
  planos.push({
    etapa: 'empresas',
    registrosNaOrigem: empresas,
    requisicoesEstimadas: paginasPara(empresas),
    cabe: true,
    motivo: null,
  });

  const empreendimentos = await contar('enterprises');
  planos.push({
    etapa: 'empreendimentos',
    registrosNaOrigem: empreendimentos,
    requisicoesEstimadas: paginasPara(empreendimentos),
    cabe: true,
    motivo: null,
  });

  const clientes = await contar('customers', { onlyActive: 'true' });
  planos.push({
    etapa: 'clientes',
    registrosNaOrigem: clientes,
    requisicoesEstimadas: paginasPara(clientes),
    cabe: true,
    motivo: 'carga completa; com corte incremental o custo cai para 1-2 requisicoes',
  });

  const titulos = await contar('receivable_bills');
  planos.push({
    etapa: 'titulos',
    registrosNaOrigem: titulos,
    requisicoesEstimadas: paginasPara(titulos),
    cabe: true,
    motivo: 'listagem geral confirmada por sonda: nao exige customerId',
  });

  // Parcelas: uma requisicao por titulo. E a etapa que nao cabe num dia.
  const parcelasEstimadas = titulos ?? 0;
  planos.push({
    etapa: 'parcelas',
    registrosNaOrigem: titulos,
    requisicoesEstimadas: parcelasEstimadas,
    cabe: parcelasEstimadas <= saldo,
    motivo:
      parcelasEstimadas > saldo
        ? `nao cabe num dia (${parcelasEstimadas} requisicoes contra ${saldo} disponiveis); ` +
          'a etapa processa o que couber e retoma na proxima carga'
        : null,
  });

  const comissoes = await contar('commissions', { commissionFilterType: 'ALL' });
  planos.push({
    etapa: 'comissoes',
    registrosNaOrigem: comissoes,
    requisicoesEstimadas: paginasPara(comissoes),
    cabe: true,
    motivo: null,
  });

  const totalEstimado = planos.reduce((s, p) => s + p.requisicoesEstimadas, 0);

  return {
    planos,
    totalEstimado,
    saldoDisponivel: saldo,
    cabeCompleta: totalEstimado <= saldo,
  };
}
