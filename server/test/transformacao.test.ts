/**
 * Transformacoes do Monday.
 *
 * Cada teste aqui protege uma regra descoberta contra os quadros reais da Coevo.
 * A auditoria mostrou que essas regras existem em uma base de codigo e faltam em
 * outra — os testes existem para que a convergencia nao as perca.
 */
import { describe, expect, it } from 'vitest';
import {
  classificarCategoriaDistrato,
  classificarJudicializacao,
  competenciaDoGrupo,
  extrairLocalizacao,
  interpretarAtuacao,
  lerColuna,
  normalizarContrato,
  normalizarEstagio,
  normalizarNome,
  paraBooleano,
  paraData,
  paraInteiro,
  paraNumero,
} from '../src/integracoes/monday/transformacao.js';
import type { ItemMonday } from '../src/integracoes/monday/cliente.js';

const item = (colunas: Array<Partial<{ id: string; text: string | null; display_value: string | null }>>): ItemMonday => ({
  id: '1',
  name: 'item',
  group: null,
  created_at: null,
  updated_at: null,
  column_values: colunas.map((c) => ({
    id: c.id ?? 'x',
    text: c.text ?? null,
    value: null,
    type: null,
    display_value: c.display_value ?? null,
  })),
});

describe('lerColuna', () => {
  it('le o texto quando presente', () => {
    expect(lerColuna(item([{ id: 'a', text: ' MORATTA ' }]), 'a')).toBe('MORATTA');
  });

  it('cai para display_value em coluna mirror/formula', () => {
    // Colunas espelhadas vem com text vazio. Sem este fallback, o valor
    // simplesmente desapareceria — foi o que aconteceu no code-drop paralelo.
    expect(lerColuna(item([{ id: 'a', text: '', display_value: 'AURORA' }]), 'a')).toBe('AURORA');
  });

  it('devolve vazio para coluna inexistente ou id nulo', () => {
    expect(lerColuna(item([{ id: 'a', text: 'x' }]), 'b')).toBe('');
    expect(lerColuna(item([]), null)).toBe('');
  });
});

describe('normalizarNome', () => {
  it('remove acento, pontuacao e espaco duplo', () => {
    expect(normalizarNome('  José   da Silva-Souza ')).toBe('JOSE DA SILVA SOUZA');
    expect(normalizarNome('Conceição Ávila')).toBe('CONCEICAO AVILA');
  });

  it('nomes diferentes continuam diferentes depois de normalizar', () => {
    // Normalizar nao autoriza unir nomes parecidos.
    expect(normalizarNome('Joao Silva')).not.toBe(normalizarNome('Joao Silveira'));
  });
});

describe('normalizarContrato', () => {
  it('remove separadores e preserva letras', () => {
    expect(normalizarContrato('CT-2024/001')).toBe('CT2024001');
    expect(normalizarContrato(' 12.345-6 ')).toBe('123456');
  });

  it('devolve null quando nao sobra nada', () => {
    expect(normalizarContrato('---')).toBeNull();
    expect(normalizarContrato(null)).toBeNull();
  });
});

describe('paraNumero', () => {
  it('interpreta moeda em pt-BR', () => {
    expect(paraNumero('R$ 1.234,56')).toBe(1234.56);
    expect(paraNumero('66.071,10')).toBe(66071.1);
    expect(paraNumero('1.234.567,89')).toBe(1234567.89);
  });

  it('interpreta formato en', () => {
    expect(paraNumero('1234.56')).toBe(1234.56);
    expect(paraNumero('1,234,567.89')).toBe(1234567.89);
  });

  it('distingue virgula decimal de separador de milhar', () => {
    expect(paraNumero('1,5')).toBe(1.5);
    expect(paraNumero('1,234')).toBe(1234);
  });

  it('devolve null para ausencia, nao zero', () => {
    // Zero e um valor legitimo; confundi-lo com ausencia falsearia indicador.
    expect(paraNumero('')).toBeNull();
    expect(paraNumero(null)).toBeNull();
    expect(paraNumero('nao informado')).toBeNull();
    expect(paraNumero('0')).toBe(0);
  });

  it('trata espaco inquebravel de valores formatados', () => {
    expect(paraNumero('R$ 1.000,00')).toBe(1000);
  });
});

