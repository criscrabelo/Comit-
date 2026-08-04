/**
 * Endpoints da Central de Inconsistencias.
 *
 * Regras de permissao (verificadas no servidor, sempre):
 *
 *   GET  /catalogo              modulo juridico: ler
 *   GET  /                      modulo juridico: ler   + escopo de empreendimento
 *   GET  /resumo                modulo juridico: ler   + escopo de empreendimento
 *   GET  /:id                   modulo juridico: ler   + escopo + AUDITA leitura
 *   GET  /:id/historico         modulo juridico: ler
 *   GET  /:id/origem            modulo juridico: ler   + escopo
 *   POST /:id/responsavel       modulo juridico: editar
 *   POST /:id/analise           modulo juridico: editar
 *   POST /:id/encerrar          modulo juridico: editar
 *
 * Convidado e Colaborador nao tem `juridico:ler` no padrao de perfil, portanto
 * nao alcancam a Central. Diretoria le mas nao trata. Gestora e Lider tratam.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/pool.js';
import { entradaInvalida, naoAutenticado, naoAutorizado, naoEncontrado } from '../errors.js';
import {
  exigirEmpreendimento,
  filtroEmpreendimentos,
  aplicarMascaraDocumento,
} from '../rbac/autorizacao.js';
import {
  aprovar,
  atribuir,
  catalogo,
  encerrar,
  marcarRequerAprovacao,
  historico,
  listar,
  obter,
  paraStatusApi,
  registrarAnalise,
  registrosDeOrigem,
  resumo,
  type ContextoUsuario,
} from './servico.js';
import { TIPOS } from './tipos.js';

const TIPOS_VALIDOS = Object.keys(TIPOS) as [keyof typeof TIPOS, ...Array<keyof typeof TIPOS>];

/**
 * Quem encerra inconsistencia critica.
 *
 * Gestora e a titular do tratamento. Administrador entra por contingencia —
 * quando a Gestora esta indisponivel — e cada encerramento seu fica na trilha
 * com o perfil registrado, para que a excecao seja visivel depois.
 *
 * Lider trata mas NAO encerra critica: fechar um vinculo ambiguo que altera a
 * exposicao da carteira excede o escopo de quem distribui trabalho.
 * Diretoria delibera em /aprovar, nao encerra.
 */
const PERFIS_ENCERRAM_CRITICA: ReadonlyArray<string> = ['gestora', 'administrador'];

/** Somente a Diretoria delibera. */
const PERFIS_APROVAM: ReadonlyArray<string> = ['diretoria'];

const esquemaAprovacao = z.object({
  decisao: z.enum(['aprovada', 'reprovada', 'aprovada_com_ressalva']),
  justificativa: z.string().min(10).max(5000),
});

const esquemaMarcarAprovacao = z.object({
  requer_aprovacao: z.boolean(),
});

const esquemaFiltros = z.object({
  fonte: z.enum(['monday', 'sienge', 'cvcrm', 'manual', 'migracao', 'consolidacao']).optional(),
  empreendimento_id: z.string().uuid().optional(),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  periodo_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodo_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tipo: z.enum(TIPOS_VALIDOS).optional(),
  status: z.enum(['pendente', 'em_revisao', 'resolvida', 'descartada']).optional(),
  gravidade: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
  impacto: z
    .enum(['nenhum', 'cadastro', 'indicador', 'valor_financeiro', 'situacao_juridica', 'multiplo'])
    .optional(),
  responsavel_id: z.string().uuid().optional(),
  area: z.enum(['juridico', 'ti', 'financeiro', 'comercial', 'obras', 'diretoria']).optional(),
  somente_bloqueantes: z.coerce.boolean().optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
  deslocamento: z.coerce.number().int().min(0).optional(),
});

const esquemaAtribuicao = z.object({
  responsavel_id: z.string().uuid().nullable(),
});

const esquemaAnalise = z.object({
  analise: z.string().min(3).max(5000),
  gravidade: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
  impacto: z
    .enum(['nenhum', 'cadastro', 'indicador', 'valor_financeiro', 'situacao_juridica', 'multiplo'])
    .optional(),
});

