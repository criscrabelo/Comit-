/**
 * Sessoes: tokens opacos revogaveis.
 *
 * O token e um valor aleatorio de 256 bits. No banco fica apenas o hash SHA-256
 * — quem obtiver acesso de leitura ao banco nao consegue se passar por ninguem.
 *
 * Diferenca em relacao ao que existe hoje: o token da base atual e assinado e
 * autocontido, portanto irrevogavel. Trocar a senha nao invalidava nada
 * (code-drop server.js:417). Aqui a sessao e um registro, logo pode ser
 * encerrada individualmente ou em massa.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/pool.js';
import type { PerfilUsuario, StatusUsuario, AreaOrganizacional } from '../db/schema.js';

export interface UsuarioAutenticado {
  id: string;
  usuario: string;
  nome: string;
  perfil: PerfilUsuario;
  area: AreaOrganizacional | null;
  status: StatusUsuario;
  sessaoId: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparacao em tempo constante de dois hashes hexadecimais. */
function hashesIguais(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function criarSessao(
  usuarioId: string,
  contexto: { enderecoIp?: string | null; agenteUsuario?: string | null } = {},
): Promise<{ token: string; sessaoId: string; expiraEm: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + config.sessao.duracaoHoras * 3_600_000);

  const linha = await db
    .insertInto('sessoes')
    .values({
      usuario_id: usuarioId,
      hash_token: hashToken(token),
      expira_em: expiraEm,
      endereco_ip: contexto.enderecoIp ?? null,
      agente_usuario: contexto.agenteUsuario?.slice(0, 500) ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return { token, sessaoId: linha.id, expiraEm };
}

/**
 * Resolve o token em usuario autenticado.
 *
 * Recusa sessao revogada, expirada, inativa por tempo excessivo, e tambem
 * usuario que deixou de estar ativo ou cujo acesso de convidado venceu — a
 * verificacao acontece a cada requisicao, nao apenas no login.
 */
export async function resolverSessao(token: string | null): Promise<UsuarioAutenticado | null> {
  if (!token) return null;

  const hash = hashToken(token);
  const agora = new Date();

  const linha = await db
    .selectFrom('sessoes as s')
    .innerJoin('usuarios as u', 'u.id', 's.usuario_id')
    .select([
      's.id as sessao_id',
      's.hash_token',
      's.expira_em',
      's.ultima_atividade',
      's.revogada_em',
      'u.id as usuario_id',
      'u.usuario',
      'u.nome',
      'u.perfil',
      'u.area',
      'u.status',
      'u.acesso_expira_em',
    ])
    .where('s.hash_token', '=', hash)
    .executeTakeFirst();

  if (!linha) return null;
  // Defesa extra: mesmo tendo casado pelo indice, compara em tempo constante.
  if (!hashesIguais(linha.hash_token, hash)) return null;

  if (linha.revogada_em) return null;
  if (new Date(linha.expira_em) <= agora) return null;

  const limiteInatividade = new Date(
    new Date(linha.ultima_atividade).getTime() + config.sessao.inatividadeMinutos * 60_000,
  );
  if (limiteInatividade <= agora) {
    await revogarSessao(linha.sessao_id, { motivo: 'inatividade' });
    return null;
  }

  if (linha.status !== 'ativo') return null;
  if (linha.acesso_expira_em && new Date(linha.acesso_expira_em) <= agora) {
    await revogarSessao(linha.sessao_id, { motivo: 'acesso_expirado' });
    return null;
  }

  // Renova a atividade sem bloquear a requisicao.
  void db
    .updateTable('sessoes')
    .set({ ultima_atividade: agora })
    .where('id', '=', linha.sessao_id)
    .execute();

  return {
    id: linha.usuario_id,
    usuario: linha.usuario,
    nome: linha.nome,
    perfil: linha.perfil,
    area: linha.area,
    status: linha.status,
    sessaoId: linha.sessao_id,
  };
}

export async function revogarSessao(
  sessaoId: string,
  opcoes: { motivo: string; porUsuarioId?: string | null } = { motivo: 'encerrada' },
): Promise<void> {
  await db
    .updateTable('sessoes')
    .set({
      revogada_em: new Date(),
      revogada_por: opcoes.porUsuarioId ?? null,
      motivo_revogacao: opcoes.motivo,
    })
    .where('id', '=', sessaoId)
    .where('revogada_em', 'is', null)
    .execute();
}

/**
 * Encerra todas as sessoes de um usuario.
 *
 * Chamado obrigatoriamente na troca e na recuperacao de senha: a partir daqui,
 * senha comprometida deixa de dar acesso.
 */
export async function revogarSessoesDoUsuario(
  usuarioId: string,
  opcoes: { motivo: string; porUsuarioId?: string | null; exceto?: string | null } = {
    motivo: 'senha_alterada',
  },
): Promise<number> {
  let consulta = db
    .updateTable('sessoes')
    .set({
      revogada_em: new Date(),
      revogada_por: opcoes.porUsuarioId ?? null,
      motivo_revogacao: opcoes.motivo,
    })
    .where('usuario_id', '=', usuarioId)
    .where('revogada_em', 'is', null);

  if (opcoes.exceto) consulta = consulta.where('id', '!=', opcoes.exceto);

  const r = await consulta.executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0);
}

/** Sessoes ativas do usuario, para a tela de dispositivos conectados. */
export async function listarSessoesAtivas(usuarioId: string) {
  return db
    .selectFrom('sessoes')
    .select(['id', 'criada_em', 'ultima_atividade', 'expira_em', 'endereco_ip', 'agente_usuario'])
    .where('usuario_id', '=', usuarioId)
    .where('revogada_em', 'is', null)
    .where('expira_em', '>', new Date())
    .orderBy('ultima_atividade', 'desc')
    .execute();
}

/** Manutencao: marca como revogadas as sessoes que so venceram por tempo. */
export async function limparSessoesVencidas(): Promise<number> {
  const r = await db
    .updateTable('sessoes')
    .set({ revogada_em: new Date(), motivo_revogacao: 'expirada' })
    .where('revogada_em', 'is', null)
    .where('expira_em', '<=', new Date())
    .executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0);
}
