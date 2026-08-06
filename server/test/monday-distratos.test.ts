/**
 * O que a homologação real do board 18404493605 revelou.
 *
 *  1. **O perfil de homologação nomeava colunas que a tabela não tem.**
 *     `distratos` não tem `situacao`, `torre`, `grupo` nem `total_dias`, e o
 *     perfil pedia as quatro na amostra — além de usar `situacao` como campo da
 *     prova 5. Defeito estático, encontrado contra a migração 005 antes da
 *     carga; o teste abaixo impede que volte por cópia.
 *
 *  2. **`ALAMEDA` cortava `ALAMEDAS 406A` no meio da palavra.** A remoção do
 *     prefixo do empreendimento não exigia fronteira de palavra, e a unidade
 *     saía como `S 406A` — um identificador que não existe.
 *
 *  3. **A coluna EMPREENDIMENTO do quadro é a SPE, não o prédio.** Itens
 *     chamados `MORATTA 001B` vêm com EMPREENDIMENTO `ALENCAR MAZZEO`;
 *     `ALAMEDA 003B` vem com `COEVO E CONELESTE`. Nada é corrigido por
 *     suposição — o que estes testes fixam é o COMPORTAMENTO nesse caso: a
 *     unidade preserva o nome do item inteiro em vez de inventar um recorte.
 */
import { describe, expect, it } from 'vitest';
import {
  extrairLocalizacao,
  classificarCategoriaDistrato,
  lerVinculo,
} from '../src/integracoes/monday/transformacao.js';
import { separarUnidadeCliente } from '../src/integracoes/monday/transformacao.js';
import { QUADROS, resolverMapa, titulosAmbiguos } from '../src/integracoes/monday/quadros.js';
import type { ItemMonday } from '../src/integracoes/monday/cliente.js';

/** Colunas do board 18404493605, como a API as devolveu em 06/08/2026. */
const COLUNAS_REAIS = [
  { id: 'name', title: 'Name', type: 'name' },
  { id: 'text_mm1tkbna', title: 'CLIENTE', type: 'text' },
  { id: 'data', title: 'DATA DA SOLICITAÇÃO', type: 'date' },
  { id: 'lookup_mm1re8j8', title: 'EMPREENDIMENTO', type: 'mirror' },
  { id: 'color_mm28cam9', title: 'EMPREENDIMENTO', type: 'status' },
  { id: 'date_mm1zzqfm', title: 'DATA DA VENDA', type: 'date' },
  { id: 'lookup_mm1rpssd', title: 'SETOR', type: 'mirror' },
  { id: 'color_mm2knzbk', title: 'SETOR', type: 'status' },
  { id: 'color_mm1km2gz', title: 'MOTIVO', type: 'status' },
  { id: 'color_mm1kctx7', title: 'EQUIPE', type: 'status' },
  { id: 'formula_mm1tmz3a', title: 'PERÍODO (DIAS)', type: 'formula' },
  { id: 'board_relation_mm1r9a8w', title: '(JUR) CONTRATOS PARA CLIENTES', type: 'board_relation' },
];

