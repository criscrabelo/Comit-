/**
 * Proxy seguro do Monday.
 *
 * O navegador nunca recebe o token e nunca fala com api.monday.com. Ele pede a
 * operacao a estas rotas; o token vive so aqui, em variavel de ambiente.
 *
 * Isso corrige a lacuna critica de js/monday-sync.js:10,22,36, onde o token
 * ficava em localStorage e qualquer script na pagina podia le-lo.
 *
 * Permissoes:
 *   GET  /api/monday/estado    juridico: ler        — sem expor o token
 *   POST /api/monday/testar    administracao: executar
 *   GET  /api/monday/quadros   administracao: ler   — descoberta de quadros
 *   POST /api/monday/sync      juridico: executar   — dispara a ingestao
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { db } from '../../db/pool.js';
import { ErroApi, entradaInvalida, naoAutenticado } from '../../errors.js';
import { auditar } from '../../audit/registrar.js';
import { consultar, lerQuadro, recusarEscrita, testarConexao } from './cliente.js';
import { QUADROS, type ChaveQuadro } from './quadros.js';
import { sincronizarQuadro } from './sincronizar.js';

const esquemaSync = z.object({
  quadro: z.enum(['processos', 'notificacoes', 'distratos', 'retomadas', 'honorarios', 'entregas']),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  comite_id: z.string().uuid().optional(),
  /** Le e transforma sem gravar, para conferir antes de aplicar. */
  simular: z.coerce.boolean().optional(),
});

const esquemaQuadro = z.object({
  id: z.string().regex(/^\d+$/, 'ID de quadro do Monday e numerico'),
});

