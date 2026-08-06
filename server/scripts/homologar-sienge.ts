/**
 * Homologacao controlada do Sienge — endpoint por endpoint.
 *
 * Executa, para cada endpoint do catalogo (docs/SIENGE-INFORMACOES-PREENCHIDAS.md
 * §3), uma sonda REAL e minima contra a API da Coevo, confere o formato de
 * resposta contra o que o documento registra (paginacao resultSetMetadata,
 * campos confirmados, totais esperados) e — somente quando a sonda passa —
 * grava a confirmacao em `integracoes.relatorio_verificacao`, com autor, data
 * e observacao, mais a entrada na trilha de auditoria. E o mesmo registro que
 * `POST /api/sienge/homologar` faz; aqui ele nasce de uma consulta real, nao
 * de um formulario.
 *
 * Orcamento: a franquia do plano Start e de 1.000 requisicoes REST/dia e o
 * custo do excedente NAO foi validado (§6). A homologacao completa custa
 * ~10 requisicoes; o script recusa comecar um endpoint sem folga no orcamento
 * diario e presta contas do consumo no relatorio.
 *
 * Ordem: companies e enterprises primeiro (dados corporativos, sem dado
 * pessoal), depois customers, titulos, parcelas, saldo devedor e comissoes.
 *
 * Uso:
 *   SIENGE_SUBDOMAIN=... SIENGE_USER=... SIENGE_PASSWORD=... \
 *   SIENGE_HABILITADO=true DATABASE_URL=... \
 *   npx tsx scripts/homologar-sienge.ts --confirmado-por "Nome Sobrenome"
 *
 *   ... --endpoint companies      homologa so um endpoint (padrao: todos)
 *   ... --pre-confirmacao         so itens locais; nao toca a rede
 *   ... --simular                 sonda a API mas NAO registra confirmacao
 *   ... --saida relatorio.md      grava o relatorio em arquivo
 *
 * A senha vem SO de variavel de ambiente. Nunca por argumento: argumento
 * aparece em `ps` e no historico do shell.
 */
import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import { db, fecharBanco } from '../src/db/pool.js';
import { config } from '../src/config.js';
import { auditar } from '../src/audit/registrar.js';
import {
  ENDPOINTS_CANDIDATOS,
  LIMITE_POR_PAGINA,
  ler,
  orcamentoRestante,
  verificarConfiguracao,
  type PaginaSienge,
} from '../src/integracoes/sienge/cliente.js';

// ─────────────────────────────────────────────────────────────────────────────

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

const SIMULAR = temFlag('simular');
const SO_PRE = temFlag('pre-confirmacao');
const CONFIRMADO_POR = argumento('confirmado-por');

const linhas: string[] = [];
const escrever = (texto = '') => {
  linhas.push(texto);
  console.log(texto);
};

/**
 * Folga minima de orcamento para INICIAR a sonda de um endpoint.
 *
 * Nenhuma sonda custa mais que 2 requisicoes felizes, mas cada uma pode
 * retentar ate 4 vezes em erro transitorio — e retentativa tambem consome
 * franquia. A folga cobre o pior caso com margem, para que a homologacao
 * nunca seja a causa de um excedente.
 */
const FOLGA_MINIMA = 10;

/** Total esperado por endpoint, do levantamento de 06/08/2026 (§7 e §8.3). */
const TOTAIS_DO_LEVANTAMENTO: Record<string, number> = {
  companies: 43,
  enterprises: 285,
  customers: 3257,
};

/** Cliente e titulo usados nas consultas reais do levantamento (§8.3–8.5). */
const CLIENTE_DO_LEVANTAMENTO = 3431;
const TITULO_DO_LEVANTAMENTO = 5600;

interface ResultadoSonda {
  ok: boolean;
  requisicoes: number;
  /** Linhas de evidencia para o relatorio. Nunca contem dado pessoal. */
  evidencias: string[];
  /** Divergencias que nao impedem a confirmacao, mas ficam registradas. */
  avisos: string[];
  /** Observacao gravada no registro de homologacao quando a sonda passa. */
  observacao: string;
}

/** Registro incremental de requisicoes, para prestar contas no relatorio. */
let requisicoesDaExecucao = 0;

