/**
 * Upsert idempotente por (fonte, id_origem).
 *
 * Substitui o padrao destrutivo da base atual, onde cada rotina de sync faz
 *
 *     DB.forComite('notificacoes', comiteId).forEach(n => DB.remove(...))
 *
 * antes de inserir (js/monday-sync.js:272, 352, 434, 540). Se a rede cair no
 * meio, o comite fica com os dados antigos apagados e apenas parte dos novos —
 * sem rollback e sem aviso.
 *
 * Aqui:
 *   - executar duas vezes produz o mesmo resultado (idempotente)
 *   - registro que nao veio na carga NAO e apagado: recebe `ausente_desde`
 *   - o valor original da fonte e sempre preservado
 *   - toda alteracao entra na trilha `historico` pelo gatilho do banco
 */
import { sql, type Transaction } from 'kysely';
import { db } from '../db/pool.js';
import type { Database, FonteDado } from '../db/schema.js';
import type { Execucao } from './execucoes.js';

/** Tabelas que aceitam upsert por proveniencia. */
export type TabelaIntegravel =
  | 'empreendimentos'
  | 'unidades'
  | 'clientes'
  | 'contratos'
  | 'notificacoes'
  | 'processos_judiciais'
  | 'distratos';

export interface RegistroParaUpsert {
  /** Identificador no sistema de origem. Obrigatorio: e a chave da idempotencia. */
  idOrigem: string;
  /** Campos do dominio, ja normalizados. */
  campos: Record<string, unknown>;
  /** Payload cru da fonte, preservado em valor_original. */
  valorOriginal: unknown;
  dataReferencia?: string | null;
  dataFato?: string | null;
}

export interface ResultadoUpsert {
  incluidos: number;
  /** Registros cujo CONTEUDO mudou. */
  atualizados: number;
  /** Reconhecidos pelo upsert e sem nada a alterar. Evidencia de idempotencia. */
  inalterados: number;
  /** IDs internos dos registros gravados, na ordem de entrada. */
  ids: string[];
}

type Executor = Transaction<Database> | typeof db;

/**
 * Grava um lote com upsert por (fonte, id_origem).
 *
 * Roda em transacao unica: ou o lote inteiro entra, ou nada muda. E o que
 * impede o estado intermediario que a base atual produz.
 */
export async function upsertLote(
  tabela: TabelaIntegravel,
  fonte: FonteDado,
  registros: RegistroParaUpsert[],
  contexto: {
    execucaoId: string;
    versaoRegra?: string | null;
    demonstrativo?: boolean;
    executor?: Executor;
  },
): Promise<ResultadoUpsert> {
  const resultado: ResultadoUpsert = { incluidos: 0, atualizados: 0, inalterados: 0, ids: [] };
  if (registros.length === 0) return resultado;

  const executar = async (trx: Executor) => {
    for (const registro of registros) {
      const valores = {
        ...registro.campos,
        fonte,
        id_origem: registro.idOrigem,
        valor_original: JSON.stringify(registro.valorOriginal),
        valor_normalizado: JSON.stringify(registro.campos),
        extraido_em: new Date(),
        data_referencia: registro.dataReferencia ?? null,
        data_fato: registro.dataFato ?? null,
        versao_regra: contexto.versaoRegra ?? null,
        execucao_id: contexto.execucaoId,
        demonstrativo: contexto.demonstrativo ?? false,
        // Registro voltou a aparecer: deixa de estar ausente.
        ausente_desde: null,
      };

      // `xmax = 0` distingue insercao de atualizacao na mesma instrucao: e o
      // unico jeito de saber qual dos dois aconteceu sem uma segunda consulta.
      const linha = await (trx as typeof db)
        .insertInto(tabela)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(valores as any)
        .onConflict((oc) =>
          oc
            .columns(['fonte', 'id_origem'])
            .doUpdateSet(
              // O gatilho do banco cuida de atualizado_em e da trilha historico.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              Object.fromEntries(
                Object.entries(valores).filter(([k]) => k !== 'criado_em'),
              ) as any,
            ),
        )
        .returning([
          'id',
          sql<boolean>`(xmax = 0)`.as('foi_insercao'),
          // O gatilho so mexe em `atualizado_em` quando algum campo de conteudo
          // muda. `now()` e o instante da TRANSACAO, entao igualdade aqui
          // significa "alterado por esta instrucao" — e o que separa uma carga
          // que corrigiu algo de uma que apenas releu o mesmo.
          sql<boolean>`(atualizado_em = now())`.as('mudou'),
        ])
        .executeTakeFirstOrThrow();

      resultado.ids.push(linha.id as string);
      if (linha.foi_insercao) resultado.incluidos++;
      else if (linha.mudou) resultado.atualizados++;
      else resultado.inalterados++;
    }
  };

  if (contexto.executor) {
    await executar(contexto.executor);
  } else {
    await db.transaction().execute(executar);
  }

  return resultado;
}

