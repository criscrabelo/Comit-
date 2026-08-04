/**
 * Endpoints dos dados de negocio da interface.
 *
 *   GET    /api/dados/carga-inicial      tudo que a SPA precisa para abrir
 *   GET    /api/dados/exportar           dump completo, auditado
 *   GET    /api/dados/:entidade          listar (filtro, ordenacao, paginacao)
 *   GET    /api/dados/:entidade/:id      consultar
 *   POST   /api/dados/:entidade          criar
 *   PATCH  /api/dados/:entidade/:id      atualizar (exige versao)
 *   DELETE /api/dados/:entidade/:id      excluir logicamente
 *   POST   /api/dados/:entidade/excluir  excluir em lote
 *   POST   /api/dados/divergencia-local  registra divergencia navegador x banco
 *
 * Substitui `POST /api/db`, que recebia o dump inteiro da SPA e gravava por
 * cima. Nao ha rota equivalente aqui de proposito: com dump inteiro nao existe
 * controle de concorrencia possivel.
 */
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { entradaInvalida, naoAutenticado } from '../errors.js';
import { registrar as registrarInconsistencia } from '../inconsistencias/servico.js';
import { exigirPodeMigrar } from '../rbac/autorizacao.js';
import { ehEntidade, ENTIDADES, NOMES_ENTIDADES } from './entidades.js';
import {
  atualizar,
  cargaInicial,
  criar,
  criarLote,
  excluir,
  exportar,
  listar,
  obter,
  type ContextoDados,
  type Filtros,
} from './servico.js';

const esquemaFiltros = z.object({
  comite_id: z.string().uuid().optional(),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  empreendimento_id: z.string().uuid().optional(),
  responsavel: z.string().min(1).max(120).optional(),
  pagina: z.coerce.number().int().min(1).optional(),
  tamanho: z.coerce.number().int().min(1).max(500).optional(),
  ordenar: z.string().max(60).optional(),
  direcao: z.enum(['asc', 'desc']).optional(),
  incluir_ausentes: z.coerce.boolean().optional(),
});

const esquemaCorpo = z.record(z.string(), z.unknown());

const esquemaDivergencia = z.object({
  entidade: z.string().max(60),
  registros_no_navegador: z.number().int().min(0),
  registros_no_servidor: z.number().int().min(0),
  chaves: z.array(z.string().max(200)).max(50).optional(),
});

