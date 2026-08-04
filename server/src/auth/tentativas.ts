/**
 * Limite de tentativas de autenticacao.
 *
 * Ausente nas duas bases de codigo auditadas: hoje um atacante pode tentar
 * senha indefinidamente (code-drop server.js:344). Trava as duas superficies —
 * a conta e a origem — porque travar so a conta permite varredura de senha
 * comum contra muitas contas, e travar so o IP permite ataque distribuido.
 *
 * A janela e deslizante e a espera cresce, para nao bloquear em definitivo quem
 * apenas errou a senha algumas vezes.
 */
import { sql } from 'kysely';
import { db } from '../db/pool.js';

/** Falhas toleradas por conta antes de comecar a esperar. */
const LIMITE_POR_CONTA = 5;
/** Falhas toleradas por origem: maior, porque escritorio compartilha IP. */
const LIMITE_POR_IP = 20;
const JANELA_MINUTOS = 15;
/** Teto da espera, para que a conta nao fique inacessivel por muito tempo. */
const ESPERA_MAXIMA_SEGUNDOS = 900;

export interface ResultadoLimite {
  permitido: boolean;
  esperarSegundos: number;
  motivo?: 'conta' | 'origem';
}

/**
 * Espera progressiva: 15s, 30s, 60s, 120s... limitada ao teto.
 * Conta as falhas ACIMA do limite tolerado.
 */
function esperaProgressiva(falhas: number, limite: number): number {
  const excedente = falhas - limite;
  if (excedente <= 0) return 0;
  return Math.min(15 * 2 ** (excedente - 1), ESPERA_MAXIMA_SEGUNDOS);
}

export async function verificarLimite(
  usuario: string | null,
  enderecoIp: string | null,
): Promise<ResultadoLimite> {
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000);

  const [porConta, porIp] = await Promise.all([
    usuario
      ? db
          .selectFrom('tentativas_autenticacao')
          .select(({ fn }) => fn.countAll<number>().as('total'))
          .where('usuario', '=', usuario)
          .where('sucesso', '=', false)
          .where('ocorrida_em', '>=', desde)
          .executeTakeFirst()
      : Promise.resolve({ total: 0 }),
    enderecoIp
      ? db
          .selectFrom('tentativas_autenticacao')
          .select(({ fn }) => fn.countAll<number>().as('total'))
          .where('endereco_ip', '=', enderecoIp)
          .where('sucesso', '=', false)
          .where('ocorrida_em', '>=', desde)
          .executeTakeFirst()
      : Promise.resolve({ total: 0 }),
  ]);

  const falhasConta = Number(porConta?.total ?? 0);
  const falhasIp = Number(porIp?.total ?? 0);

  const esperaConta = esperaProgressiva(falhasConta, LIMITE_POR_CONTA);
  const esperaIp = esperaProgressiva(falhasIp, LIMITE_POR_IP);

  if (esperaConta === 0 && esperaIp === 0) {
    return { permitido: true, esperarSegundos: 0 };
  }

  return esperaConta >= esperaIp
    ? { permitido: false, esperarSegundos: esperaConta, motivo: 'conta' }
    : { permitido: false, esperarSegundos: esperaIp, motivo: 'origem' };
}

export async function registrarTentativa(
  usuario: string | null,
  enderecoIp: string | null,
  sucesso: boolean,
): Promise<void> {
  await db
    .insertInto('tentativas_autenticacao')
    .values({ usuario, endereco_ip: enderecoIp, sucesso })
    .execute();
}

/**
 * Zera o historico de falhas apos login bem-sucedido, para que o proximo erro
 * de digitacao nao caia direto numa espera longa acumulada.
 */
export async function limparFalhas(usuario: string, enderecoIp: string | null): Promise<void> {
  await db
    .deleteFrom('tentativas_autenticacao')
    .where('sucesso', '=', false)
    .where((eb) =>
      eb.or([
        eb('usuario', '=', usuario),
        ...(enderecoIp ? [eb('endereco_ip', '=', enderecoIp)] : []),
      ]),
    )
    .execute();
}

/** Manutencao: descarta tentativas antigas, que nao servem mais ao limite. */
export async function expurgarTentativasAntigas(dias = 90): Promise<void> {
  await db
    .deleteFrom('tentativas_autenticacao')
    .where('ocorrida_em', '<', sql<Date>`now() - make_interval(days => ${dias})`)
    .execute();
}