/**
 * Marca como ausentes os registros que a fonte deixou de trazer.
 *
 * NUNCA apaga. "Falha de uma fonte nao pode apagar o ultimo dado valido" — e o
 * registro pode ter sumido por erro de filtro na origem, nao por ter deixado de
 * existir. Marcar preserva o dado e deixa a ausencia visivel.
 *
 * `escopo` restringe a marcacao ao recorte que a carga realmente cobriu: marcar
 * fora dele acusaria de ausente algo que nem foi consultado.
 */
export async function marcarAusentes(
  tabela: TabelaIntegravel,
  fonte: FonteDado,
  idsOrigemPresentes: string[],
  escopo: { comiteId?: string | null; competenciaRef?: string | null } = {},
): Promise<number> {
  let consulta = db
    .updateTable(tabela)
    .set({ ausente_desde: new Date() })
    .where('fonte', '=', fonte)
    .where('ausente_desde', 'is', null);

  if (idsOrigemPresentes.length > 0) {
    consulta = consulta.where('id_origem', 'not in', idsOrigemPresentes);
  }

  // Restringe ao recorte da carga. Sem isso, sincronizar julho marcaria como
  // ausente tudo de junho.
  if (escopo.comiteId !== undefined && escopo.comiteId !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    consulta = consulta.where('comite_id' as any, '=', escopo.comiteId);
  }
  if (escopo.competenciaRef !== undefined && escopo.competenciaRef !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    consulta = consulta.where('competencia_ref' as any, '=', escopo.competenciaRef);
  }

  const r = await consulta.executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0);
}

/**
 * Detecta duplicidade de id_origem no lote lido.
 *
 * Duas linhas com o mesmo id_origem na mesma carga significam problema na
 * origem. Sem detectar, o upsert simplesmente sobrescreveria a primeira pela
 * segunda e a diferenca nunca apareceria.
 */
export function separarDuplicados<T extends { idOrigem: string }>(
  registros: T[],
): { unicos: T[]; duplicados: T[] } {
  const vistos = new Set<string>();
  const unicos: T[] = [];
  const duplicados: T[] = [];

  for (const registro of registros) {
    if (vistos.has(registro.idOrigem)) duplicados.push(registro);
    else {
      vistos.add(registro.idOrigem);
      unicos.push(registro);
    }
  }

  return { unicos, duplicados };
}

/**
 * Executa o upsert de um lote contabilizando na execucao.
 *
 * Junta as tres pecas: separa duplicados, grava com upsert, contabiliza. E o
 * caminho que toda ingestao deve usar.
 */
export async function persistirLote(
  tabela: TabelaIntegravel,
  fonte: FonteDado,
  registros: RegistroParaUpsert[],
  execucao: Execucao,
  opcoes: { versaoRegra?: string | null; demonstrativo?: boolean } = {},
): Promise<ResultadoUpsert> {
  const { unicos, duplicados } = separarDuplicados(registros);

  for (const d of duplicados) {
    execucao.registrarDuplicado();
  }

  const resultado = await upsertLote(tabela, fonte, unicos, {
    execucaoId: execucao.id,
    versaoRegra: opcoes.versaoRegra ?? null,
    demonstrativo: opcoes.demonstrativo ?? false,
  });

  for (let i = 0; i < resultado.incluidos; i++) execucao.registrarIncluido();
  for (let i = 0; i < resultado.atualizados; i++) execucao.registrarAtualizado();
  for (let i = 0; i < resultado.inalterados; i++) execucao.registrarInalterado();

  return resultado;
}