describe('paraInteiro', () => {
  it('trunca e aceita negativo', () => {
    expect(paraInteiro('45,9')).toBe(45);
    expect(paraInteiro('-3')).toBe(-3);
    expect(paraInteiro('')).toBeNull();
  });
});

describe('paraData', () => {
  it('aceita ISO e dd/mm/yyyy', () => {
    expect(paraData('2026-07-31')).toBe('2026-07-31');
    expect(paraData('31/07/2026')).toBe('2026-07-31');
    expect(paraData('1/7/2026')).toBe('2026-07-01');
  });

  it('recusa data inexistente em vez de aproximar', () => {
    // O Date normalizaria 31/02 para marco em silencio.
    expect(paraData('31/02/2026')).toBeNull();
    expect(paraData('2026-02-31')).toBeNull();
    expect(paraData('2026-13-01')).toBeNull();
  });

  it('recusa texto sem data', () => {
    expect(paraData('a definir')).toBeNull();
    expect(paraData('')).toBeNull();
  });
});

describe('paraBooleano', () => {
  it('interpreta as formas usadas nos quadros', () => {
    expect(paraBooleano('Sim')).toBe(true);
    expect(paraBooleano('NÃO')).toBe(false);
    expect(paraBooleano('x')).toBe(true);
    expect(paraBooleano('talvez')).toBeNull();
    expect(paraBooleano('')).toBeNull();
  });
});

describe('extrairLocalizacao', () => {
  it('separa torre do nome do empreendimento', () => {
    // Sem esta regra cada torre viraria um empreendimento diferente.
    const r = extrairLocalizacao('AURORA TORRE B', 'AURORA 1105B');
    expect(r.empreendimento).toBe('AURORA');
    expect(r.torre).toBe('TORRE B');
    expect(r.unidade).toBe('1105B');
  });

  it('extrai unidade removendo o prefixo do empreendimento', () => {
    const r = extrairLocalizacao('MORATTA', 'MORATTA APTO 703A');
    expect(r.empreendimento).toBe('MORATTA');
    expect(r.unidade).toBe('APTO 703A');
  });

  it('mantem o nome do item quando nao ha prefixo a remover', () => {
    const r = extrairLocalizacao('ALAMEDA', '204');
    expect(r.unidade).toBe('204');
  });

  it('funciona sem torre', () => {
    const r = extrairLocalizacao('CARPE DIEM', 'CARPE DIEM 12');
    expect(r.torre).toBeNull();
    expect(r.empreendimento).toBe('CARPE DIEM');
  });

  it('nao quebra com caractere especial no nome', () => {
    const r = extrairLocalizacao('RESIDENCIAL (FASE 1)', 'RESIDENCIAL (FASE 1) 33');
    expect(r.unidade).toBe('33');
  });
});

describe('normalizarEstagio', () => {
  it('reconhece resolvida', () => {
    expect(normalizarEstagio('RESOLVIDO')).toBe('Resolvida');
    expect(normalizarEstagio('Unidade Retomada')).toBe('Resolvida');
  });

  it('trata o resto como em andamento', () => {
    expect(normalizarEstagio('AGUARDANDO')).toBe('Em Andamento');
    expect(normalizarEstagio('')).toBe('Em Andamento');
  });
});

describe('classificarCategoriaDistrato', () => {
  it('distingue distrato de desistencia pelo grupo', () => {
    // O code-drop paralelo perdeu esta distincao e passou a contar as duas juntas.
    expect(classificarCategoriaDistrato('DISTRATOS 2026', 'distratos')).toBe('distrato');
    expect(classificarCategoriaDistrato('DESISTÊNCIAS 2026', 'distratos')).toBe('desistencia');
  });

  it('reconhece retomada e recompra', () => {
    expect(classificarCategoriaDistrato('RETOMADAS JULHO', 'distratos')).toBe('retomada');
    expect(classificarCategoriaDistrato('RE-COMPRA', 'distratos')).toBe('recompra');
    expect(classificarCategoriaDistrato('RECOMPRAS', 'distratos')).toBe('recompra');
  });

  it('no quadro dedicado de retomadas, o padrao e retomada', () => {
    expect(classificarCategoriaDistrato('JULHO 2026', 'retomadas')).toBe('retomada');
    expect(classificarCategoriaDistrato('RECOMPRA', 'retomadas')).toBe('recompra');
  });
});

