/**
 * Central de Inconsistencias — regras de negocio.
 *
 * Os 15 requisitos obrigatorios, e onde cada um vive:
 *
 *  1. dois valores originais + fontes      → `valores_em_conflito` (jsonb, imutavel)
 *  2. fonte de origem visivel              → `fonte` de cada lado do conflito
 *  3. identificador original de cada lado   → `id_origem` de cada lado
 *  4. regra de relacionamento               → `regra_vinculo`
 *  5. nivel de confianca                    → `confianca_vinculo`
 *  6. nao escolhe automaticamente           → `registrarAmbiguidade` nunca decide
 *  7. atribuicao de responsavel             → `atribuir`
 *  8. tipo, gravidade e impacto             → `tipo`, `gravidade`, `impacto`
 *  9. analise, decisao e justificativa       → campos distintos
 * 10. resolvida / descartada / pendente      → `status_revisao` + mapa da API
 * 11. historico completo                     → `inconsistencias_eventos` (append-only)
 * 12. resolucao nao altera os originais      → gatilho no banco
 * 13. filtros                                → `listar`
 * 14. acesso ao registro original            → `registrosDeOrigem`
 * 15. auditoria de visualizacao e alteracao  → `auditar` em cada operacao
 */
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db/pool.js';
import { auditar } from '../audit/registrar.js';
import { conflito, naoEncontrado } from '../errors.js';
import { definicao, TIPOS } from './tipos.js';
import type {
  AreaOrganizacional,
  ConfiancaVinculo,
  FonteDado,
  GravidadeInconsistencia,
  StatusRevisao,
  TipoInconsistencia,
} from '../db/schema.js';

/** Impacto: natureza do que fica comprometido. Distinto da gravidade (urgencia). */
export type ImpactoInconsistencia =
  | 'nenhum'
  | 'cadastro'
  | 'indicador'
  | 'valor_financeiro'
  | 'situacao_juridica'
  | 'multiplo';

/**
 * Vocabulario da API x do banco.
 *
 * O produto fala "pendente" e "descartada"; o schema da skill
 * (schemas/inconsistencias.schema.json) usa `aberta`, `em_revisao` e `ignorada`.
 * O banco preserva o schema da skill; a API fala a lingua do produto. O mapa
 * abaixo e a unica ponte — ver DECISOES.md.
 */
export type StatusApi = 'pendente' | 'em_revisao' | 'resolvida' | 'descartada';

const STATUS_PARA_BANCO: Record<StatusApi, StatusRevisao> = {
  pendente: 'aberta',
  em_revisao: 'em_revisao',
  resolvida: 'resolvida',
  descartada: 'ignorada',
};

const STATUS_PARA_API: Record<StatusRevisao, StatusApi> = {
  aberta: 'pendente',
  em_revisao: 'em_revisao',
  resolvida: 'resolvida',
  ignorada: 'descartada',
};

export const paraStatusBanco = (s: StatusApi): StatusRevisao => STATUS_PARA_BANCO[s];
export const paraStatusApi = (s: StatusRevisao): StatusApi => STATUS_PARA_API[s];

/**
 * Um lado do conflito.
 *
 * Requisitos 1, 2 e 3: o valor como a fonte informou, qual fonte, e qual o
 * identificador original naquela fonte. Nada disso e recalculado depois.
 */
export interface LadoDoConflito {
  fonte: FonteDado;
  /** Identificador no sistema de origem. Permite abrir o registro original. */
  id_origem: string | null;
  /** Nome do campo em conflito, ex: 'saldo_vencido'. */
  campo: string;
  /** Valor exatamente como a fonte informou. */
  valor: unknown;
  /** Valor apos normalizacao, quando houve. */
  valor_normalizado?: unknown;
  /** A que data o valor se refere. */
  data_referencia?: string | null;
  /** Quando foi lido da fonte. */
  extraido_em?: string | null;
  /** Endereco do registro na fonte, quando conhecido. */
  url_origem?: string | null;
}

export interface ContextoUsuario {
  usuarioId: string | null;
  usuarioNome: string | null;
  perfil?: import('../db/schema.js').PerfilUsuario | null;
  sessaoId?: string | null;
  enderecoIp?: string | null;
}

