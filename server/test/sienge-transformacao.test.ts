/**
 * Transformação dos payloads do Sienge — funções puras.
 *
 * Provam as regras que não dependem de rede nem de banco: residuo decimal
 * tratado, campo ausente nunca virando zero, situação do título derivada dos
 * sinalizadores, faixa de atraso e a separação entre juros/multa (que o
 * Sienge não confirma separados) e o saldo agregado.
 */
import { describe, expect, it } from 'vitest';
import {
  diasDeAtraso,
  faixaDeAtraso,
  paraDecimal,
  paraDia,
  transformarCliente,
  transformarComissao,
  transformarEmpreendimento,
  transformarParcela,
  transformarSaldo,
  transformarTitulo,
} from '../src/integracoes/sienge/transformacao.js';

describe('paraDecimal — residuo de float nunca chega ao banco', () => {
  it('arredonda o residuo real do ambiente (§8.6 do levantamento)', () => {
    expect(paraDecimal(341233.7699999997)).toBe('341233.77');
  });

  it('preserva null como ausencia, nunca zero', () => {
    expect(paraDecimal(null)).toBeNull();
    expect(paraDecimal(undefined)).toBeNull();
  });

  it('zero explicito continua zero — nao e a mesma coisa que ausente', () => {
    expect(paraDecimal(0)).toBe('0.00');
  });
});

describe('paraDia — so aceita yyyy-MM-dd', () => {
  it('aceita o formato confirmado', () => {
    expect(paraDia('2026-08-06')).toBe('2026-08-06');
  });

  it('trunca timestamp para a data', () => {
    expect(paraDia('2026-08-06T10:00:00Z')).toBe('2026-08-06');
  });

  it('recusa formato invalido em vez de adivinhar', () => {
    expect(paraDia('06/08/2026')).toBeNull();
    expect(paraDia('')).toBeNull();
    expect(paraDia(null)).toBeNull();
  });
});

describe('diasDeAtraso e faixaDeAtraso', () => {
  it('vencimento no futuro nao atrasa', () => {
    expect(diasDeAtraso('2026-09-01', '2026-08-06')).toBe(0);
  });

  it('conta dias corridos entre vencimento e referencia', () => {
    expect(diasDeAtraso('2026-07-01', '2026-08-06')).toBe(36);
  });

  it('sem vencimento nao ha atraso calculavel', () => {
    expect(diasDeAtraso(null, '2026-08-06')).toBeNull();
  });

  it('zero dia nao e faixa: em dia e ausencia de faixa, nao uma faixa "0"', () => {
    expect(faixaDeAtraso(0)).toBeNull();
    expect(faixaDeAtraso(null)).toBeNull();
  });

  it('classifica nas cinco faixas do enum do banco', () => {
    expect(faixaDeAtraso(15)).toBe('1-30');
    expect(faixaDeAtraso(45)).toBe('31-60');
    expect(faixaDeAtraso(75)).toBe('61-90');
    expect(faixaDeAtraso(100)).toBe('91-120');
    expect(faixaDeAtraso(200)).toBe('>120');
  });
});

describe('transformarEmpreendimento', () => {
  it('usa o nome comercial quando presente, senao o nome oficial', () => {
    const r = transformarEmpreendimento({ id: 1, name: 'OFICIAL', commercialName: 'COMERCIAL' });
    expect(r?.nome).toBe('COMERCIAL');
  });

  it('sem nome nenhum, o registro e recusado — nao inventa rotulo', () => {
    expect(transformarEmpreendimento({ id: 1, name: null, commercialName: null })).toBeNull();
  });

  it('preserva a empresa do payload real, com a grafia adress inclusa', () => {
    const r = transformarEmpreendimento({
      id: 1, name: 'X', companyName: 'TETUS - CONSTRUTORA', adress: 'RUA X',
    });
    expect(r?.empresa).toBe('TETUS - CONSTRUTORA');
  });
});

