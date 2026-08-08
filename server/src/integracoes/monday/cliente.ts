/**
 * Cliente do Monday.com — GraphQL, somente leitura.
 *
 * O token vive apenas aqui, no servidor, lido de variavel de ambiente. Nunca e
 * devolvido em resposta, nunca aparece em log (ver logging.ts) e nunca chega ao
 * navegador. Isso corrige a lacuna critica de js/monday-sync.js:10,22,36, onde o
 * token ficava em localStorage e o navegador falava direto com a API do Monday.
 *
 * Suprido em relacao ao adaptador Python (scripts/adaptadores/monday.py), que
 * faz uma unica chamada sem paginacao:
 *   - percorre items_page por cursor ate o fim
 *   - retentativa com espera progressiva em 429 e 5xx
 *   - respeita o limite de complexidade da API
 *   - le colunas mirror e formula por display_value
 */
import { config } from '../../config.js';
import { logger } from '../../logging.js';
import { ErroApi } from '../../errors.js';

/**
 * Endereco da API.
 *
 * `MONDAY_ENDPOINT` existe apenas para o ensaio do runner de homologacao, que
 * sobe um servidor local respondendo no formato da API. Em producao a variavel
 * nao e definida e o valor e o oficial — nao ha caminho para redirecionar a
 * integracao sem alterar o ambiente do servidor deliberadamente.
 */
const ENDPOINT = process.env.MONDAY_ENDPOINT?.trim() || 'https://api.monday.com/v2';

/** Itens por pagina. O maximo aceito pela API e 500; 200 e mais estavel. */
const ITENS_POR_PAGINA = 200;
const TENTATIVAS_MAXIMAS = 4;
const TEMPO_LIMITE_MS = 60_000;

export interface ValorColuna {
  id: string;
  text: string | null;
  value: string | null;
  type: string | null;
  /** Presente em mirror e formula — e onde o valor visivel realmente aparece. */
  display_value?: string | null;
}

export interface ItemMonday {
  id: string;
  name: string;
  group: { id: string; title: string } | null;
  created_at: string | null;
  updated_at: string | null;
  column_values: ValorColuna[];
}

export interface ColunaMonday {
  id: string;
  title: string;
  type: string;
}

export class ErroMonday extends Error {
  readonly detalhe: Record<string, unknown>;
  constructor(mensagem: string, detalhe: Record<string, unknown> = {}) {
    super(mensagem);
    this.name = 'ErroMonday';
    this.detalhe = detalhe;
  }
}

/**
 * Caracteres possiveis num token do Monday (JWT: base64url e pontos).
 *
 * Serve para separar "token invalido" de "valor que nem e um token". O ambiente
 * de uma sessao real trouxe `MONDAY_TOKEN` com o valor envolto em `<`...`>`,
 * como o marcador `<token>` da documentacao, e o `.trim()` do config nao pega
 * isso: a requisicao ia com os delimitadores e o Monday respondia `401
 * NOT_AUTHENTICATED` — indistinguivel de credencial revogada. Perdeu-se tempo
 * atras do problema errado, que e exatamente o que esta checagem evita.
 */
const CARACTERES_DE_TOKEN = /^[A-Za-z0-9._-]+$/;

