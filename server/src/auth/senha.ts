/**
 * Hash de senha.
 *
 * Usa scrypt da biblioteca padrao do Node: memory-hard, sem compilacao nativa.
 * O algoritmo e os parametros ficam gravados no proprio valor, no formato
 *
 *   scrypt$N$r$p$<salt-base64>$<hash-base64>
 *
 * para que trocar de algoritmo depois (Argon2id, por exemplo) nao exija migracao
 * destrutiva: a verificacao le os parametros do registro, e o rehash acontece no
 * proximo login de cada pessoa.
 *
 * Substitui o PBKDF2 do code-drop paralelo, que usava parametros fixos e sem
 * versionamento.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  senha: string | Buffer,
  sal: Buffer,
  tamanho: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Custo alvo: ~100ms por hash em servidor comum. */
const PARAMETROS = { N: 2 ** 15, r: 8, p: 1 } as const;
const TAMANHO_SAL = 16;
const TAMANHO_HASH = 32;
/** scrypt exige maxmem >= 128 * N * r; folga de 2x para nao falhar por limite. */
const MAXMEM = 256 * PARAMETROS.N * PARAMETROS.r;

const ALGORITMO = 'scrypt';

export const TAMANHO_MINIMO_SENHA = 12;

/**
 * Valida a forca da senha antes de gerar o hash.
 * Comprimento acima de tudo: e o fator que mais custa a um atacante.
 */
export function validarForcaSenha(senha: string): { ok: boolean; motivo?: string } {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    return { ok: false, motivo: `A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.` };
  }
  if (senha.length > 256) {
    return { ok: false, motivo: 'A senha pode ter no maximo 256 caracteres.' };
  }
  if (/^\s|\s$/.test(senha)) {
    return { ok: false, motivo: 'A senha nao pode comecar nem terminar com espaco.' };
  }
  // Senha de um unico caractere repetido nao resiste a nada, independente do tamanho.
  if (new Set(senha).size < 5) {
    return { ok: false, motivo: 'A senha precisa de pelo menos 5 caracteres diferentes.' };
  }
  return { ok: true };
}

export async function gerarHashSenha(senha: string): Promise<{ hash: string; algoritmo: string }> {
  const sal = randomBytes(TAMANHO_SAL);
  const derivada = await scrypt(senha.normalize('NFKC'), sal, TAMANHO_HASH, {
    ...PARAMETROS,
    maxmem: MAXMEM,
  });

  const hash = [
    ALGORITMO,
    PARAMETROS.N,
    PARAMETROS.r,
    PARAMETROS.p,
    sal.toString('base64'),
    derivada.toString('base64'),
  ].join('$');

  return { hash, algoritmo: `${ALGORITMO}-n${PARAMETROS.N}-r${PARAMETROS.r}-p${PARAMETROS.p}` };
}

/**
 * Verifica a senha em tempo constante.
 *
 * Devolve tambem `precisaRehash` quando o registro usa parametros diferentes dos
 * atuais — permite endurecer o custo ao longo do tempo sem invalidar ninguem.
 */
export async function verificarSenha(
  senha: string,
  hashArmazenado: string | null,
): Promise<{ ok: boolean; precisaRehash: boolean }> {
  if (!hashArmazenado) return { ok: false, precisaRehash: false };

  const partes = hashArmazenado.split('$');
  if (partes.length !== 6 || partes[0] !== ALGORITMO) {
    return { ok: false, precisaRehash: false };
  }

  const N = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  const sal = Buffer.from(partes[4]!, 'base64');
  const esperado = Buffer.from(partes[5]!, 'base64');

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return { ok: false, precisaRehash: false };
  }

  let derivada: Buffer;
  try {
    derivada = await scrypt(senha.normalize('NFKC'), sal, esperado.length, {
      N,
      r,
      p,
      maxmem: Math.max(MAXMEM, 256 * N * r),
    });
  } catch {
    return { ok: false, precisaRehash: false };
  }

  const ok = derivada.length === esperado.length && timingSafeEqual(derivada, esperado);
  const precisaRehash =
    ok && (N !== PARAMETROS.N || r !== PARAMETROS.r || p !== PARAMETROS.p);

  return { ok, precisaRehash };
}

/**
 * Consome o mesmo tempo de uma verificacao real.
 *
 * Usado quando o usuario nao existe, para que a resposta de "usuario inexistente"
 * seja indistinguivel de "senha errada". Sem isso, o tempo de resposta revela
 * quais contas existem — a enumeracao de usuario encontrada no code-drop
 * (server.js:369).
 */
export async function consumirTempoVerificacao(): Promise<void> {
  await scrypt('senha-inexistente', randomBytes(TAMANHO_SAL), TAMANHO_HASH, {
    ...PARAMETROS,
    maxmem: MAXMEM,
  });
}