export interface DadosNovaInconsistencia {
  tipo: TipoInconsistencia;
  fonte: FonteDado;
  descricao: string;
  gravidade?: GravidadeInconsistencia;
  impacto?: ImpactoInconsistencia;
  impactoValor?: number | null;

  cliente?: string | null;
  contrato?: string | null;
  empreendimento?: string | null;
  clienteId?: string | null;
  contratoId?: string | null;
  empreendimentoId?: string | null;

  valoresEmConflito?: LadoDoConflito[];
  precedenciaAplicada?: string | null;
  valorAplicado?: unknown;
  hipotese?: string | null;

  regraVinculo?: import('../db/schema.js').RegraVinculo | null;
  confiancaVinculo?: ConfiancaVinculo | null;
  vinculoId?: string | null;

  competenciaRef?: string | null;
  dataReferencia?: string | null;
  execucaoId?: string | null;

  /** Componentes da chave de deduplicacao. Sem eles, a chave vem dos campos. */
  chaveExtra?: string[];
}

/**
 * Chave de deduplicacao.
 *
 * Sem ela, cada carga reabriria as mesmas inconsistencias e a Central viraria
 * ruido. Com ela, a recorrencia incrementa um contador e a fila permanece
 * utilizavel.
 */
function montarChave(dados: DadosNovaInconsistencia): string {
  const partes = [
    dados.tipo,
    dados.fonte,
    dados.empreendimentoId ?? dados.empreendimento ?? '',
    dados.contratoId ?? dados.contrato ?? '',
    dados.clienteId ?? dados.cliente ?? '',
    ...(dados.valoresEmConflito ?? []).map((l) => `${l.fonte}:${l.id_origem}:${l.campo}`).sort(),
    ...(dados.chaveExtra ?? []),
  ];
  return createHash('sha256').update(partes.join('|')).digest('hex').slice(0, 32);
}

/**
 * Abre uma inconsistencia, ou registra reincidencia se ela ja estiver aberta.
 *
 * NUNCA reabre o que foi resolvido ou descartado por decisao humana: se o caso
 * volta a aparecer depois de tratado, entra uma nova inconsistencia, e o
 * historico da anterior permanece intacto.
 */
export async function registrar(
  dados: DadosNovaInconsistencia,
  contexto?: ContextoUsuario,
): Promise<{ id: string; reincidencia: boolean }> {
  const def = definicao(dados.tipo);
  const chave = montarChave(dados);

  const aberta = await db
    .selectFrom('inconsistencias')
    .select(['id', 'ocorrencias'])
    .where('chave_deduplicacao', '=', chave)
    .where('status_revisao', 'in', ['aberta', 'em_revisao'])
    .executeTakeFirst();

  if (aberta) {
    await db
      .updateTable('inconsistencias')
      .set({
        ocorrencias: aberta.ocorrencias + 1,
        vista_por_ultimo_em: new Date(),
        execucao_id: dados.execucaoId ?? null,
      })
      .where('id', '=', aberta.id)
      .execute();

    await registrarEvento(aberta.id, 'reincidencia', contexto, {
      detalhe: { ocorrencia: aberta.ocorrencias + 1 },
    });

    return { id: aberta.id, reincidencia: true };
  }

  const linha = await db
    .insertInto('inconsistencias')
    .values({
      tipo: dados.tipo,
      gravidade: dados.gravidade ?? def.gravidadePadrao,
      impacto: (dados.impacto ?? 'indicador') as never,
      impacto_valor: dados.impactoValor?.toString() ?? null,
      fonte: dados.fonte,
      descricao: dados.descricao,
      cliente: dados.cliente ?? null,
      contrato: dados.contrato ?? null,
      empreendimento: dados.empreendimento ?? null,
      cliente_id: dados.clienteId ?? null,
      contrato_id: dados.contratoId ?? null,
      empreendimento_id: dados.empreendimentoId ?? null,
      valores_em_conflito: JSON.stringify(dados.valoresEmConflito ?? []),
      precedencia_aplicada: dados.precedenciaAplicada ?? null,
      valor_aplicado: dados.valorAplicado === undefined ? null : JSON.stringify(dados.valorAplicado),
      hipotese: dados.hipotese ?? null,
      regra_vinculo: dados.regraVinculo ?? null,
      confianca_vinculo: dados.confiancaVinculo ?? null,
      vinculo_id: dados.vinculoId ?? null,
      bloqueia_indicador: def.bloqueiaIndicador,
      responsavel_area: def.areaResponsavel,
      competencia_ref: dados.competenciaRef ?? null,
      data_referencia: dados.dataReferencia ?? null,
      execucao_id: dados.execucaoId ?? null,
      chave_deduplicacao: chave,
      status_revisao: 'aberta',
    } as never)
    .returning('id')
    .executeTakeFirstOrThrow();

  await registrarEvento(linha.id, 'detectada', contexto, {
    detalhe: {
      tipo: dados.tipo,
      gravidade: dados.gravidade ?? def.gravidadePadrao,
      lados: (dados.valoresEmConflito ?? []).length,
    },
    statusDepois: 'aberta',
  });

  return { id: linha.id, reincidencia: false };
}

