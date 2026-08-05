/**
 * Cifra dos backups em repouso.
 *
 * Um dump do Patrono contem CPF, nome, contrato, valor e situacao juridica de
 * clientes reais. Em claro, o arquivo e uma copia integral da base pessoal sem
 * nenhum controle de acesso proprio: quem alcancar o disco alcanca tudo.
 *
 * AES-256-GCM porque cifra E autentica: um arquivo adulterado nao decifra, ele
 * FALHA. Com um modo sem autenticacao (CBC, CTR), bytes trocados produziriam
 * lixo plausivel, e a restauracao seguiria adiante com dado corrompido.
 *
 * A chave vem de variavel de ambiente e nunca e gravada, logada nem devolvida
 * por endpoint. Derivada por scrypt com sal aleatorio por arquivo — a mesma
 * senha nunca produz a mesma chave duas vezes.
 *
 * Formato do arquivo:
 *
 *   PATRONO1 | sal(16) | nonce(12) | tag(16) | conteudo cifrado
 *   \_______/  \_____/   \_______/   \_____/
 *    8 bytes    scrypt     GCM       GCM
 *
 * O cabecalho existe para que um arquivo encontrado solto seja identificavel
 * sem adivinhacao — e para recusar arquivo de outra origem antes de tentar
 * decifrar.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export const ASSINATURA = Buffer.from('PATRONO1', 'ascii');
const TAMANHO_SAL = 16;
const TAMANHO_NONCE = 12;
const TAMANHO_TAG = 16;
export const TAMANHO_CABECALHO = ASSINATURA.length + TAMANHO_SAL + TAMANHO_NONCE + TAMANHO_TAG;

/** Mesmos parametros do hash de senha, pelo mesmo motivo: custo verificado. */
const SCRYPT = { N: 32768, r: 8, p: 1, tamanho: 32 } as const;

export class ErroCofre extends Error {
  readonly motivo: 'sem_chave' | 'assinatura_invalida' | 'autenticacao_falhou' | 'arquivo_curto';

  constructor(motivo: ErroCofre['motivo'], mensagem: string) {
    super(mensagem);
    this.name = 'ErroCofre';
    this.motivo = motivo;
  }
}

// `promisify` escolhe a sobrecarga de tres argumentos do scrypt e nao aceita o
// objeto de parametros. Como o custo N=32768 e justamente o que da forca a
// derivacao, a promessa e montada a mao.
function derivar(chave: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    scryptCb(
      chave,
      sal,
      SCRYPT.tamanho,
      {
        N: SCRYPT.N,
        r: SCRYPT.r,
        p: SCRYPT.p,
        // O padrao do Node nao acomoda N=32768; sem isto o scrypt recusa.
        maxmem: 256 * 1024 * 1024,
      },
      (erro, derivada) => (erro ? rejeitar(erro) : resolver(derivada)),
    );
  });
}

/** Calcula SHA-256 sem carregar o arquivo inteiro na memoria. */
export async function somaDoArquivo(caminho: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;

  await pipeline(
    createReadStream(caminho),
    new Transform({
      transform(pedaco, _cod, pronto) {
        bytes += pedaco.length;
        hash.update(pedaco);
        pronto();
      },
    }),
  );

  return { sha256: hash.digest('hex'), bytes };
}

export interface ResultadoCifra {
  /** SHA-256 do conteudo ANTES de cifrar. */
  checksumClaro: string;
  tamanhoClaro: number;
  /** SHA-256 do arquivo como ficou no disco. Verificavel sem a chave. */
  checksum: string;
  tamanho: number;
}

/**
 * Cifra `origem` em `destino`.
 *
 * A tag de autenticacao do GCM so existe DEPOIS de todo o conteudo passar. Como
 * ela fica no cabecalho — para que a verificacao aconteca antes de qualquer
 * byte ser entregue a restauracao — o cabecalho e reescrito no fim, com o
 * arquivo ja fechado. E uma escrita de 16 bytes numa posicao conhecida.
 */