async function sondar<T>(
  endpoint: keyof typeof ENDPOINTS_CANDIDATOS,
  parametros?: Record<string, string | number | undefined>,
  parametrosDeCaminho?: Record<string, string | number>,
): Promise<T> {
  requisicoesDaExecucao++;
  return ler<T>({ endpoint, parametros, parametrosDeCaminho });
}

/** Confere a presenca dos campos no primeiro registro de uma pagina. */
function conferirCampos(
  registro: Record<string, unknown> | undefined,
  campos: string[],
): { presentes: string[]; ausentes: string[] } {
  const presentes: string[] = [];
  const ausentes: string[] = [];
  for (const campo of campos) {
    (registro && campo in registro ? presentes : ausentes).push(campo);
  }
  return { presentes, ausentes };
}

function conferirMetadata(pagina: PaginaSienge<unknown>): string[] {
  const problemas: string[] = [];
  const m = pagina.resultSetMetadata;
  if (!m || typeof m !== 'object') problemas.push('resposta sem `resultSetMetadata`');
  else {
    for (const campo of ['count', 'offset', 'limit'] as const) {
      if (typeof m[campo] !== 'number') problemas.push(`\`resultSetMetadata.${campo}\` nao e numerico`);
    }
  }
  if (!Array.isArray(pagina.results)) problemas.push('resposta sem o array `results`');
  return problemas;
}