/**
 * Requisito 6: ambiguidade NAO e resolvida automaticamente.
 *
 * Recebe todos os candidatos, preserva todos, e abre a inconsistencia sem
 * escolher nenhum. O vinculo correspondente fica marcado como ambiguo e nao
 * alimenta indicador ate confirmacao humana.
 */
export async function registrarAmbiguidade(
  dados: {
    fonte: FonteDado;
    entidade: string;
    chaveUsada: string;
    regraVinculo: import('../db/schema.js').RegraVinculo;
    candidatos: LadoDoConflito[];
    empreendimentoId?: string | null;
    competenciaRef?: string | null;
    execucaoId?: string | null;
  },
  contexto?: ContextoUsuario,
): Promise<{ id: string; reincidencia: boolean }> {
  if (dados.candidatos.length < 2) {
    throw conflito('Ambiguidade exige ao menos dois candidatos.');
  }

  return registrar(
    {
      tipo: 'vinculo_ambiguo',
      fonte: dados.fonte,
      descricao:
        `${dados.entidade}: ${dados.candidatos.length} candidatos possiveis para ` +
        `${dados.regraVinculo} = "${dados.chaveUsada}". Nenhum foi escolhido automaticamente.`,
      // Confianca baixa: e exatamente por isso que nao se decide sozinho.
      confiancaVinculo: 'baixa',
      regraVinculo: dados.regraVinculo,
      valoresEmConflito: dados.candidatos,
      empreendimentoId: dados.empreendimentoId ?? null,
      competenciaRef: dados.competenciaRef ?? null,
      execucaoId: dados.execucaoId ?? null,
      impacto: 'indicador',
      chaveExtra: [dados.entidade, dados.chaveUsada],
    },
    contexto,
  );
}

/**
 * Requisito 1 e 12: divergencia de valor entre duas fontes.
 *
 * Os dois valores ficam preservados, a precedencia configurada define qual entra
 * no indicador, e nada e sobrescrito em silencio.
 */
export async function registrarDivergencia(
  dados: {
    campo: string;
    ladoA: LadoDoConflito;
    ladoB: LadoDoConflito;
    precedencia: string;
    valorAplicado: unknown;
    clienteId?: string | null;
    contratoId?: string | null;
    contrato?: string | null;
    cliente?: string | null;
    empreendimentoId?: string | null;
    empreendimento?: string | null;
    competenciaRef?: string | null;
    dataReferencia?: string | null;
    execucaoId?: string | null;
    regraVinculo?: import('../db/schema.js').RegraVinculo | null;
    confiancaVinculo?: ConfiancaVinculo | null;
  },
  contexto?: ContextoUsuario,
): Promise<{ id: string; reincidencia: boolean }> {
  const fontes = new Set([dados.ladoA.fonte, dados.ladoB.fonte]);
  const tipo: TipoInconsistencia =
    fontes.has('monday') && fontes.has('sienge')
      ? 'conflito_monday_sienge'
      : fontes.has('monday') && fontes.has('cvcrm')
        ? 'conflito_monday_cvcrm'
        : fontes.has('cvcrm') && fontes.has('sienge')
          ? 'conflito_cvcrm_sienge'
          : 'divergencia_valor';

  // Diferenca monetaria, quando os dois lados forem numericos. Permite ordenar
  // a triagem por dinheiro em risco.
  const a = Number(dados.ladoA.valor);
  const b = Number(dados.ladoB.valor);
  const diferenca =
    Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : null;

  return registrar(
    {
      tipo,
      fonte: 'consolidacao',
      descricao:
        `Divergencia em ${dados.campo}: ${dados.ladoA.fonte} informa ${String(dados.ladoA.valor)}, ` +
        `${dados.ladoB.fonte} informa ${String(dados.ladoB.valor)}. Os dois valores estao preservados.`,
      impacto: diferenca !== null ? 'valor_financeiro' : 'indicador',
      impactoValor: diferenca,
      valoresEmConflito: [dados.ladoA, dados.ladoB],
      precedenciaAplicada: dados.precedencia,
      valorAplicado: dados.valorAplicado,
      clienteId: dados.clienteId ?? null,
      contratoId: dados.contratoId ?? null,
      cliente: dados.cliente ?? null,
      contrato: dados.contrato ?? null,
      empreendimentoId: dados.empreendimentoId ?? null,
      empreendimento: dados.empreendimento ?? null,
      competenciaRef: dados.competenciaRef ?? null,
      dataReferencia: dados.dataReferencia ?? null,
      execucaoId: dados.execucaoId ?? null,
      regraVinculo: dados.regraVinculo ?? null,
      confiancaVinculo: dados.confiancaVinculo ?? null,
      chaveExtra: [dados.campo],
    },
    contexto,
  );
}

