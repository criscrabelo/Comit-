/**
 * Os dois últimos quadros: Honorários (`7231876117`) e Entregas (`18410779605`).
 *
 * Os dois não tinham ingestão — `DESTINO` os mapeava para `null` e a carga
 * respondia "ainda nao implementada nesta fase". O que estes testes fixam são as
 * três coisas que a implementação encontrou contra os quadros reais:
 *
 *  1. **Emoji no título de coluna.** Oito colunas de Honorários começam com
 *     emoji (`📋 Tipo de Honorário`). Emoji é decoração de quem digitou, igual
 *     às aspas — e pior de casar, porque pode trazer um seletor de variação
 *     invisível que faz a comparação exata falhar sem nada parecer errado.
 *
 *  2. **`AURORA - Torre B`.** O separador antes de TORRE deixava a base como
 *     `AURORA -`, criando um empreendimento com traço pendurado ao lado do
 *     `AURORA` legítimo.
 *
 *  3. **Campos que vêm do QUADRO, não de coluna.** `especie` em Honorários e
 *     `empreendimento` em Entregas — os dois são NOT NULL no banco.
 */
import { describe, expect, it } from 'vitest';
import { extrairLocalizacao } from '../src/integracoes/monday/transformacao.js';
import { QUADROS, chaveDeColuna, resolverMapa } from '../src/integracoes/monday/quadros.js';

/** Colunas do board 7231876117, como a API as devolveu em 06/08/2026. */
const COLUNAS_HONORARIOS = [
  { id: 'status_1__1', title: 'EMPREENDIMENTO', type: 'status' },
  { id: 'texto__1', title: 'UNIDADE', type: 'text' },
  { id: 'n_meros7__1', title: 'HONORÁRIOS', type: 'numbers' },
  { id: 'status', title: 'Status', type: 'status' },
  { id: 'data', title: 'Data', type: 'date' },
  { id: 'n_meros__1', title: 'OAB', type: 'numbers' },
  { id: 'status_16__1', title: 'CLIENTE NOVO', type: 'status' },
  { id: 'board_relation_mm2ps948', title: '(JUR) NOTIFICAÇÕES CLIENTES', type: 'board_relation' },
  { id: 'color_mm35trwq', title: '📋 Tipo de Honorário', type: 'status' },
  { id: 'date_mm35qvqv', title: '✅ Data Pagamento Efetivo', type: 'date' },
];

/** Colunas do board 18410779605. */
const COLUNAS_ENTREGAS = [
  { id: 'texto__1', title: 'CLIENTE', type: 'text' },
  { id: 'status44__1', title: 'FINANCIAMENTO', type: 'status' },
  { id: 'status38__1', title: 'LIBERAÇÃO JURÍDICO', type: 'status' },
  { id: 'data', title: 'HABITE-SE', type: 'date' },
  { id: 'color_mm2wa10k', title: 'CARÊNCIA (180 DIAS)', type: 'status' },
  { id: 'date_mktrn5b4', title: 'ENTREGA DAS CHAVES', type: 'date' },
];