const esquemaConsulta = z.object({
  query: z.string().min(1).max(20_000),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export async function rotasMonday(app: FastifyInstance): Promise<void> {
  // ── Estado da integracao ──────────────────────────────────────────────────
  // Informa se esta configurada, NUNCA o valor do token.
  app.get(
    '/api/monday/estado',
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async () => {
      const integracao = await db
        .selectFrom('integracoes')
        .select(['estado', 'habilitada', 'modo', 'ultima_carga_em', 'ultima_carga_valida_em'])
        .where('sistema', '=', 'monday')
        .executeTakeFirst();

      const ultima = await db
        .selectFrom('execucoes_importacao')
        .select([
          'id', 'escopo', 'competencia', 'status', 'iniciada_em', 'finalizada_em',
          'lidos', 'incluidos', 'atualizados', 'ignorados', 'duplicados', 'com_erro',
          'parcial', 'mensagem',
        ])
        .where('fonte', '=', 'monday')
        .orderBy('iniciada_em', 'desc')
        .limit(1)
        .executeTakeFirst();

      return {
        // Presenca da credencial, nao o valor dela.
        token_configurado: config.monday.habilitado,
        modo: integracao?.modo ?? 'leitura',
        estado: integracao?.estado ?? 'desconectada',
        ultima_carga_em: integracao?.ultima_carga_em ?? null,
        // O que a interface usa para dizer "ultimo dado valido de <data>".
        ultima_carga_valida_em: integracao?.ultima_carga_valida_em ?? null,
        ultima_execucao: ultima ?? null,
        quadros: Object.values(QUADROS).map((q) => ({
          chave: q.chave,
          nome: q.nome,
          id: q.idPadrao,
          destino: q.destino,
          recorte: q.recorte,
        })),
      };
    },
  );

  // ── Teste de conexao ──────────────────────────────────────────────────────
  // Devolve apenas o nome da conta que o token representa. Nunca o token.
  app.post(
    '/api/monday/testar',
    { config: { exige: { modulo: 'administracao', acao: 'executar' } } },
    async (req) => {
      if (!config.monday.habilitado) {
        throw new ErroApi(
          'integracao_desligada',
          'MONDAY_TOKEN nao esta configurado no servidor. Configure a variavel de ambiente.',
        );
      }

      const resultado = await testarConexao();

      await Promise.all([
        db
          .updateTable('integracoes')
          .set({
            estado: resultado.ok ? 'conectada' : 'erro',
            habilitada: resultado.ok,
            atualizado_em: new Date(),
          })
          .where('sistema', '=', 'monday')
          .execute(),
        auditar({
          ...req.contextoAuditoria,
          acao: 'integracao_verificada',
          recurso: 'integracoes',
          recursoId: 'monday',
          modulo: 'administracao',
          resultado: resultado.ok ? 'sucesso' : 'erro',
          detalhe: { conta: resultado.conta ?? null, erro: resultado.erro ?? null },
        }),
      ]);

      if (!resultado.ok) {
        throw new ErroApi('fonte_indisponivel', resultado.erro ?? 'Monday indisponivel.');
      }

      return { conectado: true, conta: resultado.conta };
    },
  );

  // ── Consulta repassada (somente leitura) ──────────────────────────────────
  // O frontend chama esta rota em vez de api.monday.com. O token e adicionado
  // aqui; o navegador nunca o possui.
  app.post(
    '/api/monday/consultar',
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async (req) => {
      if (!config.monday.habilitado) {
        throw new ErroApi(
          'integracao_desligada',
          'MONDAY_TOKEN nao esta configurado no servidor. Nenhuma consulta foi enviada ao Monday.',
        );
      }

      const corpo = esquemaConsulta.safeParse(req.body);
      if (!corpo.success) throw entradaInvalida('Informe a consulta GraphQL.');

      recusarEscrita(corpo.data.query);

      const dados = await consultar<unknown>(corpo.data.query, corpo.data.variables ?? {});
      // Formato identico ao da API do Monday, para o cliente nao precisar mudar.
      return { data: dados };
    },
  );

  // ── Descoberta de quadro ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/monday/quadros/:id',
    { config: { exige: { modulo: 'administracao', acao: 'ler' } } },
    async (req) => {
      if (!config.monday.habilitado) {
        throw new ErroApi('integracao_desligada', 'MONDAY_TOKEN nao configurado no servidor.');
      }

      const params = esquemaQuadro.safeParse(req.params);
      if (!params.success) throw entradaInvalida('ID de quadro invalido.');

      const quadro = await lerQuadro(params.data.id);

      return {
        id: quadro.id,
        nome: quadro.name,
        itens: quadro.items_count,
        grupos: quadro.groups,
        colunas: quadro.columns,
      };
    },
  );

  // ── Sincronizacao ─────────────────────────────────────────────────────────
  app.post(
    '/api/monday/sync',
    { config: { exige: { modulo: 'juridico', acao: 'executar' } } },
    async (req, reply) => {
      if (!req.usuario) throw naoAutenticado();

      if (!config.monday.habilitado) {
        throw new ErroApi(
          'integracao_desligada',
          'MONDAY_TOKEN nao esta configurado no servidor. A sincronizacao nao foi iniciada e nenhum dado foi alterado.',
        );
      }

      const corpo = esquemaSync.safeParse(req.body);
      if (!corpo.success) {
        throw entradaInvalida('Informe o quadro a sincronizar.', {
          quadros_validos: Object.keys(QUADROS),
        });
      }

      const definicao = QUADROS[corpo.data.quadro as ChaveQuadro];

      // Quadro por competencia exige competencia: sem ela, a carga nao saberia
      // a que mes vincular e os indicadores ficariam sem recorte.
      if (definicao.recorte === 'competencia' && !corpo.data.competencia) {
        throw entradaInvalida(
          `O quadro ${definicao.nome} e sincronizado por competencia. Informe competencia no formato YYYY-MM.`,
        );
      }

      await auditar({
        ...req.contextoAuditoria,
        acao: 'importacao_iniciada',
        recurso: 'integracoes',
        recursoId: 'monday',
        modulo: 'juridico',
        detalhe: {
          quadro: corpo.data.quadro,
          competencia: corpo.data.competencia ?? null,
          simular: corpo.data.simular ?? false,
        },
      });

      const resumo = await sincronizarQuadro({
        quadro: corpo.data.quadro as ChaveQuadro,
        competenciaRef: corpo.data.competencia ?? null,
        comiteId: corpo.data.comite_id ?? null,
        usuarioId: req.usuario.id,
        simular: corpo.data.simular ?? false,
      });

      await auditar({
        ...req.contextoAuditoria,
        acao: 'importacao_concluida',
        recurso: 'integracoes',
        recursoId: 'monday',
        modulo: 'juridico',
        resultado: resumo.status === 'sucesso' ? 'sucesso' : 'erro',
        detalhe: {
          quadro: corpo.data.quadro,
          lidos: resumo.lidos,
          incluidos: resumo.incluidos,
          atualizados: resumo.atualizados,
          ignorados: resumo.ignorados,
          duplicados: resumo.duplicados,
          com_erro: resumo.comErro,
          status: resumo.status,
        },
      });

      // Atualizacao parcial responde 207: a interface precisa saber que o
      // conjunto nao esta completo, sem tratar como erro total.
      if (resumo.parcial) reply.code(207);

      return { execucao: resumo };
    },
  );

  // ── Historico de execucoes ────────────────────────────────────────────────
  app.get(
    '/api/monday/execucoes',
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async (req) => {
      const filtros = z
        .object({
          competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
          limite: z.coerce.number().int().min(1).max(200).optional(),
        })
        .safeParse(req.query);

      const { listarExecucoes } = await import('../execucoes.js');
      return {
        execucoes: await listarExecucoes({
          fonte: 'monday',
          competencia: filtros.success ? filtros.data.competencia : undefined,
          limite: filtros.success ? filtros.data.limite : undefined,
        }),
      };
    },
  );
}
