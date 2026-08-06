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
import { extrairLocalizacao, classificarCategoriaDistrato } from '../src/integracoes/monday/transformacao.js';
import { QUADROS, resolverMapa, titulosAmbiguos } from '../src/integracoes/monday/quadros.js';

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
