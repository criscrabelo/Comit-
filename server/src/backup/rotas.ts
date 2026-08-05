/**
 * Endpoints de backup e restauracao.
 *
 *   GET    /api/backup                      historico
 *   GET    /api/backup/continuidade         relatorio de continuidade
 *   GET    /api/backup/politica             politica de retencao vigente
 *   PATCH  /api/backup/politica             alterar a politica
 *   POST   /api/backup                      gerar backup
 *   GET    /api/backup/:id                  detalhe
 *   GET    /api/backup/:id/verificar        conferir checksum do arquivo
 *   GET    /api/backup/:id/baixar           baixar o arquivo cifrado
 *   PATCH  /api/backup/:id/protecao         proteger/desproteger
 *   DELETE /api/backup/:id                  excluir
 *   POST   /api/backup/retencao             aplicar retencao (aceita simulacao)
 *   POST   /api/backup/:id/avaliar          passos 1 a 6, sem alterar nada
 *   POST   /api/backup/:id/restaurar        passos 7 a 12
 *   GET    /api/backup/restauracoes         historico de restauracoes
 *
 * Permissoes, e a razao de cada uma:
 *   sistema:ler        consultar. Gestora e Diretoria acompanham.
 *   sistema:backup     gerar. Gestora pode solicitar.
 *   sistema:restaurar  restaurar e baixar. So Administrador.
 *   sistema:remover    excluir e alterar protecao. So Administrador.
 *
 * Baixar exige `restaurar`, e nao `ler`: o arquivo e a base inteira. Quem pode
 * baixar pode levar a base para fora — e a mesma gravidade de restaurar.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { entradaInvalida, naoAutenticado, naoAutorizado, naoEncontrado } from '../errors.js';
import { auditar } from '../audit/registrar.js';
import {
  aplicarRetencao,
  definirProtecao,
  detalharBackup,
  excluirBackup,
  executarBackup,
  listarBackups,
  relatorioContinuidade,
  verificarBackup,
  type ContextoBackup,
} from './servico.js';
import {
  avaliar,
  detalharRestauracao,
  listarRestauracoes,
  restaurar,
  CONFIRMACAO_PRODUCAO,
} from './restauracao.js';

const esquemaCriacao = z.object({
  motivo: z.string().min(3).max(500).optional(),
  protegido: z.boolean().optional(),
});

const esquemaRestauracao = z.object({
  destino: z.enum(['isolado', 'producao']).default('isolado'),
  confirmacao: z.string().max(200).optional(),
  justificativa: z.string().min(10).max(1000).optional(),
  banco_isolado: z
    .string()
    .regex(/^[a-z_][a-z0-9_]{0,62}$/, 'Use letras minusculas, numeros e sublinhado.')
    .optional(),
});

const esquemaPolitica = z.object({
  diarios_manter: z.number().int().min(1).max(365).optional(),
  semanais_manter: z.number().int().min(1).max(260).optional(),
  mensais_manter: z.number().int().min(1).max(240).optional(),
  retencao_minima_dias: z.number().int().min(7).max(3650).optional(),
  minimo_recuperaveis: z.number().int().min(1).max(50).optional(),
});

export async function rotasBackup(app: FastifyInstance): Promise<void> {
  const base = '/api/backup';

  const contextoDe = (req: FastifyRequest): ContextoBackup => {
    if (!req.usuario) throw naoAutenticado();
    return {
      usuarioId: req.usuario.id,
      usuarioNome: req.usuario.nome,
      perfil: req.usuario.perfil,
      sessaoId: req.usuario.sessaoId,
      enderecoIp: req.contextoAuditoria.enderecoIp,
    };
  };

  /**
   * Restaurar exige perfil administrador ALEM da permissao.
   *
   * Permissao por si e concedivel por excecao de usuario; o perfil e uma
   * segunda barreira, deliberada. Substituir a base nao deve depender de uma
   * unica linha numa tabela.
   */
  const exigirAdministrador = (req: FastifyRequest): void => {
    if (req.usuario?.perfil !== 'administrador') {
      throw naoAutorizado(
        'Somente o perfil Administrador restaura ou baixa backup. ' +
          'A Gestora pode solicitar um backup e acompanhar o status.',
        { perfil: req.usuario?.perfil ?? null },
      );
    }
  };

  // ── Consulta ──────────────────────────────────────────────────────────────
  app.get<{ Querystring: { ambiente?: string; status?: string; limite?: string } }>(
    base,
    { config: { exige: { modulo: 'sistema', acao: 'ler' } } },
    async (req) => ({
      backups: await listarBackups({
        ambiente: req.query.ambiente ?? null,
        status: req.query.status ?? null,
        limite: req.query.limite ? Number(req.query.limite) : 50,
      }),
      ambiente_atual: config.ambiente,
    }),
  );

  app.get(
    `${base}/continuidade`,
    { config: { exige: { modulo: 'sistema', acao: 'ler' } } },
    async () => relatorioContinuidade(),
  );

  app.get(
    `${base}/restauracoes`,
    { config: { exige: { modulo: 'sistema', acao: 'ler' } } },
    async () => ({ restauracoes: await listarRestauracoes() }),
  );

  app.get<{ Params: { id: string } }>(
    `${base}/restauracoes/:id`,
    { config: { exige: { modulo: 'sistema', acao: 'ler' } } },
    async (req) => detalharRestauracao(req.params.id),
  );

  app.get(
    `${base}/politica`,
    { config: { exige: { modulo: 'sistema', acao: 'ler' } } },
    async () => {
      const politica = await db
        .selectFrom('politica_retencao')
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirst();
      return { politica, confirmacao_producao: CONFIRMACAO_PRODUCAO };
    },
  );

  app.patch(
    `${base}/politica`,
    { config: { exige: { modulo: 'sistema', acao: 'remover' } } },
    async (req) => {
      exigirAdministrador(req);
      const ctx = contextoDe(req);
      const corpo = esquemaPolitica.safeParse(req.body);
      if (!corpo.success) {
        throw entradaInvalida('Valores de retencao invalidos.', {
          problemas: corpo.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }
      if (Object.keys(corpo.data).length === 0) {
        throw entradaInvalida('Informe ao menos um campo da politica.');
      }

      const antes = await db
        .selectFrom('politica_retencao')
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirstOrThrow();

      const politica = await db
        .updateTable('politica_retencao')
        .set({ ...corpo.data, atualizada_em: new Date(), atualizada_por: ctx.usuarioId } as never)
        .where('id', '=', 1)
        .returningAll()
        .executeTakeFirstOrThrow();

      await auditar({
        usuarioId: ctx.usuarioId,
        usuarioNome: ctx.usuarioNome,
        sessaoId: ctx.sessaoId ?? null,
        enderecoIp: ctx.enderecoIp ?? null,
        acao: 'permissao_alterada',
        recurso: 'politica_retencao',
        modulo: 'sistema',
        valorAntes: antes,
        valorDepois: politica,
      });

      return { politica };
    },
  );

  app.get<{ Params: { id: string } }>(
    `${base}/:id`,
    { config: { exige: { modulo: 'sistema', acao: 'ler' } } },
    async (req) => detalharBackup(req.params.id),
  );

  app.get<{ Params: { id: string } }>(
    `${base}/:id/verificar`,
    { config: { exige: { modulo: 'sistema', acao: 'ler' } } },
    async (req) => verificarBackup(req.params.id),
  );

  // ── Download ──────────────────────────────────────────────────────────────
  //
  // O arquivo sai cifrado. Sem BACKUP_CHAVE, quem o receber tem bytes, nao
  // dados — inclusive se o download for interceptado.
  app.get<{ Params: { id: string } }>(
    `${base}/:id/baixar`,
    { config: { exige: { modulo: 'sistema', acao: 'restaurar' } } },
    async (req, reply) => {
      exigirAdministrador(req);
      const ctx = contextoDe(req);

      const b = await db
        .selectFrom('backups')
        .select(['id', 'rotulo', 'arquivo', 'local_armazenamento', 'status', 'tamanho_bytes', 'checksum'])
        .where('id', '=', req.params.id)
        .executeTakeFirst();

      if (!b || !b.arquivo) throw naoEncontrado('Backup nao encontrado ou sem arquivo.');
      if (b.status === 'expurgado') throw naoEncontrado('Este backup foi expurgado.');

      await auditar({
        usuarioId: ctx.usuarioId,
        usuarioNome: ctx.usuarioNome,
        perfil: ctx.perfil as never,
        sessaoId: ctx.sessaoId ?? null,
        enderecoIp: ctx.enderecoIp ?? null,
        acao: 'backup_baixado',
        recurso: 'backups',
        recursoId: b.id,
        modulo: 'sistema',
        detalhe: { rotulo: b.rotulo, checksum: b.checksum, tamanho_bytes: Number(b.tamanho_bytes) },
      });

      const caminho = join(b.local_armazenamento ?? config.backup.diretorio, b.arquivo);

      reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${b.arquivo}"`)
        // Um backup nunca deve ficar em cache de proxy ou de navegador.
        .header('Cache-Control', 'no-store, private')
        .header('X-Patrono-Checksum', b.checksum ?? '');

      return reply.send(createReadStream(caminho));
    },
  );

  // ── Geracao ───────────────────────────────────────────────────────────────
  app.post(
    base,
    { config: { exige: { modulo: 'sistema', acao: 'backup' } } },
    async (req, reply) => {
      const ctx = contextoDe(req);
      const corpo = esquemaCriacao.safeParse(req.body ?? {});
      if (!corpo.success) throw entradaInvalida('Motivo invalido.');

      // Proteger contra exclusao e decisao de administrador: um backup
      // protegido nunca sai pela retencao e ocupa espaco indefinidamente.
      const protegido = corpo.data.protegido === true;
      if (protegido) exigirAdministrador(req);

      const resultado = await executarBackup(
        { tipo: 'completo', origem: 'api', motivo: corpo.data.motivo, protegido },
        ctx,
      );

      reply.code(201);
      return resultado;
    },
  );

  app.post(
    `${base}/retencao`,
    { config: { exige: { modulo: 'sistema', acao: 'remover' } } },
    async (req) => {
      exigirAdministrador(req);
      const ctx = contextoDe(req);
      const simular = (req.body as { simular?: boolean } | null)?.simular === true;
      return aplicarRetencao(ctx, { simular });
    },
  );

  app.patch<{ Params: { id: string } }>(
    `${base}/:id/protecao`,
    { config: { exige: { modulo: 'sistema', acao: 'remover' } } },
    async (req) => {
      exigirAdministrador(req);
      const ctx = contextoDe(req);
      const corpo = z.object({ protegido: z.boolean() }).safeParse(req.body);
      if (!corpo.success) throw entradaInvalida('Informe { protegido: true|false }.');
      return definirProtecao(req.params.id, corpo.data.protegido, ctx);
    },
  );

  app.delete<{ Params: { id: string } }>(
    `${base}/:id`,
    { config: { exige: { modulo: 'sistema', acao: 'remover' } } },
    async (req) => {
      exigirAdministrador(req);
      return excluirBackup(req.params.id, contextoDe(req));
    },
  );

  // ── Restauracao ───────────────────────────────────────────────────────────
  //
  // Avaliar exige `ler`: mostrar o impacto a quem acompanha nao restaura nada,
  // e esconder o impacto so tornaria a decisao pior informada.
  app.post<{ Params: { id: string } }>(
    `${base}/:id/avaliar`,
    { config: { exige: { modulo: 'sistema', acao: 'ler' } } },
    async (req) => {
      const ctx = contextoDe(req);
      const destino = (req.body as { destino?: string } | null)?.destino ?? 'isolado';
      if (destino !== 'isolado' && destino !== 'producao') {
        throw entradaInvalida('Destino deve ser "isolado" ou "producao".');
      }
      return avaliar(req.params.id, destino, ctx);
    },
  );

  app.post<{ Params: { id: string } }>(
    `${base}/:id/restaurar`,
    { config: { exige: { modulo: 'sistema', acao: 'restaurar' } } },
    async (req) => {
      exigirAdministrador(req);
      const ctx = contextoDe(req);

      const corpo = esquemaRestauracao.safeParse(req.body ?? {});
      if (!corpo.success) {
        throw entradaInvalida('Pedido de restauracao invalido.', {
          problemas: corpo.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
          confirmacao_exigida_em_producao: CONFIRMACAO_PRODUCAO,
        });
      }

      return restaurar(
        {
          backupId: req.params.id,
          destino: corpo.data.destino,
          confirmacao: corpo.data.confirmacao ?? null,
          justificativa: corpo.data.justificativa ?? null,
          bancoIsolado: corpo.data.banco_isolado ?? null,
          perfil: req.usuario?.perfil ?? null,
        },
        ctx,
      );
    },
  );
}
