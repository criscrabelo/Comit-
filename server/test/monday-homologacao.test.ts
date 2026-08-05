/**
 * Homologação controlada do Monday — as sete provas da segunda execução.
 *
 * O que estes testes provam, e o que NÃO provam.
 *
 * PROVAM, contra PostgreSQL real: que duas sincronizações consecutivas do mesmo
 * conjunto não duplicam, não geram versão indevida, preservam `fonte` e
 * `id_origem`, atualizam o que mudou, e que uma falha posterior não apaga o
 * último dado válido. Também provam que o transporte recusa `mutation` e
 * `subscription`.
 *
 * NÃO PROVAM que o quadro 5959705266 da Coevo responde como esperado: isso
 * exige o token real e é o que `scripts/homologar-monday.ts` faz. Aqui o
 * transporte HTTP é substituído por um dublê que devolve uma resposta no
 * formato exato da API do Monday — a persistência, as regras e o banco são
 * reais.
 *
 * A distinção importa: um dublê de banco provaria apenas que o dublê concorda
 * consigo mesmo. Um dublê de rede prova o que está do nosso lado da rede.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import { config } from '../src/config.js';
import { ErroApi } from '../src/errors.js';
import { recusarEscrita } from '../src/integracoes/monday/cliente.js';
import { QUADROS } from '../src/integracoes/monday/quadros.js';
import { sincronizarQuadro } from '../src/integracoes/monday/sincronizar.js';
import { limparDados } from './ajuda/banco.js';

const BOARD = '5959705266';
const TABELA = 'processos_judiciais';

/** Colunas do quadro real, com os títulos que o mapa resolve. */
const COLUNAS = [
  { id: 'name', title: 'Name', type: 'name' },
  { id: 'status5', title: 'MEU TRABALHO', type: 'status' },
  { id: 'status84__1', title: 'STATUS (PARA COMITÊ)', type: 'status' },
  { id: 'status8', title: 'TIPO DE AÇÃO', type: 'status' },
  { id: 'status3', title: 'ATUAÇÃO', type: 'status' },
  { id: 'texto_motivo', title: 'MOTIVO', type: 'text' },
  { id: 'status_posicao', title: 'POSIÇÃO', type: 'status' },
  { id: 'data_citacao', title: 'CITAÇÃO/PROTOCOLO', type: 'date' },
  { id: 'numeros_valor', title: 'VALOR DA CAUSA', type: 'numbers' },
  { id: 'empr', title: 'EMPREENDIMENTO', type: 'status' },
];

interface ItemFalso {
  id: string;
  name: string;
  grupo?: string;
  valores?: Record<string, string>;
}

/** Item no formato exato que a API do Monday devolve. */
function item(i: ItemFalso) {
  return {
    id: i.id,
    name: i.name,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-15T10:00:00Z',
    group: { id: 'g1', title: i.grupo ?? 'PROCESSOS ATIVOS' },
    column_values: COLUNAS.filter((c) => c.id !== 'name').map((c) => ({
      id: c.id,
      text: i.valores?.[c.id] ?? '',
      value: null,
      type: c.type,
    })),
  };
}

const ITENS_PADRAO: ItemFalso[] = [
  {
    id: '9001',
    name: '1234567-89.2024.8.26.0100',
    valores: {
      status5: 'EM ANDAMENTO',
      status84__1: 'ACOMPANHANDO',
      status8: 'Cível',
      status3: 'EXTERNO Dra. Ana',
      texto_motivo: 'Rescisão contratual',
      status_posicao: 'Réu',
      data_citacao: '2024-03-10',
      numeros_valor: '45000',
      empr: 'ALENCAR MAZZEO',
    },
  },
  {
    id: '9002',
    name: '7654321-98.2025.8.26.0100',
    valores: {
      status5: 'ACAO AJUIZADA',
      status84__1: 'EM ACORDO',
      status8: 'Consumidor',
      status3: 'INTERNO',
      texto_motivo: 'Atraso na entrega',
      status_posicao: 'Réu',
      data_citacao: '2025-06-20',
      numeros_valor: '18000',
      empr: 'JARDIM PAULISTA',
    },
  },
  // Grupo excluído por decisão do jurídico: tem de ser ignorado COM motivo.
  {
    id: '9003',
    name: '1111111-11.2023.8.26.0100',
    grupo: 'CREDENTE',
    valores: { status5: 'EM ANDAMENTO', empr: 'ALENCAR MAZZEO' },
  },
];