describe('classificarJudicializacao', () => {
  it('reconhece judicializacao', () => {
    for (const s of [
      'PROCESSO JUDICIAL',
      'AÇÃO AJUIZADA',
      'PROCESSO DISTRIBUÍDO',
      'EXECUÇÃO JUDICIAL',
      'CUMPRIMENTO DE SENTENÇA',
    ]) {
      expect(classificarJudicializacao(s).judicializado, s).toBe(true);
    }
  });

  it('NAO judicializa encaminhamento ao juridico', () => {
    // Confundir os dois inflaria a taxa de judicializacao.
    for (const s of [
      'ENVIAR PARA ADVOGADO',
      'ENCAMINHADO AO JURÍDICO',
      'ANÁLISE JURÍDICA',
      'AGUARDANDO AJUIZAMENTO',
      'COBRANÇA EXTRAJUDICIAL',
      'DOCUMENTAÇÃO PARA PROCESSO',
      // "extrajudicial" contem "judicial": sem tratamento explicito, toda
      // cobranca extrajudicial seria contada como judicializada.
      'EXECUÇÃO EXTRAJUDICIAL',
      'ACORDO EXTRAJUDICIAL',
      'NOTIFICAÇÃO EXTRAJUDICIAL',
    ]) {
      const r = classificarJudicializacao(s);
      expect(r.judicializado, s).toBe(false);
      expect(r.revisaoNecessaria, s).toBe(false);
    }
  });

  it('marca revisao necessaria quando nao da para decidir', () => {
    // Duvida nao vira sim nem nao em silencio.
    expect(classificarJudicializacao('EM ANÁLISE').revisaoNecessaria).toBe(true);
    expect(classificarJudicializacao('').revisaoNecessaria).toBe(true);
    expect(classificarJudicializacao(null).revisaoNecessaria).toBe(true);
  });

  it('termo forte vence a exclusao, mas pede revisao', () => {
    const r = classificarJudicializacao('AGUARDANDO AJUIZAMENTO - PROCESSO JUDICIAL DISTRIBUÍDO');
    expect(r.judicializado).toBe(true);
    expect(r.revisaoNecessaria).toBe(true);
  });
});

describe('interpretarAtuacao', () => {
  it('reconhece interno e externo', () => {
    expect(interpretarAtuacao('INTERNO')).toEqual({ atuacao: 'INTERNO', interno: true });
    expect(interpretarAtuacao('EXTERNO Dr. Fulano')).toEqual({
      atuacao: 'EXTERNO Dr. Fulano',
      interno: false,
    });
  });

  it('nao inventa quando o valor nao diz', () => {
    // Esta coluna NAO e comarca: reaproveita-la como tal produziria indicador
    // geografico falso.
    expect(interpretarAtuacao('TAUBATÉ')).toEqual({ atuacao: 'TAUBATÉ', interno: null });
    expect(interpretarAtuacao('')).toEqual({ atuacao: null, interno: null });
  });
});

describe('competenciaDoGrupo', () => {
  it('deriva do nome do mes', () => {
    expect(competenciaDoGrupo('JULHO 2026')).toBe('2026-07');
    expect(competenciaDoGrupo('Março/2026')).toBe('2026-03');
    expect(competenciaDoGrupo('DEZEMBRO 2025')).toBe('2025-12');
  });

  it('aceita formatos numericos', () => {
    expect(competenciaDoGrupo('2026-07')).toBe('2026-07');
    expect(competenciaDoGrupo('07/2026')).toBe('2026-07');
    expect(competenciaDoGrupo('7/2026')).toBe('2026-07');
  });

  it('devolve null quando o grupo nao indica competencia', () => {
    expect(competenciaDoGrupo('CJ (REGRESSO)')).toBeNull();
    expect(competenciaDoGrupo('')).toBeNull();
    expect(competenciaDoGrupo('JULHO')).toBeNull();
  });
});
