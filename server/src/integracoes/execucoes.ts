/**
 * Registro de execucoes de importacao.
 *
 * Contadores exigidos no escopo da Fase 1: lidos, incluidos, atualizados,
 * ignorados, duplicados e com erro. O detalhe dos ignorados tambem e gravado —
 * a base atual descarta grupos excluidos em silencio, e ninguem consegue
 * explicar depois por que a contagem nao fecha.
 *
 * Regra central: FALHA NAO APAGA O ULTIMO DADO VALIDO. A execucao registra o que
 * falhou e marca a carga como parcial; `ultima_carga_valida_em` da integracao so
 * avanca quando a carga foi completa.
 */
import { sql } from 'kysely';
import { db } from '../db/pool.js';
import { logger } from '../logging.js';
import type { EstadoIntegracao, FonteDado, StatusExecucao } from '../db/schema.js';

export interface Contadores {
  lidos: number;
  incluidos: number;
  /** Conteudo mudou de fato. */
  atualizados: number;
  /**
   * Reconhecidos pelo upsert e sem nada a alterar.
   *
   * Separado de `atualizados` porque, sem essa distincao, toda
   * re-sincronizacao reportaria o conjunto inteiro como atualizado — e a
   * metrica nao diria nada sobre a carga ter mudado alguma coisa.
   */
  inalterados: number;
  ignorados: number;
  duplicados: number;
  comErro: number;
}

export interface MotivoIgnorado {
  motivo: string;
  quantidade: number;
  exemplos?: string[];
}

/**
 * Acumulador de uma execucao.
 *
 * Cada registro processado incrementa exatamente um contador — o total sempre
 * fecha com `lidos`, e isso e verificado ao finalizar.
 */
export class Execucao {
  readonly id: string;
  readonly fonte: FonteDado;
  readonly escopo: string | null;

  private lidos = 0;
  private incluidos = 0;
  private atualizados = 0;
  private inalterados = 0;
  private ignorados = 0;
  private duplicados = 0;
  private comErro = 0;

  /** Metricas da leitura na origem, exigidas no relatorio de homologacao. */
  private paginas: number | null = null;
  private ultimoCursor: string | null = null;
  private normalizados: number | null = null;
  private dataReferencia: string | null = null;
  /** `ultima_carga_valida_em` no INICIO desta execucao. Preservado se falhar. */
  private ultimoDadoValidoEm: Date | null = null;

  private readonly motivosIgnorados = new Map<string, { quantidade: number; exemplos: string[] }>();
  private readonly erros: Array<{ id_origem?: string; mensagem: string }> = [];
  private readonly fontesComFalha = new Set<string>();
  private parcial = false;

  readonly iniciadaEm = new Date();

  constructor(id: string, fonte: FonteDado, escopo: string | null) {
    this.id = id;
    this.fonte = fonte;
    this.escopo = escopo;
  }

  registrarLidos(quantidade: number): void {
    this.lidos += quantidade;
  }

  /**
   * Registra como a leitura foi feita na origem.
   *
   * `paginas` e `ultimoCursor` sao o que permite dizer, depois, se a carga leu
   * o quadro inteiro — e retomar de onde parou quando nao leu.
   */
  registrarLeitura(dados: { paginas: number; ultimoCursor: string | null }): void {
    this.paginas = dados.paginas;
    this.ultimoCursor = dados.ultimoCursor;
  }

  /** Itens que sobreviveram a transformacao e viraram registro gravavel. */
  registrarNormalizados(quantidade: number): void {
    this.normalizados = quantidade;
  }

  /** Data de referencia do conjunto lido. */
  registrarDataReferencia(data: string | null): void {
    this.dataReferencia = data;
  }

  definirUltimoDadoValido(quando: Date | null): void {
    this.ultimoDadoValidoEm = quando;
  }

  get ultimoDadoValido(): Date | null {
    return this.ultimoDadoValidoEm;
  }

  registrarIncluido(): void {
    this.incluidos++;
  }

  registrarAtualizado(): void {
    this.atualizados++;
  }

  registrarInalterado(): void {
    this.inalterados++;
  }

  registrarDuplicado(): void {
    this.duplicados++;
  }

  /**
   * Registra um item que nao entrou, com o motivo.
   * Guarda alguns exemplos para que a origem da diferenca fique investigavel.
   */
  registrarIgnorado(motivo: string, idOrigem?: string): void {
    this.ignorados++;
    const atual = this.motivosIgnorados.get(motivo) ?? { quantidade: 0, exemplos: [] };
    atual.quantidade++;
    if (idOrigem && atual.exemplos.length < 10) atual.exemplos.push(idOrigem);
    this.motivosIgnorados.set(motivo, atual);
  }

  registrarErro(mensagem: string, idOrigem?: string): void {
    this.comErro++;
    // Limita o volume gravado; a contagem continua exata.
    if (this.erros.length < 200) {
      this.erros.push(idOrigem ? { id_origem: idOrigem, mensagem } : { mensagem });
    }
  }

