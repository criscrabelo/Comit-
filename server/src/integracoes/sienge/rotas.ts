/**
 * Rotas do Sienge — estado, verificação de configuração e homologação.
 *
 * Nenhuma rota de ingestão existe ainda, de propósito: enquanto os endpoints não
 * forem confirmados no ambiente da Coevo, não há o que ingerir. Chamar qualquer
 * coisa devolve `integracao_nao_verificada`, com o motivo declarado — nunca
 * dado vazio nem zero.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { db } from '../../db/pool.js';
import { ErroApi, entradaInvalida, naoAutenticado } from '../../errors.js';
import { auditar } from '../../audit/registrar.js';
import { ENDPOINTS_CANDIDATOS, verificarConfiguracao } from './cliente.js';

const esquemaHomologacao = z.object({
  endpoint: z.string().min(1),
  confirmado: z.boolean(),
  /** O que a Coevo confirmou: caminho real, parâmetros, formato. */
  observacao: z.string().min(10).max(2000),
});

export async function rotasSienge(app: FastifyInstance): Promise<void> {
  // ── Estado e verificação de configuração ──────────────────────────────────
  app.get(
    '/api/sienge/estado',
    { config: { exige: { modulo: 'juridico', acao: 'ler' } } },
    async () => {
      const configuracao = verificarConfiguracao();

      const integracao = await db
        .selectFrom('integracoes')
        .select([
          'estado',
          'habilitada',
          'modo',
          'ambiente_verificado_em',
          'relatorio_verificacao',
          'ultima_carga_em',
          'ultima_carga_valida_em',
        ])
        .where('sistema', '=', 'sienge')
        .executeTakeFirst();

      const endpoints = Object.entries(ENDPOINTS_CANDIDATOS).map(([chave, e]) => ({
        chave,
        caminho: e.caminho,
        descricao: e.descricao,
        natureza: e.natureza,
        confirmado: e.confirmado,
        observacao_homologacao: e.observacaoHomologacao ?? null,
      }));

      const confirmados = endpoints.filter((e) => e.confirmado).length;

      return {
        // Presença das credenciais, nunca o valor — nem o subdomínio.
        configuracao: {
          completa: configuracao.completa,
          presentes: configuracao.presentes,
          faltando: configuracao.faltando,
        },
        habilitado: config.sienge.habilitado,
        modo: integracao?.modo ?? 'leitura',
        estado: integracao?.estado ?? 'desconectada',
        ambiente_verificado_em: integracao?.ambiente_verificado_em ?? null,
        ultima_carga_em: integracao?.ultima_carga_em ?? null,
        ultima_carga_valida_em: integracao?.ultima_carga_valida_em ?? null,
        endpoints,
        homologacao: {
          endpoints_confirmados: confirmados,
          endpoints_totais: endpoints.length,
          pronto_para_ingestao: config.sienge.habilitado && confirmados > 0,
        },
        // Enquanto não houver dado, a resposta diz POR QUE. Nunca zero.
        indicadores_financeiros: {
          disponivel: false,
          motivo:
            confirmados === 0
              ? 'Endpoints do Sienge ainda nao confirmados no ambiente da Coevo.'
              : 'Conector configurado, mas nenhuma carga valida foi executada.',
        },
      };
    },
  );

  // ── Health check da configuração ──────────────────────────────────────────
  // Não chama a API: verifica se a estrutura está pronta para chamar.
  app.get(
    '/api/sienge/saude',
    { config: { exige: { modulo: 'administracao', acao: 'ler' } } },
    async (_req, reply) => {
      const configuracao = verificarConfiguracao();
      const confirmados = Object.values(ENDPOINTS_CANDIDATOS).filter((e) => e.confirmado).length;

      const pronto = configuracao.completa && config.sienge.habilitado && confirmados > 0;

      if (!pronto) reply.code(503);

      return {
        pronto,
        credenciais_completas: configuracao.completa,
        faltando: configuracao.faltando,
        habilitado: config.sienge.habilitado,
        endpoints_confirmados: confirmados,
        proximo_passo: !configuracao.completa
          ? 'Configurar SIENGE_SUBDOMAIN, SIENGE_USER e SIENGE_PASSWORD no servidor.'
          : confirmados === 0
            ? 'Confirmar os endpoints com o responsavel pelo Sienge na Coevo (ver docs/SIENGE-INFORMACOES-NECESSARIAS.md).'
            : !config.sienge.habilitado
              ? 'Definir SIENGE_HABILITADO=true apos a homologacao.'
              : 'Pronto para a primeira carga controlada.',
      };
    },
  );

  // ── Registro da homologação de um endpoint ────────────────────────────────
  //
  // Confirmar é ato deliberado, endpoint por endpoint, com o que a Coevo
  // informou. Fica auditado: quem confirmou, quando e com base em quê.
  app.post(
    '/api/sienge/homologar',
    { config: { exige: { modulo: 'administracao', acao: 'executar' } } },
    async (req) => {
      if (!req.usuario) throw naoAutenticado();

      const corpo = esquemaHomologacao.safeParse(req.body);
      if (!corpo.success) {
        throw entradaInvalida(
          'Informe o endpoint, se foi confirmado, e uma observacao com o que a Coevo informou (minimo 10 caracteres).',
          { endpoints: Object.keys(ENDPOINTS_CANDIDATOS) },
        );
      }

      const candidato = ENDPOINTS_CANDIDATOS[corpo.data.endpoint];
      if (!candidato) {
        throw entradaInvalida(`Endpoint desconhecido: ${corpo.data.endpoint}`, {
          endpoints: Object.keys(ENDPOINTS_CANDIDATOS),
        });
      }

      // A confirmação vive em memória do processo E no banco. O banco é a
      // fonte da verdade entre reinícios; ver `carregarHomologacao`.
      candidato.confirmado = corpo.data.confirmado;
      candidato.observacaoHomologacao = corpo.data.observacao;

      const atual = await db
        .selectFrom('integracoes')
        .select('relatorio_verificacao')
        .where('sistema', '=', 'sienge')
        .executeTakeFirst();

      const relatorio = {
        ...((atual?.relatorio_verificacao as Record<string, unknown>) ?? {}),
        [corpo.data.endpoint]: {
          confirmado: corpo.data.confirmado,
          observacao: corpo.data.observacao,
          confirmado_por: req.usuario.nome,
          confirmado_em: new Date().toISOString(),
        },
      };

      await db
        .updateTable('integracoes')
        .set({
          relatorio_verificacao: JSON.stringify(relatorio),
          ambiente_verificado_em: new Date(),
          ambiente_verificado_por: req.usuario.id,
          atualizado_em: new Date(),
        })
        .where('sistema', '=', 'sienge')
        .execute();

      await auditar({
        ...req.contextoAuditoria,
        acao: 'integracao_verificada',
        recurso: 'integracoes',
        recursoId: 'sienge',
        modulo: 'administracao',
        detalhe: {
          endpoint: candidato.caminho,
          confirmado: corpo.data.confirmado,
          observacao: corpo.data.observacao,
        },
      });

      return {
        endpoint: candidato.caminho,
        confirmado: candidato.confirmado,
        endpoints_confirmados: Object.values(ENDPOINTS_CANDIDATOS).filter((e) => e.confirmado).length,
      };
    },
  );

  // ── Ingestão: existe, e recusa ────────────────────────────────────────────
  //
  // A rota existe para responder com clareza em vez de 404. Recusar dizendo por
  // quê é melhor do que a interface receber "rota inexistente" e concluir que a
  // funcionalidade sumiu.
  app.post(
    '/api/sienge/sync',
    { config: { exige: { modulo: 'juridico', acao: 'executar' } } },
    async () => {
      const configuracao = verificarConfiguracao();
      const confirmados = Object.values(ENDPOINTS_CANDIDATOS).filter((e) => e.confirmado).length;

      throw new ErroApi(
        'integracao_nao_verificada',
        'A ingestao do Sienge esta travada ate a homologacao do ambiente. ' +
          'Nenhum dado foi lido e nenhum registro foi alterado.',
        {
          credenciais_completas: configuracao.completa,
          faltando: configuracao.faltando,
          habilitado: config.sienge.habilitado,
          endpoints_confirmados: confirmados,
          endpoints_totais: Object.keys(ENDPOINTS_CANDIDATOS).length,
          o_que_falta:
            'Confirmar URL, versao, autenticacao, endpoints, parametros e paginacao com o responsavel ' +
            'pelo Sienge na Coevo. Lista completa em docs/SIENGE-INFORMACOES-NECESSARIAS.md.',
        },
      );
    },
  );
}

/**
 * Recarrega as confirmações gravadas no banco.
 *
 * `ENDPOINTS_CANDIDATOS` vive em memória do processo; sem isto, reiniciar o
 * servidor destravaria endpoints já confirmados ou, pior, deixaria a memória
 * divergir do banco. Chamado na partida.
 */
export async function carregarHomologacao(): Promise<number> {
  const integracao = await db
    .selectFrom('integracoes')
    .select('relatorio_verificacao')
    .where('sistema', '=', 'sienge')
    .executeTakeFirst();

  const relatorio = (integracao?.relatorio_verificacao as Record<
    string,
    { confirmado?: boolean; observacao?: string }
  > | null) ?? null;

  if (!relatorio) return 0;

  let confirmados = 0;
  for (const [chave, registro] of Object.entries(relatorio)) {
    const candidato = ENDPOINTS_CANDIDATOS[chave];
    if (!candidato) continue;
    candidato.confirmado = registro.confirmado === true;
    candidato.observacaoHomologacao = registro.observacao;
    if (candidato.confirmado) confirmados++;
  }

  return confirmados;
}