const esquemaEncerramento = z.object({
  status: z.enum(['resolvida', 'descartada']),
  decisao: z.string().min(3).max(5000),
  justificativa: z.string().min(3).max(5000),
  analise: z.string().max(5000).optional(),
});

/**
 * Mascara o CPF/CNPJ que aparece dentro dos valores em conflito.
 *
 * A Central mostra dado de cliente. Quem nao tem permissao de documento
 * completo ve mascarado — inclusive dentro do jsonb, que de outra forma
 * escaparia do mascaramento aplicado nas colunas.
 */
function mascararConflito(
  ctx: import('../rbac/autorizacao.js').ContextoAutorizacao,
  valores: unknown,
): unknown {
  if (!Array.isArray(valores)) return valores;

  return valores.map((lado) => {
    if (!lado || typeof lado !== 'object') return lado;
    const copia = { ...(lado as Record<string, unknown>) };
    const campo = String(copia.campo ?? '');
    if (/cpf|cnpj|documento/i.test(campo)) {
      copia.valor = aplicarMascaraDocumento(ctx, String(copia.valor ?? ''));
      if (copia.valor_normalizado !== undefined) {
        copia.valor_normalizado = aplicarMascaraDocumento(ctx, String(copia.valor_normalizado ?? ''));
      }
    }
    return copia;
  });
}