function exigirToken(): string {
  const token = config.monday.token;

  if (!token) {
    throw new ErroApi(
      'integracao_desligada',
      'Integracao com o Monday desligada: MONDAY_TOKEN nao configurado no servidor.',
    );
  }

  if (!CARACTERES_DE_TOKEN.test(token)) {
    // A mensagem descreve a forma do defeito, NUNCA o valor: o token nao vai
    // para log nem para mensagem de erro em nenhuma hipotese.
    const delimitado = /^[<"'].*[>"']$/s.test(token);
    // Mesmo codigo de token ausente: com valor malformado a integracao esta,
    // para todos os efeitos, desligada. O que muda e a mensagem.
    throw new ErroApi(
      'integracao_desligada',
      // Sem acento grave nesta mensagem: a pre-confirmacao da homologacao
      // extrai as consultas GraphQL deste arquivo delimitando por acento grave,
      // e um deles em texto comum quebra a extracao — o que aconteceu de fato
      // quando esta mensagem citava o marcador entre acentos graves.
      delimitado
        ? 'MONDAY_TOKEN tem delimitadores em volta do valor, do tipo <token> ou ' +
            '"token". Guarde apenas o token, sem os delimitadores: com eles a ' +
            'requisicao sai malformada e o Monday responde 401, como se a ' +
            'credencial estivesse revogada.'
        : 'MONDAY_TOKEN contem caracteres que nao existem num token do Monday. ' +
            'Confira se o valor foi copiado inteiro e sem espaco ou quebra de linha.',
    );
  }

  return token;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa uma consulta GraphQL com retentativa.
 *
 * Retenta em 429 (limite de requisicoes), 5xx e falha de rede. Nao retenta em
 * 401/403 nem em erro de sintaxe da consulta — repetir nao resolveria e apenas
 * queimaria a cota.
 */
/**
 * Recusa qualquer operacao de escrita.
 *
 * O token do Monday tem permissao de escrita na conta. A integracao da Fase 1 e
 * SOMENTE LEITURA, e a trava vive aqui — no transporte — e nao apenas na rota
 * do proxy: qualquer caminho que fale com o Monday passa por `consultar`, e
 * nenhum deles consegue escrever, inclusive codigo interno futuro.
 *
 * Exportada porque a homologacao precisa PROVAR a recusa, e uma funcao privada
 * so poderia ser provada indiretamente.
 */
export function recusarEscrita(consulta: string): void {
  // Remove comentarios e literais de texto antes de procurar palavras-chave,
  // para que `query { x(nome: "mutation") }` nao seja recusado por engano.
  const limpo = consulta
    .replace(/#[^\n]*/g, ' ')
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

  if (/\b(mutation|subscription)\b/i.test(limpo)) {
    throw new ErroApi(
      'nao_autorizado',
      'A integracao com o Monday opera somente em leitura. Operacoes de escrita nao sao permitidas pelo proxy.',
      { operacao_recusada: /\bmutation\b/i.test(limpo) ? 'mutation' : 'subscription' },
    );
  }
}

export async function consultar<T>(
  consulta: string,
  variaveis: Record<string, unknown> = {},
): Promise<T> {
  // Trava no transporte, e nao apenas na rota: nenhum caminho — inclusive
  // codigo interno — consegue escrever no Monday por aqui.
  recusarEscrita(consulta);

  const token = exigirToken();
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= TENTATIVAS_MAXIMAS; tentativa++) {
    const controle = new AbortController();
    const expira = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);

    try {
      const resposta = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
          'API-Version': config.monday.versaoApi,
        },
        body: JSON.stringify({ query: consulta, variables: variaveis }),
        signal: controle.signal,
      });

      clearTimeout(expira);

      if (resposta.status === 401 || resposta.status === 403) {
        throw new ErroMonday('Token do Monday recusado. Verifique MONDAY_TOKEN no servidor.', {
          status: resposta.status,
          reentar: false,
        });
      }

      if (resposta.status === 429 || resposta.status >= 500) {
        const cabecalho = resposta.headers.get('retry-after');
        const esperaSegundos = cabecalho ? Number(cabecalho) : 0;
        // Espera progressiva: 2s, 4s, 8s — ou o que a API pedir, se for maior.
        const espera = Math.max(esperaSegundos * 1000, 2000 * 2 ** (tentativa - 1));

        if (tentativa === TENTATIVAS_MAXIMAS) {
          throw new ErroMonday('Monday indisponivel apos as retentativas.', {
            status: resposta.status,
            tentativas: tentativa,
          });
        }

        logger.warn(
          { status: resposta.status, tentativa, espera_ms: espera },
          'Monday devolveu erro transitorio; retentando',
        );
        await esperar(espera);
        continue;
      }

      if (!resposta.ok) {
        throw new ErroMonday(`Monday respondeu ${resposta.status}.`, { status: resposta.status });
      }

      const corpo = (await resposta.json()) as {
        data?: T;
        errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
        error_message?: string;
      };

      // A API do Monday devolve 200 com erro no corpo — verificar o status nao
      // basta.
      if (corpo.errors?.length) {
        const mensagens = corpo.errors.map((e) => e.message).join('; ');
        const limite = corpo.errors.some((e) =>
          /complexity|rate limit|minute/i.test(e.message ?? ''),
        );

        if (limite && tentativa < TENTATIVAS_MAXIMAS) {
          const espera = 5000 * 2 ** (tentativa - 1);
          logger.warn({ tentativa, espera_ms: espera }, 'Limite de complexidade do Monday; aguardando');
          await esperar(espera);
          continue;
        }

        throw new ErroMonday(`Monday recusou a consulta: ${mensagens}`, { erros: corpo.errors });
      }

      if (corpo.error_message) {
        throw new ErroMonday(`Monday: ${corpo.error_message}`);
      }

      if (!corpo.data) {
        throw new ErroMonday('Monday respondeu sem dados.');
      }

      return corpo.data;
    } catch (erro) {
      clearTimeout(expira);
      ultimoErro = erro;

      // Erro definitivo: nao insistir.
      if (erro instanceof ErroApi) throw erro;
      if (erro instanceof ErroMonday && erro.detalhe.reentar === false) throw erro;
      if (erro instanceof ErroMonday && tentativa === TENTATIVAS_MAXIMAS) throw erro;
      if (erro instanceof ErroMonday && !('status' in erro.detalhe)) throw erro;

      if (tentativa === TENTATIVAS_MAXIMAS) break;

      const espera = 2000 * 2 ** (tentativa - 1);
      logger.warn(
        { tentativa, espera_ms: espera, erro: erro instanceof Error ? erro.message : String(erro) },
        'Falha ao falar com o Monday; retentando',
      );
      await esperar(espera);
    }
  }

  throw new ErroMonday('Nao foi possivel consultar o Monday.', {
    causa: ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro),
  });
}