  /**
   * Marca que uma fonte falhou. A consequencia e atualizacao PARCIAL: os dados
   * anteriores permanecem, e a resposta sinaliza que o conjunto nao esta completo.
   */
  marcarFalhaDeFonte(fonte: string, mensagem: string): void {
    this.parcial = true;
    this.fontesComFalha.add(fonte);
    this.registrarErro(`${fonte}: ${mensagem}`);
  }

  marcarParcial(): void {
    this.parcial = true;
  }

  get contadores(): Contadores {
    return {
      lidos: this.lidos,
      incluidos: this.incluidos,
      atualizados: this.atualizados,
      inalterados: this.inalterados,
      ignorados: this.ignorados,
      duplicados: this.duplicados,
      comErro: this.comErro,
    };
  }

  get ehParcial(): boolean {
    return this.parcial;
  }

  /**
   * Verifica se a contabilidade fecha.
   *
   * incluidos + atualizados + inalterados + ignorados + duplicados + comErro
   * deve igualar lidos. Divergencia indica caminho de codigo que processou um item sem
   * contabilizar — e o tipo de erro que faz um painel mentir sem alarme.
   */
  conferir(): { fecha: boolean; diferenca: number } {
    const somados =
      this.incluidos + this.atualizados + this.inalterados +
      this.ignorados + this.duplicados + this.comErro;
    return { fecha: somados === this.lidos, diferenca: this.lidos - somados };
  }

  private detalheIgnorados(): MotivoIgnorado[] {
    return [...this.motivosIgnorados.entries()].map(([motivo, d]) => ({
      motivo,
      quantidade: d.quantidade,
      exemplos: d.exemplos,
    }));
  }

  /** Encerra a execucao e grava os contadores. */
  async finalizar(
    resultado: { status?: StatusExecucao; mensagem?: string } = {},
  ): Promise<ResumoExecucao> {
    const conferencia = this.conferir();
    if (!conferencia.fecha) {
      logger.error(
        { execucao_id: this.id, ...this.contadores, diferenca: conferencia.diferenca },
        'Contabilidade da execucao nao fecha: itens processados sem contabilizacao',
      );
    }

    const status: StatusExecucao =
      resultado.status ??
      (this.comErro > 0 || this.parcial
        ? this.incluidos + this.atualizados + this.inalterados > 0
          ? 'parcial'
          : 'erro'
        : 'sucesso');

    await db
      .updateTable('execucoes_importacao')
      .set({
        finalizada_em: new Date(),
        status,
        lidos: this.lidos,
        incluidos: this.incluidos,
        atualizados: this.atualizados,
        inalterados: this.inalterados,
        ignorados: this.ignorados,
        duplicados: this.duplicados,
        com_erro: this.comErro,
        detalhe_ignorados: JSON.stringify({
          motivos: this.detalheIgnorados(),
          contabilidade_fecha: conferencia.fecha,
          diferenca: conferencia.diferenca,
        }),
        erros: JSON.stringify(this.erros),
        parcial: this.parcial,
        fontes_com_falha: [...this.fontesComFalha],
        mensagem: resultado.mensagem ?? null,
        paginas: this.paginas,
        ultimo_cursor: this.ultimoCursor,
        normalizados: this.normalizados,
        data_referencia: this.dataReferencia,
        ultimo_dado_valido_em: this.ultimoDadoValidoEm,
      })
      .where('id', '=', this.id)
      .execute();

    // O estado da integracao reflete o que aconteceu de verdade.
    const estado: EstadoIntegracao =
      status === 'sucesso' ? 'concluida' : status === 'parcial' ? 'parcial' : 'erro';

    await db
      .updateTable('integracoes')
      .set({
        estado,
        ultima_carga_em: new Date(),
        // So avanca em carga COMPLETA. E isto que permite a interface dizer
        // "ultimo dado valido de <data>" quando a carga de hoje falhou.
        ...(status === 'sucesso' ? { ultima_carga_valida_em: new Date() } : {}),
        atualizado_em: new Date(),
      })
      .where('sistema', '=', this.fonte)
      .execute();

    return {
      id: this.id,
      fonte: this.fonte,
      escopo: this.escopo,
      status,
      parcial: this.parcial,
      fontes_com_falha: [...this.fontesComFalha],
      ...this.contadores,
      motivos_ignorados: this.detalheIgnorados(),
      contabilidade_fecha: conferencia.fecha,
      mensagem: resultado.mensagem ?? null,
      paginas: this.paginas,
      ultimo_cursor: this.ultimoCursor,
      normalizados: this.normalizados,
      data_referencia: this.dataReferencia,
      // Falha NAO apaga: este e o carimbo do ultimo conjunto completo, e
      // continua valendo quando a carga de hoje nao fecha.
      ultimo_dado_valido_em: this.ultimoDadoValidoEm,
      iniciada_em: this.iniciadaEm,
      finalizada_em: new Date(),
      duracao_ms: Date.now() - this.iniciadaEm.getTime(),
    };
  }
}

