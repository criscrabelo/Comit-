/**
 * Migração do localStorage para o PostgreSQL.
 *
 * Ordem, que é a garantia central:
 *
 *   1. SNAPSHOT — o dump bruto é gravado imutável antes de interpretar nada
 *   2. INSPEÇÃO — classifica as chaves e devolve prévia, sem gravar
 *   3. IMPORTAÇÃO — upsert idempotente, chave a chave, com contadores
 *   4. CONFIRMAÇÃO — relê do banco para provar que persistiu
 *   5. REMOÇÃO — só então o navegador pode apagar a chave
 *
 * Nada é apagado antes do passo 4. Interromper entre qualquer passo é seguro:
 * o snapshot permanece e a retomada continua de onde parou.
 */
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db/pool.js';
import { logger } from '../logging.js';
import { auditar } from '../audit/registrar.js';
import { conflito, entradaInvalida, naoEncontrado } from '../errors.js';
import { registrar as registrarInconsistencia } from '../inconsistencias/servico.js';
import { normalizarNome } from '../integracoes/monday/transformacao.js';
import {
  classificar,
  ehDemonstrativo,
  PREFIXO_PREFERENCIA,
  type ClasseChave,
  type DefinicaoChave,
} from './inventario.js';

const FONTE = 'migracao' as const;
const VERSAO_REGRA = 'migracao-1.0.0';

export interface DumpNavegador {
  /** Chave → valor cru, como estava no localStorage. */
  chaves: Record<string, string>;
  /** Versão do formato, quando o cliente souber informar. */
  versao?: string;
  navegador?: string;
}

export interface ChaveInspecionada {
  chave: string;
  classe: ClasseChave;
  modulo: string;
  destino: string | null;
  contemDadoPessoal: boolean;
  descricao: string;
  motivo: string | null;
  registros: number;
  demonstrativos: number;
  /** Amostra para a prévia. Dado pessoal já mascarado. */
  amostra: unknown[];
  /** Preenchido quando o conteúdo não é interpretável. */
  erroFormato: string | null;
}

export interface Inspecao {
  chaves: ChaveInspecionada[];
  totais: {
    chaves: number;
    a_migrar: number;
    preferencias: number;
    a_excluir: number;
    em_revisao: number;
    registros: number;
    demonstrativos: number;
    corrompidas: number;
  };
  snapshotHash: string;
  /** Migração anterior com o mesmo dump, se houver. */
  migracaoExistente: { id: string; status: string; iniciada_em: Date } | null;
}

/** Mascara nome e documento na prévia — a tela não precisa do valor completo. */
function mascararAmostra(registro: unknown): unknown {
  if (!registro || typeof registro !== 'object') return registro;

  const copia: Record<string, unknown> = { ...(registro as Record<string, unknown>) };
  for (const campo of Object.keys(copia)) {
    const valor = copia[campo];
    if (typeof valor !== 'string') continue;

    if (/cpf|cnpj|documento/i.test(campo)) {
      const digitos = valor.replace(/\D/g, '');
      copia[campo] = digitos ? `***${digitos.slice(-2)}` : '[vazio]';
    } else if (/cliente|nome|autor|responsavel/i.test(campo) && valor.length > 3) {
      // Primeiro termo e inicial do segundo: suficiente para reconhecer,
      // insuficiente para identificar.
      const termos = valor.trim().split(/\s+/);
      copia[campo] =
        termos.length > 1 ? `${termos[0]} ${termos[1]![0]}.` : termos[0]!;
    }
  }
  return copia;
}

function calcularHash(dump: DumpNavegador): string {
  const ordenado = Object.keys(dump.chaves)
    .sort()
    .map((k) => `${k}=${dump.chaves[k]}`)
    .join('\n');
  return createHash('sha256').update(ordenado).digest('hex');
}

