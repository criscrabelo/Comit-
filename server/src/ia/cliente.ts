/**
 * Cliente das assistentes de IA (Temis e Ivo) — API da Anthropic, mensagens.
 *
 * Mesmo desenho do cliente do Monday (integracoes/monday/cliente.ts): a chave
 * vive so aqui, em variavel de ambiente, nunca chega ao navegador e nunca e
 * logada. Ausencia de chave nao trava o servidor — a rota devolve
 * `integracao_desligada` e a tela mostra a mensagem de indisponibilidade
 * documentada no handoff, em vez de travar ou inventar resposta.
 *
 * Usa `fetch` puro, sem SDK, pelo mesmo motivo do cliente do Monday: e uma
 * unica chamada HTTP, e adicionar uma dependencia so para isso seria peso sem
 * ganho.
 */
import { config } from '../config.js';
import { logger } from '../logging.js';
import { ErroApi } from '../errors.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';
const TEMPO_LIMITE_MS = 30_000;
const TOKENS_MAXIMOS_RESPOSTA = 1024;

export interface MensagemIA {
  papel: 'usuario' | 'assistente';
  texto: string;
}

function exigirChave(): string {
  if (!config.ia.chave) {
    throw new ErroApi(
      'integracao_desligada',
      'Assistente de IA desligada: a plataforma ainda nao foi configurada com uma chave de IA.',
    );
  }
  return config.ia.chave;
}

/**
 * Envia system prompt + historico para a Anthropic e devolve o texto da
 * resposta. Lanca ErroApi em qualquer falha — quem chama nao precisa
 * distinguir rede de resposta malformada, so mostrar que a assistente nao
 * respondeu desta vez.
 */
export async function perguntarIA(sistema: string, mensagens: MensagemIA[]): Promise<string> {
  const chave = exigirChave();

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);

  let resposta: Response;
  try {
    resposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': VERSAO_API,
      },
      body: JSON.stringify({
        model: config.ia.modelo,
        max_tokens: TOKENS_MAXIMOS_RESPOSTA,
        system: sistema,
        messages: mensagens.map((m) => ({
          role: m.papel === 'usuario' ? 'user' : 'assistant',
          content: m.texto,
        })),
      }),
      signal: controlador.signal,
    });
  } catch (erro) {
    logger.warn({ motivo: erro instanceof Error ? erro.message : String(erro) }, 'Falha de rede ao chamar a IA');
    throw new ErroApi('fonte_indisponivel', 'Nao foi possivel falar com a assistente de IA agora.');
  } finally {
    clearTimeout(temporizador);
  }

  if (!resposta.ok) {
    // O corpo do erro da Anthropic pode conter detalhe sensivel (chave
    // invalida, limite de uso, request id) — fica so no log do servidor. O
    // navegador recebe apenas o status, no mesmo padrao do cliente do Monday
    // (ver ErroMonday em integracoes/monday/cliente.ts).
    const corpo = await resposta.text().catch(() => '');
    logger.warn({ status: resposta.status, corpo: corpo.slice(0, 500) }, 'IA respondeu com erro');
    throw new ErroApi('fonte_indisponivel', 'A assistente de IA nao respondeu desta vez.', {
      status: resposta.status,
    });
  }

  const json = (await resposta.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const texto = json.content?.find((b) => b.type === 'text')?.text;
  if (!texto) {
    throw new ErroApi('fonte_indisponivel', 'A assistente de IA devolveu uma resposta vazia.');
  }
  return texto;
}
