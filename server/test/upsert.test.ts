/**
 * Persistencia idempotente, contra PostgreSQL real.
 *
 * Estes sao os testes obrigatorios do plano da Fase 1:
 *   - execucao duplicada nao duplica registros
 *   - falha de uma fonte nao apaga dados anteriores
 *   - reprocessamento preserva o valor original
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import { iniciarExecucao } from '../src/integracoes/execucoes.js';
import {
  marcarAusentes,
  persistirLote,
  separarDuplicados,
  upsertLote,
  type RegistroParaUpsert,
} from '../src/integracoes/upsert.js';
import { contar, criarComite, criarEmpreendimento, limparDados } from './ajuda/banco.js';

const notificacao = (
  idOrigem: string,
  extra: Record<string, unknown> = {},
): RegistroParaUpsert => ({
  idOrigem,
  campos: {
    cliente_nome: `Cliente ${idOrigem}`,
    estagio: 'Em Andamento',
    ...extra,
  },
  valorOriginal: { id: idOrigem, name: `Cliente ${idOrigem}`, bruto: true },
  dataReferencia: '2026-07-31',
});

let comiteId: string;
let competenciaRef: string;

beforeAll(async () => {
  const c = await criarComite('2026-07');
  comiteId = c.comiteId;
  competenciaRef = c.competenciaRef;
});

beforeEach(async () => {
  await limparDados();
  const c = await criarComite('2026-07');
  comiteId = c.comiteId;
  competenciaRef = c.competenciaRef;
});

afterAll(async () => {
  await fecharBanco();
});

describe('separarDuplicados', () => {
  it('separa id_origem repetido no mesmo lote', () => {
    // Duas linhas com o mesmo id na mesma carga indicam problema na origem.
    // Sem detectar, o upsert sobrescreveria a primeira e ninguem saberia.
    const { unicos, duplicados } = separarDuplicados([
      notificacao('a'),
      notificacao('b'),
      notificacao('a'),
    ]);
    expect(unicos).toHaveLength(2);
    expect(duplicados).toHaveLength(1);
    expect(duplicados[0]!.idOrigem).toBe('a');
  });
});

describe('upsert idempotente', () => {
  it('executar duas vezes nao duplica registros', async () => {
    const execucao1 = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });
    const lote = [notificacao('item-1'), notificacao('item-2'), notificacao('item-3')];

    const primeira = await upsertLote('notificacoes', 'monday', lote, {
      execucaoId: execucao1.id,
    });
    expect(primeira.incluidos).toBe(3);
    expect(primeira.atualizados).toBe(0);
    expect(await contar('notificacoes')).toBe(3);

    // Mesma carga, execucao nova: reconhece, nao insere e nao altera.
    //
    // `atualizados` conta o que MUDOU de fato. Antes contava toda linha que
    // passasse pelo caminho de conflito, e uma releitura identica reportava o
    // conjunto inteiro como atualizado — metrica que nao dizia nada.
    const execucao2 = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });
    const segunda = await upsertLote('notificacoes', 'monday', lote, {
      execucaoId: execucao2.id,
    });
    expect(segunda.incluidos).toBe(0);
    expect(segunda.atualizados).toBe(0);
    expect(segunda.inalterados).toBe(3);
    expect(await contar('notificacoes')).toBe(3);

    // E nenhuma versao foi consumida: releitura identica nao gera versao.
    const versoes = await sql<{ maxima: number; historico: number }>`
      SELECT coalesce(max(versao), 0)::int AS maxima,
             coalesce(sum(jsonb_array_length(historico)), 0)::int AS historico
      FROM notificacoes
    `.execute(db);
    expect(versoes.rows[0]!.maxima).toBe(1);
    expect(versoes.rows[0]!.historico).toBe(0);
  });

  it('preserva o valor original da fonte e registra a trilha ao mudar', async () => {
    const execucao = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });

    await upsertLote('notificacoes', 'monday', [notificacao('item-1')], {
      execucaoId: execucao.id,
    });

    // Segunda carga com o estagio mudado.
    const execucao2 = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });
    await upsertLote(
      'notificacoes',
      'monday',
      [notificacao('item-1', { estagio: 'Resolvida' })],
      { execucaoId: execucao2.id },
    );

    const linha = await db
      .selectFrom('notificacoes')
      .select(['estagio', 'valor_original', 'historico'])
      .where('id_origem', '=', 'item-1')
      .executeTakeFirstOrThrow();

    expect(linha.estagio).toBe('Resolvida');
    // O bruto da fonte continua la.
    expect((linha.valor_original as { bruto: boolean }).bruto).toBe(true);

    // A trilha registrou a mudanca de estagio, com o valor anterior.
    const historico = linha.historico as Array<{ campos: Record<string, { de: unknown; para: unknown }> }>;
    expect(historico.length).toBeGreaterThanOrEqual(1);
    const mudancaEstagio = historico.find((h) => 'estagio' in h.campos);
    expect(mudancaEstagio?.campos.estagio).toEqual({
      de: 'Em Andamento',
      para: 'Resolvida',
    });
  });

  it('idempotencia vale por fonte: mesma id_origem de fontes diferentes coexiste', async () => {
    const execucao = await iniciarExecucao({ fonte: 'monday' });
    await upsertLote('notificacoes', 'monday', [notificacao('123')], {
      execucaoId: execucao.id,
    });
    await upsertLote('notificacoes', 'sienge', [notificacao('123')], {
      execucaoId: execucao.id,
    });

    // O mesmo numero pode existir nos dois sistemas significando coisas
    // diferentes; unificar por id seria erro.
    expect(await contar('notificacoes')).toBe(2);
  });
});

describe('falha nao apaga o ultimo dado valido', () => {
  it('registro ausente na carga e MARCADO, nunca removido', async () => {
    const execucao = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });
    await upsertLote(
      'notificacoes',
      'monday',
      [
        notificacao('item-1', { comite_id: comiteId, competencia_ref: competenciaRef }),
        notificacao('item-2', { comite_id: comiteId, competencia_ref: competenciaRef }),
        notificacao('item-3', { comite_id: comiteId, competencia_ref: competenciaRef }),
      ],
      { execucaoId: execucao.id },
    );
    expect(await contar('notificacoes')).toBe(3);

    // Carga seguinte traz so dois. O terceiro NAO pode desaparecer.
    const marcados = await marcarAusentes('notificacoes', 'monday', ['item-1', 'item-2'], {
      comiteId,
    });

    expect(marcados).toBe(1);
    // Continua existindo: 3 linhas, nao 2.
    expect(await contar('notificacoes')).toBe(3);
    expect(await contar('notificacoes', 'ausente_desde IS NOT NULL')).toBe(1);

    const ausente = await db
      .selectFrom('notificacoes')
      .select(['id_origem', 'ausente_desde', 'cliente_nome'])
      .where('ausente_desde', 'is not', null)
      .executeTakeFirstOrThrow();
    expect(ausente.id_origem).toBe('item-3');
    // O dado em si segue intacto.
    expect(ausente.cliente_nome).toBe('Cliente item-3');
  });

  it('registro que volta a aparecer deixa de estar ausente', async () => {
    const execucao = await iniciarExecucao({ fonte: 'monday' });
    await upsertLote('notificacoes', 'monday', [notificacao('item-1')], {
      execucaoId: execucao.id,
    });
    await marcarAusentes('notificacoes', 'monday', []);
    expect(await contar('notificacoes', 'ausente_desde IS NOT NULL')).toBe(1);

    const execucao2 = await iniciarExecucao({ fonte: 'monday' });
    await upsertLote('notificacoes', 'monday', [notificacao('item-1')], {
      execucaoId: execucao2.id,
    });
    expect(await contar('notificacoes', 'ausente_desde IS NOT NULL')).toBe(0);
  });

  it('marcacao de ausencia respeita o recorte da carga', async () => {
    // Sincronizar julho nao pode marcar junho como ausente.
    const junho = await criarComite('2026-06');
    const execucao = await iniciarExecucao({ fonte: 'monday' });

    await upsertLote(
      'notificacoes',
      'monday',
      [
        notificacao('jun-1', { comite_id: junho.comiteId, competencia_ref: junho.competenciaRef }),
        notificacao('jul-1', { comite_id: comiteId, competencia_ref: competenciaRef }),
      ],
      { execucaoId: execucao.id },
    );

    // Carga de julho que nao trouxe jul-1.
    const marcados = await marcarAusentes('notificacoes', 'monday', [], {
      comiteId,
    });

    expect(marcados).toBe(1);
    const junhoIntacto = await db
      .selectFrom('notificacoes')
      .select('ausente_desde')
      .where('id_origem', '=', 'jun-1')
      .executeTakeFirstOrThrow();
    expect(junhoIntacto.ausente_desde).toBeNull();
  });
});

describe('contabilidade da execucao', () => {
  it('contadores fecham com o total lido', async () => {
    const execucao = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });

    const lote = [notificacao('a'), notificacao('b'), notificacao('a')];
    execucao.registrarLidos(lote.length);
    await persistirLote('notificacoes', 'monday', lote, execucao);
    // Um item que a regra de negocio descartou.
    execucao.registrarLidos(1);
    execucao.registrarIgnorado('grupo excluido do comite', 'item-x');

    const resumo = await execucao.finalizar();

    expect(resumo.lidos).toBe(4);
    expect(resumo.incluidos).toBe(2);
    expect(resumo.duplicados).toBe(1);
    expect(resumo.ignorados).toBe(1);
    // incluidos + atualizados + ignorados + duplicados + erro == lidos
    expect(resumo.contabilidade_fecha).toBe(true);
    expect(resumo.status).toBe('sucesso');
    // Os ignorados sao explicaveis, nao descartados em silencio.
    expect(resumo.motivos_ignorados[0]).toMatchObject({
      motivo: 'grupo excluido do comite',
      quantidade: 1,
    });
  });

  it('falha de fonte marca carga parcial e nao avanca a ultima carga valida', async () => {
    const execucao = await iniciarExecucao({ fonte: 'monday' });
    execucao.registrarLidos(2);
    await persistirLote('notificacoes', 'monday', [notificacao('a'), notificacao('b')], execucao);
    execucao.marcarFalhaDeFonte('monday', 'quadro de honorarios indisponivel');

    const resumo = await execucao.finalizar();

    expect(resumo.status).toBe('parcial');
    expect(resumo.parcial).toBe(true);
    expect(resumo.fontes_com_falha).toContain('monday');

    const integracao = await db
      .selectFrom('integracoes')
      .select(['estado', 'ultima_carga_em', 'ultima_carga_valida_em'])
      .where('sistema', '=', 'monday')
      .executeTakeFirstOrThrow();

    expect(integracao.estado).toBe('parcial');
    expect(integracao.ultima_carga_em).not.toBeNull();
    // O ponto: carga parcial NAO conta como valida. E isto que permite a
    // interface dizer "ultimo dado valido de <data>" com honestidade.
    expect(integracao.ultima_carga_valida_em).toBeNull();
  });

  it('carga completa avanca a ultima carga valida', async () => {
    const execucao = await iniciarExecucao({ fonte: 'monday' });
    execucao.registrarLidos(1);
    await persistirLote('notificacoes', 'monday', [notificacao('a')], execucao);
    const resumo = await execucao.finalizar();

    expect(resumo.status).toBe('sucesso');
    const integracao = await db
      .selectFrom('integracoes')
      .select(['estado', 'ultima_carga_valida_em'])
      .where('sistema', '=', 'monday')
      .executeTakeFirstOrThrow();
    expect(integracao.estado).toBe('concluida');
    expect(integracao.ultima_carga_valida_em).not.toBeNull();
  });
});

describe('area bruta', () => {
  it('payload original fica gravado e e imutavel', async () => {
    const execucao = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });
    const { gravarBruto } = await import('../src/integracoes/execucoes.js');

    await gravarBruto(execucao.id, 'monday', 'notificacoes', [
      { idOrigem: 'item-1', payload: { id: 'item-1', valor: 'original' } },
    ]);

    expect(await contar('registros_brutos')).toBe(1);

    // Reprocessar precisa poder reler a fonte sem chamar a API de novo — por
    // isso a area bruta nao pode ser alterada nem apagada.
    await expect(
      db.updateTable('registros_brutos').set({ escopo: 'outro' }).execute(),
    ).rejects.toThrow(/imutavel/i);

    await expect(db.deleteFrom('registros_brutos').execute()).rejects.toThrow(/imutavel/i);
  });
});