export async function cifrarArquivo(
  origem: string,
  destino: string,
  chave: string,
): Promise<ResultadoCifra> {
  if (!chave || chave.length < 16) {
    throw new ErroCofre(
      'sem_chave',
      'BACKUP_CHAVE ausente ou curta demais. Backup em claro nao e gerado: ' +
        'o dump contem dado pessoal de clientes reais.',
    );
  }

  const sal = randomBytes(TAMANHO_SAL);
  const nonce = randomBytes(TAMANHO_NONCE);
  const derivada = await derivar(chave, sal);

  const cifrador = createCipheriv('aes-256-gcm', derivada, nonce);
  const hashClaro = createHash('sha256');
  let tamanhoClaro = 0;

  const saida = createWriteStream(destino, { mode: 0o600 });
  // Espaco reservado para a tag; reescrito no fim.
  saida.write(Buffer.concat([ASSINATURA, sal, nonce, Buffer.alloc(TAMANHO_TAG)]));

  await pipeline(
    createReadStream(origem),
    new Transform({
      transform(pedaco, _cod, pronto) {
        tamanhoClaro += pedaco.length;
        hashClaro.update(pedaco);
        pronto(null, pedaco);
      },
    }),
    cifrador,
    saida,
  );

  const tag = cifrador.getAuthTag();

  const { promises: fs } = await import('node:fs');
  const manipulador = await fs.open(destino, 'r+');
  try {
    await manipulador.write(tag, 0, TAMANHO_TAG, ASSINATURA.length + TAMANHO_SAL + TAMANHO_NONCE);
  } finally {
    await manipulador.close();
  }

  const final = await somaDoArquivo(destino);

  return {
    checksumClaro: hashClaro.digest('hex'),
    tamanhoClaro,
    checksum: final.sha256,
    tamanho: final.bytes,
  };
}

/**
 * Decifra `origem` em `destino` e devolve o checksum do conteudo recuperado.
 *
 * Falha de autenticacao NAO devolve conteudo parcial: o GCM so valida a tag ao
 * fim, e o `pipeline` propaga o erro. Quem chama deve descartar o destino.
 */
export async function decifrarArquivo(
  origem: string,
  destino: string,
  chave: string,
): Promise<{ checksumClaro: string; tamanhoClaro: number }> {
  if (!chave || chave.length < 16) {
    throw new ErroCofre('sem_chave', 'BACKUP_CHAVE ausente: nao ha como decifrar este backup.');
  }

  const { promises: fs } = await import('node:fs');
  const manipulador = await fs.open(origem, 'r');

  let cabecalho: Buffer;
  try {
    cabecalho = Buffer.alloc(TAMANHO_CABECALHO);
    const { bytesRead } = await manipulador.read(cabecalho, 0, TAMANHO_CABECALHO, 0);
    if (bytesRead < TAMANHO_CABECALHO) {
      throw new ErroCofre('arquivo_curto', 'Arquivo menor que o cabecalho: esta truncado.');
    }
  } finally {
    await manipulador.close();
  }

  const assinatura = cabecalho.subarray(0, ASSINATURA.length);
  if (!timingSafeEqual(assinatura, ASSINATURA)) {
    throw new ErroCofre(
      'assinatura_invalida',
      'Este arquivo nao e um backup do Patrono, ou foi gerado por outra versao.',
    );
  }

  let deslocamento = ASSINATURA.length;
  const sal = cabecalho.subarray(deslocamento, (deslocamento += TAMANHO_SAL));
  const nonce = cabecalho.subarray(deslocamento, (deslocamento += TAMANHO_NONCE));
  const tag = cabecalho.subarray(deslocamento, deslocamento + TAMANHO_TAG);

  const derivada = await derivar(chave, sal);
  const decifrador = createDecipheriv('aes-256-gcm', derivada, nonce);
  decifrador.setAuthTag(tag);

  const hashClaro = createHash('sha256');
  let tamanhoClaro = 0;

  try {
    await pipeline(
      createReadStream(origem, { start: TAMANHO_CABECALHO }),
      decifrador,
      new Transform({
        transform(pedaco, _cod, pronto) {
          tamanhoClaro += pedaco.length;
          hashClaro.update(pedaco);
          pronto(null, pedaco);
        },
      }),
      createWriteStream(destino, { mode: 0o600 }),
    );
  } catch (erro) {
    // "Unsupported state or unable to authenticate data" e a mensagem do Node
    // quando a tag nao confere. Traduzida, porque a original nao diz a coisa
    // mais importante: o arquivo foi adulterado ou a chave esta errada.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (/unable to authenticate|unsupported state/i.test(mensagem)) {
      throw new ErroCofre(
        'autenticacao_falhou',
        'O backup nao passou na verificacao de autenticidade: ou o arquivo foi ' +
          'alterado, ou a chave de cifra nao e a mesma usada para gera-lo. ' +
          'Nenhum dado foi restaurado.',
      );
    }
    throw erro;
  }

  return { checksumClaro: hashClaro.digest('hex'), tamanhoClaro };
}

/** Comparacao de checksum em tempo constante. */
export function checksumConfere(esperado: string, obtido: string): boolean {
  if (esperado.length !== obtido.length) return false;
  return timingSafeEqual(Buffer.from(esperado, 'hex'), Buffer.from(obtido, 'hex'));
}
