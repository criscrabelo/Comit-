/**
 * Cliente HTTP do Sienge.
 *
 * Os caminhos vêm do levantamento REAL da Coevo/Tetus
 * (docs/SIENGE-INFORMACOES-PREENCHIDAS.md, 06/08/2026) — nenhum endpoint,
 * parâmetro ou formato foi inventado. A hipótese anterior, mantida desligada
 * por meses, provou-se errada quando a confirmação chegou; a espera pagou.
 *
 * A ingestão continua travada até a homologação por endpoint: o documento
 * confirma o caminho, o ato registrado no banco libera a chamada.
 *
 * Estrutura: Basic Auth por variável de ambiente, paginação limit/offset com
 * resultSetMetadata, retentativa com espera progressiva, limite por minuto E
 * orçamento diário (franquia do plano Start), tempo limite, e somente GET por
 * construção.
 */
import { config } from '../../config.js';
import { logger } from '../../logging.js';
import { ErroApi } from '../../errors.js';

/**
 * Caminhos confirmados pela Coevo/Tetus em consultas reais à API
 * (docs/SIENGE-INFORMACOES-PREENCHIDAS.md, 06/08/2026).
 *
 * A versão anterior deste catálogo guardava cinco hipóteses de
 * references/sienge.md — e a confirmação provou que os caminhos de títulos e
 * saldo estavam ERRADOS (`/receivable-bills` não existe; o real é
 * `/accounts-receivable/receivable-bills`). É o motivo de a regra "não invente
 * endpoints" existir.
 *
 * `confirmado: false` continua em todos, de propósito: o documento confirma o
 * CAMINHO, mas a homologação por endpoint (`POST /api/sienge/homologar`) é o
 * ato registrado — com autor, data e observação — que libera a chamada. A
 * trava recusa qualquer endpoint não homologado; não é documentação, é
 * comportamento.
 */
export interface EndpointCandidato {
  caminho: string;
  descricao: string;
  /** posicao = situação numa data; movimentacao = eventos no período. */
  natureza: 'posicao' | 'movimentacao';
  confirmado: boolean;
  /** Preenchido pela homologação, com o que a Coevo confirmar. */
  observacaoHomologacao?: string;
}

export const ENDPOINTS_CANDIDATOS: Record<string, EndpointCandidato> = {
  companies: {
    caminho: '/companies',
    descricao: 'Empresas (43 no ambiente; id é o identificador, sem deduplicar por nome/CNPJ)',
    natureza: 'posicao',
    confirmado: false,
  },
  enterprises: {
    caminho: '/enterprises',
    descricao: 'Empreendimentos (285 no ambiente; incluir todos, sem filtro prévio)',
    natureza: 'posicao',
    confirmado: false,
  },
  customers: {
    caminho: '/customers',
    descricao: 'Clientes (3.257 ativos; carga incremental por modifiedAfter/modifiedBefore)',
    natureza: 'posicao',
    confirmado: false,
  },
  receivable_bills: {
    caminho: '/accounts-receivable/receivable-bills',
    descricao: 'Títulos a receber — customerId OBRIGATÓRIO: não há listagem geral',
    natureza: 'posicao',
    confirmado: false,
  },
  installments: {
    caminho: '/accounts-receivable/receivable-bills/{receivableBillId}/installments',
    descricao: 'Parcelas de um título',
    natureza: 'posicao',
    confirmado: false,
  },
  total_current_debit_balance: {
    caminho: '/total-current-debit-balance',
    descricao: 'Saldo devedor presente do cliente (CPF ou CNPJ, mutuamente excludentes)',
    natureza: 'posicao',
    confirmado: false,
  },
  commissions: {
    caminho: '/commissions',
    descricao: 'Comissões — limit e offset OBRIGATÓRIOS neste endpoint',
    natureza: 'movimentacao',
    confirmado: false,
  },
};

const TENTATIVAS_MAXIMAS = 4;
const TEMPO_LIMITE_MS = 60_000;

export class ErroSienge extends Error {
  readonly detalhe: Record<string, unknown>;
  constructor(mensagem: string, detalhe: Record<string, unknown> = {}) {
    super(mensagem);
    this.name = 'ErroSienge';
    this.detalhe = detalhe;
  }
}

/**
 * Verificação de configuração.
 *
 * Devolve o que está presente SEM revelar valor algum — nem o subdomínio
 * completo, que já é informação de infraestrutura.
 */