/** Colunas do quadro, para resolver por titulo em vez de por ID fixo. */
export async function lerColunas(quadroId: string): Promise<ColunaMonday[]> {
  const dados = await consultar<{ boards: Array<{ columns: ColunaMonday[] } | null> }>(
    `query($quadro: ID!) {
       boards(ids: [$quadro]) { columns { id title type } }
     }`,
    { quadro: String(quadroId) },
  );

  const colunas = dados.boards?.[0]?.columns;
  if (!colunas) {
    throw new ErroMonday(`Quadro ${quadroId} nao encontrado ou sem acesso.`, { quadro: quadroId });
  }
  return colunas;
}

interface PaginaItens {
  cursor: string | null;
  items: ItemMonday[];
}

export interface ResultadoLeitura {
  itens: ItemMonday[];
  paginas: number;
  /** true quando a leitura parou pelo teto de paginas, nao pelo fim dos dados. */
  truncado: boolean;
  /**
   * Cursor devolvido pela ultima pagina.
   *
   * `null` significa que a leitura chegou ao FIM do quadro — e o que separa
   * "li tudo" de "parei no meio". Preenchido quando truncado, para que a
   * retomada seja possivel sem reler desde o inicio.
   */
  ultimoCursor: string | null;
}

/**
 * Le TODOS os itens do quadro, percorrendo o cursor.
 *
 * O adaptador Python le apenas a primeira pagina — em um quadro com mais de 200
 * itens, os indicadores sairiam calculados sobre uma fracao da carteira, sem
 * qualquer aviso. Aqui a paginacao vai ate o fim, e se um teto de seguranca for
 * atingido o resultado e marcado como truncado, nunca apresentado como completo.
 */
