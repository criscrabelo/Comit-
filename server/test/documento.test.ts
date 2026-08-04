/**
 * Validacao de CPF/CNPJ por digito verificador.
 *
 * Regra obrigatoria da Fase 1. O ponto central dos testes negativos: documento
 * com o TAMANHO certo e o DIGITO errado precisa ser recusado — se passasse, dois
 * clientes diferentes poderiam ser unificados por um documento invalido.
 */
import { describe, expect, it } from 'vitest';
import {
  avaliarDocumento,
  formatarDocumento,
  mascararDocumento,
  validarCnpj,
  validarCpf,
} from '../src/dominio/documento.js';

describe('validarCpf', () => {
  it('aceita CPF valido', () => {
    // Valores validos conhecidos, usados tambem nos testes da skill.
    expect(validarCpf('52998224725')).toBe(true);
    expect(validarCpf('11144477735')).toBe(true);
  });

  it('recusa CPF com digito verificador errado', () => {
    // Mesmo CPF valido acima, com o ultimo digito trocado.
    expect(validarCpf('52998224726')).toBe(false);
    expect(validarCpf('11144477736')).toBe(false);
  });

  it('recusa sequencia de digito repetido', () => {
    for (const d of '0123456789') {
      expect(validarCpf(d.repeat(11))).toBe(false);
    }
  });

  it('recusa comprimento errado', () => {
    expect(validarCpf('5299822472')).toBe(false);
    expect(validarCpf('529982247250')).toBe(false);
    expect(validarCpf('')).toBe(false);
  });
});

describe('validarCnpj', () => {
  it('aceita CNPJ valido', () => {
    expect(validarCnpj('11222333000181')).toBe(true);
  });

  it('recusa CNPJ com digito verificador errado', () => {
    expect(validarCnpj('11222333000182')).toBe(false);
    expect(validarCnpj('11222333000191')).toBe(false);
  });

  it('recusa sequencia de digito repetido', () => {
    expect(validarCnpj('11111111111111')).toBe(false);
    expect(validarCnpj('00000000000000')).toBe(false);
  });

  it('recusa comprimento errado', () => {
    expect(validarCnpj('1122233300018')).toBe(false);
    expect(validarCnpj('112223330001811')).toBe(false);
  });
});

describe('avaliarDocumento', () => {
  it('reconhece CPF formatado e preserva o original', () => {
    const r = avaliarDocumento('529.982.247-25');
    expect(r.valido).toBe(true);
    expect(r.tipo).toBe('PF');
    expect(r.digitos).toBe('52998224725');
    // O valor da fonte nunca e descartado.
    expect(r.original).toBe('529.982.247-25');
    expect(r.motivo).toBeNull();
  });

  it('reconhece CNPJ formatado', () => {
    const r = avaliarDocumento('11.222.333/0001-81');
    expect(r.valido).toBe(true);
    expect(r.tipo).toBe('PJ');
    expect(r.digitos).toBe('11222333000181');
  });

  it('marca invalido com motivo, sem lancar excecao', () => {
    // Interromper a carga por um documento errado apagaria o resto do lote.
    const r = avaliarDocumento('529.982.247-26');
    expect(r.valido).toBe(false);
    expect(r.tipo).toBe('PF');
    expect(r.digitos).toBe('52998224726');
    expect(r.motivo).toMatch(/digito verificador invalido/i);
  });

  it('relata comprimento inesperado com o numero de digitos', () => {
    const r = avaliarDocumento('123456');
    expect(r.valido).toBe(false);
    expect(r.tipo).toBeNull();
    expect(r.motivo).toContain('6 digitos');
  });

  it('trata ausencia e texto sem digitos', () => {
    expect(avaliarDocumento(null).motivo).toBe('documento ausente');
    expect(avaliarDocumento('   ').motivo).toBe('documento ausente');
    expect(avaliarDocumento('nao informado').motivo).toBe('documento sem digitos');
  });
});

describe('exibicao', () => {
  it('formata para quem tem permissao', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('mascara escondendo o numero e preservando a forma', () => {
    const cpf = mascararDocumento('52998224725');
    expect(cpf).toBe('***.***.***-25');
    // O corpo do documento nao pode aparecer no valor mascarado.
    expect(cpf).not.toContain('529');
    expect(cpf).not.toContain('982');

    const cnpj = mascararDocumento('11222333000181');
    expect(cnpj).toBe('**.***.***/****-81');
    expect(cnpj).not.toContain('222');
  });

  it('mascara documento de tamanho inesperado sem revelar nada', () => {
    expect(mascararDocumento('123456')).toBe('[documento mascarado]');
  });
});