describe('Honorários — board 7231876117', () => {
  it('emoji no começo do título não esconde a coluna', () => {
    const { porCampo, ausentes } = resolverMapa(QUADROS.honorarios, COLUNAS_HONORARIOS);

    expect(porCampo.get('categoria')).toBe('color_mm35trwq');
    expect(porCampo.get('data_pagamento')).toBe('date_mm35qvqv');
    expect(ausentes).not.toContain('categoria');
  });

  it('emoji é removido só do começo, e só pictograma', () => {
    expect(chaveDeColuna('📋 Tipo de Honorário')).toBe('TIPO DE HONORÁRIO');
    // Com seletor de variação invisível — o caso que quebrava a comparação.
    expect(chaveDeColuna('\u{1F4CB}️ Tipo de Honorário')).toBe('TIPO DE HONORÁRIO');

    // Pontuação ASCII NÃO é removida: são títulos que existem e precisam casar.
    expect(chaveDeColuna('(JUR) NOTIFICAÇÕES CLIENTES')).toBe('(JUR) NOTIFICAÇÕES CLIENTES');
    expect(chaveDeColuna('Nº PROCESSO')).toBe('Nº PROCESSO');
  });

  it('resolve os valores, o status e a data que o quadro tem', () => {
    const { porCampo } = resolverMapa(QUADROS.honorarios, COLUNAS_HONORARIOS);

    expect(porCampo.get('valor_honorarios')).toBe('n_meros7__1');
    expect(porCampo.get('valor_oab')).toBe('n_meros__1');
    expect(porCampo.get('status')).toBe('status');
    expect(porCampo.get('data_evento')).toBe('data');
    expect(porCampo.get('cliente_novo')).toBe('status_16__1');
    // A ligação com Notificações já existe neste quadro.
    expect(porCampo.get('notificacoes')).toBe('board_relation_mm2ps948');
  });

  it('o cliente NÃO vem de coluna — o quadro não tem CLIENTE', () => {
    // O nome do cliente é o nome do item (`ANDERSON NORONHA`). A ausência é
    // reportada, e `lerCampo` cai para `item.name` na transformação.
    const { ausentes } = resolverMapa(QUADROS.honorarios, COLUNAS_HONORARIOS);
    expect(ausentes).toContain('cliente');
    expect(ausentes).toContain('valor_principal');
  });

  it('`AURORA - Torre B` não vira um empreendimento com traço pendurado', () => {
    // Sem tratar o separador, a base ficaria `AURORA -` e criaria um
    // empreendimento ao lado do `AURORA` legítimo — o histórico do mesmo
    // ativo em duas linhas.
    const r = extrairLocalizacao('AURORA - Torre B', 'AURORA - Torre B 1105');

    expect(r.empreendimento).toBe('AURORA');
    expect(r.torre).toBe('TORRE B');
  });

  it('o formato sem separador continua funcionando', () => {
    const r = extrairLocalizacao('AURORA TORRE B', 'AURORA 1105B');
    expect(r.empreendimento).toBe('AURORA');
    expect(r.torre).toBe('TORRE B');
    expect(r.unidade).toBe('1105B');
  });
});

describe('Entregas — board 18410779605', () => {
  it('o empreendimento e a unidade NÃO vêm de coluna', () => {
    // O empreendimento é o GRUPO (`CARPE DIEM`) e a unidade é o nome do item
    // (`11`). As duas são NOT NULL no banco: sem esse tratamento a carga
    // inteira falharia na primeira linha.
    const { ausentes } = resolverMapa(QUADROS.entregas, COLUNAS_ENTREGAS);

    expect(ausentes).toContain('empreendimento');
    expect(ausentes).toContain('unidade');
  });

  it('`CARÊNCIA (180 DIAS)` NÃO alimenta `prazo_180`', () => {
    // É uma coluna de STATUS com rótulos de mês (`DEZEMBRO 2025`, `ESTOQUE`,
    // `VENDA NOVA`), não uma data. Converter "DEZEMBRO 2025" em data exigiria
    // escolher um dia do mês — invenção. Fica ausente até a origem ter data.
    const { porCampo, ausentes } = resolverMapa(QUADROS.entregas, COLUNAS_ENTREGAS);

    expect(ausentes).toContain('prazo_180');
    expect(porCampo.has('prazo_180')).toBe(false);
  });

  it('`ENTREGA DAS CHAVES` NÃO alimenta `previsao_entrega`', () => {
    // Entrega realizada e previsão de entrega são coisas diferentes num quadro
    // cujo propósito é acompanhar prazo. A data realizada vira `data_fato`.
    const { porCampo, ausentes } = resolverMapa(QUADROS.entregas, COLUNAS_ENTREGAS);

    expect(ausentes).toContain('previsao_entrega');
    expect(porCampo.get('entrega_chaves')).toBe('date_mktrn5b4');
  });

  it('resolve financiamento, liberação jurídica e habite-se', () => {
    const { porCampo } = resolverMapa(QUADROS.entregas, COLUNAS_ENTREGAS);

    expect(porCampo.get('tipo_financiamento')).toBe('status44__1');
    expect(porCampo.get('status_juridico')).toBe('status38__1');
    expect(porCampo.get('prazo_habite_se')).toBe('data');
  });

  it('`STATUS` genérico não é aceito como situação da unidade', () => {
    // O quadro tem sete colunas de status diferentes (FINANCEIRO COEVO,
    // ENGENHARIA, LIBERAÇÃO FINANCEIRO…). Aceitar `STATUS` faria a situação da
    // unidade sair de qualquer uma que aparecesse primeiro.
    expect(QUADROS.entregas.colunas.situacao).not.toContain('STATUS');
  });
});