// ── Historico (requisito 11) ────────────────────────────────────────────────

async function registrarEvento(
  inconsistenciaId: string,
  evento: string,
  contexto?: ContextoUsuario,
  dados: {
    statusAntes?: StatusRevisao | null;
    statusDepois?: StatusRevisao | null;
    responsavelAntes?: string | null;
    responsavelDepois?: string | null;
    analise?: string | null;
    decisao?: string | null;
    justificativa?: string | null;
    observacao?: string | null;
    detalhe?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await db
    .insertInto('inconsistencias_eventos')
    .values({
      inconsistencia_id: inconsistenciaId,
      evento,
      usuario_id: contexto?.usuarioId ?? null,
      usuario_nome: contexto?.usuarioNome ?? null,
      status_antes: dados.statusAntes ?? null,
      status_depois: dados.statusDepois ?? null,
      responsavel_antes: dados.responsavelAntes ?? null,
      responsavel_depois: dados.responsavelDepois ?? null,
      analise: dados.analise ?? null,
      decisao: dados.decisao ?? null,
      justificativa: dados.justificativa ?? null,
      observacao: dados.observacao ?? null,
      detalhe: JSON.stringify(dados.detalhe ?? {}),
    } as never)
    .execute();
}

export async function historico(inconsistenciaId: string) {
  return db
    .selectFrom('inconsistencias_eventos')
    .select([
      'id', 'ocorrido_em', 'evento', 'usuario_nome',
      'status_antes', 'status_depois', 'responsavel_antes', 'responsavel_depois',
      'analise', 'decisao', 'justificativa', 'observacao', 'detalhe',
    ])
    .where('inconsistencia_id', '=', inconsistenciaId)
    .orderBy('ocorrido_em', 'asc')
    .orderBy('id', 'asc')
    .execute();
}

// ── Consulta (requisito 13) ─────────────────────────────────────────────────

export interface FiltrosInconsistencia {
  fonte?: FonteDado;
  empreendimentoId?: string;
  competenciaRef?: string;
  periodoInicio?: string;
  periodoFim?: string;
  tipo?: TipoInconsistencia;
  status?: StatusApi;
  gravidade?: GravidadeInconsistencia;
  impacto?: ImpactoInconsistencia;
  responsavelId?: string;
  area?: AreaOrganizacional;
  somenteBloqueantes?: boolean;
  /** Restricao de escopo do usuario. `null` = sem restricao. */
  empreendimentosPermitidos?: string[] | null;
  limite?: number;
  deslocamento?: number;
}

export async function listar(filtros: FiltrosInconsistencia) {
  let consulta = db
    .selectFrom('inconsistencias as i')
    .leftJoin('usuarios as r', 'r.id', 'i.responsavel_id')
    .leftJoin('empreendimentos as e', 'e.id', 'i.empreendimento_id')
    .select([
      'i.id', 'i.tipo', 'i.gravidade', 'i.impacto', 'i.impacto_valor', 'i.fonte',
      'i.descricao', 'i.detectado_em', 'i.status_revisao',
      'i.cliente', 'i.contrato', 'i.empreendimento', 'i.empreendimento_id',
      'i.valores_em_conflito', 'i.precedencia_aplicada', 'i.valor_aplicado', 'i.hipotese',
      'i.regra_vinculo', 'i.confianca_vinculo', 'i.vinculo_id',
      'i.analise', 'i.decisao', 'i.justificativa', 'i.observacao',
      'i.bloqueia_indicador', 'i.competencia_ref', 'i.data_referencia',
      'i.responsavel_id', 'i.responsavel_area', 'i.ocorrencias',
      'i.resolvido_em', 'i.vista_por_ultimo_em', 'i.visualizacoes',
      'r.nome as responsavel_nome',
      'e.nome as empreendimento_nome',
    ]);

  if (filtros.fonte) consulta = consulta.where('i.fonte', '=', filtros.fonte);
  if (filtros.tipo) consulta = consulta.where('i.tipo', '=', filtros.tipo);
  if (filtros.gravidade) consulta = consulta.where('i.gravidade', '=', filtros.gravidade);
  if (filtros.impacto) consulta = consulta.where('i.impacto' as never, '=', filtros.impacto as never);
  if (filtros.status) consulta = consulta.where('i.status_revisao', '=', paraStatusBanco(filtros.status));
  if (filtros.responsavelId) consulta = consulta.where('i.responsavel_id', '=', filtros.responsavelId);
  if (filtros.area) consulta = consulta.where('i.responsavel_area', '=', filtros.area);
  if (filtros.competenciaRef) {
    consulta = consulta.where('i.competencia_ref' as never, '=', filtros.competenciaRef as never);
  }
  if (filtros.empreendimentoId) {
    consulta = consulta.where('i.empreendimento_id', '=', filtros.empreendimentoId);
  }
  if (filtros.somenteBloqueantes) {
    consulta = consulta.where('i.bloqueia_indicador' as never, '=', true as never);
  }
  if (filtros.periodoInicio) {
    consulta = consulta.where('i.detectado_em', '>=', new Date(filtros.periodoInicio));
  }
  if (filtros.periodoFim) {
    // Fim do dia informado, para que o filtro inclua o proprio dia.
    consulta = consulta.where('i.detectado_em', '<', new Date(`${filtros.periodoFim}T23:59:59.999Z`));
  }

  // Escopo de autorizacao: lista vazia significa nenhum empreendimento
  // permitido, e a consulta deve resultar em nada — diferente de `null`, que
  // significa sem restricao.
  if (filtros.empreendimentosPermitidos !== null && filtros.empreendimentosPermitidos !== undefined) {
    if (filtros.empreendimentosPermitidos.length === 0) {
      consulta = consulta.where(sql<boolean>`false`);
    } else {
      consulta = consulta.where((eb) =>
        eb.or([
          eb('i.empreendimento_id', 'in', filtros.empreendimentosPermitidos!),
          // Inconsistencia sem empreendimento e consolidada: visivel a quem tem
          // acesso ao modulo.
          eb('i.empreendimento_id', 'is', null),
        ]),
      );
    }
  }

  return consulta
    // Triagem: mais grave primeiro, depois maior valor em risco, depois mais recente.
    .orderBy(sql`case i.gravidade when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end`)
    .orderBy('i.impacto_valor' as never, 'desc')
    .orderBy('i.detectado_em', 'desc')
    .limit(filtros.limite ?? 100)
    .offset(filtros.deslocamento ?? 0)
    .execute();
}

/** Contagem por gravidade e status, para os cartoes de resumo da tela. */
export async function resumo(empreendimentosPermitidos: string[] | null) {
  let consulta = db
    .selectFrom('inconsistencias')
    .select(({ fn }) => [
      'gravidade',
      'status_revisao',
      fn.countAll<number>().as('total'),
    ])
    .groupBy(['gravidade', 'status_revisao']);

  if (empreendimentosPermitidos !== null) {
    if (empreendimentosPermitidos.length === 0) {
      consulta = consulta.where(sql<boolean>`false`);
    } else {
      consulta = consulta.where((eb) =>
        eb.or([
          eb('empreendimento_id', 'in', empreendimentosPermitidos),
          eb('empreendimento_id', 'is', null),
        ]),
      );
    }
  }

  const linhas = await consulta.execute();

  return linhas.map((l) => ({
    gravidade: l.gravidade,
    status: paraStatusApi(l.status_revisao),
    total: Number(l.total),
  }));
}

/**
 * Requisito 15: leitura de uma inconsistencia e auditada.
 *
 * Ver o conflito significa ver dado de cliente. A trilha registra quem abriu,
 * quando, e quantas vezes o registro foi consultado.
 */
export async function obter(id: string, contexto: ContextoUsuario) {
  const linha = await db
    .selectFrom('inconsistencias as i')
    .leftJoin('usuarios as r', 'r.id', 'i.responsavel_id')
    .leftJoin('empreendimentos as e', 'e.id', 'i.empreendimento_id')
    .selectAll('i')
    .select(['r.nome as responsavel_nome', 'e.nome as empreendimento_nome'])
    .where('i.id', '=', id)
    .executeTakeFirst();

  if (!linha) throw naoEncontrado('Inconsistencia nao encontrada.');

  await db
    .updateTable('inconsistencias')
    .set({
      visualizacoes: sql`visualizacoes + 1` as never,
      vista_por: contexto.usuarioId as never,
    })
    .where('id', '=', id)
    .execute();

  await Promise.all([
    registrarEvento(id, 'visualizada', contexto),
    auditar({
      ...contexto,
      acao: 'consulta_dado_pessoal',
      recurso: 'inconsistencias',
      recursoId: id,
      modulo: 'juridico',
      detalhe: { tipo: linha.tipo, gravidade: linha.gravidade },
    }),
  ]);

  return linha;
}

/**
 * Requisito 14: registros originais das fontes envolvidas.
 *
 * Le da area bruta preservada na ingestao — nao consulta Monday nem Sienge de
 * novo, e por isso funciona mesmo se a fonte estiver fora do ar.
 */
export async function registrosDeOrigem(inconsistenciaId: string) {
  const linhas = await sql<{
    fonte: FonteDado;
    id_origem: string;
    payload: unknown;
    extraido_em: Date;
    escopo: string | null;
  }>`
    SELECT fonte, id_origem, payload, extraido_em, escopo
    FROM inconsistencias_com_origem
    WHERE inconsistencia_id = ${inconsistenciaId}
    ORDER BY extraido_em DESC
  `.execute(db);

  return linhas.rows;
}

// ── Tratamento (requisitos 7, 9, 10) ────────────────────────────────────────

export async function atribuir(
  id: string,
  responsavelId: string | null,
  contexto: ContextoUsuario,
): Promise<void> {
  const atual = await db
    .selectFrom('inconsistencias')
    .select(['responsavel_id', 'status_revisao'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!atual) throw naoEncontrado('Inconsistencia nao encontrada.');

  await db
    .updateTable('inconsistencias')
    .set({
      responsavel_id: responsavelId,
      // Atribuir move automaticamente de pendente para em revisao: a fila da
      // triagem deve mostrar so o que ainda nao tem dono.
      status_revisao: atual.status_revisao === 'aberta' ? 'em_revisao' : atual.status_revisao,
    })
    .where('id', '=', id)
    .execute();

  await Promise.all([
    registrarEvento(id, 'atribuida', contexto, {
      responsavelAntes: atual.responsavel_id,
      responsavelDepois: responsavelId,
      statusAntes: atual.status_revisao,
      statusDepois: atual.status_revisao === 'aberta' ? 'em_revisao' : atual.status_revisao,
    }),
    auditar({
      ...contexto,
      acao: 'inconsistencia_tratada',
      recurso: 'inconsistencias',
      recursoId: id,
      modulo: 'juridico',
      valorAntes: { responsavel_id: atual.responsavel_id },
      valorDepois: { responsavel_id: responsavelId },
      detalhe: { operacao: 'atribuicao' },
    }),
  ]);
}

/** Requisito 9: registra a analise sem encerrar o caso. */
export async function registrarAnalise(
  id: string,
  dados: { analise: string; gravidade?: GravidadeInconsistencia; impacto?: ImpactoInconsistencia },
  contexto: ContextoUsuario,
): Promise<void> {
  const atual = await db
    .selectFrom('inconsistencias')
    .select(['status_revisao', 'analise', 'gravidade'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!atual) throw naoEncontrado('Inconsistencia nao encontrada.');

  await db
    .updateTable('inconsistencias')
    .set({
      analise: dados.analise,
      ...(dados.gravidade ? { gravidade: dados.gravidade } : {}),
      ...(dados.impacto ? { impacto: dados.impacto as never } : {}),
      status_revisao: atual.status_revisao === 'aberta' ? 'em_revisao' : atual.status_revisao,
    })
    .where('id', '=', id)
    .execute();

  await Promise.all([
    registrarEvento(id, 'analisada', contexto, {
      analise: dados.analise,
      statusAntes: atual.status_revisao,
      statusDepois: atual.status_revisao === 'aberta' ? 'em_revisao' : atual.status_revisao,
      detalhe: dados.gravidade ? { gravidade_antes: atual.gravidade, gravidade_depois: dados.gravidade } : {},
    }),
    auditar({
      ...contexto,
      acao: 'inconsistencia_tratada',
      recurso: 'inconsistencias',
      recursoId: id,
      modulo: 'juridico',
      detalhe: { operacao: 'analise' },
    }),
  ]);
}

/**
 * Requisito 10 e 12: encerra como resolvida ou descartada.
 *
 * Exige decisao E justificativa — encerrar sem dizer por que tornaria a trilha
 * inutil para auditoria. Os valores originais permanecem: o gatilho do banco
 * recusa qualquer alteracao em `valores_em_conflito`.
 */
export async function encerrar(
  id: string,
  dados: {
    status: 'resolvida' | 'descartada';
    decisao: string;
    justificativa: string;
    analise?: string | null;
  },
  contexto: ContextoUsuario,
): Promise<void> {
  if (!dados.decisao?.trim()) {
    throw conflito('Informe a decisao tomada.');
  }
  if (!dados.justificativa?.trim()) {
    throw conflito('Informe a justificativa da decisao.');
  }

  const atual = await db
    .selectFrom('inconsistencias')
    .select(['status_revisao', 'responsavel_id', 'valores_em_conflito'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!atual) throw naoEncontrado('Inconsistencia nao encontrada.');

  if (atual.status_revisao === 'resolvida' || atual.status_revisao === 'ignorada') {
    throw conflito('Esta inconsistencia ja foi encerrada. O historico nao pode ser reescrito.', {
      status_atual: paraStatusApi(atual.status_revisao),
    });
  }

  const statusBanco = paraStatusBanco(dados.status);

  await db
    .updateTable('inconsistencias')
    .set({
      status_revisao: statusBanco,
      decisao: dados.decisao,
      justificativa: dados.justificativa,
      ...(dados.analise ? { analise: dados.analise } : {}),
      resolvido_em: new Date(),
      resolvido_por: contexto.usuarioId,
      // Encerrada deixa de bloquear o indicador: a decisao humana e o
      // desbloqueio.
      bloqueia_indicador: false as never,
    })
    .where('id', '=', id)
    .execute();

  await Promise.all([
    registrarEvento(id, dados.status === 'resolvida' ? 'resolvida' : 'descartada', contexto, {
      statusAntes: atual.status_revisao,
      statusDepois: statusBanco,
      analise: dados.analise ?? null,
      decisao: dados.decisao,
      justificativa: dados.justificativa,
    }),
    auditar({
      ...contexto,
      acao: 'inconsistencia_tratada',
      recurso: 'inconsistencias',
      recursoId: id,
      modulo: 'juridico',
      valorAntes: { status: paraStatusApi(atual.status_revisao) },
      valorDepois: { status: dados.status, decisao: dados.decisao },
      detalhe: { operacao: 'encerramento' },
    }),
  ]);
}

/** Catalogo, para a interface montar filtros e orientacoes. */
export function catalogo() {
  return Object.values(TIPOS).map((d) => ({
    tipo: d.tipo,
    rotulo: d.rotulo,
    gravidade_padrao: d.gravidadePadrao,
    area_responsavel: d.areaResponsavel,
    orientacao: d.orientacao,
    bloqueia_indicador: d.bloqueiaIndicador,
  }));
}
