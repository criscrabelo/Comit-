/**
 * Os defeitos que a homologação real do board 5630368737 revelou.
 *
 * Os três apareceram só contra o quadro vivo, e nenhum deles podia aparecer na
 * homologação de Processos Judiciais:
 *
 *  1. **Competência derivada nunca era criada.** `competencia_ref` é chave
 *     estrangeira para `competencias(ref)`, e nada no fluxo de ingestão criava a
 *     linha. Em processos o campo ficava nulo — os grupos daquele quadro
 *     (`CJ (REGRESSO)`, `TETUS LOCAÇÃO`) não derivam competência, e nulo não
 *     viola chave estrangeira. Em notificações os grupos são meses, a
 *     competência é derivada de cada um, e o banco recusou a carga inteira:
 *     1072 itens lidos, 0 gravados.
 *
 *  2. **Três colunas do mapa não existiam com aqueles títulos.** O board usa
 *     `MODELOS DE NOTIFICAÇÃO` (plural), `TOTAL DIAS` (sem o "DE") e
 *     `RESOLUÇÃO` como data de solução. Sem isso, `modelo`, `total_dias` e
 *     `data_solucao` ficariam nulos nos 1072 registros — sem erro nenhum, como
 *     `situacao` ficou nula nos 250 processos antes da correção de aspas.
 *
 *  3. **Dois títulos iguais no mesmo quadro.** O board tem DUAS colunas
 *     chamadas `'MEU TRABALHO'`: uma `date` quase toda vazia e uma `status` com
 *     ACOMPANHANDO/FEITO. A resolução por título desempatava em silêncio.
 *
 * A persistência e o banco são reais; só o transporte HTTP é dublê.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import {
  QUADROS,
  resolverMapa,
  titulosAmbiguos,
  montarMapaColunas,
  resolverColuna,
} from '../src/integracoes/monday/quadros.js';
import { sincronizarQuadro } from '../src/integracoes/monday/sincronizar.js';
import { limparDados } from './ajuda/banco.js';

const BOARD = '5630368737';

/**
 * Colunas do board 5630368737, como a API as devolveu em 06/08/2026.
 *
 * Inclui as duas `'MEU TRABALHO'` e os títulos que o mapa antigo não achava.
 */
const COLUNAS_REAIS = [
  { id: 'name', title: 'Name', type: 'name' },
  { id: 'texto', title: 'CLIENTE', type: 'text' },
  { id: 'nome_m_s', title: "'MEU TRABALHO'", type: 'date' },
  { id: 'status68', title: "'MEU TRABALHO'", type: 'status' },
  { id: 'color_mky1txdp', title: 'ESTÁGIOS', type: 'status' },
  { id: 'color_mky02302', title: 'EMPREENDIMENTO', type: 'status' },
  { id: 'status6', title: 'MODELOS DE NOTIFICAÇÃO', type: 'status' },
  { id: 'date0', title: 'DATA DA NOTIFICAÇÃO', type: 'date' },
  { id: 'date_mm2v7zz4', title: 'RESOLUÇÃO', type: 'date' },
  { id: 'formula_mm31vn5h', title: 'TOTAL DIAS', type: 'formula' },
];

interface ItemFalso {
  id: string;
  name: string;
  grupo: string;
  valores?: Record<string, string>;
}

function item(i: ItemFalso) {
  return {
    id: i.id,
    name: i.name,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-15T10:00:00Z',
    group: { id: `g-${i.grupo}`, title: i.grupo },
    column_values: COLUNAS_REAIS.filter((c) => c.id !== 'name').map((c) => ({
      id: c.id,
      text: i.valores?.[c.id] ?? '',
      value: null,
      display_value: i.valores?.[c.id] ?? '',
      type: c.type,
    })),
  };
}