export function verificarConfiguracao(): {
  completa: boolean;
  faltando: string[];
  presentes: string[];
} {
  const itens: Array<[string, boolean]> = [
    ['SIENGE_SUBDOMAIN', Boolean(config.sienge.subdominio)],
    ['SIENGE_USER', Boolean(config.sienge.usuario)],
    ['SIENGE_PASSWORD', Boolean(config.sienge.senha)],
  ];

  const faltando = itens.filter(([, presente]) => !presente).map(([nome]) => nome);
  const presentes = itens.filter(([, presente]) => presente).map(([nome]) => nome);

  return { completa: faltando.length === 0, faltando, presentes };
}

/**
 * URL base — formato CONFIRMADO pelo levantamento:
 * `https://api.sienge.com.br/{subdominio}/public/api/v1`, subdomínio `tetus`.
 * O subdomínio segue vindo do ambiente: infraestrutura não vive em código.
 */
function urlBase(): string {
  const subdominio = config.sienge.subdominio;
  if (!subdominio) {
    throw new ErroApi('integracao_desligada', 'SIENGE_SUBDOMAIN nao configurado no servidor.');
  }
  return `https://api.sienge.com.br/${subdominio}/public/api/v1`;
}

/** Cabeçalho de autenticação. Nunca registrado em log. */
function cabecalhoAutenticacao(): string {
  const usuario = config.sienge.usuario;
  const senha = config.sienge.senha;
  if (!usuario || !senha) {
    throw new ErroApi(
      'integracao_desligada',
      'SIENGE_USER ou SIENGE_PASSWORD nao configurados no servidor.',
    );
  }
  return `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}`;
}

/**
 * Limite de requisições por minuto.
 *
 * Balde simples em memória. O limite real da Coevo é desconhecido — está na
 * lista de perguntas. Enquanto não souber, o padrão é conservador.
 */
class LimitadorDeRequisicoes {
  private marcas: number[] = [];

  constructor(private readonly porMinuto: number) {}

  async aguardarVaga(): Promise<void> {
    const agora = Date.now();
    this.marcas = this.marcas.filter((m) => agora - m < 60_000);

    if (this.marcas.length >= this.porMinuto) {
      const maisAntiga = this.marcas[0]!;
      const esperar = 60_000 - (agora - maisAntiga) + 50;
      logger.debug({ esperar_ms: esperar }, 'Limite de requisicoes do Sienge: aguardando');
      await new Promise((r) => setTimeout(r, esperar));
      return this.aguardarVaga();
    }

    this.marcas.push(Date.now());
  }
}

const limitador = new LimitadorDeRequisicoes(config.sienge.requisicoesPorMinuto);

/**
 * Orçamento DIÁRIO de requisições.
 *
 * O plano Start da Coevo tem franquia de 1.000 requisições REST por dia, e o
 * custo do excedente ainda não foi validado contratualmente
 * (docs/SIENGE-INFORMACOES-PREENCHIDAS.md §6). Estourar a franquia em silêncio
 * geraria custo sem ninguém ter decidido pagar — por isso o teto vive aqui,
 * abaixo da franquia, e esgotá-lo interrompe a carga com erro claro em vez de
 * seguir gastando.
 *
 * O saldo restante fica exposto para a ingestão PLANEJAR: com 3.257 clientes
 * ativos e títulos apenas por customerId, uma carga completa custa 3+ dias de
 * franquia — o desenho incremental não é otimização, é obrigação.
 */
class OrcamentoDiario {
  private dia = '';
  private usadas = 0;

  constructor(private readonly teto: number) {}

  consumir(): void {
    const hoje = new Date().toISOString().slice(0, 10);
    if (hoje !== this.dia) {
      this.dia = hoje;
      this.usadas = 0;
    }
    if (this.usadas >= this.teto) {
      throw new ErroSienge(
        `Orcamento diario de requisicoes ao Sienge esgotado (${this.teto}). ` +
          'A franquia do plano Start e de 1.000/dia e o custo do excedente nao foi validado. ' +
          'A carga continua amanha, ou ajuste SIENGE_ORCAMENTO_DIARIO deliberadamente.',
        { teto: this.teto, usadas: this.usadas, reentar: false },
      );
    }
    this.usadas++;
  }

  restante(): number {
    const hoje = new Date().toISOString().slice(0, 10);
    if (hoje !== this.dia) return this.teto;
    return Math.max(0, this.teto - this.usadas);
  }
}

const orcamento = new OrcamentoDiario(config.sienge.orcamentoDiario);