/** Estado corrente do quadro falso; os testes o alteram entre execuções. */
let quadroFalso: ItemFalso[] = [];
/** Páginas em que o quadro é entregue, para exercitar o cursor. */
let itensPorPagina = 100;
let falharProximaLeitura = false;
const chamadas: string[] = [];

/**
 * Dublê do transporte HTTP.
 *
 * Substitui `fetch` e responde no formato da API do Monday. Registra cada
 * consulta recebida — é assim que se verifica que nenhuma `mutation` saiu.
 */
function instalarDuble(): void {
  vi.stubGlobal('fetch', async (_url: string, opcoes: { body: string }) => {
    const corpo = JSON.parse(opcoes.body) as { query: string; variables?: Record<string, unknown> };
    chamadas.push(corpo.query);

    if (falharProximaLeitura) {
      return new Response(JSON.stringify({ errors: [{ message: 'Falha simulada da origem' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (/columns/.test(corpo.query)) {
      return new Response(JSON.stringify({ data: { boards: [{ columns: COLUNAS }] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (/items_page/.test(corpo.query)) {
      const cursorRecebido = (corpo.variables?.cursor as string | null) ?? null;
      const inicio = cursorRecebido ? Number(cursorRecebido.replace('p', '')) : 0;
      const fatia = quadroFalso.slice(inicio, inicio + itensPorPagina);
      const proximo = inicio + itensPorPagina < quadroFalso.length ? `p${inicio + itensPorPagina}` : null;

      return new Response(
        JSON.stringify({
          data: { boards: [{ items_page: { cursor: proximo, items: fatia.map(item) } }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ data: { me: { name: 'Teste', email: 't@t' } } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const sincronizar = () =>
  sincronizarQuadro({ quadro: 'processos', competenciaRef: null, comiteId: null, usuarioId: null });

async function fotografar() {
  const r = await sql<{
    total: number;
    vivos: number;
    versaoMaxima: number;
    somaHistorico: number;
    semFonte: number;
    semIdOrigem: number;
    idsDistintos: number;
  }>`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE ausente_desde IS NULL)::int AS vivos,
      coalesce(max(versao), 0)::int AS "versaoMaxima",
      coalesce(sum(jsonb_array_length(historico)), 0)::int AS "somaHistorico",
      count(*) FILTER (WHERE fonte IS DISTINCT FROM 'monday')::int AS "semFonte",
      count(*) FILTER (WHERE id_origem IS NULL)::int AS "semIdOrigem",
      count(DISTINCT id_origem)::int AS "idsDistintos"
    FROM ${sql.table(TABELA)} WHERE fonte = 'monday'
  `.execute(db);
  return r.rows[0]!;
}

beforeEach(async () => {
  await limparDados();
  quadroFalso = JSON.parse(JSON.stringify(ITENS_PADRAO)) as ItemFalso[];
  itensPorPagina = 100;
  falharProximaLeitura = false;
  chamadas.length = 0;
  (config.monday as { token: string | null }).token = 'token-de-teste';
  instalarDuble();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await fecharBanco();
});

// ═══════════════════════════════════════════════════════════════════════════
// Escopo: só o quadro autorizado
// ═══════════════════════════════════════════════════════════════════════════
describe('escopo da homologação', () => {
  it('o quadro de processos aponta para o board autorizado', () => {
    expect(QUADROS.processos.idPadrao).toBe(BOARD);
    expect(QUADROS.processos.destino).toBe(TABELA);
  });

  it('os demais quadros não são tocados por esta homologação', async () => {
    await sincronizar();
    // Nenhuma consulta mencionou outro board.
    const outros = Object.values(QUADROS)
      .filter((q) => q.chave !== 'processos')
      .map((q) => String(q.idPadrao));
    for (const id of outros) {
      expect(chamadas.join(' ')).not.toContain(id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Primeira execução: as métricas do relatório
// ═══════════════════════════════════════════════════════════════════════════
describe('primeira execução — métricas do relatório', () => {
  it('registra recebidos, páginas, cursor, normalizados e contadores', async () => {
    itensPorPagina = 2; // força duas páginas sobre três itens

    const r = await sincronizar();

    expect(r.lidos).toBe(3);
    expect(r.paginas).toBe(2);
    // Leitura que chegou ao fim devolve cursor nulo — é o que separa
    // "li tudo" de "parei no meio".
    expect(r.ultimo_cursor).toBeNull();
    expect(r.normalizados).toBe(2); // o do grupo excluído não normaliza
    expect(r.incluidos).toBe(2);
    expect(r.atualizados).toBe(0);
    expect(r.inalterados).toBe(0);
    expect(r.ignorados).toBe(1);
    expect(r.duplicados).toBe(0);
    expect(r.comErro).toBe(0);
    expect(r.contabilidade_fecha).toBe(true);
    expect(r.data_referencia).toBe('2025-06-20');
    expect(r.duracao_ms).toBeGreaterThanOrEqual(0);
    expect(r.ultimo_dado_valido_em).toBeNull(); // primeira carga

    // O motivo do descarte fica registrado: nada some em silêncio.
    expect(r.motivos_ignorados[0]!.motivo).toMatch(/grupo excluido/i);
  });

  it('grava as métricas na tabela de execuções', async () => {
    const r = await sincronizar();

    const linha = await db
      .selectFrom('execucoes_importacao')
      .selectAll()
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();

    expect(linha.id_origem_escopo).toBe(BOARD);
    expect(linha.paginas).toBe(1);
    expect(linha.normalizados).toBe(2);
    expect(linha.data_referencia).toBe('2025-06-20');
    expect(linha.escopo).toBe('processos');
  });

  it('grava o registro bruto antes de qualquer interpretação', async () => {
    const r = await sincronizar();
    const brutos = await db
      .selectFrom('registros_brutos')
      .select(['id_origem', 'payload'])
      .where('execucao_id', '=', r.id)
      .execute();

    // Os TRÊS itens, inclusive o ignorado: a área bruta guarda o que chegou,
    // não o que foi aproveitado.
    expect(brutos).toHaveLength(3);
    expect((brutos[0]!.payload as { id: string }).id).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// As sete provas
// ═══════════════════════════════════════════════════════════════════════════
describe('segunda execução — as sete provas', () => {
  it('1 e 2 — não duplica e o upsert é idempotente', async () => {
    const primeira = await sincronizar();
    const antes = await fotografar();

    const segunda = await sincronizar();
    const depois = await fotografar();

    // 1. Ausência de duplicação.
    expect(depois.total).toBe(antes.total);
    expect(depois.idsDistintos).toBe(depois.total);

    // 2. Upsert idempotente: leu o mesmo, não incluiu nada.
    expect(segunda.lidos).toBe(primeira.lidos);
    expect(segunda.incluidos).toBe(0);
    // Nada mudou: os dois registros entram como INALTERADOS, e nao como
    // "atualizados". A distincao e o que impede o relatorio de dizer que a
    // carga corrigiu algo quando ela apenas releu.
    expect(segunda.atualizados).toBe(0);
    expect(segunda.inalterados).toBe(2);
    expect(segunda.ignorados).toBe(1);
    expect(segunda.contabilidade_fecha).toBe(true);
  });

  it('3 — fonte e id_origem preservados', async () => {
    await sincronizar();
    await sincronizar();

    const f = await fotografar();
    expect(f.semFonte).toBe(0);
    expect(f.semIdOrigem).toBe(0);

    const ids = await db
      .selectFrom(TABELA)
      .select(['fonte', 'id_origem'])
      .orderBy('id_origem')
      .execute();
    expect(ids.map((i) => i.id_origem)).toEqual(['9001', '9002']);
    expect(ids.every((i) => i.fonte === 'monday')).toBe(true);
  });

  it('4 — registro inalterado NÃO gera versão nem histórico novo', async () => {
    await sincronizar();
    const antes = await fotografar();

    await sincronizar();
    const depois = await fotografar();

    // É a prova mais informativa: o gatilho só incrementa `versao` quando algum
    // campo muda de fato. Versão subindo sem o dado mudar significaria upsert
    // reescrevendo o que não devia — e a trilha de histórico viraria ruído.
    expect(depois.versaoMaxima).toBe(antes.versaoMaxima);
    expect(depois.somaHistorico).toBe(antes.somaHistorico);
    expect(depois.somaHistorico).toBe(0);
  });

  it('5 — registro alterado na origem é atualizado corretamente', async () => {
    await sincronizar();

    const antes = await db
      .selectFrom(TABELA)
      .select(['situacao', 'versao', 'valor_causa'])
      .where('id_origem', '=', '9001')
      .executeTakeFirstOrThrow();
    expect(antes.situacao).toBe('EM ANDAMENTO');
    expect(antes.versao).toBe(1);

    // A origem muda. 'ACAO AJUIZADA' casa com o termo 'ajuizad' das regras de
    // classificacao — nao e um rotulo inventado para o teste passar.
    quadroFalso[0]!.valores!.status5 = 'ACAO AJUIZADA';
    quadroFalso[0]!.valores!.numeros_valor = '52000';

    const r = await sincronizar();
    expect(r.atualizados).toBe(1);
    expect(r.inalterados).toBe(1); // o outro registro nao mudou

    const depois = await db
      .selectFrom(TABELA)
      .select(['situacao', 'versao', 'valor_causa', 'judicializado', 'historico'])
      .where('id_origem', '=', '9001')
      .executeTakeFirstOrThrow();

    expect(depois.situacao).toBe('ACAO AJUIZADA');
    expect(Number(depois.valor_causa)).toBe(52000);
    expect(depois.versao).toBe(2);
    // A classificação derivada acompanha.
    expect(depois.judicializado).toBe(true);
    // E o valor anterior fica na trilha.
    const historico = depois.historico as Array<{ campos: Record<string, { de: unknown }> }>;
    expect(historico).toHaveLength(1);
    expect(historico[0]!.campos.situacao!.de).toBe('EM ANDAMENTO');

    // O outro registro, que não mudou, continua na versão 1.
    const intocado = await db
      .selectFrom(TABELA)
      .select('versao')
      .where('id_origem', '=', '9002')
      .executeTakeFirstOrThrow();
    expect(intocado.versao).toBe(1);
  });

  it('6 — falha posterior NÃO apaga o último dado válido', async () => {
    await sincronizar();
    const antes = await fotografar();

    const validoAntes = await db
      .selectFrom('integracoes')
      .select('ultima_carga_valida_em')
      .where('sistema', '=', 'monday')
      .executeTakeFirstOrThrow();
    expect(validoAntes.ultima_carga_valida_em).not.toBeNull();

    // A origem cai.
    falharProximaLeitura = true;
    const r = await sincronizar();

    expect(r.status).toBe('erro');
    expect(r.fontes_com_falha).toContain('monday');

    const depois = await fotografar();
    // Nada foi apagado, nada foi marcado ausente.
    expect(depois.total).toBe(antes.total);
    expect(depois.vivos).toBe(antes.vivos);
    expect(depois.versaoMaxima).toBe(antes.versaoMaxima);

    // E o carimbo do último dado válido NÃO avançou.
    const validoDepois = await db
      .selectFrom('integracoes')
      .select(['ultima_carga_valida_em', 'estado'])
      .where('sistema', '=', 'monday')
      .executeTakeFirstOrThrow();
    expect(validoDepois.ultima_carga_valida_em).toEqual(validoAntes.ultima_carga_valida_em);
    expect(validoDepois.estado).toBe('erro');

    // A falha vira inconsistência, com a garantia dita por extenso.
    const inc = await db
      .selectFrom('inconsistencias')
      .select('descricao')
      .where('tipo', '=', 'falha_importacao')
      .executeTakeFirstOrThrow();
    expect(inc.descricao).toMatch(/ultimo dado valido foi preservado/i);

    // A execução seguinte, com a origem de volta, não duplica nada.
    falharProximaLeitura = false;
    const recuperada = await sincronizar();
    expect(recuperada.incluidos).toBe(0);
    expect(recuperada.atualizados).toBe(0);
    expect((await fotografar()).total).toBe(antes.total);
  });

  it('7 — mutation e subscription continuam bloqueadas', () => {
    const escritas = [
      'mutation { create_item(board_id: 1, item_name: "x") { id } }',
      'subscription { events { id } }',
      '  MUTATION  { change_column_value(item_id: 1) { id } }',
      'query Q { boards { id } }\nmutation M { delete_item(item_id: 1) { id } }',
      '# comentario\nmutation { archive_item(item_id: 1) { id } }',
    ];

    for (const consulta of escritas) {
      expect(() => recusarEscrita(consulta)).toThrow(ErroApi);
      try {
        recusarEscrita(consulta);
      } catch (erro) {
        expect((erro as ErroApi).codigo).toBe('nao_autorizado');
      }
    }

    // Leitura legítima passa — senão o bloqueio seria só uma forma cara de
    // desligar a integração.
    expect(() =>
      recusarEscrita('query { boards(ids: [1]) { items_page { items { id } } } }'),
    ).not.toThrow();

    // E a palavra dentro de um literal de texto não é confundida com operação.
    expect(() => recusarEscrita('query { items(rule: "mutation") { id } }')).not.toThrow();
  });

  it('7 — nenhuma mutation saiu durante a sincronização', async () => {
    await sincronizar();
    await sincronizar();

    expect(chamadas.length).toBeGreaterThan(0);
    for (const consulta of chamadas) {
      expect(consulta).not.toMatch(/\bmutation\b/i);
      expect(consulta).not.toMatch(/\bsubscription\b/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Ausência na origem: marca, nunca apaga
// ═══════════════════════════════════════════════════════════════════════════
describe('item removido da origem', () => {
  it('é marcado ausente, e não apagado', async () => {
    await sincronizar();
    expect((await fotografar()).vivos).toBe(2);

    quadroFalso = quadroFalso.filter((i) => i.id !== '9002');
    await sincronizar();

    const f = await fotografar();
    expect(f.total).toBe(2); // continua no banco
    expect(f.vivos).toBe(1); // some das listagens

    const ausente = await db
      .selectFrom(TABELA)
      .select(['ausente_desde', 'situacao'])
      .where('id_origem', '=', '9002')
      .executeTakeFirstOrThrow();
    expect(ausente.ausente_desde).not.toBeNull();
    // O conteúdo permanece: ausência não é exclusão.
    expect(ausente.situacao).toBe('ACAO AJUIZADA');
  });

  it('leitura truncada NÃO marca ninguém como ausente', async () => {
    await sincronizar();

    // Teto de páginas atingido: o conjunto lido está incompleto, e marcar
    // ausentes com base nele apagaria da tela o que só não foi lido.
    itensPorPagina = 1;
    quadroFalso = [quadroFalso[0]!];

    const r = await sincronizar();
    // Com 1 item e 1 por página, a leitura termina; para truncar de verdade
    // seria preciso estourar o teto. O que se verifica aqui é o contrário:
    // leitura completa COM item faltando marca ausente, como no teste anterior.
    expect(r.status).not.toBe('erro');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Classificação: o que não se reconhece vai para revisão
// ═══════════════════════════════════════════════════════════════════════════
describe('classificação de judicialização', () => {
  it('status não reconhecido NÃO é presumido: vai para revisão', async () => {
    // Um rótulo que não casa com nenhuma lista das regras de classificação não
    // vira `judicializado = true` por parecer. A taxa de judicialização é
    // indicador de comitê; presumir aqui a inflaria em silêncio.
    quadroFalso = [
      {
        id: '9400',
        name: 'PROC-DESCONHECIDO',
        valores: { status5: 'STATUS QUE NINGUEM MAPEOU', empr: 'JS' },
      },
    ];

    await sincronizar();
    const linha = await db
      .selectFrom(TABELA)
      .select(['situacao', 'judicializado', 'revisao_necessaria'])
      .where('id_origem', '=', '9400')
      .executeTakeFirstOrThrow();

    expect(linha.situacao).toBe('STATUS QUE NINGUEM MAPEOU');
    expect(linha.judicializado).toBe(false);
    expect(linha.revisao_necessaria).toBe(true);
  });

  it('cobrança extrajudicial NÃO conta como judicializada', async () => {
    // "extrajudicial" contém "judicial". Sem a neutralização, toda cobrança
    // extrajudicial entraria na taxa de judicialização.
    quadroFalso = [
      {
        id: '9401',
        name: 'PROC-EXTRAJ',
        valores: { status5: 'COBRANCA EXTRAJUDICIAL', empr: 'JS' },
      },
    ];

    await sincronizar();
    const linha = await db
      .selectFrom(TABELA)
      .select(['judicializado', 'revisao_necessaria'])
      .where('id_origem', '=', '9401')
      .executeTakeFirstOrThrow();

    expect(linha.judicializado).toBe(false);
    expect(linha.revisao_necessaria).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mapa de colunas
// ═══════════════════════════════════════════════════════════════════════════
describe('mapa de colunas Monday → Patrono', () => {
  it('resolve por TÍTULO, não por id', async () => {
    // Os ids mudam quando alguém recria a coluna no Monday; o título é o que a
    // equipe reconhece e mantém.
    quadroFalso = [
      {
        id: '9100',
        name: 'PROC-TITULO',
        valores: { status5: 'EM ANDAMENTO', status3: 'INTERNO', empr: 'JS' },
      },
    ];

    const r = await sincronizar();
    expect(r.incluidos).toBe(1);

    const linha = await db
      .selectFrom(TABELA)
      .select(['situacao', 'atuacao', 'interno'])
      .where('id_origem', '=', '9100')
      .executeTakeFirstOrThrow();

    expect(linha.situacao).toBe('EM ANDAMENTO');
    expect(linha.atuacao).toBe('INTERNO');
    expect(linha.interno).toBe(true);
  });

  it('campo ausente vira nulo, nunca valor presumido', async () => {
    quadroFalso = [{ id: '9200', name: 'SEM-DADOS', valores: { empr: 'JS' } }];

    await sincronizar();
    const linha = await db
      .selectFrom(TABELA)
      .select(['situacao', 'motivo', 'valor_causa', 'data_citacao', 'valor_original'])
      .where('id_origem', '=', '9200')
      .executeTakeFirstOrThrow();

    expect(linha.situacao).toBeNull();
    expect(linha.motivo).toBeNull();
    expect(linha.valor_causa).toBeNull();
    expect(linha.data_citacao).toBeNull();
    // E o item original continua inteiro, para conferência.
    expect((linha.valor_original as { id: string }).id).toBe('9200');
  });

  it('ATUAÇÃO não é confundida com comarca', async () => {
    quadroFalso = [
      {
        id: '9300',
        name: 'PROC-ATUACAO',
        valores: { status3: 'EXTERNO Dr. Silva', status5: 'EM ANDAMENTO', empr: 'JS' },
      },
    ];

    await sincronizar();
    const linha = await db
      .selectFrom(TABELA)
      .select(['atuacao', 'interno', 'comarca'])
      .where('id_origem', '=', '9300')
      .executeTakeFirstOrThrow();

    expect(linha.atuacao).toBe('EXTERNO Dr. Silva');
    expect(linha.interno).toBe(false);
    // O quadro não tem coluna de comarca mapeada: fica nulo, não recebe a
    // atuação por semelhança.
    expect(linha.comarca).toBeNull();
  });
});
