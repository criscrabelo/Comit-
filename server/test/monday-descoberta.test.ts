/**
 * Levantamento da forma de um quadro — o passo zero de homologar quadro novo.
 *
 * O que estes testes garantem: que a apuração enxerga a coluna que ninguém
 * mapeou, que valor de texto livre NÃO entra no levantamento (é evidência
 * versionada), que coluna espelho e fórmula são lidas por `display_value`, e
 * que a conferência de uma definição contra o quadro real acusa campo sem
 * coluna em vez de deixá-lo virar nulo em silêncio — que foi como
 * `'MEU TRABALHO'` passou desapercebido na homologação de processos.
 */
import { describe, expect, it } from 'vitest';
import type { ColunaMonday, ItemMonday } from '../src/integracoes/monday/cliente.js';
import { apurarForma, conferirDefinicao } from '../src/integracoes/monday/descoberta.js';

const COLUNAS: ColunaMonday[] = [
  { id: 'name', title: 'Name', type: 'name' },
  { id: 'status5', title: "'MEU TRABALHO'", type: 'status' },
  { id: 'texto', title: 'NOME DA PARTE / REFERÊNCIA', type: 'text' },
  { id: 'espelho', title: 'EMPREENDIMENTO', type: 'mirror' },
  { id: 'formula1', title: 'CRÉDITO', type: 'formula' },
  { id: 'valor', title: 'VALOR DA CAUSA', type: 'numbers' },
  { id: 'vazia', title: 'PEDIDO', type: 'status' },
];

function item(
  id: string,
  grupo: string,
  valores: Record<string, { text?: string; display?: string }>,
): ItemMonday {
  return {
    id,
    name: `item ${id}`,
    group: { id: 'g', title: grupo },
    created_at: null,
    updated_at: null,
    column_values: Object.entries(valores).map(([idColuna, v]) => ({
      id: idColuna,
      text: v.text ?? null,
      value: null,
      type: null,
      display_value: v.display ?? null,
    })),
  };
}

const ITENS: ItemMonday[] = [
  item('1', 'SAN MARINO', {
    status5: { text: 'ACOMPANHANDO' },
    texto: { text: 'MARIA E RODOLFO' },
    espelho: { display: 'SAN MARINO' },
    formula1: { display: '1200.50' },
    valor: { text: '10000' },
  }),
  item('2', 'SAN MARINO', {
    status5: { text: 'ACOMPANHANDO' },
    texto: { text: 'CPF 123.456.789-00 em campo livre' },
    espelho: { display: 'SAN MARINO' },
    formula1: { display: '0' },
    valor: { text: '20000' },
  }),
  item('3', 'COEVO', {
    status5: { text: 'ACORDO' },
    texto: { text: 'PREFEITURA LAMBARI' },
    espelho: { display: 'COEVO' },
    formula1: { display: '0' },
    valor: { text: '30000' },
  }),
];

const forma = apurarForma({
  quadroId: '5959705266',
  nome: '(JUR) PROCESSOS JUDICIAIS',
  colunas: COLUNAS,
  itens: ITENS,
});

const coluna = (titulo: string) => forma.colunas.find((c) => c.titulo === titulo)!;

describe('apuração da forma do quadro', () => {
  it('conta os grupos a partir dos itens, ordenados por quantidade', () => {
    expect(forma.grupos).toEqual([
      { valor: 'SAN MARINO', ocorrencias: 2 },
      { valor: 'COEVO', ocorrencias: 1 },
    ]);
  });

  it('levanta os valores da coluna cujo título tem apóstrofos', () => {
    const c = coluna("'MEU TRABALHO'");

    expect(c.chave).toBe('MEU TRABALHO');
    expect(c.valores).toEqual([
      { valor: 'ACOMPANHANDO', ocorrencias: 2 },
      { valor: 'ACORDO', ocorrencias: 1 },
    ]);
  });

  it('NÃO lista valores de coluna de texto livre, mas conta o preenchimento', () => {
    const c = coluna('NOME DA PARTE / REFERÊNCIA');

    expect(c.valoresOmitidos).toBe(true);
    expect(c.valores).toEqual([]);
    expect(c.preenchidos).toBe(3);
    expect(c.distintos).toBe(3);
  });

  it('nenhum documento sobrevive à apuração, nem na estrutura em memória', () => {
    expect(JSON.stringify(forma)).not.toContain('123.456.789-00');
  });

  it('lê coluna espelho e fórmula por display_value', () => {
    expect(coluna('EMPREENDIMENTO').valores).toEqual([
      { valor: 'SAN MARINO', ocorrencias: 2 },
      { valor: 'COEVO', ocorrencias: 1 },
    ]);
    expect(coluna('CRÉDITO').preenchidos).toBe(3);
  });

  it('coluna vazia em todos os itens aparece com zero preenchidos', () => {
    const c = coluna('PEDIDO');

    expect(c.preenchidos).toBe(0);
    expect(c.vazios).toBe(3);
    expect(c.valores).toEqual([]);
  });

  it('a coluna de nome do item não entra no levantamento', () => {
    expect(forma.colunas.map((c) => c.id)).not.toContain('name');
  });

  it('coluna com um valor por item é marcada como identificadora', () => {
    const muitos = Array.from({ length: 40 }, (_, i) =>
      item(String(i), 'G', { valor: { text: String(1000 + i) } }),
    );
    const f = apurarForma({
      quadroId: '1',
      nome: 'q',
      colunas: [{ id: 'valor', title: 'VALOR DA CAUSA', type: 'numbers' }],
      itens: muitos,
    });

    expect(f.colunas[0]!.pareceIdentificadora).toBe(true);
  });

  it('coluna de rótulo com poucos valores NÃO é marcada como identificadora', () => {
    expect(coluna("'MEU TRABALHO'").pareceIdentificadora).toBe(false);
  });
});

describe('conferência de definição contra o quadro real', () => {
  it('casa o campo mesmo quando o título real tem apóstrofos', () => {
    const { encontrados } = conferirDefinicao({ situacao: ['MEU TRABALHO'] }, forma);

    expect(encontrados).toEqual([
      { campo: 'situacao', tituloEncontrado: "'MEU TRABALHO'", idColuna: 'status5' },
    ]);
  });

  it('acusa campo sem coluna, em vez de deixá-lo virar nulo em silêncio', () => {
    const { ausentes } = conferirDefinicao(
      { cpf_cnpj: ['CPF/CNPJ', 'DOCUMENTO'], contrato: ['CONTRATO'] },
      forma,
    );

    expect(ausentes).toEqual(['cpf_cnpj', 'contrato']);
  });

  it('respeita a ordem de preferência dos títulos aceitos', () => {
    const { encontrados } = conferirDefinicao(
      { empreendimento: ['OBRA', 'EMPREENDIMENTO'] },
      forma,
    );

    expect(encontrados[0]!.tituloEncontrado).toBe('EMPREENDIMENTO');
  });

  it('não sugere título nenhum para campo ausente', () => {
    const { encontrados, ausentes } = conferirDefinicao({ comarca: ['COMARCA'] }, forma);

    expect(encontrados).toEqual([]);
    expect(ausentes).toEqual(['comarca']);
  });
});