/** Saldo diário restante — para a ingestão decidir se cabe mais uma página. */
export function orcamentoRestante(): number {
  return orcamento.restante();
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Trava de homologação.
 *
 * Impede qualquer chamada antes de o ambiente ser confirmado. Duas condições
 * independentes: a variável de ambiente E o registro de verificação no banco.
 * A verificação de banco fica em `homologacao.ts`, para não acoplar o cliente
 * HTTP ao esquema.
 */
export function exigirHabilitado(): void {
  if (!config.sienge.habilitado) {
    throw new ErroApi(
      'integracao_nao_verificada',
      'Conector Sienge desligado. Os endpoints ainda nao foram confirmados no ambiente da Coevo. ' +
        'Ligar exige SIENGE_HABILITADO=true e a homologacao do ambiente registrada.',
    );
  }
}

export interface OpcoesRequisicao {
  /** Chave de ENDPOINTS_CANDIDATOS. Caminho livre não é aceito. */
  endpoint: keyof typeof ENDPOINTS_CANDIDATOS;
  parametros?: Record<string, string | number | undefined>;
  /**
   * Valores para os marcadores `{nome}` do caminho — hoje só
   * `{receivableBillId}` em parcelas. Obrigatórios quando o caminho os tem:
   * um marcador sem valor viraria URL literalmente com `{...}`, e o Sienge
   * responderia 404 num caminho que existe.
   */
  parametrosDeCaminho?: Record<string, string | number>;
}

/**
 * Formato de página confirmado nos endpoints de listagem
 * (docs/SIENGE-INFORMACOES-PREENCHIDAS.md §5).
 */
export interface PaginaSienge<T> {
  resultSetMetadata: { count: number; offset: number; limit: number };
  results: T[];
}

/** Máximo aceito pela API nos endpoints de listagem confirmados. */
export const LIMITE_POR_PAGINA = 200;

/**
 * Executa uma requisição de LEITURA.
 *
 * Só GET: o método é fixo, não é parâmetro. A integração é somente leitura por
 * construção, não por convenção — não existe caminho no código que envie POST,
 * PUT, PATCH ou DELETE ao Sienge.
 */
export async function ler<T>(opcoes: OpcoesRequisicao): Promise<T> {
  exigirHabilitado();

  const candidato = ENDPOINTS_CANDIDATOS[opcoes.endpoint];
  if (!candidato) {
    throw new ErroSienge(`Endpoint desconhecido: ${String(opcoes.endpoint)}`, {
      endpoints_conhecidos: Object.keys(ENDPOINTS_CANDIDATOS),
    });
  }

  // Segunda trava: mesmo com a integração ligada, um endpoint não confirmado
  // não é chamado. Confirmar é ato deliberado, endpoint por endpoint.
  if (!candidato.confirmado) {
    throw new ErroApi(
      'integracao_nao_verificada',
      `O endpoint ${candidato.caminho} ainda nao foi confirmado no ambiente da Coevo. ` +
        'Confirme na homologacao antes de usar.',
      { endpoint: candidato.caminho },
    );
  }

  // Resolve os marcadores `{nome}` do caminho ANTES de montar a URL. Falta de
  // valor é erro imediato — nunca uma requisição com `{...}` literal na URL.
  let caminho = candidato.caminho;
  for (const marcador of caminho.match(/\{(\w+)\}/g) ?? []) {
    const nome = marcador.slice(1, -1);
    const valor = opcoes.parametrosDeCaminho?.[nome];
    if (valor === undefined) {
      throw new ErroSienge(`O endpoint ${candidato.caminho} exige o parametro de caminho "${nome}".`, {
        endpoint: candidato.caminho,
      });
    }
    caminho = caminho.replace(marcador, encodeURIComponent(String(valor)));
  }

  const url = new URL(urlBase() + caminho);
  for (const [chave, valor] of Object.entries(opcoes.parametros ?? {})) {
    if (valor !== undefined) url.searchParams.set(chave, String(valor));
  }

  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= TENTATIVAS_MAXIMAS; tentativa++) {
    // Retentativa tambem consome franquia: cada tentativa e uma requisicao
    // real cobrada pelo plano, entao cada uma passa pelo orcamento.
    orcamento.consumir();
    await limitador.aguardarVaga();

    const controle = new AbortController();
    const expira = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);

    try {
      const resposta = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: cabecalhoAutenticacao(),
          Accept: 'application/json',
        },
        signal: controle.signal,
      });

      clearTimeout(expira);

      if (resposta.status === 401 || resposta.status === 403) {
        // Credencial recusada: repetir não resolve e ainda pode bloquear a conta.
        throw new ErroSienge('Credenciais do Sienge recusadas. Verifique as variaveis de ambiente.', {
          status: resposta.status,
          reentar: false,
        });
      }

      if (resposta.status === 429 || resposta.status >= 500) {
        const cabecalho = resposta.headers.get('retry-after');
        const espera = Math.max(
          (cabecalho ? Number(cabecalho) : 0) * 1000,
          2000 * 2 ** (tentativa - 1),
        );

        if (tentativa === TENTATIVAS_MAXIMAS) {
          throw new ErroSienge('Sienge indisponivel apos as retentativas.', {
            status: resposta.status,
            tentativas: tentativa,
          });
        }

        logger.warn(
          { status: resposta.status, tentativa, espera_ms: espera, endpoint: candidato.caminho },
          'Sienge devolveu erro transitorio; retentando',
        );
        await esperar(espera);
        continue;
      }

      if (!resposta.ok) {
        throw new ErroSienge(`Sienge respondeu ${resposta.status}.`, { status: resposta.status });
      }

      return (await resposta.json()) as T;
    } catch (erro) {
      clearTimeout(expira);
      ultimoErro = erro;

      if (erro instanceof ErroApi) throw erro;
      if (erro instanceof ErroSienge && erro.detalhe.reentar === false) throw erro;
      if (erro instanceof ErroSienge && tentativa === TENTATIVAS_MAXIMAS) throw erro;
      if (tentativa === TENTATIVAS_MAXIMAS) break;

      const espera = 2000 * 2 ** (tentativa - 1);
      logger.warn(
        {
          tentativa,
          espera_ms: espera,
          endpoint: candidato.caminho,
          erro: erro instanceof Error ? erro.message : String(erro),
        },
        'Falha ao falar com o Sienge; retentando',
      );
      await esperar(espera);
    }
  }

  throw new ErroSienge('Nao foi possivel consultar o Sienge.', {
    causa: ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro),
  });
}