describe('transformarCliente', () => {
  it('CPF valido (digito verificador) ganha tipo PF e documento normalizado', () => {
    const r = transformarCliente({ id: 1, name: 'Fulano', cpf: '111.444.777-35' });
    expect(r?.cpf_cnpj).toBe('11144477735');
    expect(r?.cpf_cnpj_valido).toBe(true);
    expect(r?.tipo_pessoa).toBe('PF');
  });

  it('CNPJ valido ganha tipo PJ', () => {
    const r = transformarCliente({ id: 2, name: 'Empresa', cnpj: '11.222.333/0001-81' });
    expect(r?.cpf_cnpj).toBe('11222333000181');
    expect(r?.cpf_cnpj_valido).toBe(true);
    expect(r?.tipo_pessoa).toBe('PJ');
  });

  it('documento com digito verificador invalido grava mas nao valida', () => {
    const r = transformarCliente({ id: 3, name: 'Suspeito', cpf: '11144477736' });
    expect(r?.cpf_cnpj_valido).toBe(false);
  });

  it('sem documento nenhum, cpf_cnpj_valido e null — nao false', () => {
    const r = transformarCliente({ id: 4, name: 'SemDoc' });
    expect(r?.cpf_cnpj).toBeNull();
    expect(r?.cpf_cnpj_valido).toBeNull();
  });

  it('sem nome, o registro e recusado', () => {
    expect(transformarCliente({ id: 5, name: null })).toBeNull();
  });
});

describe('transformarTitulo — situacao por prioridade de sinalizador', () => {
  const base = { receivableBillId: 1, customerId: 10, companyId: 1 };

  it('quitado vence qualquer outro sinalizador', () => {
    const r = transformarTitulo({ ...base, payOffDate: '2026-08-01', subjudice: true, defaulting: true }, 'X');
    expect(r.situacao).toBe('quitado');
  });

  it('sub judice pesa mais que inadimplencia', () => {
    const r = transformarTitulo({ ...base, subjudice: true, defaulting: true }, 'X');
    expect(r.situacao).toBe('sub_judice');
  });

  it('inadimplente sem sub judice', () => {
    const r = transformarTitulo({ ...base, defaulting: true }, 'X');
    expect(r.situacao).toBe('inadimplente');
  });

  it('sem sinalizador nenhum, em dia', () => {
    const r = transformarTitulo(base, 'X');
    expect(r.situacao).toBe('em_dia');
  });

  it('saldo_atualizado fica nulo: vem de outro endpoint, nao deste', () => {
    const r = transformarTitulo({ ...base, receivableBillValue: 341233.77 }, 'X');
    expect(r.valor_nominal).toBe('341233.77');
    expect(r.saldo_atualizado).toBeNull();
  });
});

describe('transformarParcela', () => {
  it('parcela com saldo zero e quitada e nunca conta atraso', () => {
    const r = transformarParcela(
      { receivableBillId: 1, installmentId: 1, dueDate: '2020-01-01', balanceDue: 0 },
      '2026-08-06',
    );
    expect(r.status).toBe('quitada');
    expect(r.dias_atraso).toBe(0);
    expect(r.faixa).toBeNull();
  });

  it('parcela vencida com saldo positivo entra na faixa correta', () => {
    const r = transformarParcela(
      { receivableBillId: 1, installmentId: 2, dueDate: '2026-07-01', balanceDue: 7000 },
      '2026-08-06',
    );
    expect(r.status).toBe('vencida');
    expect(r.dias_atraso).toBe(36);
    expect(r.faixa).toBe('31-60');
    expect(r.saldo_vencido).toBe('7000.00');
  });

  it('juros e multa ficam nulos: o Sienge nao os separa (§10 do levantamento)', () => {
    const r = transformarParcela(
      { receivableBillId: 1, installmentId: 3, dueDate: '2026-07-01', balanceDue: 100 },
      '2026-08-06',
    );
    expect(r.juros).toBeNull();
    expect(r.multa).toBeNull();
  });

  it('valor_nominal fica nulo: o endpoint so devolve saldo, nao original', () => {
    const r = transformarParcela(
      { receivableBillId: 1, installmentId: 4, dueDate: '2026-09-01', balanceDue: 500 },
      '2026-08-06',
    );
    expect(r.valor_nominal).toBeNull();
    expect(r.status).toBe('a_vencer');
  });
});

describe('transformarComissao', () => {
  it('beneficiario e o corretor faturado quando existe', () => {
    const r = transformarComissao({
      commissionID: 1, brokerName: 'Corretor A', billingBrokerName: 'Corretor B (faturado)',
    });
    expect(r.beneficiario).toBe('Corretor B (faturado)');
  });

  it('sem faturado, cai no corretor da venda', () => {
    const r = transformarComissao({ commissionID: 1, brokerName: 'Corretor A' });
    expect(r.beneficiario).toBe('Corretor A');
  });
});

describe('transformarSaldo', () => {
  it('acrescimos agregados NAO viram saldo_vencido — sao coisas diferentes', () => {
    const r = transformarSaldo({
      totalOriginalValue: 341233.77,
      totalAdditionalValue: 1200,
      totalCurrentDebitBalanceValue: 341233.77,
    });
    expect(r.saldo_vencido).toBeNull();
    expect(r.saldo_atualizado).toBe('341233.77');
  });
});