export async function lerTodosOsItens(
  quadroId: string,
  opcoes: { paginasMaximas?: number } = {},
): Promise<ResultadoLeitura> {
  const paginasMaximas = opcoes.paginasMaximas ?? 200;
  const itens: ItemMonday[] = [];
  let cursor: string | null = null;
  let paginas = 0;

  const CONSULTA = `
    query($quadro: ID!, $limite: Int!, $cursor: String) {
      boards(ids: [$quadro]) {
        items_page(limit: $limite, cursor: $cursor) {
          cursor
          items {
            id
            name
            created_at
            updated_at
            group { id title }
            column_values {
              id
              text
              value
              type
              ... on MirrorValue    { display_value }
              ... on FormulaValue   { display_value }
              ... on BoardRelationValue { display_value }
            }
          }
        }
      }
    }`;

  // Tipo nomeado: declarar a resposta inline dentro do laco cria uma referencia
  // circular na inferencia, porque `cursor` e ao mesmo tempo entrada da consulta
  // e saida da resposta.
  type RespostaPagina = {
    boards: Array<{ items_page: PaginaItens } | null>;
  };

  do {
    const dados: RespostaPagina = await consultar<RespostaPagina>(CONSULTA, {
      quadro: String(quadroId),
      limite: ITENS_POR_PAGINA,
      cursor,
    });

    const pagina: PaginaItens | undefined = dados.boards?.[0]?.items_page;
    if (!pagina) {
      throw new ErroMonday(`Quadro ${quadroId} nao encontrado ou sem acesso.`, { quadro: quadroId });
    }

    itens.push(...pagina.items);
    cursor = pagina.cursor;
    paginas++;

    if (paginas >= paginasMaximas && cursor) {
      logger.error(
        { quadro: quadroId, paginas, itens: itens.length },
        'Teto de paginas atingido: leitura do quadro esta incompleta',
      );
      return { itens, paginas, truncado: true, ultimoCursor: cursor };
    }
  } while (cursor);

  logger.info({ quadro: quadroId, paginas, itens: itens.length }, 'Quadro do Monday lido');
  return { itens, paginas, truncado: false, ultimoCursor: null };
}

export interface QuadroListado {
  id: string;
  name: string;
  state: string;
  items_count: number | null;
  workspace: { id: string; name: string } | null;
}

/**
 * Lista os quadros que a credencial alcanca, percorrendo as paginas.
 *
 * Existe para achar o ID de um quadro pelo NOME. Homologar um quadro novo
 * comeca por saber qual e o id dele, e pedir o id por mensagem convida ao erro
 * de digitacao — que se manifesta como "quadro nao encontrado" e se parece com
 * falta de permissao.
 *
 * `boards` do Monday pagina por numero de pagina, nao por cursor; pagina vazia
 * significa fim. O teto existe para que credencial de conta grande nao gire sem
 * parar.
 */
export async function listarQuadros(
  opcoes: { paginasMaximas?: number } = {},
): Promise<QuadroListado[]> {
  const paginasMaximas = opcoes.paginasMaximas ?? 20;
  const quadros: QuadroListado[] = [];

  for (let pagina = 1; pagina <= paginasMaximas; pagina++) {
    const dados = await consultar<{ boards: QuadroListado[] | null }>(
      `query($limite: Int!, $pagina: Int!) {
         boards(limit: $limite, page: $pagina) {
           id
           name
           state
           items_count
           workspace { id name }
         }
       }`,
      { limite: 100, pagina },
    );

    const lote = dados.boards ?? [];
    quadros.push(...lote);
    if (lote.length < 100) break;
  }

  logger.info({ quadros: quadros.length }, 'Quadros do Monday listados');
  return quadros;
}

/** Metadados do quadro, para a tela de descoberta de quadros. */
export async function lerQuadro(quadroId: string) {
  const dados = await consultar<{
    boards: Array<{
      id: string;
      name: string;
      items_count: number | null;
      groups: Array<{ id: string; title: string }>;
      columns: ColunaMonday[];
    } | null>;
  }>(
    `query($quadro: ID!) {
       boards(ids: [$quadro]) {
         id
         name
         items_count
         groups { id title }
         columns { id title type }
       }
     }`,
    { quadro: String(quadroId) },
  );

  const quadro = dados.boards?.[0];
  if (!quadro) {
    throw new ErroMonday(`Quadro ${quadroId} nao encontrado ou sem acesso.`, { quadro: quadroId });
  }
  return quadro;
}

/** Testa a credencial sem expor o token: devolve apenas quem ele representa. */
export async function testarConexao(): Promise<{ ok: boolean; conta?: string; erro?: string }> {
  try {
    const dados = await consultar<{ me: { name: string; email: string } | null }>(
      `query { me { name email } }`,
    );
    return { ok: true, conta: dados.me?.name ?? 'desconhecida' };
  } catch (erro) {
    return {
      ok: false,
      erro: erro instanceof Error ? erro.message : String(erro),
    };
  }
}