export interface ResumoExecucao extends Contadores {
  id: string;
  fonte: FonteDado;
  escopo: string | null;
  status: StatusExecucao;
  parcial: boolean;
  fontes_com_falha: string[];
  motivos_ignorados: MotivoIgnorado[];
  contabilidade_fecha: boolean;
  mensagem: string | null;
  paginas: number | null;
  ultimo_cursor: string | null;
  normalizados: number | null;
  data_referencia: string | null;
  ultimo_dado_valido_em: Date | null;
  iniciada_em: Date;
  finalizada_em: Date;
  duracao_ms: number;
}

export async function iniciarExecucao(dados: {
  fonte: FonteDado;
  escopo?: string | null;
  destino?: string | null;
  competencia?: string | null;
  comiteId?: string | null;
  usuarioId?: string | null;
  versaoRegra?: string | null;
  /** Identificador do quadro/endpoint na origem. */
  idOrigemEscopo?: string | null;
}): Promise<Execucao> {
  const linha = await db
    .insertInto('execucoes_importacao')
    .values({
      fonte: dados.fonte,
      escopo: dados.escopo ?? null,
      destino: dados.destino ?? null,
      competencia: dados.competencia ?? null,
      comite_id: dados.comiteId ?? null,
      usuario_id: dados.usuarioId ?? null,
      versao_regra: dados.versaoRegra ?? null,
      id_origem_escopo: dados.idOrigemEscopo ?? null,
      status: 'em_andamento',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  // Ultimo dado valido ANTES desta execucao. Guardado agora porque, se esta
  // falhar, e este carimbo que a interface deve mostrar — e nao a hora da
  // tentativa que nao deu certo.
  const integracao = await db
    .selectFrom('integracoes')
    .select('ultima_carga_valida_em')
    .where('sistema', '=', dados.fonte)
    .executeTakeFirst();

  await db
    .updateTable('integracoes')
    .set({ estado: 'sincronizando', atualizado_em: new Date() })
    .where('sistema', '=', dados.fonte)
    .execute();

  const execucao = new Execucao(linha.id, dados.fonte, dados.escopo ?? null);
  execucao.definirUltimoDadoValido(
    integracao?.ultima_carga_valida_em ? new Date(integracao.ultima_carga_valida_em) : null,
  );
  return execucao;
}

/**
 * Encerra execucoes que ficaram penduradas em 'em_andamento'.
 *
 * Um processo derrubado no meio da carga deixa a execucao aberta, e a integracao
 * ficaria eternamente "sincronizando". Chamada na partida do servidor.
 */
export async function encerrarExecucoesOrfas(minutos = 120): Promise<number> {
  const r = await db
    .updateTable('execucoes_importacao')
    .set({
      status: 'erro',
      parcial: true,
      finalizada_em: new Date(),
      mensagem: 'Execucao interrompida: processo encerrado antes de concluir.',
    })
    .where('status', '=', 'em_andamento')
    .where('iniciada_em', '<', sql<Date>`now() - make_interval(mins => ${minutos})`)
    .executeTakeFirst();

  const total = Number(r.numUpdatedRows ?? 0);
  if (total > 0) {
    logger.warn({ total }, 'Execucoes orfas encerradas na partida');
  }
  return total;
}

/** Grava o payload original na area bruta, antes de qualquer interpretacao. */
export async function gravarBruto(
  execucaoId: string,
  fonte: FonteDado,
  escopo: string | null,
  registros: Array<{ idOrigem: string | null; payload: unknown }>,
): Promise<void> {
  if (registros.length === 0) return;

  // Lotes para nao estourar o limite de parametros da consulta.
  const TAMANHO_LOTE = 500;
  for (let i = 0; i < registros.length; i += TAMANHO_LOTE) {
    const lote = registros.slice(i, i + TAMANHO_LOTE);
    await db
      .insertInto('registros_brutos')
      .values(
        lote.map((r) => ({
          execucao_id: execucaoId,
          fonte,
          escopo,
          id_origem: r.idOrigem,
          payload: JSON.stringify(r.payload),
        })),
      )
      .execute();
  }
}

/** Historico de execucoes, para a tela de integracoes. */
export async function listarExecucoes(filtros: {
  fonte?: FonteDado;
  competencia?: string;
  limite?: number;
} = {}) {
  let consulta = db
    .selectFrom('execucoes_importacao')
    .select([
      'id', 'fonte', 'escopo', 'destino', 'competencia', 'iniciada_em', 'finalizada_em',
      'status', 'lidos', 'incluidos', 'atualizados', 'ignorados', 'duplicados', 'com_erro',
      'parcial', 'fontes_com_falha', 'mensagem', 'detalhe_ignorados',
    ])
    .orderBy('iniciada_em', 'desc')
    .limit(filtros.limite ?? 50);

  if (filtros.fonte) consulta = consulta.where('fonte', '=', filtros.fonte);
  if (filtros.competencia) consulta = consulta.where('competencia', '=', filtros.competencia);

  return consulta.execute();
}
