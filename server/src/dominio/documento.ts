/**
 * Validacao de CPF e CNPJ pelos digitos verificadores.
 *
 * Regra obrigatoria: "CPF/CNPJ deve ser validado pelos digitos verificadores".
 * Documento com o tamanho certo e digito errado NAO serve como chave de vinculo
 * — entra no banco com valido=false e gera inconsistencia cpf_cnpj_invalido.
 *
 * Espelha scripts/comum.py:51-94 da skill, para que o backend e o motor de
 * analise concordem sobre o que e um documento valido.
 */

export type TipoPessoa = 'PF' | 'PJ';

export interface DocumentoAvaliado {
  /** Somente digitos. `null` quando nao havia nada aproveitavel. */
  digitos: string | null;
  valido: boolean;
  tipo: TipoPessoa | null;
  /** Preenchido quando invalido, para virar descricao de inconsistencia. */
  motivo: string | null;
  /** Valor exatamente como veio da fonte, preservado. */
  original: string | null;
}

/** CPF: dois digitos verificadores com pesos decrescentes. */
export function validarCpf(digitos: string): boolean {
  if (digitos.length !== 11) return false;
  // Sequencia de digito unico passa na aritmetica mas nao e documento valido.
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  for (const [tamanhoBase, pesoInicial] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < tamanhoBase; i++) {
      soma += Number(digitos[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    const esperado = resto === 10 ? 0 : resto;
    if (esperado !== Number(digitos[tamanhoBase])) return false;
  }

  return true;
}

/** CNPJ: dois digitos verificadores com a sequencia de pesos oficial. */
export function validarCnpj(digitos: string): boolean {
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const PESOS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  for (const tamanhoBase of [12, 13] as const) {
    const pesos = PESOS.slice(PESOS.length - tamanhoBase);
    let soma = 0;
    for (let i = 0; i < tamanhoBase; i++) {
      soma += Number(digitos[i]) * pesos[i]!;
    }
    const resto = soma % 11;
    const esperado = resto < 2 ? 0 : 11 - resto;
    if (esperado !== Number(digitos[tamanhoBase])) return false;
  }

  return true;
}

/**
 * Avalia um documento vindo de qualquer fonte.
 *
 * Nunca lanca excecao: devolve o veredito com o motivo, para que a ingestao
 * continue e a inconsistencia seja registrada. Interromper a carga por causa de
 * um documento errado apagaria o resto do lote.
 */
export function avaliarDocumento(valor: string | null | undefined): DocumentoAvaliado {
  const original = valor?.trim() || null;

  if (!original) {
    return { digitos: null, valido: false, tipo: null, motivo: 'documento ausente', original: null };
  }

  const digitos = original.replace(/\D/g, '');

  if (!digitos) {
    return {
      digitos: null,
      valido: false,
      tipo: null,
      motivo: 'documento sem digitos',
      original,
    };
  }

  if (digitos.length === 11) {
    const valido = validarCpf(digitos);
    return {
      digitos,
      valido,
      tipo: 'PF',
      motivo: valido ? null : 'CPF com digito verificador invalido',
      original,
    };
  }

  if (digitos.length === 14) {
    const valido = validarCnpj(digitos);
    return {
      digitos,
      valido,
      tipo: 'PJ',
      motivo: valido ? null : 'CNPJ com digito verificador invalido',
      original,
    };
  }

  return {
    digitos,
    valido: false,
    tipo: null,
    motivo: `documento com ${digitos.length} digitos (esperado 11 para CPF ou 14 para CNPJ)`,
    original,
  };
}

/** Formata para exibicao a quem tem permissao de ver o documento completo. */
export function formatarDocumento(digitos: string | null | undefined): string | null {
  if (!digitos) return null;
  if (digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }
  if (digitos.length === 14) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
  }
  return digitos;
}

/** Mascara para quem nao tem permissao. Preserva a forma, esconde o numero. */
export function mascararDocumento(digitos: string | null | undefined): string | null {
  if (!digitos) return null;
  if (digitos.length === 11) return `***.***.***-${digitos.slice(9)}`;
  if (digitos.length === 14) return `**.***.***/****-${digitos.slice(12)}`;
  return '[documento mascarado]';
}
