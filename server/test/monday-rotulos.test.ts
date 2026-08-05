/**
 * Levantamento de rótulos reais e cobertura das regras.
 *
 * O que estes testes garantem: que a homologação vai mostrar TODOS os valores
 * distintos que o quadro realmente usa — inclusive de colunas que ninguém
 * mapeou —, que rótulo sem cobertura vira revisão necessária com quantidade e
 * registros afetados, e que a proposta de regra é **proposta**: nada é
 * aplicado sem aprovação.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fecharBanco } from '../src/db/pool.js';
import { gravarBruto, iniciarExecucao } from '../src/integracoes/execucoes.js';
import {
  analisarCoberturaJudicializacao,
  levantarRotulos,
  type RotuloEncontrado,
} from '../src/integracoes/monday/rotulos.js';
import { limparDados } from './ajuda/banco.js';

const TITULOS = new Map([
  ['status5', { titulo: 'MEU TRABALHO', tipo: 'status' }],
  ['status3', { titulo: 'ATUAÇÃO', tipo: 'status' }],
  ['pessoa', { titulo: 'RESPONSÁVEL', tipo: 'people' }],
  ['espelho', { titulo: 'EMPREENDIMENTO', tipo: 'mirror' }],
  ['livre', { titulo: 'MOTIVO', tipo: 'text' }],
]);

const MAPA = new Map([
  ['situacao', 'status5'],
  ['atuacao', 'status3'],
  ['empreendimento', 'espelho'],
  ['motivo', 'livre'],
]);

interface Coluna {
  id: string;
  text?: string;
  display_value?: string;
}

function item(id: string, grupo: string, colunas: Coluna[]) {
  return {
    id,
    name: `ITEM-${id}`,
    created_at: null,
    updated_at: null,
    group: { id: 'g', title: grupo },
    column_values: colunas.map((c) => ({
      id: c.id,
      text: c.text ?? '',
      value: null,
      type: 'status',
      ...(c.display_value ? { display_value: c.display_value } : {}),
    })),
  };
}

async function semear(itens: ReturnType<typeof item>[]): Promise<string> {
  const execucao = await iniciarExecucao({ fonte: 'monday', escopo: 'processos' });
  await gravarBruto(
    execucao.id,
    'monday',
    'processos',
    itens.map((i) => ({ idOrigem: i.id, payload: i })),
  );
  return execucao.id;
}

beforeEach(async () => {
  await limparDados();
});

afterAll(async () => {
  await fecharBanco();
});

describe('levantamento de rótulos', () => {
  it('lista os valores distintos com contagem e exemplos', async () => {
    const execucaoId = await semear([
      item('1', 'ATIVOS', [{ id: 'status5', text: 'EM ANDAMENTO' }]),
      item('2', 'ATIVOS', [{ id: 'status5', text: 'EM ANDAMENTO' }]),
      item('3', 'ARQUIVADOS', [{ id: 'status5', text: 'BAIXA DEFINITIVA' }]),
    ]);

    const l = await levantarRotulos(execucaoId, MAPA, TITULOS);

    expect(l.itens).toBe(3);

    const situacao = l.colunas.find((c) => c.titulo === 'MEU TRABALHO')!;
    expect(situacao.campoPatrono).toBe('situacao');
    expect(situacao.preenchidos).toBe(3);
    expect(situacao.rotulos).toEqual([
      { valor: 'EM ANDAMENTO', ocorrencias: 2, exemplos: ['1', '2'] },
      { valor: 'BAIXA DEFINITIVA', ocorrencias: 1, exemplos: ['3'] },
    ]);

    // Grupos: a competência sai daqui, não de coluna de data.
    expect(l.grupos.map((g) => g.valor).sort()).toEqual(['ARQUIVADOS', 'ATIVOS']);
  });

  it('inclui colunas que NINGUÉM mapeou — é assim que RESPONSÁVEL aparece', async () => {
    const execucaoId = await semear([
      item('1', 'ATIVOS', [
        { id: 'status5', text: 'EM ANDAMENTO' },
        { id: 'pessoa', text: 'Ana Souza' },
      ]),
      item('2', 'ATIVOS', [
        { id: 'status5', text: 'EM ANDAMENTO' },
        { id: 'pessoa', text: 'Carlos Lima' },
      ]),
    ]);

    const l = await levantarRotulos(execucaoId, MAPA, TITULOS);
    const responsavel = l.colunas.find((c) => c.titulo === 'RESPONSÁVEL')!;

    expect(responsavel).toBeDefined();
    // Não está no mapa: o levantamento a mostra assim mesmo, e é isso que
    // permite descobrir que ela existe.
    expect(responsavel.campoPatrono).toBeNull();
    expect(responsavel.rotulos).toHaveLength(2);
  });

  it('lê espelho e fórmula por display_value, não por text', async () => {
    // Coluna espelho vem com `text` vazio. Ignorar `display_value` faria a
    // coluna inteira parecer vazia no levantamento.
    const execucaoId = await semear([
      item('1', 'ATIVOS', [{ id: 'espelho', text: '', display_value: 'ALENCAR MAZZEO' }]),
      item('2', 'ATIVOS', [{ id: 'espelho', text: '', display_value: 'ALENCAR MAZZEO' }]),
    ]);

    const l = await levantarRotulos(execucaoId, MAPA, TITULOS);
    const empr = l.colunas.find((c) => c.titulo === 'EMPREENDIMENTO')!;

    expect(empr.preenchidos).toBe(2);
    expect(empr.vazios).toBe(0);
    expect(empr.rotulos[0]!.valor).toBe('ALENCAR MAZZEO');
  });

  it('separa preenchidos de vazios', async () => {
    const execucaoId = await semear([
      item('1', 'ATIVOS', [{ id: 'livre', text: 'Rescisão' }]),
      item('2', 'ATIVOS', [{ id: 'livre', text: '' }]),
      item('3', 'ATIVOS', [{ id: 'livre', text: '   ' }]),
    ]);

    const l = await levantarRotulos(execucaoId, MAPA, TITULOS);
    const motivo = l.colunas.find((c) => c.titulo === 'MOTIVO')!;

    expect(motivo.preenchidos).toBe(1);
    expect(motivo.vazios).toBe(2);
  });

  it('coluna sem título conhecido aparece pelo id, não some', async () => {
    const execucaoId = await semear([
      item('1', 'ATIVOS', [{ id: 'coluna_nova_do_monday', text: 'VALOR X' }]),
    ]);

    const l = await levantarRotulos(execucaoId, MAPA, TITULOS);
    const nova = l.colunas.find((c) => c.id === 'coluna_nova_do_monday')!;

    expect(nova).toBeDefined();
    expect(nova.titulo).toContain('coluna_nova_do_monday');
    expect(nova.rotulos[0]!.valor).toBe('VALOR X');
  });
});

describe('cobertura das regras de judicialização', () => {
  const rotulo = (valor: string, ocorrencias = 1): RotuloEncontrado => ({
    valor,
    ocorrencias,
    exemplos: ['1'],
  });

  it('classifica os rótulos cobertos e separa os que não estão', () => {
    const a = analisarCoberturaJudicializacao('MEU TRABALHO', [
      rotulo('ACAO AJUIZADA', 10),
      rotulo('ENVIAR PARA ADVOGADO', 5),
      rotulo('RÓTULO QUE NINGUÉM PREVIU', 7),
    ]);

    expect(a.total).toBe(3);
    expect(a.cobertos).toBe(2);
    expect(a.emRevisao).toBe(1);
    // A quantidade de REGISTROS afetados, e não de rótulos: é o número que
    // permite avaliar o tamanho do problema.
    expect(a.registrosEmRevisao).toBe(7);

    const porValor = Object.fromEntries(a.rotulos.map((r) => [r.valor, r.cobertura]));
    expect(porValor['ACAO AJUIZADA']).toBe('judicializado');
    expect(porValor['ENVIAR PARA ADVOGADO']).toBe('nao_judicializado');
    expect(porValor['RÓTULO QUE NINGUÉM PREVIU']).toBe('revisao_necessaria');
  });

  it('cobrança extrajudicial NÃO é judicializada', () => {
    const a = analisarCoberturaJudicializacao('MEU TRABALHO', [rotulo('COBRANCA EXTRAJUDICIAL')]);
    expect(a.rotulos[0]!.cobertura).toBe('nao_judicializado');
  });

  it('propõe regra para rótulo não coberto, SEM aplicá-la', () => {
    const a = analisarCoberturaJudicializacao('MEU TRABALHO', [
      rotulo('AUDIENCIA MARCADA', 12),
    ]);

    expect(a.rotulos[0]!.cobertura).toBe('revisao_necessaria');

    const p = a.propostas[0]!;
    expect(p.rotulo).toBe('AUDIENCIA MARCADA');
    expect(p.registrosAfetados).toBe(12);
    expect(p.lista).toBe('TERMOS_JUDICIAL');
    expect(p.termoSugerido).toBe('audiencia');
    expect(p.justificativa).toMatch(/confirmar/i);
    // A proposta é texto para o humano decidir. A classificação do registro
    // permanece em revisão até a aprovação.
    expect(a.rotulos[0]!.cobertura).toBe('revisao_necessaria');
  });

  it('"AGUARDANDO SENTENÇA" fica indefinido: tem indício dos dois lados', () => {
    // "aguardando" sugere etapa anterior; "sentenca" sugere processo em curso.
    // Inferir aqui seria escolher no lugar de quem conhece o fluxo.
    const a = analisarCoberturaJudicializacao('MEU TRABALHO', [
      rotulo('AGUARDANDO SENTENCA', 4),
    ]);
    expect(a.propostas[0]!.lista).toBe('indefinida');
  });

  it('rótulo com indícios dos dois lados não recebe sugestão de lista', () => {
    const a = analisarCoberturaJudicializacao('MEU TRABALHO', [
      rotulo('ACORDO EM AUDIENCIA', 3),
    ]);

    const p = a.propostas[0]!;
    expect(p.lista).toBe('indefinida');
    expect(p.justificativa).toMatch(/indícios dos dois lados|decisão da equipe/i);
  });

  it('rótulo sem nenhum termo reconhecível pede explicação da equipe', () => {
    const a = analisarCoberturaJudicializacao('MEU TRABALHO', [rotulo('XPTO-42', 2)]);

    const p = a.propostas[0]!;
    expect(p.lista).toBe('indefinida');
    expect(p.termoSugerido).toBeNull();
    expect(p.justificativa).toMatch(/não contém nenhum termo reconhecível/i);
  });

  it('quando tudo está coberto, não há proposta nenhuma', () => {
    const a = analisarCoberturaJudicializacao('MEU TRABALHO', [
      rotulo('ACAO AJUIZADA'),
      rotulo('COBRANCA EXTRAJUDICIAL'),
    ]);

    expect(a.emRevisao).toBe(0);
    expect(a.propostas).toEqual([]);
  });
});
