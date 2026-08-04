/**
 * Endpoints da migração do localStorage.
 *
 * Fluxo, na ordem que a interface segue:
 *
 *   POST /inspecionar  → o que existe, quanto, prévia mascarada (NÃO grava)
 *   POST /importar     → snapshot + upsert idempotente + contadores
 *   GET  /:id          → relatório
 *   POST /:id/confirmar-remocao → autoriza o navegador a apagar
 *
 * Ninguém migra dado de outra pessoa: todas as rotas filtram pelo usuário da
 * sessão, e o relatório recusa migração de outro dono.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { entradaInvalida, naoAutenticado } from '../errors.js';
import {
  CATALOGO,
  CATALOGO_PROTOTIPOS,
  PREFERENCIAS_PERMITIDAS,
  PREFIXO_PREFERENCIA,
} from './inventario.js';
import {
  confirmarRemocao,
  inspecionar,
  listar,
  migrar,
  relatorio,
  type ContextoMigracao,
} from './servico.js';

/** 8 MiB de dump: com folga para o maior localStorage plausível. */
const esquemaDump = z.object({
  chaves: z.record(z.string(), z.string()),
  versao: z.string().max(50).optional(),
  navegador: z.string().max(300).optional(),
});

export async function rotasMigracao(app: FastifyInstance): Promise<void> {
  const base = '/api/migracao';

  const contextoDe = (req: import('fastify').FastifyRequest): ContextoMigracao => {
    if (!req.usuario) throw naoAutenticado();
    return {
      usuarioId: req.usuario.id,
      usuarioNome: req.usuario.nome,
      perfil: req.usuario.perfil,
      sessaoId: req.usuario.sessaoId,
      enderecoIp: req.contextoAuditoria.enderecoIp,
    };
  };

  // ── Catálogo, para a interface explicar o que vai acontecer ───────────────
  app.get(
    `${base}/catalogo`,
    { config: { exige: { modulo: 'administracao', acao: 'ler' } } },
    async () => ({
      chaves: CATALOGO.map((d) => ({
        chave: d.chave,
        classe: d.classe,
        modulo: d.modulo,
        destino: d.destino ?? null,
        contem_dado_pessoal: d.contemDadoPessoal,
        descricao: d.descricao,
        motivo: d.motivo ?? null,
      })),
      prototipos_nao_implantados: CATALOGO_PROTOTIPOS.map((d) => ({
        chave: d.chave,
        modulo: d.modulo,
        contem_dado_pessoal: d.contemDadoPessoal,
      })),
      preferencias_permitidas: PREFERENCIAS_PERMITIDAS,
      prefixo_preferencia: PREFIXO_PREFERENCIA,
    }),
  );

  // ── 1. Inspeção: mostra sem gravar ────────────────────────────────────────
  app.post(
    `${base}/inspecionar`,
    { config: { exige: { modulo: 'administracao', acao: 'ler' } } },
    async (req) => {
      const ctx = contextoDe(req);

      const corpo = esquemaDump.safeParse(req.body);
      if (!corpo.success) {
        throw entradaInvalida('Envie o dump no formato { chaves: { nome: conteudo } }.');
      }

      const inspecao = await inspecionar(corpo.data, ctx.usuarioId);

      return {
        ...inspecao,
        // A interface usa isto para montar a confirmação.
        resumo_para_usuario:
          inspecao.totais.a_migrar > 0
            ? `Encontramos dados de uma versão anterior: ${inspecao.totais.registros} registro(s) ` +
              `em ${inspecao.totais.a_migrar} módulo(s).` +
              (inspecao.totais.demonstrativos > 0
                ? ` ${inspecao.totais.demonstrativos} são dados de exemplo e serão marcados como tal.`
                : '') +
              (inspecao.totais.corrompidas > 0
                ? ` ${inspecao.totais.corrompidas} chave(s) com conteúdo inválido não serão migradas.`
                : '')
            : 'Nenhum dado de versão anterior encontrado neste navegador.',
      };
    },
  );

  // ── 2. Importação ─────────────────────────────────────────────────────────
  app.post(
    `${base}/importar`,
    { config: { exige: { modulo: 'administracao', acao: 'executar' } } },
    async (req, reply) => {
      const ctx = contextoDe(req);

      const corpo = esquemaDump.safeParse(req.body);
      if (!corpo.success) {
        throw entradaInvalida('Envie o dump no formato { chaves: { nome: conteudo } }.');
      }

      const resultado = await migrar(corpo.data, ctx);

      // Migração parcial responde 207: a interface precisa distinguir de sucesso
      // total sem tratar como erro — o que entrou permanece.
      if (resultado.status === 'parcial') reply.code(207);

      return resultado;
    },
  );

  // ── 3. Relatório ──────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    `${base}/:id`,
    { config: { exige: { modulo: 'administracao', acao: 'ler' } } },
    async (req) => {
      const ctx = contextoDe(req);
      return relatorio(req.params.id, ctx.usuarioId);
    },
  );

  app.get(
    base,
    { config: { exige: { modulo: 'administracao', acao: 'ler' } } },
    async (req) => {
      const ctx = contextoDe(req);
      return { migracoes: await listar(ctx.usuarioId) };
    },
  );

  // ── 4. Confirmação de remoção ─────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    `${base}/:id/confirmar-remocao`,
    { config: { exige: { modulo: 'administracao', acao: 'executar' } } },
    async (req) => {
      const ctx = contextoDe(req);
      return confirmarRemocao(req.params.id, ctx);
    },
  );
}