export async function rotasInconsistencias(app: FastifyInstance): Promise<void> {
  const base = '/api/cobranca/inconsistencias';

  const contextoDe = (req: import('fastify').FastifyRequest): ContextoUsuario => ({
    usuarioId: req.contextoAuditoria.usuarioId,
    usuarioNome: req.contextoAuditoria.usuarioNome,
    perfil: req.contextoAuditoria.perfil,
    sessaoId: req.contextoAuditoria.sessaoId,
    enderecoIp: req.contextoAuditoria.enderecoIp,
  });

  // ── Catalogo dos tipos ────────────────────────────────────────────────────
  app.get(
    `${base}/catalogo`,
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async () => ({ tipos: catalogo() }),
  );

  // ── Resumo por gravidade e status ─────────────────────────────────────────
  app.get(
    `${base}/resumo`,
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();
      return { resumo: await resumo(filtroEmpreendimentos(ctx)) };
    },
  );

  // ── Lista com filtros (requisito 13) ──────────────────────────────────────
  app.get(
    base,
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      const filtros = esquemaFiltros.safeParse(req.query);
      if (!filtros.success) {
        throw entradaInvalida('Filtros invalidos.', {
          campos: filtros.error.issues.map((i) => i.path.join('.')),
        });
      }
      const f = filtros.data;

      // Filtrar por um empreendimento fora do escopo e negado, nao apenas
      // silenciosamente vazio: o usuario precisa saber que nao tem acesso.
      if (f.empreendimento_id) exigirEmpreendimento(ctx, f.empreendimento_id);

      const linhas = await listar({
        fonte: f.fonte,
        empreendimentoId: f.empreendimento_id,
        competenciaRef: f.competencia,
        periodoInicio: f.periodo_inicio,
        periodoFim: f.periodo_fim,
        tipo: f.tipo,
        status: f.status,
        gravidade: f.gravidade,
        impacto: f.impacto,
        responsavelId: f.responsavel_id,
        area: f.area,
        somenteBloqueantes: f.somente_bloqueantes,
        empreendimentosPermitidos: filtroEmpreendimentos(ctx),
        limite: f.limite,
        deslocamento: f.deslocamento,
      });

      return {
        total: linhas.length,
        inconsistencias: linhas.map((l) => ({
          ...l,
          status: paraStatusApi(l.status_revisao),
          valores_em_conflito: mascararConflito(ctx, l.valores_em_conflito),
          orientacao: TIPOS[l.tipo].orientacao,
          rotulo_tipo: TIPOS[l.tipo].rotulo,
        })),
      };
    },
  );

  // ── Detalhe (requisito 15: leitura auditada) ──────────────────────────────
  app.get<{ Params: { id: string } }>(
    `${base}/:id`,
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      const linha = await obter(req.params.id, contextoDe(req));
      exigirEmpreendimento(ctx, linha.empreendimento_id);

      return {
        ...linha,
        status: paraStatusApi(linha.status_revisao),
        valores_em_conflito: mascararConflito(ctx, linha.valores_em_conflito),
        orientacao: TIPOS[linha.tipo].orientacao,
        rotulo_tipo: TIPOS[linha.tipo].rotulo,
      };
    },
  );

  // ── Historico completo (requisito 11) ─────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    `${base}/:id/historico`,
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      const alvo = await db
        .selectFrom('inconsistencias')
        .select('empreendimento_id')
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!alvo) throw naoEncontrado('Inconsistencia nao encontrada.');
      exigirEmpreendimento(ctx, alvo.empreendimento_id);

      const eventos = await historico(req.params.id);
      return {
        eventos: eventos.map((e) => ({
          ...e,
          status_antes: e.status_antes ? paraStatusApi(e.status_antes) : null,
          status_depois: e.status_depois ? paraStatusApi(e.status_depois) : null,
        })),
      };
    },
  );

  // ── Registros originais das fontes (requisito 14) ─────────────────────────
  app.get<{ Params: { id: string } }>(
    `${base}/:id/origem`,
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      const alvo = await db
        .selectFrom('inconsistencias')
        .select(['empreendimento_id', 'valores_em_conflito'])
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!alvo) throw naoEncontrado('Inconsistencia nao encontrada.');
      exigirEmpreendimento(ctx, alvo.empreendimento_id);

      const registros = await registrosDeOrigem(req.params.id);

      return {
        // Referencias declaradas na inconsistencia — sempre presentes.
        lados: mascararConflito(ctx, alvo.valores_em_conflito),
        // Payloads brutos preservados na ingestao. Vazio quando a carga foi
        // anterior a area bruta ou quando a origem foi manual.
        registros_originais: registros,
        observacao:
          registros.length === 0
            ? 'Nenhum payload bruto encontrado para os identificadores deste conflito.'
            : null,
      };
    },
  );

  // ── Atribuir responsavel (requisito 7) ────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    `${base}/:id/responsavel`,
    { config: { exige: { modulo: 'juridico', acao: 'editar' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      const corpo = esquemaAtribuicao.safeParse(req.body);
      if (!corpo.success) throw entradaInvalida('Informe responsavel_id ou null.');

      const alvo = await db
        .selectFrom('inconsistencias')
        .select('empreendimento_id')
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!alvo) throw naoEncontrado('Inconsistencia nao encontrada.');
      exigirEmpreendimento(ctx, alvo.empreendimento_id);

      // Nao atribuir a quem nao existe ou esta inativo: a fila ficaria parada
      // esperando alguem que nunca vai abrir o caso.
      if (corpo.data.responsavel_id) {
        const responsavel = await db
          .selectFrom('usuarios')
          .select(['id', 'status'])
          .where('id', '=', corpo.data.responsavel_id)
          .executeTakeFirst();
        if (!responsavel) throw entradaInvalida('Responsavel nao encontrado.');
        if (responsavel.status !== 'ativo') {
          throw entradaInvalida('Nao e possivel atribuir a um usuario inativo.');
        }
      }

      await atribuir(req.params.id, corpo.data.responsavel_id, contextoDe(req));
      return { atribuida: true };
    },
  );

  // ── Registrar analise (requisito 9) ───────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    `${base}/:id/analise`,
    { config: { exige: { modulo: 'juridico', acao: 'editar' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      const corpo = esquemaAnalise.safeParse(req.body);
      if (!corpo.success) throw entradaInvalida('Informe a analise (minimo 3 caracteres).');

      const alvo = await db
        .selectFrom('inconsistencias')
        .select('empreendimento_id')
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!alvo) throw naoEncontrado('Inconsistencia nao encontrada.');
      exigirEmpreendimento(ctx, alvo.empreendimento_id);

      await registrarAnalise(req.params.id, corpo.data, contextoDe(req));
      return { registrada: true };
    },
  );

  // ── Encerrar como resolvida ou descartada (requisitos 10 e 12) ────────────
  app.post<{ Params: { id: string } }>(
    `${base}/:id/encerrar`,
    { config: { exige: { modulo: 'juridico', acao: 'editar' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      const corpo = esquemaEncerramento.safeParse(req.body);
      if (!corpo.success) {
        throw entradaInvalida(
          'Encerrar exige status (resolvida ou descartada), decisao e justificativa.',
        );
      }

      const alvo = await db
        .selectFrom('inconsistencias')
        .select(['empreendimento_id', 'gravidade'])
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!alvo) throw naoEncontrado('Inconsistencia nao encontrada.');
      exigirEmpreendimento(ctx, alvo.empreendimento_id);

      // Encerramento de critica: Gestora (titular) ou Administrador (por
      // contingencia, sempre auditado).
      //
      // A Diretoria NAO entra aqui. Ela delibera em /aprovar, acao propria, e
      // nao opera o tratamento — coerente com ser perfil de leitura. Listar a
      // Diretoria aqui era contraditorio: com apenas `juridico:ler` ela nunca
      // alcancaria esta rota, e a mencao dava a entender o contrario.
      if (alvo.gravidade === 'critica' && !PERFIS_ENCERRAM_CRITICA.includes(ctx.perfil)) {
        throw naoAutorizado(
          'Inconsistencia critica so pode ser encerrada por Gestora ou, por contingencia, por Administrador. ' +
            'A Diretoria delibera pela acao de aprovacao, nao pelo encerramento.',
          { gravidade: alvo.gravidade, perfil: ctx.perfil },
        );
      }

      await encerrar(req.params.id, corpo.data, contextoDe(req));
      return { encerrada: true, status: corpo.data.status };
    },
  );

  // ── Encaminhar para deliberacao da Diretoria ──────────────────────────────
  // Acao da Gestora: identifica o que precisa subir. Nao altera o tratamento.
  app.post<{ Params: { id: string } }>(
    `${base}/:id/requer-aprovacao`,
    { config: { exige: { modulo: 'juridico', acao: 'editar' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      const corpo = esquemaMarcarAprovacao.safeParse(req.body);
      if (!corpo.success) throw entradaInvalida('Informe requer_aprovacao (true ou false).');

      const alvo = await db
        .selectFrom('inconsistencias')
        .select('empreendimento_id')
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!alvo) throw naoEncontrado('Inconsistencia nao encontrada.');
      exigirEmpreendimento(ctx, alvo.empreendimento_id);

      await marcarRequerAprovacao(req.params.id, corpo.data.requer_aprovacao, contextoDe(req));
      return { requer_aprovacao: corpo.data.requer_aprovacao };
    },
  );

  // ── Deliberacao formal da Diretoria ───────────────────────────────────────
  //
  // Exige `juridico:ler` (que a Diretoria tem) MAIS o perfil diretoria. Nao usa
  // `editar`, para que aprovar nao implique poder alterar o tratamento
  // operacional. E a separacao entre deliberar e operar.
  app.post<{ Params: { id: string } }>(
    `${base}/:id/aprovar`,
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async (req) => {
      const ctx = req.autorizacao;
      if (!ctx) throw naoAutenticado();

      if (!PERFIS_APROVAM.includes(ctx.perfil)) {
        throw naoAutorizado(
          'A deliberacao formal e exclusiva da Diretoria. Para encerrar o tratamento operacional, use a acao de encerramento.',
          { perfil: ctx.perfil, perfis_permitidos: PERFIS_APROVAM },
        );
      }

      const corpo = esquemaAprovacao.safeParse(req.body);
      if (!corpo.success) {
        throw entradaInvalida(
          'A deliberacao exige decisao (aprovada, reprovada ou aprovada_com_ressalva) e justificativa com ao menos 10 caracteres.',
        );
      }

      const alvo = await db
        .selectFrom('inconsistencias')
        .select('empreendimento_id')
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!alvo) throw naoEncontrado('Inconsistencia nao encontrada.');
      exigirEmpreendimento(ctx, alvo.empreendimento_id);

      await aprovar(req.params.id, corpo.data, contextoDe(req));
      return { deliberada: true, decisao: corpo.data.decisao };
    },
  );
}