/**
 * Leitura paginada.
 *
 * ⚠️ O ESQUEMA DE PAGINAÇÃO DO SIENGE NÃO É CONHECIDO. Está na lista de
 * perguntas à Coevo. Esta função aceita a convenção por deslocamento e limite,
 * que é a mais comum, mas ela **precisa ser confirmada** — e por isso só roda
 * com o endpoint confirmado.
 *
 * Se a API usar cursor, página numerada ou cabeçalho `Link`, a mudança fica
 * contida aqui.
 */
export async function lerPaginado<T>(
  opcoes: OpcoesRequisicao & {
    /** Nome do parâmetro de deslocamento. A confirmar. */
    parametroDeslocamento?: string;
    /** Nome do parâmetro de limite. A confirmar. */
    parametroLimite?: string;
    /** Caminho do array de resultados no corpo. A confirmar. */
    campoResultados?: string;
    tamanhoPagina?: number;
    paginasMaximas?: number;
  },
): Promise<{ itens: T[]; paginas: number; truncado: boolean }> {
  const deslocamentoNome = opcoes.parametroDeslocamento ?? 'offset';
  const limiteNome = opcoes.parametroLimite ?? 'limit';
  const campo = opcoes.campoResultados ?? 'results';
  const tamanho = opcoes.tamanhoPagina ?? 200;
  const paginasMaximas = opcoes.paginasMaximas ?? 500;

  const itens: T[] = [];
  let deslocamento = 0;
  let paginas = 0;

  for (;;) {
    const corpo = await ler<Record<string, unknown>>({
      endpoint: opcoes.endpoint,
      parametros: {
        ...opcoes.parametros,
        [limiteNome]: tamanho,
        [deslocamentoNome]: deslocamento,
      },
    });

    const pagina = corpo[campo];
    if (!Array.isArray(pagina)) {
      throw new ErroSienge(
        `Resposta do Sienge sem o campo "${campo}". O formato precisa ser confirmado no ambiente.`,
        { campos_recebidos: Object.keys(corpo) },
      );
    }

    itens.push(...(pagina as T[]));
    paginas++;

    if (pagina.length < tamanho) break;

    if (paginas >= paginasMaximas) {
      logger.error(
        { endpoint: opcoes.endpoint, paginas, itens: itens.length },
        'Teto de paginas atingido: a leitura do Sienge esta INCOMPLETA',
      );
      return { itens, paginas, truncado: true };
    }

    deslocamento += tamanho;
  }

  return { itens, paginas, truncado: false };
}