describe('Distratos — board 18404493605', () => {
  // ── 1. Prefixo cortado no meio da palavra ───────────────────────────────

  it('não corta o nome do empreendimento no meio da palavra', () => {
    // O caso real: item `ALAMEDAS 406A` com EMPREENDIMENTO `ALAMEDA`.
    // Antes da correção a unidade saía `S 406A`.
    const r = extrairLocalizacao('ALAMEDA', 'ALAMEDAS 406A');

    expect(r.unidade).toBe('ALAMEDAS 406A');
    expect(r.unidade).not.toBe('S 406A');
  });

  it('continua removendo o prefixo quando ele termina em espaço', () => {
    expect(extrairLocalizacao('ALAMEDA', 'ALAMEDA 603A').unidade).toBe('603A');
    expect(extrairLocalizacao('GRAN PARK', 'GRAN PARK 1308').unidade).toBe('1308');
    expect(extrairLocalizacao('CARPE DIEM', 'CARPE DIEM 44').unidade).toBe('44');
  });

  it('item igual ao nome do empreendimento não vira unidade vazia', () => {
    expect(extrairLocalizacao('GRAN PARK', 'GRAN PARK').unidade).toBe('GRAN PARK');
  });

  it('quando a coluna não é o prefixo do item, a unidade preserva o nome inteiro', () => {
    // EMPREENDIMENTO `ALENCAR MAZZEO` (a SPE) com item `MORATTA 001B`.
    // Informação incompleta e verdadeira vale mais que recorte inventado.
    const r = extrairLocalizacao('ALENCAR MAZZEO', 'MORATTA 001B');

    expect(r.empreendimento).toBe('ALENCAR MAZZEO');
    expect(r.unidade).toBe('MORATTA 001B');
  });

  // ── 2. Categoria pelo título do grupo ───────────────────────────────────

  it('classifica pelos dois grupos reais do quadro', () => {
    expect(classificarCategoriaDistrato('DISTRATOS', 'distratos')).toBe('distrato');
    // Acentuado, como está no board.
    expect(classificarCategoriaDistrato('DESISTÊNCIAS', 'distratos')).toBe('desistencia');
  });

  it('nenhum grupo real dos dois quadros produz `recompra`', () => {
    // `docs/REGRA-SAIDA-DE-CLIENTE.md` diz que a recompra é acompanhada no
    // quadro de Distratos e Retomadas com `categoria = 'recompra'`. Conferido
    // contra a origem em 06/08/2026: o board 18404493605 tem os grupos
    // DISTRATOS e DESISTÊNCIAS, e o 18413057491 tem só RETOMADAS. Não existe
    // grupo de recompra — a categoria é aceita pelo CHECK do banco e NUNCA
    // produzida pela ingestão.
    //
    // Este teste falha no dia em que alguém criar o grupo, que é exatamente
    // quando a seção 4.3 daquele documento precisa ser revisitada.
    const gruposReais: Array<[string, 'distratos' | 'retomadas']> = [
      ['DISTRATOS', 'distratos'],
      ['DESISTÊNCIAS', 'distratos'],
      ['RETOMADAS', 'retomadas'],
    ];

    const categorias = gruposReais.map(([g, q]) => classificarCategoriaDistrato(g, q));

    expect(categorias).toEqual(['distrato', 'desistencia', 'retomada']);
    expect(categorias).not.toContain('recompra');
  });

  it('a regra de recompra continua valendo se o grupo passar a existir', () => {
    // Não é defeito da classificação — é ausência na origem. A capacidade está
    // pronta e é isto que a mantém honesta.
    expect(classificarCategoriaDistrato('RECOMPRA', 'distratos')).toBe('recompra');
    expect(classificarCategoriaDistrato('RE-COMPRA', 'retomadas')).toBe('recompra');
  });

  // ── data_venda: venda original, não revenda ─────────────────────────────

  it('`data_venda` sai de DATA DA VENDA — e o quadro não tem coluna de revenda', () => {
    const { porCampo } = resolverMapa(QUADROS.distratos, COLUNAS_REAIS);

    // A ingestão ALIMENTA `data_venda`: a afirmação contrária em
    // REGRA-SAIDA-DE-CLIENTE.md §4.2 era factualmente errada, e a carga real
    // gravou 38 de 38 preenchidos.
    expect(porCampo.get('data_venda')).toBe('date_mm1zzqfm');

    // Mas nenhum título de revenda existe no quadro. O que está mapeado é a
    // venda ORIGINAL ao cliente que sai: a fórmula de `PERÍODO (DIAS)` é
    // DAYS(SOLICITAÇÃO, VENDA), e na carga real a venda precede a solicitação
    // em 36 dos 38 registros, com média de 300 dias.
    const titulos = COLUNAS_REAIS.map((c) => c.title.toUpperCase());
    expect(titulos.some((t) => t.includes('REVENDA'))).toBe(false);
  });

  it('Retomadas NÃO aceita DATA DA VENDA — aquele board também a tem, e é a venda original', () => {
    // O board 18413057491 tem `DATA DA VENDA` com datas de 2022 a 2025 contra
    // solicitações de 2026, e a mesma fórmula DAYS(SOLICITAÇÃO, VENDA). Se a
    // lista de Retomadas a aceitasse, `data_venda` sairia preenchido em quase
    // todo item com a data errada — e o indicador de recompra trataria toda
    // retomada como concluída. Erra para o lado que parece certo, que é o
    // motivo de este teste existir.
    const deRetomadas = QUADROS.retomadas.colunas.data_venda!;

    expect(deRetomadas).not.toContain('DATA DA VENDA');
    expect(deRetomadas).not.toContain('DATA VENDA');
    expect(deRetomadas).toContain('DATA DA REVENDA');

    // Contra as colunas reais daquele quadro, o campo cai em `ausentes`.
    const colunasRetomadas = [
      { id: 'data', title: 'DATA DA SOLICITAÇÃO', type: 'date' },
      { id: 'date_mm1zzqfm', title: 'DATA DA VENDA', type: 'date' },
      { id: 'color_mm1km2gz', title: 'MOTIVO', type: 'status' },
    ];
    const { porCampo, ausentes } = resolverMapa(QUADROS.retomadas, colunasRetomadas);

    expect(ausentes).toContain('data_venda');
    expect(porCampo.has('data_venda')).toBe(false);
  });

  it('Distratos continua aceitando DATA DA VENDA — lá o sentido é a venda original', () => {
    // A assimetria entre os dois quadros é deliberada, não descuido.
    expect(QUADROS.distratos.colunas.data_venda!).toContain('DATA DA VENDA');
    expect(resolverMapa(QUADROS.distratos, COLUNAS_REAIS).porCampo.get('data_venda')).toBe(
      'date_mm1zzqfm',
    );
  });

  // ── 3. Mapa contra as colunas reais ─────────────────────────────────────

  it('resolve cliente, motivo, equipe e as duas datas que o quadro tem', () => {
    const { porCampo } = resolverMapa(QUADROS.distratos, COLUNAS_REAIS);

    expect(porCampo.get('cliente')).toBe('text_mm1tkbna');
    expect(porCampo.get('motivo')).toBe('color_mm1km2gz');
    expect(porCampo.get('equipe')).toBe('color_mm1kctx7');
    expect(porCampo.get('data_solicitacao')).toBe('data');
    expect(porCampo.get('data_venda')).toBe('date_mm1zzqfm');
  });

  it('data de conclusão e tempo não existem no quadro — nulos, nunca presumidos', () => {
    const { ausentes, porCampo } = resolverMapa(QUADROS.distratos, COLUNAS_REAIS);

    // `PERÍODO (DIAS)` é DAYS(SOLICITAÇÃO, VENDA) — quanto o cliente segurou a
    // unidade antes de pedir o distrato. NÃO é o tempo até concluir, que é o
    // que `tempo_dias` significa. Mapear os dois igualaria coisas diferentes.
    expect(ausentes).toContain('tempo_dias');
    expect(ausentes).toContain('data_conclusao');
    expect(porCampo.has('tempo_dias')).toBe(false);
    expect(porCampo.has('data_conclusao')).toBe(false);
  });

  it('declara EMPREENDIMENTO e SETOR repetidos, e o espelho perde para o status', () => {
    const ambiguos = titulosAmbiguos(COLUNAS_REAIS);

    expect(ambiguos.map((a) => a.titulo).sort()).toEqual(['EMPREENDIMENTO', 'SETOR']);
    // A regra de desempate preferir o não-espelho importa aqui: os dois
    // espelhos vêm vazios em 12 dos 38 itens.
    expect(ambiguos.find((a) => a.titulo === 'EMPREENDIMENTO')!.vencedora).toBe('color_mm28cam9');
    expect(ambiguos.find((a) => a.titulo === 'SETOR')!.vencedora).toBe('color_mm2knzbk');
  });

  // ── Ligação com as notificações ─────────────────────────────────────────

  /** Item no formato da API, com uma coluna de ligação. */
  const itemComLigacao = (ligados: string[] | null | undefined): ItemMonday => ({
    id: '9001',
    name: 'SIETE 44-C',
    group: { id: 'g1', title: 'RETOMADAS' },
    created_at: null,
    updated_at: null,
    column_values: [
      {
        id: 'board_relation_mm3an1k0',
        text: '',
        value: null,
        type: 'board_relation',
        // O nome visível DIVERGE do nome da notificação ligada — é o caso real
        // do board 18413057491: `SIETE 44-C` aponta para `SIETE 44C`.
        display_value: 'SIETE 44C',
        ...(ligados === undefined ? {} : { linked_item_ids: ligados }),
      },
    ],
  });

  const MAPA_LIGACAO = new Map([['notificacoes', 'board_relation_mm3an1k0']]);

  it('lê os ids ligados, não o nome visível da notificação', () => {
    // Casar por nome erraria este par: `SIETE 44-C` vs `SIETE 44C`.
    expect(lerVinculo(itemComLigacao(['11350971630']), MAPA_LIGACAO, 'notificacoes')).toEqual([
      '11350971630',
    ]);
  });

  it('deduplica e ordena os ids, para o upsert não ver mudança onde não houve', () => {
    // A API não garante ordem estável. Sem normalizar, uma reordenação faria
    // `versao` e o histórico crescerem a cada carga — o defeito da migração 017
    // por outro caminho.
    const a = lerVinculo(itemComLigacao(['222', '111', '222']), MAPA_LIGACAO, 'notificacoes');
    const b = lerVinculo(itemComLigacao(['111', '222']), MAPA_LIGACAO, 'notificacoes');

    expect(a).toEqual(['111', '222']);
    expect(a).toEqual(b);
  });

  it('coluna ausente, vazia ou sem o campo devolvem lista vazia — nunca nulo', () => {
    // Os três casos significam "nenhuma ligação declarada", e nenhum deles
    // significa "não houve notificação".
    expect(lerVinculo(itemComLigacao([]), MAPA_LIGACAO, 'notificacoes')).toEqual([]);
    expect(lerVinculo(itemComLigacao(undefined), MAPA_LIGACAO, 'notificacoes')).toEqual([]);
    // Campo não mapeado: é o estado do board 18404493605 hoje.
    expect(lerVinculo(itemComLigacao(['1']), new Map(), 'notificacoes')).toEqual([]);
  });

  it('a ligação com o quadro de contratos já existe no board e é resolvida', () => {
    // Segunda porta de entrada do pedido de distrato: Relacionamento e Crédito
    // encaminham pelo quadro de contratos, não pela notificação. A coluna JÁ
    // existe no board 18404493605 e já vem preenchida em 26 dos 38 itens — o
    // que faltava era a ingestão ler.
    const { porCampo, ausentes } = resolverMapa(QUADROS.distratos, COLUNAS_REAIS);

    expect(porCampo.get('contratos')).toBe('board_relation_mm1r9a8w');
    expect(ausentes).not.toContain('contratos');
    // A ligação com notificações continua ausente: são portas diferentes, e uma
    // não supre a outra.
    expect(ausentes).toContain('notificacoes');
  });

  it('as duas portas de entrada são campos distintos', () => {
    // Guardar as duas no mesmo campo faria "veio da notificação" e "veio do
    // contrato" virarem a mesma coisa — e a origem do pedido é o que distingue
    // cobrança que não se resolveu de encaminhamento de Relacionamento/Crédito.
    expect(QUADROS.distratos.colunas.notificacoes).not.toEqual(
      QUADROS.distratos.colunas.contratos,
    );
  });

  it('os dois quadros aceitam os MESMOS títulos de ligação', () => {
    // Eles gravam na mesma tabela. Duas listas divergindo fariam a ligação
    // existir num quadro e não no outro, com o sintoma aparecendo num indicador
    // que soma os dois.
    expect(QUADROS.distratos.colunas.notificacoes).toEqual(QUADROS.retomadas.colunas.notificacoes);
    expect(QUADROS.distratos.colunas.contratos).toEqual(QUADROS.retomadas.colunas.contratos);
  });

  it('Retomadas resolve a ligação; Distratos ainda não tem a coluna', () => {
    const retomadas = resolverMapa(QUADROS.retomadas, [
      { id: 'board_relation_mm3an1k0', title: '(JUR) NOTIFICAÇÕES CLIENTES', type: 'board_relation' },
    ]);
    expect(retomadas.porCampo.get('notificacoes')).toBe('board_relation_mm3an1k0');

    // O board de Distratos de hoje: sem nenhuma coluna de ligação para
    // notificações. Fica em `ausentes` — declarado, nunca presumido.
    const distratos = resolverMapa(QUADROS.distratos, COLUNAS_REAIS);
    expect(distratos.ausentes).toContain('notificacoes');
    expect(distratos.porCampo.has('notificacoes')).toBe(false);
  });

  it('o nome automático do Monday também é aceito', () => {
    // Coluna criada e não renomeada vira `link to <quadro>`. É o caso mais
    // provável no dia em que Distratos ganhar a dela.
    const mapa = resolverMapa(QUADROS.distratos, [
      ...COLUNAS_REAIS,
      { id: 'board_relation_novo', title: 'link to (JUR) NOTIFICAÇÕES CLIENTES', type: 'board_relation' },
    ]);
    expect(mapa.porCampo.get('notificacoes')).toBe('board_relation_novo');
  });

  // ── Recompra: quadro próprio, board 6149480325 ──────────────────────────

  it('a recompra tem quadro próprio, e ele grava na tabela de distratos', () => {
    // A regra dizia que a recompra era acompanhada "no quadro de Distratos e
    // Retomadas". Não é: é board separado, e por isso `categoria = 'recompra'`
    // nunca era produzida — não por defeito da classificação.
    expect(QUADROS.recompras.idPadrao).toBe('6149480325');
    expect(QUADROS.recompras.destino).toBe('distratos');
    // Os grupos são empreendimentos, então não há competência a filtrar.
    expect(QUADROS.recompras.recorte).toBe('historico');
  });

  it('`ASS. NOVO FINANCIAMENTO` alimenta a data de revenda e a de conclusão', () => {
    const colunas = [
      { id: 'date_mky1rrnr', title: 'DATA DE RECOMPRA', type: 'date' },
      { id: 'date_mm5zm11v', title: 'ASS. NOVO FINANCIAMENTO', type: 'date' },
      { id: 'data', title: 'DATA DA VENDA', type: 'date' },
      { id: 'status2', title: 'Status', type: 'status' },
    ];
    const { porCampo } = resolverMapa(QUADROS.recompras, colunas);

    expect(porCampo.get('data_solicitacao')).toBe('date_mky1rrnr');
    // As duas perguntas — "quando revendeu" e "quando acabou" — são o mesmo
    // fato NESTE quadro. São campos distintos porque nos outros não coincidem.
    expect(porCampo.get('data_venda')).toBe('date_mm5zm11v');
    expect(porCampo.get('data_conclusao')).toBe('date_mm5zm11v');
  });

  it('`DATA DA VENDA` do quadro de recompra NÃO vira data de revenda', () => {
    // Mesma armadilha de Distratos e Retomadas: aquele board também tem
    // `DATA DA VENDA`, com datas de 2020 a 2025 — a venda original ao cliente
    // que sai. Se entrasse em `data_venda`, toda recompra pareceria concluída.
    expect(QUADROS.recompras.colunas.data_venda).not.toContain('DATA DA VENDA');
  });

  it('separa unidade e cliente no título do item de recompra', () => {
    expect(separarUnidadeCliente('304 C - GUSTAVO')).toEqual({
      unidade: '304 C',
      cliente: 'GUSTAVO',
    });
    // Ordem invertida: quem começa com dígito é a unidade.
    expect(separarUnidadeCliente('RIVALFREDO - 033 BELLA')).toEqual({
      unidade: '033 BELLA',
      cliente: 'RIVALFREDO',
    });
    // Sem cliente no título: a unidade não vira nome repetido.
    expect(separarUnidadeCliente('501 B')).toEqual({ unidade: '501 B', cliente: null });
    // Hífen SEM espaços é parte da unidade — cortar produziria `SIETE 44` e `C`.
    expect(separarUnidadeCliente('SIETE 44-C')).toEqual({ unidade: 'SIETE 44-C', cliente: null });
  });

  it('cada quadro só governa a ausência das categorias que ele produz', async () => {
    // Os três quadros gravam na MESMA tabela. Carregar Retomadas marcava como
    // ausentes os 38 registros de Distratos: eles não estavam no lote lido, e o
    // único critério era "não veio nesta carga". Descoberto na homologação de
    // Retomadas — 38 de 61 registros marcados por uma carga que não os lê.
    //
    // Ausência só pode ser afirmada sobre o que a carga realmente enxerga.
    const { db } = await import('../src/db/pool.js');
    const { marcarAusentes } = await import('../src/integracoes/upsert.js');
    const { limparDados } = await import('./ajuda/banco.js');
    await limparDados();

    const semear = (idOrigem: string, categoria: string) =>
      db
        .insertInto('distratos')
        .values({ fonte: 'monday', id_origem: idOrigem, categoria } as never)
        .execute();

    await semear('d1', 'distrato');
    await semear('d2', 'desistencia');
    await semear('r1', 'retomada');

    // Carga de Retomadas: só `r1` veio, e ela só governa retomada/recompra.
    const marcados = await marcarAusentes('distratos', 'monday', ['r1'], {
      categorias: ['retomada', 'recompra'],
    });

    expect(marcados).toBe(0);

    const vivos = await db
      .selectFrom('distratos')
      .select(['id_origem', 'ausente_desde'])
      .orderBy('id_origem')
      .execute();

    expect(vivos.filter((v) => v.ausente_desde === null).map((v) => v.id_origem)).toEqual([
      'd1',
      'd2',
      'r1',
    ]);
  });

  it('dentro do próprio escopo, a ausência continua sendo marcada', async () => {
    // O recorte não pode virar desculpa para nunca marcar nada.
    const { db } = await import('../src/db/pool.js');
    const { marcarAusentes } = await import('../src/integracoes/upsert.js');
    const { limparDados } = await import('./ajuda/banco.js');
    await limparDados();

    for (const [id, cat] of [['r1', 'retomada'], ['r2', 'retomada'], ['d1', 'distrato']] as const) {
      await db
        .insertInto('distratos')
        .values({ fonte: 'monday', id_origem: id, categoria: cat } as never)
        .execute();
    }

    // `r2` sumiu da origem de Retomadas: tem de ser marcada. `d1` não.
    const marcados = await marcarAusentes('distratos', 'monday', ['r1'], {
      categorias: ['retomada', 'recompra'],
    });

    expect(marcados).toBe(1);

    const ausentes = await db
      .selectFrom('distratos')
      .select('id_origem')
      .where('ausente_desde', 'is not', null)
      .execute();

    expect(ausentes.map((a) => a.id_origem)).toEqual(['r2']);
  });

  // ── 4. O perfil de homologação bate com o esquema ───────────────────────

  it('o perfil de homologação só nomeia colunas que a tabela distratos tem', async () => {
    // Guarda contra a regressão que motivou este arquivo: o perfil pedia
    // `situacao`, `torre`, `grupo` e `total_dias`, que nunca existiram em
    // `distratos`. A amostra falharia no SELECT, depois das duas execuções.
    const { sql } = await import('kysely');
    const { db } = await import('../src/db/pool.js');

    const { rows } = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'distratos'
    `.execute(db);
    const existentes = new Set(rows.map((r) => r.column_name));

    // Os mesmos nomes declarados nos perfis de `distratos` e `retomadas`.
    const doPerfil = [
      'id_origem', 'categoria', 'motivo', 'equipe', 'unidade',
      'data_solicitacao', 'data_venda', 'data_conclusao', 'tempo_dias',
      'fonte', 'versao', 'data_referencia', 'extraido_em',
    ];

    expect(doPerfil.filter((c) => !existentes.has(c))).toEqual([]);
    // E o campo da prova 5 precisa existir e não ter CHECK que recuse o valor
    // de teste — `categoria` tem, `motivo` não.
    expect(existentes.has('motivo')).toBe(true);
  });
});