/** Os títulos de grupo do quadro real, com as irregularidades de digitação. */
const ITENS_PADRAO: ItemFalso[] = [
  {
    id: '7001',
    name: 'BELLA VIDA 124',
    grupo: 'AGOSTO/ 2026',
    valores: {
      texto: 'Cliente Um',
      color_mky1txdp: 'Aguardando pagamento',
      color_mky02302: 'BELLA VIDA',
      status6: 'PARCELAS REGULARES EM ATRASO',
      date0: '2026-08-04',
    },
  },
  {
    id: '7002',
    name: 'AURORA TORRE B 41',
    grupo: 'JUNHO/2026',
    valores: {
      texto: 'Cliente Dois',
      color_mky1txdp: 'Resolvido',
      color_mky02302: 'AURORA TORRE B',
      status6: 'FINANCIAMENTO EM ATRASO',
      date0: '2026-06-11',
      date_mm2v7zz4: '2026-06-30',
      formula_mm31vn5h: '19',
    },
  },
  {
    id: '7003',
    name: 'VERANO TORRE A 12',
    grupo: 'DEZEMBRO/  2025',
    valores: {
      texto: 'Cliente Três',
      color_mky1txdp: 'Unidade retomada',
      color_mky02302: 'VERANO TORRE A',
      status6: 'RETOMADA DE UNIDADE',
      date0: '2025-12-12',
      date_mm2v7zz4: '2025-12-20',
      formula_mm31vn5h: '8',
    },
  },
];

let quadroFalso: ItemFalso[] = [];