/** Compara o total real com o do levantamento: divergencia e aviso, nao falha. */
function compararTotal(chave: string, count: number, avisos: string[]): void {
  const esperado = TOTAIS_DO_LEVANTAMENTO[chave];
  if (esperado !== undefined && count !== esperado) {
    avisos.push(
      `total atual (${count}) difere do levantamento de 06/08/2026 (${esperado}) — ` +
        'esperado se a base mudou; fica registrado para conferencia',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sondas por endpoint
//
// Cada sonda e minima por decisao: o suficiente para provar caminho, formato de
// paginacao e campos — nunca uma carga. A carga completa e trabalho da
// ingestao, depois de homologado, com desenho incremental.
// ─────────────────────────────────────────────────────────────────────────────

async function sondarCompanies(): Promise<ResultadoSonda> {
  const evidencias: string[] = [];
  const avisos: string[] = [];

  const pagina = await sondar<PaginaSienge<Record<string, unknown>>>('companies', {
    limit: LIMITE_POR_PAGINA,
    offset: 0,
  });

  const problemas = conferirMetadata(pagina);
  const { count } = pagina.resultSetMetadata;
  evidencias.push(`\`resultSetMetadata\`: count=${count}, offset=0, limit=${LIMITE_POR_PAGINA}`);
  evidencias.push(`registros recebidos na pagina 1: ${pagina.results.length}`);

  compararTotal('companies', count, avisos);

  const campos = conferirCampos(pagina.results[0], ['id', 'name', 'cnpj', 'tradeName']);
  evidencias.push(`campos confirmados no 1º registro: ${campos.presentes.join(', ') || 'nenhum'}`);
  if (campos.ausentes.length) problemas.push(`campos ausentes: ${campos.ausentes.join(', ')}`);
  if (pagina.results.length < count && pagina.results.length < LIMITE_POR_PAGINA) {
    problemas.push('pagina menor que o limite sem cobrir o total — paginacao suspeita');
  }

  return {
    ok: problemas.length === 0,
    requisicoes: 1,
    evidencias: [...evidencias, ...problemas.map((p) => `✗ ${p}`)],
    avisos,
    observacao:
      `GET /companies confirmado em consulta real: ${count} empresas, paginacao ` +
      `resultSetMetadata + limit/offset, campos id/name/cnpj/tradeName presentes.`,
  };
}

async function sondarEnterprises(): Promise<ResultadoSonda> {
  const evidencias: string[] = [];
  const avisos: string[] = [];
  const problemas: string[] = [];

  let recebidos = 0;
  let count = 0;
  let paginas = 0;

  // Paginacao manual para capturar o count real de cada pagina — e provar a
  // regra do documento (offset 0, depois 200) com o minimo de requisicoes.
  for (let offset = 0; ; offset += LIMITE_POR_PAGINA) {
    const pagina = await sondar<PaginaSienge<Record<string, unknown>>>('enterprises', {
      limit: LIMITE_POR_PAGINA,
      offset,
    });
    paginas++;
    problemas.push(...conferirMetadata(pagina));
    count = pagina.resultSetMetadata.count;
    recebidos += pagina.results.length;

    if (paginas === 1) {
      const campos = conferirCampos(pagina.results[0], [
        'id', 'name', 'cnpj', 'type', 'companyId', 'companyName',
        'creationDate', 'modificationDate',
      ]);
      evidencias.push(`campos confirmados no 1º registro: ${campos.presentes.join(', ') || 'nenhum'}`);
      if (campos.ausentes.length) problemas.push(`campos ausentes: ${campos.ausentes.join(', ')}`);
    }

    if (recebidos >= count || pagina.results.length === 0) break;
    if (paginas >= 5) {
      problemas.push('mais de 5 paginas para um total esperado de 285 — interrompido');
      break;
    }
  }

  evidencias.unshift(
    `count=${count}; ${recebidos} registros recebidos em ${paginas} pagina(s) de ${LIMITE_POR_PAGINA}`,
  );
  compararTotal('enterprises', count, avisos);
  if (recebidos !== count) problemas.push(`recebidos (${recebidos}) ≠ count (${count})`);

  return {
    ok: problemas.length === 0,
    requisicoes: paginas,
    evidencias: [...evidencias, ...problemas.map((p) => `✗ ${p}`)],
    avisos,
    observacao:
      `GET /enterprises confirmado em consulta real: ${count} empreendimentos lidos ` +
      `integralmente em ${paginas} paginas (limit ${LIMITE_POR_PAGINA} + offset), sem filtro previo.`,
  };
}

/** CPF de um cliente ativo, para a sonda de saldo devedor. Nunca publicado. */
let cpfParaSaldo: string | null = null;

async function sondarCustomers(): Promise<ResultadoSonda> {
  const evidencias: string[] = [];
  const avisos: string[] = [];
  const problemas: string[] = [];

  const pagina = await sondar<PaginaSienge<Record<string, unknown>>>('customers', {
    onlyActive: 'true',
    limit: LIMITE_POR_PAGINA,
    offset: 0,
  });
  problemas.push(...conferirMetadata(pagina));
  const { count } = pagina.resultSetMetadata;
  evidencias.push(`clientes ativos: count=${count}; pagina 1 com ${pagina.results.length} registros`);
  compararTotal('customers', count, avisos);

  const primeiro = pagina.results[0];
  const campos = conferirCampos(primeiro, ['id', 'createdAt', 'modifiedAt']);
  evidencias.push(`campos confirmados no 1º registro: ${campos.presentes.join(', ') || 'nenhum'}`);
  if (campos.ausentes.length) avisos.push(`campos de data ausentes no 1º registro: ${campos.ausentes.join(', ')}`);
  if (!primeiro || !('id' in primeiro)) problemas.push('1º registro sem campo `id`');

  const comDocumento = pagina.results.filter((r) => r.cpf || r.cnpj).length;
  evidencias.push(
    `registros com CPF/CNPJ na pagina 1: ${comDocumento} de ${pagina.results.length} ` +
      '(valores nao publicados neste relatorio)',
  );
  // Guarda um CPF em memoria para a sonda de saldo devedor — nunca no relatorio.
  cpfParaSaldo =
    (pagina.results.find((r) => typeof r.cpf === 'string' && r.cpf)?.cpf as string | undefined) ??
    null;

  // Carga incremental: o documento a confirma por modifiedAfter/modifiedBefore.
  // Uma requisicao de 1 registro prova que o parametro e aceito e restringe.
  const corte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const incremental = await sondar<PaginaSienge<Record<string, unknown>>>('customers', {
    modifiedAfter: corte,
    limit: 1,
    offset: 0,
  });
  problemas.push(...conferirMetadata(incremental));
  const filtrado = incremental.resultSetMetadata.count;
  evidencias.push(`\`modifiedAfter=${corte}\` aceito: count=${filtrado}`);
  if (filtrado > count) {
    avisos.push(`filtro incremental devolveu mais que o total ativo (${filtrado} > ${count})`);
  }

  return {
    ok: problemas.length === 0,
    requisicoes: 2,
    evidencias: [...evidencias, ...problemas.map((p) => `✗ ${p}`)],
    avisos,
    observacao:
      `GET /customers confirmado em consulta real: ${count} clientes ativos, paginacao ` +
      `resultSetMetadata, carga incremental por modifiedAfter aceita.`,
  };
}

async function sondarReceivableBills(): Promise<ResultadoSonda> {
  const evidencias: string[] = [];
  const avisos: string[] = [];
  const problemas: string[] = [];

  const pagina = await sondar<PaginaSienge<Record<string, unknown>>>('receivable_bills', {
    customerId: CLIENTE_DO_LEVANTAMENTO,
    limit: LIMITE_POR_PAGINA,
    offset: 0,
  });
  problemas.push(...conferirMetadata(pagina));
  const { count } = pagina.resultSetMetadata;
  evidencias.push(
    `customerId=${CLIENTE_DO_LEVANTAMENTO} (cliente do levantamento §8.3): count=${count}`,
  );

  if (pagina.results.length) {
    const campos = conferirCampos(pagina.results[0], [
      'receivableBillId', 'customerId', 'companyId', 'issueDate',
      'receivableBillValue', 'defaulting', 'subjudice', 'payOffDate',
    ]);
    evidencias.push(`campos confirmados no 1º titulo: ${campos.presentes.join(', ') || 'nenhum'}`);
    if (campos.ausentes.length) problemas.push(`campos ausentes: ${campos.ausentes.join(', ')}`);
  } else {
    avisos.push('cliente do levantamento sem titulos hoje; formato confirmado so pela pagina');
  }

  // O documento registra a LIMITACAO: sem customerId nao ha listagem geral.
  // A recusa e comportamento confirmavel — e uma requisicao barata.
  let recusou = false;
  let statusRecusa: unknown = null;
  try {
    await sondar<unknown>('receivable_bills', { limit: 1, offset: 0 });
  } catch (erro) {
    recusou = true;
    statusRecusa =
      erro && typeof erro === 'object' && 'detalhe' in erro
        ? (erro as { detalhe: Record<string, unknown> }).detalhe.status
        : null;
  }
  if (recusou) {
    evidencias.push(
      `sem \`customerId\` a API recusou (status ${String(statusRecusa ?? 'sem código')}) — ` +
        'confere com a limitacao do §4.4',
    );
  } else {
    avisos.push('a API ACEITOU consulta sem customerId — diverge do §4.4; revisar a limitacao');
  }

  return {
    ok: problemas.length === 0,
    requisicoes: 2,
    evidencias: [...evidencias, ...problemas.map((p) => `✗ ${p}`)],
    avisos,
    observacao:
      'GET /accounts-receivable/receivable-bills confirmado em consulta real com customerId ' +
      `obrigatorio (recusa sem o parametro ${recusou ? 'confirmada' : 'NAO confirmada'}).`,
  };
}

async function sondarInstallments(): Promise<ResultadoSonda> {
  const evidencias: string[] = [];
  const avisos: string[] = [];
  const problemas: string[] = [];

  const pagina = await sondar<PaginaSienge<Record<string, unknown>>>(
    'installments',
    undefined,
    { receivableBillId: TITULO_DO_LEVANTAMENTO },
  );
  problemas.push(...conferirMetadata(pagina));
  evidencias.push(
    `titulo ${TITULO_DO_LEVANTAMENTO} (do levantamento §8.5): count=${pagina.resultSetMetadata.count}`,
  );

  if (pagina.results.length) {
    const campos = conferirCampos(pagina.results[0], [
      'installmentId', 'dueDate', 'balanceDue', 'conditionTypeId', 'generatedBoleto',
    ]);
    evidencias.push(`campos confirmados na 1ª parcela: ${campos.presentes.join(', ') || 'nenhum'}`);
    if (campos.ausentes.length) problemas.push(`campos ausentes: ${campos.ausentes.join(', ')}`);
  } else {
    avisos.push('titulo do levantamento sem parcelas hoje; formato confirmado so pela pagina');
  }

  return {
    ok: problemas.length === 0,
    requisicoes: 1,
    evidencias: [...evidencias, ...problemas.map((p) => `✗ ${p}`)],
    avisos,
    observacao:
      'GET /accounts-receivable/receivable-bills/{id}/installments confirmado em consulta real; ' +
      'resposta paginada com installmentId, dueDate, balanceDue e conditionTypeId.',
  };
}

async function sondarSaldoDevedor(): Promise<ResultadoSonda> {
  const evidencias: string[] = [];
  const avisos: string[] = [];
  const problemas: string[] = [];

  if (!cpfParaSaldo) {
    return {
      ok: false,
      requisicoes: 0,
      evidencias: [
        '✗ sonda nao executada: nenhum CPF disponivel da sonda de /customers ' +
          '(rode a homologacao completa, ou o endpoint customers antes deste)',
      ],
      avisos,
      observacao: '',
    };
  }

  const pagina = await sondar<PaginaSienge<Record<string, unknown>>>(
    'total_current_debit_balance',
    { cpf: cpfParaSaldo },
  );
  problemas.push(...conferirMetadata(pagina));
  evidencias.push(
    'consultado com CPF de cliente ativo da pagina 1 de /customers (valor nao publicado); ' +
      `count=${pagina.resultSetMetadata.count}`,
  );

  if (pagina.results.length) {
    const campos = conferirCampos(pagina.results[0], [
      'totalOriginalValue', 'totalAdjustedValue', 'totalAdditionalValue',
      'totalCurrentDebitBalanceValue',
    ]);
    evidencias.push(`campos confirmados: ${campos.presentes.join(', ') || 'nenhum'}`);
    if (campos.ausentes.length) problemas.push(`campos ausentes: ${campos.ausentes.join(', ')}`);
    const valor = pagina.results[0]?.totalCurrentDebitBalanceValue;
    if (typeof valor === 'number' && !Number.isInteger(valor * 100)) {
      evidencias.push(
        'valor com residuo alem de 2 casas decimais — confirma o tratamento decimal obrigatorio (§8.6)',
      );
    }
  } else {
    avisos.push('cliente consultado sem saldo devedor hoje; formato confirmado so pela pagina');
  }

  return {
    ok: problemas.length === 0,
    requisicoes: 1,
    evidencias: [...evidencias, ...problemas.map((p) => `✗ ${p}`)],
    avisos,
    observacao:
      'GET /total-current-debit-balance confirmado em consulta real por CPF; retorno pontual ' +
      'com totais original/ajustado/adicional/presente e residuo decimal a arredondar.',
  };
}

async function sondarCommissions(): Promise<ResultadoSonda> {
  const evidencias: string[] = [];
  const avisos: string[] = [];
  const problemas: string[] = [];

  // limit e offset sao OBRIGATORIOS neste endpoint (§4.7).
  const pagina = await sondar<PaginaSienge<Record<string, unknown>>>('commissions', {
    limit: 10,
    offset: 0,
    commissionFilterType: 'ALL',
  });
  problemas.push(...conferirMetadata(pagina));
  evidencias.push(
    `limit=10&offset=0&commissionFilterType=ALL: count=${pagina.resultSetMetadata.count}`,
  );

  if (pagina.results.length) {
    const campos = conferirCampos(pagina.results[0], [
      'commissionID', 'companyId', 'enterpriseID', 'brokerID',
      'value', 'installmentStatus', 'dueDate',
    ]);
    evidencias.push(`campos confirmados na 1ª comissao: ${campos.presentes.join(', ') || 'nenhum'}`);
    if (campos.ausentes.length) problemas.push(`campos ausentes: ${campos.ausentes.join(', ')}`);
  } else {
    avisos.push('nenhuma comissao devolvida com o filtro ALL; formato confirmado so pela pagina');
  }

  return {
    ok: problemas.length === 0,
    requisicoes: 1,
    evidencias: [...evidencias, ...problemas.map((p) => `✗ ${p}`)],
    avisos,
    observacao:
      'GET /commissions confirmado em consulta real com limit/offset obrigatorios e ' +
      'commissionFilterType=ALL; movimentacao com commissionID, brokerID e installmentStatus.',
  };
}

/** Ordem deliberada: dados corporativos primeiro, dado pessoal por ultimo. */
const SONDAS: Array<{ chave: keyof typeof ENDPOINTS_CANDIDATOS; sonda: () => Promise<ResultadoSonda> }> = [
  { chave: 'companies', sonda: sondarCompanies },
  { chave: 'enterprises', sonda: sondarEnterprises },
  { chave: 'customers', sonda: sondarCustomers },
  { chave: 'receivable_bills', sonda: sondarReceivableBills },
  { chave: 'installments', sonda: sondarInstallments },
  { chave: 'total_current_debit_balance', sonda: sondarSaldoDevedor },
  { chave: 'commissions', sonda: sondarCommissions },
];

// ─────────────────────────────────────────────────────────────────────────────
// Pre-confirmacao: tudo local, nada de rede
// ─────────────────────────────────────────────────────────────────────────────

interface ItemConfirmacao {
  rotulo: string;
  ok: boolean;
  detalhe: string;
}

async function preConfirmar(): Promise<ItemConfirmacao[]> {
  const itens: ItemConfirmacao[] = [];

  // 1. Credenciais presentes — pelo nome, nunca pelo valor.
  const cfg = verificarConfiguracao();
  itens.push({
    rotulo: 'credenciais configuradas',
    ok: cfg.completa,
    detalhe: cfg.completa
      ? `${cfg.presentes.join(', ')} presentes no ambiente (valores nunca exibidos)`
      : `faltando: ${cfg.faltando.join(', ')}`,
  });

  // 2. Conector deliberadamente ligado.
  itens.push({
    rotulo: 'SIENGE_HABILITADO=true',
    ok: config.sienge.habilitado,
    detalhe: config.sienge.habilitado
      ? 'ligado por decisao explicita para esta homologacao'
      : 'desligado — a homologacao exige ligar deliberadamente',
  });

  // 3. Somente leitura por construcao — provado no fonte, antes de qualquer chamada.
  const fonte = readFileSync(
    new URL('../src/integracoes/sienge/cliente.ts', import.meta.url).pathname,
    'utf8',
  );
  const escritas = ['POST', 'PUT', 'PATCH', 'DELETE'].filter((verbo) =>
    new RegExp(`method:\\s*['"]${verbo}['"]`).test(fonte),
  );
  itens.push({
    rotulo: 'integracao em modo somente leitura',
    ok: escritas.length === 0 && fonte.includes("method: 'GET'"),
    detalhe:
      escritas.length === 0
        ? 'o cliente so possui GET; o metodo e fixo, nao parametro'
        : `o cliente contem escrita: ${escritas.join(', ')}`,
  });

  // 4. Orcamento diario abaixo da franquia e com folga para a sonda.
  const restante = orcamentoRestante();
  const abaixoDaFranquia = config.sienge.orcamentoDiario <= 1000;
  itens.push({
    rotulo: `orcamento diario ≤ franquia (${config.sienge.orcamentoDiario}/1000)`,
    ok: abaixoDaFranquia && restante >= FOLGA_MINIMA,
    detalhe: `${restante} requisicoes restantes hoje; folga minima por endpoint: ${FOLGA_MINIMA}`,
  });

  // 5. Catalogo identico ao documento — nenhum caminho inventado.
  const caminhosDoDocumento = [
    '/companies',
    '/enterprises',
    '/customers',
    '/accounts-receivable/receivable-bills',
    '/accounts-receivable/receivable-bills/{receivableBillId}/installments',
    '/total-current-debit-balance',
    '/commissions',
  ];
  const caminhosDoCatalogo = Object.values(ENDPOINTS_CANDIDATOS).map((e) => e.caminho);
  const catalogoConfere =
    caminhosDoCatalogo.length === caminhosDoDocumento.length &&
    caminhosDoDocumento.every((c) => caminhosDoCatalogo.includes(c));
  itens.push({
    rotulo: 'catalogo identico ao levantamento (§3)',
    ok: catalogoConfere,
    detalhe: catalogoConfere
      ? `${caminhosDoCatalogo.length} caminhos, todos do documento de 06/08/2026`
      : `divergencia: catalogo tem [${caminhosDoCatalogo.join(', ')}]`,
  });

  // 6. Banco alcancavel e linha 'sienge' presente — o registro tem onde viver.
  let linhaSienge = false;
  let detalheBanco = '';
  try {
    const linha = await db
      .selectFrom('integracoes')
      .select(['sistema', 'modo'])
      .where('sistema', '=', 'sienge')
      .executeTakeFirst();
    linhaSienge = Boolean(linha);
    detalheBanco = linha
      ? `linha \`sienge\` presente, modo \`${linha.modo}\``
      : 'tabela integracoes sem a linha sienge — rode as migracoes';
  } catch (erro) {
    detalheBanco = `banco inalcancavel: ${erro instanceof Error ? erro.message : String(erro)}`;
  }
  itens.push({ rotulo: 'registro de homologacao tem destino no banco', ok: linhaSienge, detalhe: detalheBanco });

  // 7. Autor da confirmacao declarado (exigido para registrar).
  if (!SIMULAR && !SO_PRE) {
    itens.push({
      rotulo: 'autor da confirmacao declarado (--confirmado-por)',
      ok: Boolean(CONFIRMADO_POR && CONFIRMADO_POR.trim().length >= 3),
      detalhe: CONFIRMADO_POR
        ? `confirmacoes serao registradas em nome de "${CONFIRMADO_POR}"`
        : 'obrigatorio fora de --simular: a confirmacao e ato com autor',
    });
  }

  return itens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro da confirmacao — mesmo formato do POST /api/sienge/homologar
// ─────────────────────────────────────────────────────────────────────────────

async function registrarConfirmacao(
  chave: string,
  resultado: ResultadoSonda,
): Promise<void> {
  const atual = await db
    .selectFrom('integracoes')
    .select('relatorio_verificacao')
    .where('sistema', '=', 'sienge')
    .executeTakeFirst();

  const observacao =
    resultado.observacao +
    (resultado.avisos.length ? ` Avisos: ${resultado.avisos.join('; ')}` : '') +
    ` Homologado via scripts/homologar-sienge.ts com ${resultado.requisicoes} requisicao(oes).`;

  const relatorio = {
    ...((atual?.relatorio_verificacao as Record<string, unknown>) ?? {}),
    [chave]: {
      confirmado: true,
      observacao,
      confirmado_por: CONFIRMADO_POR,
      confirmado_em: new Date().toISOString(),
    },
  };

  await db
    .updateTable('integracoes')
    .set({
      relatorio_verificacao: JSON.stringify(relatorio),
      ambiente_verificado_em: new Date(),
      atualizado_em: new Date(),
    })
    .where('sistema', '=', 'sienge')
    .execute();

  await auditar({
    acao: 'integracao_verificada',
    usuarioNome: CONFIRMADO_POR,
    recurso: 'integracoes',
    recursoId: 'sienge',
    modulo: 'administracao',
    detalhe: {
      endpoint: ENDPOINTS_CANDIDATOS[chave]!.caminho,
      confirmado: true,
      observacao,
      via: 'scripts/homologar-sienge.ts',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function gravarSaida(): Promise<void> {
  const saida = argumento('saida');
  if (!saida) return;
  await fs.writeFile(saida, linhas.join('\n') + '\n');
  console.log(`\n→ relatorio gravado em ${saida}`);
}

async function principal(): Promise<void> {
  const soEndpoint = argumento('endpoint');
  if (soEndpoint && !SONDAS.some((s) => s.chave === soEndpoint)) {
    throw new Error(
      `Endpoint "${soEndpoint}" nao tem sonda de homologacao. ` +
        `Autorizados: ${SONDAS.map((s) => s.chave).join(', ')}`,
    );
  }

  escrever('# Homologação controlada do Sienge');
  escrever();
  escrever(`**Ambiente:** ${config.ambiente}  `);
  escrever(`**Executado em:** ${new Date().toISOString()}  `);
  escrever(`**Base:** \`https://api.sienge.com.br/<subdomínio>/public/api/v1\` (subdomínio no ambiente)  `);
  escrever(`**Escopo:** ${soEndpoint ?? 'todos os 7 endpoints do catálogo'}${SIMULAR ? ' — SIMULAÇÃO, nada será registrado' : ''}`);
  escrever();
  escrever('> Integração somente leitura por construção. Cada sonda é mínima e o');
  escrever('> consumo da franquia diária (plano Start, 1.000/dia) é prestado ao final.');
  escrever();

  // ── Pré-confirmação ────────────────────────────────────────────────────────
  const pre = await preConfirmar();
  escrever('## Pré-confirmação (local, sem rede)');
  escrever();
  escrever('| Item | Resultado |');
  escrever('| --- | --- |');
  for (const item of pre) {
    escrever(`| ${item.rotulo} | ${item.ok ? '✅' : '❌'} ${item.detalhe} |`);
  }
  escrever();

  const falhouPre = pre.filter((i) => !i.ok);
  if (falhouPre.length) {
    escrever(`**Pré-confirmação falhou (${falhouPre.length} item(ns)). Nenhuma requisição foi enviada e nada foi registrado.**`);
    await gravarSaida();
    process.exitCode = 1;
    return;
  }

  if (SO_PRE) {
    escrever('_Execução limitada à pré-confirmação: nenhuma requisição foi enviada._');
    await gravarSaida();
    return;
  }

  // ── Sondas, endpoint por endpoint ─────────────────────────────────────────
  const orcamentoInicial = orcamentoRestante();
  let confirmados = 0;
  let falhas = 0;

  for (const { chave, sonda } of SONDAS) {
    if (soEndpoint && chave !== soEndpoint) continue;

    const candidato = ENDPOINTS_CANDIDATOS[chave]!;
    escrever(`## \`${candidato.caminho}\``);
    escrever();

    if (orcamentoRestante() < FOLGA_MINIMA) {
      escrever(
        `⏸️ **Sonda não iniciada:** restam ${orcamentoRestante()} requisições no orçamento ` +
          `diário e a folga mínima é ${FOLGA_MINIMA}. A homologação continua amanhã — ` +
          'estourar a franquia tem custo não validado (§6).',
      );
      escrever();
      falhas++;
      continue;
    }

    // Liberacao PROVISORIA, so em memoria e so para a sonda: o cliente recusa
    // endpoint nao confirmado, e a homologacao e justamente o ato que confirma.
    // Persistido apenas se a sonda passar.
    candidato.confirmado = true;
    let resultado: ResultadoSonda;
    try {
      resultado = await sonda();
    } catch (erro) {
      candidato.confirmado = false;
      falhas++;
      escrever(`❌ **Sonda falhou:** ${erro instanceof Error ? erro.message : String(erro)}`);
      const detalhe =
        erro && typeof erro === 'object' && 'detalhe' in erro
          ? (erro as { detalhe: Record<string, unknown> }).detalhe
          : null;
      if (detalhe && Object.keys(detalhe).length) {
        escrever();
        escrever(`Detalhe: \`${JSON.stringify(detalhe)}\``);
      }
      escrever();
      escrever('_Nada foi registrado para este endpoint._');
      escrever();
      continue;
    }

    escrever(`Requisições da sonda: ${resultado.requisicoes}`);
    escrever();
    for (const e of resultado.evidencias) escrever(`- ${e}`);
    for (const a of resultado.avisos) escrever(`- ⚠️ ${a}`);
    escrever();

    if (!resultado.ok) {
      candidato.confirmado = false;
      falhas++;
      escrever('❌ **A sonda encontrou divergências. Nada foi registrado para este endpoint.**');
      escrever();
      continue;
    }

    if (SIMULAR) {
      candidato.confirmado = false;
      escrever('✅ Sonda passou. _Simulação: confirmação NÃO registrada._');
      escrever();
      confirmados++;
      continue;
    }

    await registrarConfirmacao(chave, resultado);
    candidato.observacaoHomologacao = resultado.observacao;
    confirmados++;
    escrever(`✅ **Confirmado e registrado** em \`integracoes.relatorio_verificacao\` por ${CONFIRMADO_POR}, com trilha de auditoria.`);
    escrever();
  }

  // ── Prestação de contas do orçamento ──────────────────────────────────────
  escrever('## Orçamento diário — prestação de contas');
  escrever();
  escrever('| Item | Valor |');
  escrever('| --- | --- |');
  escrever(`| Teto configurado (SIENGE_ORCAMENTO_DIARIO) | ${config.sienge.orcamentoDiario} |`);
  escrever(`| Franquia do plano Start | 1.000/dia |`);
  escrever(`| Saldo ao iniciar | ${orcamentoInicial} |`);
  escrever(`| Requisições desta execução | ${requisicoesDaExecucao} |`);
  escrever(`| Saldo ao terminar | ${orcamentoRestante()} |`);
  escrever();

  escrever('---');
  escrever();
  const total = soEndpoint ? 1 : SONDAS.length;
  escrever(
    falhas === 0
      ? `**${confirmados} de ${total} endpoint(s) ${SIMULAR ? 'passaram na sonda (simulação)' : 'confirmados e registrados'}.**`
      : `**${confirmados} de ${total} endpoint(s) confirmados; ${falhas} falharam.** Os que falharam continuam TRAVADOS.`,
  );

  await gravarSaida();
  if (falhas > 0) process.exitCode = 1;
}

principal()
  .then(() => fecharBanco())
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(async (erro) => {
    console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)}`);
    await fecharBanco().catch(() => {});
    process.exit(1);
  });