/**
 * Lê o conteúdo de uma chave.
 *
 * Conteúdo corrompido NÃO derruba a inspeção: devolve o erro de formato, e a
 * chave entra no relatório como não migrável. Um JSON quebrado numa chave não
 * pode impedir a migração das outras dez.
 */
function lerChave(bruto: string): { registros: unknown[]; erro: string | null } {
  if (!bruto || !bruto.trim()) return { registros: [], erro: null };

  let analisado: unknown;
  try {
    analisado = JSON.parse(bruto);
  } catch (erro) {
    return {
      registros: [],
      erro: `conteudo nao e JSON valido: ${erro instanceof Error ? erro.message : 'erro'}`,
    };
  }

  if (Array.isArray(analisado)) return { registros: analisado, erro: null };

  // Valor escalar (preferência) não é lista de registros.
  if (typeof analisado !== 'object' || analisado === null) {
    return { registros: [], erro: null };
  }

  return {
    registros: [],
    erro: `esperava uma lista de registros, recebeu ${typeof analisado}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 e 2 — Snapshot e inspeção
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inspeciona o dump SEM gravar nada de negócio.
 *
 * Devolve o que existe, quanto existe e uma prévia mascarada, para que a pessoa
 * confirme com conhecimento de causa.
 */
export async function inspecionar(
  dump: DumpNavegador,
  usuarioId: string,
): Promise<Inspecao> {
  const chaves: ChaveInspecionada[] = [];
  let registrosTotais = 0;
  let demonstrativosTotais = 0;
  let corrompidas = 0;

  for (const [chave, bruto] of Object.entries(dump.chaves)) {
    // Preferências já no formato novo não entram na migração.
    if (chave.startsWith(PREFIXO_PREFERENCIA)) continue;

    const definicao: DefinicaoChave = classificar(chave);
    const { registros, erro } = lerChave(bruto);

    if (erro) corrompidas++;

    const demonstrativos = registros.filter((r) =>
      ehDemonstrativo(r as Record<string, unknown>),
    ).length;

    registrosTotais += registros.length;
    demonstrativosTotais += demonstrativos;

    chaves.push({
      chave,
      classe: definicao.classe,
      modulo: definicao.modulo,
      destino: definicao.destino ?? null,
      contemDadoPessoal: definicao.contemDadoPessoal,
      descricao: definicao.descricao,
      motivo: definicao.motivo ?? null,
      registros: registros.length,
      demonstrativos,
      amostra: registros.slice(0, 3).map(mascararAmostra),
      erroFormato: erro,
    });
  }

  const snapshotHash = calcularHash(dump);

  const existente = await db
    .selectFrom('migracoes_localstorage')
    .select(['id', 'status', 'iniciada_em'])
    .where('usuario_id', '=', usuarioId)
    .where('snapshot_hash', '=', snapshotHash)
    .executeTakeFirst();

  return {
    chaves: chaves.sort((a, b) => b.registros - a.registros),
    totais: {
      chaves: chaves.length,
      a_migrar: chaves.filter((c) => c.classe === 'migrar').length,
      preferencias: chaves.filter((c) => c.classe === 'preferencia').length,
      a_excluir: chaves.filter((c) => c.classe === 'excluir').length,
      em_revisao: chaves.filter((c) => c.classe === 'revisao').length,
      registros: registrosTotais,
      demonstrativos: demonstrativosTotais,
      corrompidas,
    },
    snapshotHash,
    migracaoExistente: existente
      ? { id: existente.id, status: existente.status, iniciada_em: new Date(existente.iniciada_em) }
      : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — Importação
// ═══════════════════════════════════════════════════════════════════════════

export interface ContextoMigracao {
  usuarioId: string;
  usuarioNome: string;
  perfil?: string | null;
  sessaoId?: string | null;
  enderecoIp?: string | null;
}

export interface ResultadoMigracao {
  id: string;
  status: string;
  chaves_encontradas: number;
  chaves_migradas: number;
  lidos: number;
  incluidos: number;
  atualizados: number;
  ignorados: number;
  conflitantes: number;
  com_erro: number;
  demonstrativos: number;
  persistencia_confirmada: boolean;
  pode_remover_chaves: boolean;
  chaves: Array<{
    chave: string;
    classe: string;
    incluidos: number;
    atualizados: number;
    ignorados: number;
    conflitantes: number;
    com_erro: number;
    concluida: boolean;
    erro: string | null;
  }>;
  mensagem: string | null;
}

/**
 * Grava o snapshot e cria (ou retoma) a migração.
 *
 * Repetir com o mesmo dump devolve a migração existente em vez de criar outra —
 * é o que torna a operação idempotente do lado de fora também.
 */
async function abrirMigracao(
  dump: DumpNavegador,
  contexto: ContextoMigracao,
): Promise<{ id: string; retomada: boolean }> {
  const snapshotHash = calcularHash(dump);
  const bytes = JSON.stringify(dump.chaves).length;

  const existente = await db
    .selectFrom('migracoes_localstorage')
    .select(['id', 'status'])
    .where('usuario_id', '=', contexto.usuarioId)
    .where('snapshot_hash', '=', snapshotHash)
    .executeTakeFirst();

  if (existente) {
    if (existente.status === 'concluida') {
      // Reexecutar uma migração concluída não reimporta: devolve o resultado.
      return { id: existente.id, retomada: true };
    }
    await db
      .updateTable('migracoes_localstorage')
      .set({ status: 'em_andamento' })
      .where('id', '=', existente.id)
      .execute();
    return { id: existente.id, retomada: true };
  }

  const linha = await db
    .insertInto('migracoes_localstorage')
    .values({
      usuario_id: contexto.usuarioId,
      usuario_nome: contexto.usuarioNome,
      // O snapshot entra ANTES de qualquer interpretação.
      snapshot: JSON.stringify(dump.chaves),
      snapshot_bytes: bytes,
      snapshot_hash: snapshotHash,
      versao_formato: dump.versao ?? null,
      origem_navegador: dump.navegador?.slice(0, 300) ?? null,
      endereco_ip: contexto.enderecoIp ?? null,
      status: 'em_andamento',
      chaves_encontradas: Object.keys(dump.chaves).length,
    } as never)
    .returning('id')
    .executeTakeFirstOrThrow();

  return { id: linha.id, retomada: false };
}

/** Contadores de uma chave. */
interface ContadoresChave {
  lidos: number;
  incluidos: number;
  atualizados: number;
  ignorados: number;
  conflitantes: number;
  comErro: number;
  demonstrativos: number;
}

const zerado = (): ContadoresChave => ({
  lidos: 0,
  incluidos: 0,
  atualizados: 0,
  ignorados: 0,
  conflitantes: 0,
  comErro: 0,
  demonstrativos: 0,
});

/**
 * Importa uma chave de negócio.
 *
 * Upsert por `(fonte='migracao', id_origem)`, onde `id_origem` inclui a chave e
 * o id local — repetir a migração atualiza, nunca duplica.
 */
async function importarChave(
  migracaoId: string,
  chave: string,
  definicao: DefinicaoChave,
  registros: unknown[],
  contexto: ContextoMigracao,
): Promise<ContadoresChave> {
  const c = zerado();
  c.lidos = registros.length;

  const destino = definicao.destino;
  if (!destino) {
    c.ignorados = registros.length;
    return c;
  }

  for (const bruto of registros) {
    const registro = bruto as Record<string, unknown>;
    const idLocal = String(registro.id ?? '');

    if (!idLocal) {
      c.ignorados++;
      continue;
    }

    const idOrigem = `localstorage:${chave}:${idLocal}`;
    const demonstrativo = ehDemonstrativo(registro);
    if (demonstrativo) c.demonstrativos++;

    try {
      const inserido = await gravarRegistro(destino, idOrigem, registro, {
        migracaoId,
        demonstrativo,
      });

      if (inserido === 'incluido') c.incluidos++;
      else if (inserido === 'atualizado') c.atualizados++;
      else if (inserido === 'conflito') {
        c.conflitantes++;
        await registrarInconsistencia(
          {
            tipo: 'duplicidade',
            fonte: FONTE,
            descricao:
              `Migração do localStorage: registro "${idLocal}" da chave ${chave} conflita com ` +
              'dado já existente no banco. Os dois valores foram preservados.',
            execucaoId: null,
            chaveExtra: [chave, idLocal],
          },
          { usuarioId: contexto.usuarioId, usuarioNome: contexto.usuarioNome },
        );
      } else {
        c.ignorados++;
      }
    } catch (erro) {
      c.comErro++;
      logger.warn(
        { chave, id_local: idLocal, erro: erro instanceof Error ? erro.message : String(erro) },
        'Falha ao migrar registro; os demais continuam',
      );
    }
  }

  return c;
}

type ResultadoGravacao = 'incluido' | 'atualizado' | 'conflito' | 'ignorado';

/**
 * Grava um registro no destino.
 *
 * Cada destino tem o seu mapeamento; o que é comum é a proveniência:
 * `fonte = 'migracao'`, `id_origem` rastreável até a chave e o id local.
 */
async function gravarRegistro(
  destino: string,
  idOrigem: string,
  registro: Record<string, unknown>,
  opcoes: { migracaoId: string; demonstrativo: boolean },
): Promise<ResultadoGravacao> {
  const comum = {
    fonte: FONTE,
    id_origem: idOrigem,
    valor_original: JSON.stringify(registro),
    versao_regra: VERSAO_REGRA,
    demonstrativo: opcoes.demonstrativo,
    extraido_em: new Date(),
  };

  const texto = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const data = (v: unknown): string | null => {
    const s = texto(v);
    if (!s) return null;
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  };
  const numero = (v: unknown): string | null => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? String(n) : null;
  };

  switch (destino) {
    case 'competencias_comites': {
      const ref = texto(registro.ref);
      if (!ref || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ref)) return 'ignorado';

      const [ano, mes] = ref.split('-').map(Number);
      await db
        .insertInto('competencias')
        .values({
          ref,
          rotulo: texto(registro.label) ?? ref,
          inicio: `${ref}-01`,
          fim: new Date(Date.UTC(ano!, mes!, 0)).toISOString().slice(0, 10),
        })
        .onConflict((oc) => oc.column('ref').doNothing())
        .execute();

      const r = await db
        .insertInto('comites')
        .values({ competencia_ref: ref, rotulo: texto(registro.label) ?? ref })
        .onConflict((oc) =>
          oc.column('competencia_ref').doUpdateSet({ atualizado_em: new Date() }),
        )
        .returning([sql<boolean>`(xmax = 0)`.as('novo')])
        .executeTakeFirst();

      return r?.novo ? 'incluido' : 'atualizado';
    }

    case 'empreendimentos': {
      const nome = texto(registro.nome);
      if (!nome) return 'ignorado';
      const normalizado = normalizarNome(nome);

      // Conflito real: já existe empreendimento com este nome vindo de OUTRA
      // fonte. Não sobrescreve — registra e preserva os dois.
      const existente = await db
        .selectFrom('empreendimentos')
        .select(['id', 'fonte'])
        .where('nome_normalizado', '=', normalizado)
        .executeTakeFirst();

      if (existente && existente.fonte !== FONTE) return 'conflito';

      const r = await db
        .insertInto('empreendimentos')
        .values({
          ...comum,
          nome,
          nome_normalizado: normalizado,
          cidade: texto(registro.cidade),
          status: texto(registro.status) === 'Inativo' ? 'inativo' : 'em_vendas',
        } as never)
        .onConflict((oc) =>
          oc.column('nome_normalizado').doUpdateSet({ nome, atualizado_em: new Date() } as never),
        )
        .returning([sql<boolean>`(xmax = 0)`.as('novo')])
        .executeTakeFirst();

      return r?.novo ? 'incluido' : 'atualizado';
    }

    case 'notificacoes':
    case 'processos_judiciais':
    case 'distratos':
    case 'fatos':
    case 'riscos':
    case 'regulatorios':
    case 'contratos':
    case 'unidades': {
      // Campos comuns a estes destinos, mapeados de forma conservadora: o que
      // não for reconhecido continua em valor_original, nunca é descartado.
      const valores: Record<string, unknown> = { ...comum };

      if (destino === 'notificacoes') {
        valores.cliente_nome = texto(registro.cliente);
        valores.unidade = texto(registro.unidade);
        valores.torre = texto(registro.torre);
        valores.grupo = texto(registro.grupo);
        valores.estagio = texto(registro.estagio);
        valores.estagio_detalhe = texto(registro.estagio_detalhe) ?? texto(registro.estagio);
        valores.data_notificacao = data(registro.data);
        valores.data_referencia = data(registro.data);
      } else if (destino === 'processos_judiciais') {
        valores.numero = texto(registro.numero) ?? texto(registro.processo);
        valores.tipo = texto(registro.tipo);
        valores.situacao = texto(registro.situacao);
        valores.valor_causa = numero(registro.valor_causa ?? registro.valor);
        valores.data_referencia = data(registro.data);
      } else if (destino === 'distratos') {
        valores.unidade = texto(registro.unidade);
        valores.motivo = texto(registro.motivo);
        valores.categoria =
          texto(registro.categoria) ??
          (registro.tipo === 'Desistência' ? 'desistencia' : 'distrato');
        valores.data_conclusao = data(registro.data);
        valores.data_referencia = data(registro.data);
      } else if (destino === 'contratos') {
        const numeroContrato = texto(registro.numero) ?? texto(registro.contrato);
        valores.numero_contrato = numeroContrato;
        valores.numero_normalizado = numeroContrato
          ? numeroContrato.toUpperCase().replace(/[^A-Z0-9]/g, '')
          : null;
        valores.situacao = texto(registro.situacao);
      } else if (destino === 'unidades') {
        // Unidade exige empreendimento; sem ele o registro não tem onde morar.
        return 'ignorado';
      } else if (destino === 'fatos') {
        valores.titulo = texto(registro.titulo);
        valores.descricao = texto(registro.descricao) ?? texto(registro.texto) ?? '';
        valores.data = data(registro.data);
        if (!valores.descricao) return 'ignorado';
      } else if (destino === 'riscos') {
        valores.contrato_ref = texto(registro.contrato);
        valores.alerta = texto(registro.alerta);
        valores.cronograma = JSON.stringify(registro.cronograma ?? []);
        valores.riscos_lista = JSON.stringify(registro.riscos ?? []);
        valores.recomendacoes = JSON.stringify(registro.recomendacoes ?? []);
      } else if (destino === 'regulatorios') {
        valores.titulo = texto(registro.titulo) ?? texto(registro.nome);
        valores.descricao = texto(registro.descricao);
        valores.checklist = JSON.stringify(registro.checklist ?? []);
        if (!valores.titulo) return 'ignorado';
      }

      const r = await db
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insertInto(destino as any)
        .values(valores as never)
        .onConflict((oc) =>
          oc.columns(['fonte', 'id_origem']).doUpdateSet({
            ...valores,
            atualizado_em: new Date(),
          } as never),
        )
        .returning([sql<boolean>`(xmax = 0)`.as('novo')])
        .executeTakeFirst();

      return r?.novo ? 'incluido' : 'atualizado';
    }

    default:
      return 'ignorado';
  }
}

/**
 * Executa a migração.
 *
 * Retomável: chave já concluída é pulada. Falha numa chave não interrompe as
 * outras nem apaga o que já entrou.
 */
export async function migrar(
  dump: DumpNavegador,
  contexto: ContextoMigracao,
): Promise<ResultadoMigracao> {
  const { id: migracaoId, retomada } = await abrirMigracao(dump, contexto);

  const jaConcluidas = await db
    .selectFrom('migracoes_chaves')
    .select('chave')
    .where('migracao_id', '=', migracaoId)
    .where('concluida', '=', true)
    .execute();

  const pular = new Set(jaConcluidas.map((k) => k.chave));

  await auditar({
    usuarioId: contexto.usuarioId,
    usuarioNome: contexto.usuarioNome,
    sessaoId: contexto.sessaoId ?? null,
    enderecoIp: contexto.enderecoIp ?? null,
    acao: 'importacao_iniciada',
    recurso: 'migracoes_localstorage',
    recursoId: migracaoId,
    modulo: 'administracao',
    detalhe: {
      chaves: Object.keys(dump.chaves).length,
      retomada,
      ja_concluidas: pular.size,
    },
  });

  const totais = zerado();
  let chavesMigradas = 0;
  const erros: Array<{ chave: string; mensagem: string }> = [];

  for (const [chave, bruto] of Object.entries(dump.chaves)) {
    if (chave.startsWith(PREFIXO_PREFERENCIA)) continue;
    if (pular.has(chave)) {
      chavesMigradas++;
      continue;
    }

    const definicao = classificar(chave);
    const { registros, erro } = lerChave(bruto);

    // Classe que não migra: registra a decisão e segue.
    if (definicao.classe !== 'migrar') {
      await db
        .insertInto('migracoes_chaves')
        .values({
          migracao_id: migracaoId,
          chave,
          classe: definicao.classe,
          destino: null,
          registros_lidos: registros.length,
          ignorados: registros.length,
          concluida: true,
          concluida_em: new Date(),
          detalhe: JSON.stringify({ motivo: definicao.motivo ?? null }),
        } as never)
        .onConflict((oc) => oc.columns(['migracao_id', 'chave']).doNothing())
        .execute();

      totais.ignorados += registros.length;
      chavesMigradas++;
      continue;
    }

    // Conteúdo corrompido: registra e segue. Não impede as outras chaves.
    if (erro) {
      erros.push({ chave, mensagem: erro });
      await db
        .insertInto('migracoes_chaves')
        .values({
          migracao_id: migracaoId,
          chave,
          classe: definicao.classe,
          destino: definicao.destino ?? null,
          concluida: false,
          erro,
        } as never)
        .onConflict((oc) =>
          oc.columns(['migracao_id', 'chave']).doUpdateSet({ erro } as never),
        )
        .execute();
      continue;
    }

    const c = await importarChave(migracaoId, chave, definicao, registros, contexto);

    totais.lidos += c.lidos;
    totais.incluidos += c.incluidos;
    totais.atualizados += c.atualizados;
    totais.ignorados += c.ignorados;
    totais.conflitantes += c.conflitantes;
    totais.comErro += c.comErro;
    totais.demonstrativos += c.demonstrativos;

    // Chave só é dada por concluída se nenhum registro dela falhou.
    const concluida = c.comErro === 0;
    if (concluida) chavesMigradas++;

    await db
      .insertInto('migracoes_chaves')
      .values({
        migracao_id: migracaoId,
        chave,
        classe: definicao.classe,
        destino: definicao.destino ?? null,
        registros_lidos: c.lidos,
        incluidos: c.incluidos,
        atualizados: c.atualizados,
        ignorados: c.ignorados,
        conflitantes: c.conflitantes,
        com_erro: c.comErro,
        demonstrativos: c.demonstrativos,
        concluida,
        concluida_em: concluida ? new Date() : null,
      } as never)
      .onConflict((oc) =>
        oc.columns(['migracao_id', 'chave']).doUpdateSet({
          registros_lidos: c.lidos,
          incluidos: c.incluidos,
          atualizados: c.atualizados,
          ignorados: c.ignorados,
          conflitantes: c.conflitantes,
          com_erro: c.comErro,
          demonstrativos: c.demonstrativos,
          concluida,
          concluida_em: concluida ? new Date() : null,
          erro: null,
        } as never),
      )
      .execute();
  }

  // ── 4. Confirmação: relê do banco para provar que persistiu ──────────────
  const gravados = await db
    .selectFrom('migracoes_chaves')
    .select(({ fn }) => [fn.sum<number>('incluidos').as('incluidos')])
    .where('migracao_id', '=', migracaoId)
    .executeTakeFirst();

  const persistiu = Number(gravados?.incluidos ?? 0) > 0 || totais.atualizados > 0;
  const semFalhas = totais.comErro === 0 && erros.length === 0;
  const status = semFalhas ? 'concluida' : totais.incluidos + totais.atualizados > 0 ? 'parcial' : 'erro';

  await db
    .updateTable('migracoes_localstorage')
    .set({
      status,
      finalizada_em: new Date(),
      chaves_migradas: chavesMigradas,
      lidos: totais.lidos,
      incluidos: totais.incluidos,
      atualizados: totais.atualizados,
      ignorados: totais.ignorados,
      conflitantes: totais.conflitantes,
      com_erro: totais.comErro,
      demonstrativos: totais.demonstrativos,
      // Só confirma se realmente persistiu e não houve falha.
      persistencia_confirmada: persistiu && semFalhas,
      erros: JSON.stringify(erros),
      mensagem: erros.length ? `${erros.length} chave(s) com conteudo invalido` : null,
    } as never)
    .where('id', '=', migracaoId)
    .execute();

  await auditar({
    usuarioId: contexto.usuarioId,
    usuarioNome: contexto.usuarioNome,
    sessaoId: contexto.sessaoId ?? null,
    enderecoIp: contexto.enderecoIp ?? null,
    acao: 'importacao_concluida',
    recurso: 'migracoes_localstorage',
    recursoId: migracaoId,
    modulo: 'administracao',
    resultado: status === 'concluida' ? 'sucesso' : 'erro',
    detalhe: { ...totais, status, chaves_migradas: chavesMigradas },
  });

  return relatorio(migracaoId, contexto.usuarioId);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 — Confirmação de remoção
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Autoriza o navegador a apagar as chaves.
 *
 * Só responde `pode_remover` para as chaves cuja persistência foi confirmada.
 * O `CHECK` do banco recusa marcar remoção sem confirmação — a garantia não
 * depende deste código.
 */
export async function confirmarRemocao(
  migracaoId: string,
  contexto: ContextoMigracao,
): Promise<{ pode_remover: string[]; nao_remover: string[]; motivo: string | null }> {
  const migracao = await db
    .selectFrom('migracoes_localstorage')
    .select(['id', 'usuario_id', 'status', 'persistencia_confirmada'])
    .where('id', '=', migracaoId)
    .executeTakeFirst();

  if (!migracao) throw naoEncontrado('Migração não encontrada.');

  // Ninguém confirma remoção da migração de outra pessoa.
  if (migracao.usuario_id !== contexto.usuarioId) {
    throw conflito('Esta migração pertence a outro usuário.');
  }

  if (!migracao.persistencia_confirmada) {
    return {
      pode_remover: [],
      nao_remover: [],
      motivo:
        'A persistência ainda não foi confirmada. Nenhuma chave deve ser removida do navegador.',
    };
  }

  const chaves = await db
    .selectFrom('migracoes_chaves')
    .select(['chave', 'classe', 'concluida', 'com_erro'])
    .where('migracao_id', '=', migracaoId)
    .execute();

  const podeRemover: string[] = [];
  const naoRemover: string[] = [];

  for (const k of chaves) {
    // Classe 'revisao' NUNCA é removida: ninguém olhou ainda.
    if (k.classe === 'revisao') {
      naoRemover.push(k.chave);
      continue;
    }
    if (k.concluida && k.com_erro === 0) podeRemover.push(k.chave);
    else naoRemover.push(k.chave);
  }

  await db
    .updateTable('migracoes_chaves')
    .set({ removida_do_navegador: true })
    .where('migracao_id', '=', migracaoId)
    .where('chave', 'in', podeRemover.length ? podeRemover : [''])
    .execute();

  await db
    .updateTable('migracoes_localstorage')
    .set({ chaves_removidas_em: new Date() })
    .where('id', '=', migracaoId)
    .execute();

  await auditar({
    usuarioId: contexto.usuarioId,
    usuarioNome: contexto.usuarioNome,
    sessaoId: contexto.sessaoId ?? null,
    enderecoIp: contexto.enderecoIp ?? null,
    acao: 'registro_removido',
    recurso: 'migracoes_localstorage',
    recursoId: migracaoId,
    modulo: 'administracao',
    detalhe: { removidas: podeRemover.length, mantidas: naoRemover.length },
  });

  return {
    pode_remover: podeRemover,
    nao_remover: naoRemover,
    motivo: naoRemover.length
      ? 'Chaves em revisão ou com erro permanecem no navegador até decisão humana.'
      : null,
  };
}

/** Relatório completo de uma migração. */
export async function relatorio(
  migracaoId: string,
  usuarioId: string,
): Promise<ResultadoMigracao> {
  const m = await db
    .selectFrom('migracoes_localstorage')
    .selectAll()
    .where('id', '=', migracaoId)
    .executeTakeFirst();

  if (!m) throw naoEncontrado('Migração não encontrada.');
  if (m.usuario_id !== usuarioId) {
    throw conflito('Esta migração pertence a outro usuário.');
  }

  const chaves = await db
    .selectFrom('migracoes_chaves')
    .select([
      'chave', 'classe', 'incluidos', 'atualizados', 'ignorados',
      'conflitantes', 'com_erro', 'concluida', 'erro',
    ])
    .where('migracao_id', '=', migracaoId)
    .orderBy('chave')
    .execute();

  return {
    id: m.id,
    status: m.status,
    chaves_encontradas: m.chaves_encontradas,
    chaves_migradas: m.chaves_migradas,
    lidos: m.lidos,
    incluidos: m.incluidos,
    atualizados: m.atualizados,
    ignorados: m.ignorados,
    conflitantes: m.conflitantes,
    com_erro: m.com_erro,
    demonstrativos: m.demonstrativos,
    persistencia_confirmada: m.persistencia_confirmada,
    pode_remover_chaves: m.persistencia_confirmada,
    chaves,
    mensagem: m.mensagem,
  };
}

/** Migrações do usuário, para a tela de histórico. */
export async function listar(usuarioId: string) {
  return db
    .selectFrom('migracoes_localstorage')
    .select([
      'id', 'iniciada_em', 'finalizada_em', 'status', 'chaves_encontradas',
      'chaves_migradas', 'lidos', 'incluidos', 'atualizados', 'conflitantes',
      'com_erro', 'demonstrativos', 'persistencia_confirmada', 'chaves_removidas_em',
    ])
    .where('usuario_id', '=', usuarioId)
    .orderBy('iniciada_em', 'desc')
    .limit(20)
    .execute();
}

/** Valida uma chave de preferência antes de o cliente gravá-la. */
export function preferenciaPermitida(chave: string): { ok: boolean; motivo?: string } {
  if (!chave.startsWith(PREFIXO_PREFERENCIA)) {
    return {
      ok: false,
      motivo: `Preferência deve usar o prefixo ${PREFIXO_PREFERENCIA}`,
    };
  }
  return { ok: true };
}

export { entradaInvalida };