export async function rotasDados(app: FastifyInstance): Promise<void> {
  const base = '/api/dados';

  const contextoDe = (req: FastifyRequest): ContextoDados => {
    if (!req.usuario || !req.autorizacao) throw naoAutenticado();
    return {
      usuarioId: req.usuario.id,
      usuarioNome: req.usuario.nome,
      perfil: req.usuario.perfil,
      sessaoId: req.usuario.sessaoId,
      enderecoIp: req.contextoAuditoria.enderecoIp,
      autorizacao: req.autorizacao,
    };
  };

  const entidadeDe = (nome: string) => {
    if (!ehEntidade(nome)) {
      throw entradaInvalida(`Entidade desconhecida: "${nome}".`, {
        entidades: NOMES_ENTIDADES,
      });
    }
    return nome;
  };

  const filtrosDe = (query: unknown): Filtros => {
    const r = esquemaFiltros.safeParse(query);
    if (!r.success) {
      throw entradaInvalida('Parametros de consulta invalidos.', {
        problemas: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return {
      comiteId: r.data.comite_id ?? null,
      competencia: r.data.competencia ?? null,
      empreendimentoId: r.data.empreendimento_id ?? null,
      responsavel: r.data.responsavel ?? null,
      pagina: r.data.pagina,
      tamanho: r.data.tamanho,
      ordenar: r.data.ordenar ?? null,
      direcao: r.data.direcao,
      incluirAusentes: r.data.incluir_ausentes ?? false,
    };
  };

  const corpoDe = (corpo: unknown): Record<string, unknown> => {
    const r = esquemaCorpo.safeParse(corpo);
    if (!r.success) throw entradaInvalida('Envie um objeto JSON com os campos do registro.');
    return r.data;
  };

  // ── Catalogo: o que a interface pode pedir e como ─────────────────────────
  //
  // Sem exigir modulo especifico: e metadado do proprio contrato da API, e
  // toda sessao autenticada precisa dele para montar as telas.
  app.get(`${base}/catalogo`, async () => ({
    entidades: NOMES_ENTIDADES.map((nome) => {
      const d = ENTIDADES[nome];
      return {
        nome,
        tabela: d.tabela,
        modulo: d.modulo,
        acoes: d.acoes,
        campos: Object.keys(d.campos),
        ordenaveis: d.ordenaveis,
        recorte: d.recorte ?? null,
        filtra_por_comite: d.temComite,
        filtra_por_empreendimento: d.temEmpreendimento,
      };
    }),
  }));

  // ── Carga inicial ─────────────────────────────────────────────────────────
  app.get<{ Querystring: { comite_id?: string } }>(
    `${base}/carga-inicial`,
    { config: { exige: { modulo: 'visao_geral', acao: 'ler' } } },
    async (req) => {
      const ctx = contextoDe(req);
      const comiteId = req.query.comite_id ?? null;
      if (comiteId && !/^[0-9a-f-]{36}$/i.test(comiteId)) {
        throw entradaInvalida('comite_id invalido.');
      }
      return cargaInicial(comiteId, ctx);
    },
  );

  // ── Exportacao ────────────────────────────────────────────────────────────
  app.get(
    `${base}/exportar`,
    { config: { exige: { modulo: 'juridico', acao: 'exportar' } } },
    async (req) => exportar(contextoDe(req)),
  );

  // ── Divergencia entre navegador e banco (fase de leitura dupla) ───────────
  //
  // Existe para o periodo em que ainda pode haver dado de versao anterior no
  // navegador. Divergir nao apaga nem sobrescreve nada: gera inconsistencia
  // para decisao humana.
  app.post(
    `${base}/divergencia-local`,
    async (req) => {
      const ctx = contextoDe(req);
      // Mesma regra da migração: quem pode migrar o próprio navegador pode
      // registrar que ele diverge do banco. Exigir perfil de administração
      // faria a divergência passar despercebida justamente para quem tem o
      // dado legado.
      exigirPodeMigrar(ctx.autorizacao, 'executar');
      const r = esquemaDivergencia.safeParse(req.body);
      if (!r.success) throw entradaInvalida('Envie entidade e as duas contagens.');

      const { entidade, registros_no_navegador, registros_no_servidor } = r.data;

      const resultado = await registrarInconsistencia(
        {
          tipo: 'divergencia_valor',
          gravidade: 'media',
          fonte: 'migracao',
          descricao:
            `Divergencia entre navegador e banco em "${entidade}": ` +
            `${registros_no_navegador} registro(s) no navegador contra ` +
            `${registros_no_servidor} no PostgreSQL. Nenhum dos dois foi alterado. ` +
            'Provavel migracao pendente neste navegador.',
          execucaoId: null,
          chaveExtra: [entidade, String(registros_no_navegador), String(registros_no_servidor)],
        },
        { usuarioId: ctx.usuarioId, usuarioNome: ctx.usuarioNome },
      );

      return { registrada: true, inconsistencia_id: resultado.id, reincidencia: resultado.reincidencia };
    },
  );

  // ── CRUD por entidade ─────────────────────────────────────────────────────
  app.get<{ Params: { entidade: string } }>(`${base}/:entidade`, async (req) => {
    const ctx = contextoDe(req);
    return listar(entidadeDe(req.params.entidade), filtrosDe(req.query), ctx);
  });

  app.get<{ Params: { entidade: string; id: string } }>(
    `${base}/:entidade/:id`,
    async (req) => {
      const ctx = contextoDe(req);
      return obter(entidadeDe(req.params.entidade), req.params.id, ctx);
    },
  );

  app.post<{ Params: { entidade: string } }>(`${base}/:entidade`, async (req, reply) => {
    const ctx = contextoDe(req);
    const registro = await criar(entidadeDe(req.params.entidade), corpoDe(req.body), ctx);
    reply.code(201);
    return registro;
  });

  app.post<{ Params: { entidade: string } }>(`${base}/:entidade/lote`, async (req, reply) => {
    const ctx = contextoDe(req);
    const r = z
      .object({ registros: z.array(esquemaCorpo).min(1).max(500) })
      .safeParse(req.body);
    if (!r.success) {
      throw entradaInvalida('Envie { registros: [...] } com ate 500 itens.');
    }
    const criados = await criarLote(entidadeDe(req.params.entidade), r.data.registros, ctx);
    reply.code(201);
    return { criados: criados.length, registros: criados };
  });

  app.patch<{ Params: { entidade: string; id: string } }>(
    `${base}/:entidade/:id`,
    async (req) => {
      const ctx = contextoDe(req);
      const corpo = corpoDe(req.body);

      // A versao vem no corpo ou no If-Match. Aceitar as duas formas evita
      // obrigar a interface a mudar de estilo por causa do transporte.
      const doCabecalho = req.headers['if-match'];
      const bruta =
        corpo.versao ?? (typeof doCabecalho === 'string' ? doCabecalho.replace(/"/g, '') : null);
      const versao = bruta === null || bruta === undefined ? null : Number(bruta);
      if (versao !== null && !Number.isInteger(versao)) {
        throw entradaInvalida('Versao deve ser um numero inteiro.');
      }
      delete corpo.versao;

      return atualizar(entidadeDe(req.params.entidade), req.params.id, corpo, versao, ctx);
    },
  );

  app.delete<{ Params: { entidade: string; id: string } }>(
    `${base}/:entidade/:id`,
    async (req) => {
      const ctx = contextoDe(req);
      return excluir(entidadeDe(req.params.entidade), [req.params.id], ctx);
    },
  );

  // Exclusao em lote. A sincronizacao do Monday apaga dezenas de registros
  // antes de reimportar; sem lote seriam dezenas de requisicoes.
  app.post<{ Params: { entidade: string } }>(
    `${base}/:entidade/excluir`,
    async (req) => {
      const ctx = contextoDe(req);
      const r = z.object({ ids: z.array(z.string().uuid()).max(500) }).safeParse(req.body);
      if (!r.success) throw entradaInvalida('Envie { ids: [...] } com ate 500 identificadores.');
      return excluir(entidadeDe(req.params.entidade), r.data.ids, ctx);
    },
  );
}