function instalarDuble(): void {
  vi.stubGlobal('fetch', async (_url: string, opcoes: { body: string }) => {
    const corpo = JSON.parse(opcoes.body) as { query: string; variables?: Record<string, unknown> };

    if (/columns/.test(corpo.query)) {
      return new Response(JSON.stringify({ data: { boards: [{ columns: COLUNAS_REAIS }] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (/items_page/.test(corpo.query)) {
      return new Response(
        JSON.stringify({
          data: { boards: [{ items_page: { cursor: null, items: quadroFalso.map(item) } }] },
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

const sincronizar = (competenciaRef: string | null = null) =>
  sincronizarQuadro({ quadro: 'notificacoes', competenciaRef, comiteId: null, usuarioId: null });

describe('Notificações — board 5630368737', () => {
  beforeEach(async () => {
    await limparDados();
    quadroFalso = [...ITENS_PADRAO];
    instalarDuble();
  });

  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => fecharBanco());

  // ── 1. Competência derivada do grupo ──────────────────────────────────────

  it('cria a competência derivada do grupo em vez de violar a chave estrangeira', async () => {
    const r = await sincronizar();

    expect(r.status).toBe('sucesso');
    expect(r.incluidos).toBe(3);
    expect(r.comErro).toBe(0);
    expect(r.contabilidade_fecha).toBe(true);

    const competencias = await db
      .selectFrom('competencias')
      .select(['ref', 'rotulo', 'inicio', 'fim'])
      .orderBy('ref')
      .execute();

    expect(competencias.map((c) => c.ref)).toEqual(['2025-12', '2026-06', '2026-08']);
  });

  it('a competência criada cobre o mês inteiro e não nasce fechada', async () => {
    await sincronizar();

    const dezembro = await db
      .selectFrom('competencias')
      .selectAll()
      .where('ref', '=', '2025-12')
      .executeTakeFirstOrThrow();

    expect(dezembro.rotulo).toBe('Dezembro 2025');
    expect(String(dezembro.inicio)).toContain('2025-12-01');
    expect(String(dezembro.fim)).toContain('2025-12-31');
    // Fechar competência é ato de gestão; uma carga automática não o pratica.
    expect(dezembro.fechada_em).toBeNull();
  });

  it('fevereiro de ano bissexto termina em 29, não em 28', async () => {
    quadroFalso = [{ ...ITENS_PADRAO[0]!, id: '7010', grupo: 'FEVEREIRO/ 2024' }];
    await sincronizar();

    const fev = await db
      .selectFrom('competencias')
      .selectAll()
      .where('ref', '=', '2024-02')
      .executeTakeFirstOrThrow();

    expect(String(fev.fim)).toContain('2024-02-29');
  });

  it('não sobrescreve competência já existente — inclusive uma já fechada', async () => {
    await db
      .insertInto('competencias')
      .values({
        ref: '2026-06',
        rotulo: 'Junho 2026 (rótulo da gestão)',
        inicio: '2026-06-01',
        fim: '2026-06-30',
        fechada_em: new Date('2026-07-05T12:00:00Z'),
      })
      .execute();

    await sincronizar();

    const junho = await db
      .selectFrom('competencias')
      .selectAll()
      .where('ref', '=', '2026-06')
      .executeTakeFirstOrThrow();

    expect(junho.rotulo).toBe('Junho 2026 (rótulo da gestão)');
    expect(junho.fechada_em).not.toBeNull();
  });

  it('a competência pedida por argumento também é garantida, antes de abrir a execução', async () => {
    // `execucoes_importacao.competencia` é chave estrangeira igual. Sem garantir
    // antes, a execução falharia ao ser aberta — e sem execução aberta não há
    // onde contabilizar a falha.
    const r = await sincronizar('2026-06');

    expect(r.status).toBe('sucesso');
    expect(r.incluidos).toBe(1);
    // Os outros dois estão fora da competência: ignorados COM motivo.
    expect(r.ignorados).toBe(2);
    expect(r.motivos_ignorados.every((m) => /fora da competencia/.test(m.motivo))).toBe(true);
  });

  it('duas execuções seguidas não recriam nem duplicam competência', async () => {
    await sincronizar();
    await sincronizar();

    const { rows } = await sql<{ total: number }>`
      SELECT count(*)::int AS total FROM competencias
    `.execute(db);

    expect(rows[0]!.total).toBe(3);
  });

  // ── 2. Títulos reais das colunas ──────────────────────────────────────────

  it('resolve MODELOS DE NOTIFICAÇÃO, TOTAL DIAS e RESOLUÇÃO', async () => {
    const { porCampo, ausentes } = resolverMapa(QUADROS.notificacoes, COLUNAS_REAIS);

    expect(porCampo.get('modelo')).toBe('status6');
    expect(porCampo.get('total_dias')).toBe('formula_mm31vn5h');
    expect(porCampo.get('data_solucao')).toBe('date_mm2v7zz4');
    expect(ausentes).not.toContain('modelo');
    expect(ausentes).not.toContain('total_dias');
    expect(ausentes).not.toContain('data_solucao');
  });

  it('um título explícito de data de solução ainda vence RESOLUÇÃO', () => {
    // RESOLUÇÃO é o título do board de hoje, não a definição do campo. Se
    // alguém criar a coluna com o nome direto, ela passa a mandar.
    const mapa = montarMapaColunas([
      ...COLUNAS_REAIS,
      { id: 'date_explicita', title: 'DATA DA SOLUÇÃO', type: 'date' },
    ]);

    expect(resolverColuna(mapa, QUADROS.notificacoes.colunas.data_solucao!)?.id).toBe(
      'date_explicita',
    );
  });

  it('grava modelo, total de dias e data de solução com os valores da origem', async () => {
    await sincronizar();

    const resolvida = await db
      .selectFrom('notificacoes')
      .selectAll()
      .where('id_origem', '=', `monday:${BOARD}:7002`)
      .executeTakeFirst();

    const alternativa = resolvida
      ? resolvida
      : await db
          .selectFrom('notificacoes')
          .selectAll()
          .where('cliente_nome', '=', 'Cliente Dois')
          .executeTakeFirstOrThrow();

    expect(alternativa.modelo).toBe('FINANCIAMENTO EM ATRASO');
    expect(alternativa.total_dias).toBe(19);
    expect(alternativa.estagio).toBe('Resolvida');
    expect(String(alternativa.data_solucao)).toContain('2026-06-30');
  });

  it('data de solução só é gravada para item resolvido — a restrição do banco é respeitada', async () => {
    // O item 7003 é "Unidade retomada", que `normalizarEstagio` trata como
    // resolvido; o 7001 está em andamento e traz RESOLUÇÃO vazia. Um item em
    // andamento COM data de resolução preenchida não pode gravar a data: a
    // constraint `notificacao_solucao_coerente` recusaria a linha inteira.
    quadroFalso = [
      {
        id: '7004',
        name: 'MORATTA TORRE C 9',
        grupo: 'MAIO/ 2026',
        valores: {
          texto: 'Cliente Quatro',
          color_mky1txdp: 'Aguardando prazo',
          color_mky02302: 'MORATTA TORRE C',
          date0: '2026-05-04',
          date_mm2v7zz4: '2026-05-20',
        },
      },
    ];

    const r = await sincronizar();

    expect(r.status).toBe('sucesso');
    expect(r.comErro).toBe(0);

    const linha = await db
      .selectFrom('notificacoes')
      .select(['estagio', 'data_solucao'])
      .executeTakeFirstOrThrow();

    expect(linha.estagio).toBe('Em Andamento');
    expect(linha.data_solucao).toBeNull();
  });

  // ── 3. Títulos ambíguos ───────────────────────────────────────────────────

  it('declara as duas colunas chamadas MEU TRABALHO em vez de desempatar em silêncio', () => {
    const ambiguos = titulosAmbiguos(COLUNAS_REAIS);

    expect(ambiguos).toHaveLength(1);
    expect(ambiguos[0]!.titulo).toBe("'MEU TRABALHO'");
    expect(ambiguos[0]!.colunas.map((c) => c.id).sort()).toEqual(['nome_m_s', 'status68']);
    // A escolha atual é declarada, não escondida: a resolução por título pega a
    // primeira coluna que não for espelho, e aqui isso é a de data.
    expect(ambiguos[0]!.vencedora).toBe('nome_m_s');
  });

  it('quadro sem título repetido não reporta ambiguidade nenhuma', () => {
    expect(titulosAmbiguos(COLUNAS_REAIS.filter((c) => c.id !== 'nome_m_s'))).toEqual([]);
    expect(resolverMapa(QUADROS.notificacoes, COLUNAS_REAIS).ambiguos).toHaveLength(1);
  });

  it('o board de processos continua sem ambiguidade — a situação segue vindo da mesma coluna', () => {
    const colunasProcessos = [
      { id: 'status5', title: "'MEU TRABALHO'", type: 'status' },
      { id: 'status84__1', title: 'STATUS (para comitê)', type: 'status' },
      { id: 'texto', title: 'MOTIVO', type: 'text' },
    ];

    expect(titulosAmbiguos(colunasProcessos)).toEqual([]);
    expect(resolverMapa(QUADROS.processos, colunasProcessos).porCampo.get('situacao')).toBe(
      'status5',
    );
  });

  // ── Idempotência sobre o quadro de notificações ───────────────────────────

  it('a segunda execução não inclui, não atualiza e não gera versão nova', async () => {
    await sincronizar();
    const antes = await sql<{ total: number; versao: number; historico: number }>`
      SELECT count(*)::int AS total, coalesce(max(versao),0)::int AS versao,
             coalesce(sum(jsonb_array_length(historico)),0)::int AS historico
      FROM notificacoes WHERE fonte = 'monday'
    `.execute(db);

    const segunda = await sincronizar();

    const depois = await sql<{ total: number; versao: number; historico: number }>`
      SELECT count(*)::int AS total, coalesce(max(versao),0)::int AS versao,
             coalesce(sum(jsonb_array_length(historico)),0)::int AS historico
      FROM notificacoes WHERE fonte = 'monday'
    `.execute(db);

    expect(segunda.incluidos).toBe(0);
    expect(segunda.atualizados).toBe(0);
    expect(segunda.inalterados).toBe(3);
    expect(depois.rows[0]).toEqual(antes.rows[0]);
  });
});
