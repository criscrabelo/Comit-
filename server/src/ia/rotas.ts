/**
 * Rotas das assistentes de IA — Temis (Juridico) e Ivo (consultoria
 * legislativa). Fonte: design_handoff_comites_juridicos/README.md, secao
 * "Agentes de IA".
 *
 * Permissoes: ambas exigem `inteligencia:executar` — hoje so a gestora tem
 * (migrations/002_identidade_acesso.sql). GET /api/ia/estado exige apenas
 * `inteligencia:ler`, para a tela saber se deve mostrar o aviso de
 * indisponibilidade sem precisar tentar uma conversa primeiro.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { entradaInvalida, naoAutenticado } from '../errors.js';
import { auditar } from '../audit/registrar.js';
import { perguntarIA, type MensagemIA } from './cliente.js';

const esquemaMensagem = z.object({
  papel: z.enum(['usuario', 'assistente']),
  texto: z.string().min(1).max(4000),
});

const esquemaTemis = z.object({
  mensagens: z.array(esquemaMensagem).min(1).max(40),
  // Resumo textual da carteira filtrada, montado no navegador a partir do que
  // a pessoa esta vendo na tela naquele momento (ver README, "Contexto").
  contexto: z.string().max(6000).optional(),
});

const esquemaIvo = z.object({
  mensagens: z.array(esquemaMensagem).min(1).max(40),
});

const TEMIS_SISTEMA = `Voce e Temis, assistente de IA do Departamento Juridico Digital do Grupo Patrono/Coevo.
Responda sempre em portugues do Brasil, com tom profissional e objetivo, SEM usar markdown — nada de asteriscos, listas com marcadores ou titulos, apenas texto corrido.
Seja concisa. Nunca invente numeros que nao estejam no contexto da carteira fornecido a seguir; se a pergunta pedir um dado que nao esta no contexto, diga que nao tem esse dado na carteira atual em vez de estimar.`;

const IVO_SISTEMA = `Voce e Ivo, Consultor Juridico de IA do Grupo Patrono/Coevo, especializado em consultoria legislativa.
Escopo: direito imobiliario, construcao e incorporacao, tributario (RET, IR), financeiro e credito (SFH/SFI, FGTS, CMN, CVM), direito do consumidor, e trabalhista da construcao civil (CLT, Normas Regulamentadoras incluindo a NR-1).
Responda sempre em portugues do Brasil. Toda resposta tem obrigatoriamente tres partes, nesta ordem, narradas em texto corrido e sem markdown:
1) a conclusao ou posicao direta sobre a pergunta;
2) a fundamentacao, citando lei e artigo especificos (por exemplo: Lei 13.786/2018, art. 43; Codigo de Defesa do Consumidor, art. 51);
3) uma ressalva de que seu conhecimento tem uma data de corte e que a resposta nao substitui parecer juridico formal.`;

function paraMensagensIA(mensagens: { papel: 'usuario' | 'assistente'; texto: string }[]): MensagemIA[] {
  return mensagens.map((m) => ({ papel: m.papel, texto: m.texto }));
}

export async function rotasIA(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/ia/estado',
    { config: { exige: { modulo: 'inteligencia', acao: 'ler' } } },
    async () => ({ habilitada: config.ia.habilitado }),
  );

  app.post(
    '/api/ia/temis',
    { config: { exige: { modulo: 'inteligencia', acao: 'executar' } } },
    async (req) => {
      if (!req.usuario || !req.autorizacao) throw naoAutenticado();

      const r = esquemaTemis.safeParse(req.body);
      if (!r.success) {
        throw entradaInvalida('Envie { mensagens: [...] }, com "contexto" opcional.', {
          problemas: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }

      const sistema = r.data.contexto
        ? `${TEMIS_SISTEMA}\n\nContexto atual da carteira juridica:\n${r.data.contexto}`
        : TEMIS_SISTEMA;

      const resposta = await perguntarIA(sistema, paraMensagensIA(r.data.mensagens));

      await auditar({
        acao: 'ia_consultada',
        usuarioId: req.usuario.id,
        usuarioNome: req.usuario.nome,
        perfil: req.usuario.perfil,
        sessaoId: req.usuario.sessaoId,
        enderecoIp: req.contextoAuditoria.enderecoIp,
        recurso: 'temis',
        modulo: 'inteligencia',
      });

      return { resposta };
    },
  );

  app.post(
    '/api/ia/ivo',
    { config: { exige: { modulo: 'inteligencia', acao: 'executar' } } },
    async (req) => {
      if (!req.usuario || !req.autorizacao) throw naoAutenticado();

      const r = esquemaIvo.safeParse(req.body);
      if (!r.success) {
        throw entradaInvalida('Envie { mensagens: [...] }.', {
          problemas: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }

      const resposta = await perguntarIA(IVO_SISTEMA, paraMensagensIA(r.data.mensagens));

      await auditar({
        acao: 'ia_consultada',
        usuarioId: req.usuario.id,
        usuarioNome: req.usuario.nome,
        perfil: req.usuario.perfil,
        sessaoId: req.usuario.sessaoId,
        enderecoIp: req.contextoAuditoria.enderecoIp,
        recurso: 'ivo',
        modulo: 'inteligencia',
      });

      return { resposta };
    },
  );
}
