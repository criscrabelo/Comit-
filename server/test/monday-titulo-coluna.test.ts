/**
 * Resolução de coluna por título — o caso que a homologação real encontrou.
 *
 * O quadro (JUR) PROCESSOS JUDICIAIS tem uma coluna chamada `'MEU TRABALHO'`,
 * com os apóstrofos digitados dentro do título. A comparação exata não a
 * encontrava: `situacao` ficava nula nos 250 registros e 100% dos processos
 * caíam em `revisao_necessaria` — sem erro, sem aviso, com a taxa de
 * judicialização simplesmente indisponível.
 *
 * O que estes testes protegem: que aspas em volta do título não escondam a
 * coluna, e que **título exato continue vencendo** o que só casa depois de
 * remover aspas — do contrário, criar `'STATUS'` ao lado de `STATUS` trocaria
 * em silêncio qual coluna alimenta o campo.
 */
import { describe, expect, it } from 'vitest';
import {
  QUADROS,
  chaveDeColuna,
  mesmoTitulo,
  montarMapaColunas,
  resolverColuna,
  resolverMapa,
} from '../src/integracoes/monday/quadros.js';

/** As colunas do board 5959705266, como a API as devolve. */
const COLUNAS_REAIS = [
  { id: 'texto', title: 'NOME DA PARTE / REFERÊNCIA', type: 'text' },
  { id: 'texto7', title: 'UNIDADE', type: 'text' },
  { id: 'status5', title: "'MEU TRABALHO'", type: 'status' },
  { id: 'status8', title: 'TIPO DE AÇÃO', type: 'status' },
  { id: 'data8', title: 'CITAÇÃO/PROTOCOLO', type: 'date' },
  { id: 'status', title: 'POSIÇÃO', type: 'status' },
  { id: 'status4', title: 'MOTIVO', type: 'status' },
  { id: 'status44', title: 'COMARCA', type: 'status' },
  { id: 'n_meros46', title: 'VALOR DA CAUSA', type: 'numbers' },
  { id: 'status__1', title: 'EMPREENDIMENTO', type: 'status' },
  { id: 'status84__1', title: 'STATUS (para comitê)', type: 'status' },
  { id: 'status3', title: 'LOCAL', type: 'status' },
  { id: 'numeric_mky1m9me', title: 'HONORÁRIOS EFETIVADOS', type: 'numbers' },
  { id: 'date_mky1jzs1', title: 'DATA DE FINALIZAÇÃO', type: 'date' },
];

describe('resolução de coluna por título', () => {
  it('encontra a coluna cujo título real vem entre apóstrofos', () => {
    const mapa = montarMapaColunas(COLUNAS_REAIS);

    expect(resolverColuna(mapa, ['MEU TRABALHO'])?.id).toBe('status5');
  });

  it('o quadro real de processos resolve `situacao` — era o campo que faltava', () => {
    const { porCampo, ausentes } = resolverMapa(QUADROS.processos, COLUNAS_REAIS);

    expect(porCampo.get('situacao')).toBe('status5');
    expect(ausentes).not.toContain('situacao');
  });

  it('`STATUS (para comitê)` é reconhecido apesar da caixa mista', () => {
    const mapa = montarMapaColunas(COLUNAS_REAIS);

    expect(resolverColuna(mapa, ['STATUS (PARA COMITÊ)'])?.id).toBe('status84__1');
    expect(mesmoTitulo('STATUS (PARA COMITÊ)', 'STATUS (para comitê)')).toBe(true);
  });

  it('título exato vence o que só casa depois de remover aspas', () => {
    const mapa = montarMapaColunas([
      { id: 'com_aspas', title: "'STATUS'", type: 'status' },
      { id: 'exato', title: 'STATUS', type: 'status' },
    ]);

    expect(resolverColuna(mapa, ['STATUS'])?.id).toBe('exato');
  });

  it('aspas duplas e tipográficas também não escondem a coluna', () => {
    const mapa = montarMapaColunas([
      { id: 'a', title: '"COMARCA"', type: 'status' },
      { id: 'b', title: '“MOTIVO”', type: 'status' },
    ]);

    expect(resolverColuna(mapa, ['COMARCA'])?.id).toBe('a');
    expect(resolverColuna(mapa, ['MOTIVO'])?.id).toBe('b');
  });

  it('coluna cujo título é só aspas não entra no mapa nem casa com nada', () => {
    const mapa = montarMapaColunas([{ id: 'vazia', title: "''", type: 'status' }]);

    expect(resolverColuna(mapa, ['MOTIVO'])).toBeNull();
    expect(chaveDeColuna("''")).toBe('');
  });

  it('coluna espelhada continua perdendo para a de status com o mesmo título', () => {
    const mapa = montarMapaColunas([
      { id: 'espelho', title: 'EMPREENDIMENTO', type: 'mirror' },
      { id: 'status__1', title: 'EMPREENDIMENTO', type: 'status' },
    ]);

    expect(resolverColuna(mapa, ['EMPREENDIMENTO'])?.id).toBe('status__1');
  });

  it('título que não existe continua ausente — nada é presumido', () => {
    const { porCampo, ausentes } = resolverMapa(QUADROS.processos, COLUNAS_REAIS);

    expect(ausentes).toContain('cpf_cnpj');
    expect(porCampo.has('cpf_cnpj')).toBe(false);
  });
});
