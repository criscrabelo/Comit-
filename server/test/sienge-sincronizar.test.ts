/**
 * Carga incremental do Sienge — contra PostgreSQL real, com o transporte HTTP
 * substituído por um dublê no formato exato das respostas confirmadas na
 * homologação (docs/evidencias/homologacao-sienge.md).
 *
 * O que estes testes PROVAM: upsert idempotente por (fonte, id_origem),
 * vínculo de título↔cliente e comissão↔empreendimento pelo identificador da
 * origem, posição (título/parcela) com `data_referencia` preenchida e
 * movimentação (comissão) com `data_referencia` nula, e a retomada de
 * parcelas quando o orçamento acaba no meio do ciclo.
 *
 * O que NÃO provam: que a API real da Coevo responde exatamente assim hoje —
 * isso é o que `scripts/homologar-sienge.ts` faz contra a rede real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, fecharBanco } from '../src/db/pool.js';
import { ENDPOINTS_CANDIDATOS } from '../src/integracoes/sienge/cliente.js';
import { planejarCarga, sincronizarSienge } from '../src/integracoes/sienge/sincronizar.js';
import { contar, limparDados } from './ajuda/banco.js';

vi.mock('../src/config.js', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('../src/config.js')>();
  return {
    ...real,
    config: {
      ...real.config,
      sienge: {
        ...real.config.sienge,
        subdominio: 'homologacao-teste',
        usuario: 'usuario-teste',
        senha: 'senha-teste',
        habilitado: true,
        requisicoesPorMinuto: 999,
        orcamentoDiario: 900,
      },
    },
  };
});

const BASE = 'https://api.sienge.com.br/homologacao-teste/public/api/v1';

/** Cliente com CPF válido pelo dígito verificador (mesmo usado em documento.test.ts). */
const CPF_VALIDO = '11144477735';
/** Empresa com CNPJ válido pelo dígito verificador. */
const CNPJ_VALIDO = '11222333000181';

const EMPRESAS = [{ id: 1, name: 'TETUS - CONSTRUTORA', cnpj: '00000000000100', tradeName: 'COEVO' }];
const EMPREENDIMENTOS = [
  { id: 1, name: 'EMPREENDIMENTO A', companyId: 1, companyName: 'TETUS - CONSTRUTORA', type: '1' },
];
const CLIENTES = [
  { id: 100, name: 'Fulano de Tal', cpf: CPF_VALIDO, modifiedAt: '2026-08-01', createdAt: '2021-01-01' },
  { id: 200, name: 'Empresa Compradora', cnpj: CNPJ_VALIDO, modifiedAt: '2026-08-02', createdAt: '2022-01-01' },
];
/** 5002 referencia um cliente que a carga de clientes NUNCA trouxe — vínculo tem de ficar ausente. */
const TITULOS = [
  {
    receivableBillId: 5001, customerId: 100, companyId: 1, documentNumber: '304',
    issueDate: '2026-01-10', receivableBillValue: 1000, defaulting: false, subjudice: false, payOffDate: null,
  },
  {
    receivableBillId: 5002, customerId: 999, companyId: 1, documentNumber: '305',
    issueDate: '2026-02-10', receivableBillValue: 500, defaulting: true, subjudice: false, payOffDate: null,
  },
];
const PARCELAS: Record<number, unknown[]> = {
  5001: [{ receivableBillId: 5001, installmentId: 1, dueDate: '2026-07-01', balanceDue: 100, conditionTypeId: 'AT' }],
  5002: [{ receivableBillId: 5002, installmentId: 1, dueDate: '2026-09-01', balanceDue: 50, conditionTypeId: 'PM' }],
};
const COMISSOES = [
  {
    commissionID: 9001, enterpriseID: 1, brokerName: 'Corretor A', value: 150,
    dueDate: '2026-08-01', installmentStatus: 'RELEASED',
  },
];

const chamadas: string[] = [];

function pagina(itens: unknown[]) {
  return { resultSetMetadata: { count: itens.length, offset: 0, limit: 200 }, results: itens };
}

function instalarDuble(): void {
  chamadas.length = 0;
  vi.stubGlobal('fetch', async (url: string | URL) => {
    const u = new URL(url);
    chamadas.push(u.pathname + '?' + u.searchParams.toString());

    if (u.pathname === '/homologacao-teste/public/api/v1/companies') {
      return Response.json(pagina(EMPRESAS));
    }
    if (u.pathname === '/homologacao-teste/public/api/v1/enterprises') {
      return Response.json(pagina(EMPREENDIMENTOS));
    }
    if (u.pathname === '/homologacao-teste/public/api/v1/customers') {
      return Response.json(pagina(CLIENTES));
    }
    if (u.pathname === '/homologacao-teste/public/api/v1/accounts-receivable/receivable-bills') {
      return Response.json(pagina(TITULOS));
    }
    const parcela = u.pathname.match(
      /^\/homologacao-teste\/public\/api\/v1\/accounts-receivable\/receivable-bills\/(\d+)\/installments$/,
    );
    if (parcela) {
      const id = Number(parcela[1]);
      return Response.json(pagina(PARCELAS[id] ?? []));
    }
    if (u.pathname === '/homologacao-teste/public/api/v1/commissions') {
      return Response.json(pagina(COMISSOES));
    }

    return new Response('nao mapeado neste dublê', { status: 404 });
  });
}

beforeAll(async () => {
  await limparDados();
});

beforeEach(() => {
  instalarDuble();
  // Confirmacao e a mesma trava do POST /api/sienge/homologar: sem ela, ler()
  // recusa antes de qualquer requisicao. So os endpoints usados nesta carga.
  for (const chave of ['companies', 'enterprises', 'customers', 'receivable_bills', 'installments', 'commissions'] as const) {
    ENDPOINTS_CANDIDATOS[chave].confirmado = true;
  }
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await limparDados();
});

afterAll(async () => {
  await fecharBanco();
});

describe('carga completa', () => {
  it('grava as seis etapas e vincula titulo↔cliente e comissao↔empreendimento pelo id da origem', async () => {
    const resultado = await sincronizarSienge({});

    expect(resultado.execucao.status).toBe('sucesso');
    expect(resultado.execucao.parcial).toBe(false);

    expect(await contar('empreendimentos', "fonte = 'sienge'")).toBe(1);
    expect(await contar('clientes', "fonte = 'sienge'")).toBe(2);
    expect(await contar('titulos_receber', "fonte = 'sienge'")).toBe(2);
    expect(await contar('parcelas', "fonte = 'sienge'")).toBe(2);
    expect(await contar('comissoes', "fonte = 'sienge'")).toBe(1);

    const titulo1 = await db
      .selectFrom('titulos_receber')
      .select(['cliente_id', 'regra_vinculo', 'situacao', 'valor_nominal'])
      .where('id_origem', '=', '5001')
      .executeTakeFirstOrThrow();
    expect(titulo1.cliente_id).not.toBeNull();
    expect(titulo1.regra_vinculo).toBe('id_relacionado');
    expect(titulo1.situacao).toBe('em_dia');
    expect(titulo1.valor_nominal).toBe('1000.00');

    // 5002 referencia um cliente (999) que a carga de clientes nunca trouxe:
    // o titulo grava, mas SEM vinculo — nao inventa um cliente_id.
    const titulo2 = await db
      .selectFrom('titulos_receber')
      .select(['cliente_id', 'regra_vinculo', 'situacao'])
      .where('id_origem', '=', '5002')
      .executeTakeFirstOrThrow();
    expect(titulo2.cliente_id).toBeNull();
    expect(titulo2.regra_vinculo).toBe('sem_vinculo');
    expect(titulo2.situacao).toBe('inadimplente');

    const comissao = await db
      .selectFrom('comissoes')
      .select(['empreendimento_id', 'beneficiario', 'valor', 'data_referencia', 'data_fato'])
      .where('id_origem', '=', '9001')
      .executeTakeFirstOrThrow();
    expect(comissao.empreendimento_id).not.toBeNull();
    expect(comissao.beneficiario).toBe('Corretor A');
    expect(comissao.valor).toBe('150.00');
    // Movimentacao: data_referencia fica NULA, so data_fato importa.
    expect(comissao.data_referencia).toBeNull();
    expect(comissao.data_fato).not.toBeNull();

    const cliente100 = await db
      .selectFrom('clientes')
      .select(['cpf_cnpj', 'cpf_cnpj_valido', 'tipo_pessoa'])
      .where('id_origem', '=', '100')
      .executeTakeFirstOrThrow();
    expect(cliente100.cpf_cnpj).toBe(CPF_VALIDO);
    expect(cliente100.cpf_cnpj_valido).toBe(true);
    expect(cliente100.tipo_pessoa).toBe('PF');
  });

  it('empreendimento ganha entrada em empreendimentos_fontes, para a comissao vincular', async () => {
    await sincronizarSienge({});
    const fonte = await db
      .selectFrom('empreendimentos_fontes')
      .select(['id_externo', 'fonte'])
      .where('fonte', '=', 'sienge')
      .where('id_externo', '=', '1')
      .executeTakeFirst();
    expect(fonte).toBeTruthy();
  });

  it('titulo e parcela sao POSICAO: data_referencia preenchida numa data', async () => {
    await sincronizarSienge({});
    const titulo = await db
      .selectFrom('titulos_receber')
      .select('data_referencia')
      .where('id_origem', '=', '5001')
      .executeTakeFirstOrThrow();
    expect(titulo.data_referencia).not.toBeNull();
  });
});

describe('colisao de nome_normalizado entre empreendimentos distintos', () => {
  it('mantem o primeiro e ignora o segundo com motivo, sem abortar o lote inteiro', async () => {
    const empreendimentosComColisao = [
      { id: 1, name: 'TORRE PARK', companyId: 1, companyName: 'TETUS - CONSTRUTORA' },
      // Mesmo nome normalizado, id_origem diferente — a colisao real encontrada
      // na sonda de 06/08/2026 (ex.: "FGLASS" em tres ids distintos).
      { id: 2, name: 'Torre Park', companyId: 1, companyName: 'TETUS - CONSTRUTORA' },
      { id: 3, name: 'EMPREENDIMENTO SEM COLISAO', companyId: 1, companyName: 'TETUS - CONSTRUTORA' },
    ];
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const u = new URL(url);
      if (u.pathname === '/homologacao-teste/public/api/v1/enterprises') {
        return Response.json(pagina(empreendimentosComColisao));
      }
      return new Response('nao mapeado neste dublê', { status: 404 });
    });

    const resultado = await sincronizarSienge({ etapas: ['empreendimentos'] });

    // A transacao NAO abortou: os dois nomes distintos entraram.
    expect(await contar('empreendimentos', "fonte = 'sienge'")).toBe(2);
    expect(resultado.execucao.status).toBe('sucesso');

    const primeiro = await db
      .selectFrom('empreendimentos')
      .select('id_origem')
      .where('nome_normalizado', '=', 'TORRE PARK')
      .executeTakeFirstOrThrow();
    // O PRIMEIRO da lista ocupa o nome; o segundo (id 2) foi ignorado.
    expect(primeiro.id_origem).toBe('1');

    const etapa = resultado.etapas.find((e) => e.etapa === 'empreendimentos');
    expect(etapa?.ignorados).toBe(1);
    expect(etapa?.incluidos).toBe(2);
  });

  it('reler o mesmo id_origem que ja ocupa o nome atualiza normalmente, nao ignora', async () => {
    const v1 = [{ id: 1, name: 'ESTAVEL', companyId: 1, companyName: 'TETUS' }];
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const u = new URL(url);
      if (u.pathname === '/homologacao-teste/public/api/v1/enterprises') return Response.json(pagina(v1));
      return new Response('nao mapeado', { status: 404 });
    });
    await sincronizarSienge({ etapas: ['empreendimentos'] });

    const v2 = [{ id: 1, name: 'ESTAVEL', companyId: 1, companyName: 'TETUS - NOME CORRIGIDO' }];
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const u = new URL(url);
      if (u.pathname === '/homologacao-teste/public/api/v1/enterprises') return Response.json(pagina(v2));
      return new Response('nao mapeado', { status: 404 });
    });
    const resultado = await sincronizarSienge({ etapas: ['empreendimentos'] });

    const etapa = resultado.etapas.find((e) => e.etapa === 'empreendimentos');
    expect(etapa?.ignorados).toBe(0);
    expect(etapa?.atualizados).toBe(1);
  });
});

describe('idempotencia — segunda execucao nao duplica nem reescreve o que nao mudou', () => {
  it('incluidos zero e inalterados no que se repete', async () => {
    await sincronizarSienge({});
    const totalAntes = await contar('titulos_receber', "fonte = 'sienge'");

    const segunda = await sincronizarSienge({});

    expect(await contar('titulos_receber', "fonte = 'sienge'")).toBe(totalAntes);
    const etapaTitulos = segunda.etapas.find((e) => e.etapa === 'titulos');
    expect(etapaTitulos?.incluidos).toBe(0);
    expect(etapaTitulos?.inalterados).toBe(2);
  });
});

describe('simulacao — le e transforma sem gravar', () => {
  it('nenhuma linha e criada quando simular:true', async () => {
    await sincronizarSienge({ simular: true });
    expect(await contar('empreendimentos', "fonte = 'sienge'")).toBe(0);
    expect(await contar('titulos_receber', "fonte = 'sienge'")).toBe(0);
  });
});

describe('orcamento e retomada de parcelas', () => {
  it('etapa de parcelas para no meio quando o teto acaba, e salva onde parou', async () => {
    // Carrega so os titulos primeiro — parcelas depende deles existirem.
    await sincronizarSienge({ etapas: ['titulos'] });

    // Teto de 1 requisicao: a etapa de parcelas precisa de 2 (uma por titulo)
    // e so consegue processar o primeiro.
    const primeira = await sincronizarSienge({ etapas: ['parcelas'], tetoDeRequisicoes: 1 });

    expect(await contar('parcelas', "fonte = 'sienge'")).toBe(1);
    expect(primeira.execucao.parcial).toBe(true);
    const etapa1 = primeira.etapas.find((e) => e.etapa === 'parcelas');
    expect(etapa1?.retomarDe).toBe(5001);

    // Segunda chamada, sem teto artificial: retoma de 5001 e completa o 5002.
    const segunda = await sincronizarSienge({ etapas: ['parcelas'] });
    expect(await contar('parcelas', "fonte = 'sienge'")).toBe(2);
    expect(segunda.execucao.parcial).toBe(false);
  });

  it('ciclo completo de parcelas reinicia o marcador para a proxima carga', async () => {
    await sincronizarSienge({ etapas: ['titulos'] });
    await sincronizarSienge({ etapas: ['parcelas'] });

    // Terceira chamada: o ciclo ja estava completo. Ela nao processa nada,
    // mas e o que detecta o fim e reinicia o marcador para a proxima.
    const terceira = await sincronizarSienge({ etapas: ['parcelas'] });
    const etapaDeteccao = terceira.etapas.find((e) => e.etapa === 'parcelas');
    expect(etapaDeteccao?.requisicoes).toBe(0);

    // Quarta chamada: o marcador voltou a zero, entao ela reprocessa os
    // mesmos 2 titulos (upsert idempotente — nao duplica).
    const quarta = await sincronizarSienge({ etapas: ['parcelas'] });
    expect(await contar('parcelas', "fonte = 'sienge'")).toBe(2);
    const etapa = quarta.etapas.find((e) => e.etapa === 'parcelas');
    expect(etapa?.requisicoes).toBe(2);
  });
});

describe('falha nao apaga o ultimo dado valido', () => {
  it('endpoint nao homologado interrompe a carga sem tocar o que ja esta gravado', async () => {
    await sincronizarSienge({ etapas: ['empreendimentos'] });
    const antes = await contar('empreendimentos', "fonte = 'sienge'");

    // Destrava tudo, exceto customers — simula uma trava que nao foi
    // renovada, ou um endpoint que a Coevo revogou.
    ENDPOINTS_CANDIDATOS.customers.confirmado = false;

    const resultado = await sincronizarSienge({ etapas: ['clientes'] });

    expect(resultado.execucao.status).toBe('erro');
    expect(await contar('empreendimentos', "fonte = 'sienge'")).toBe(antes);

    const integracao = await db
      .selectFrom('integracoes')
      .select('ultima_carga_valida_em')
      .where('sistema', '=', 'sienge')
      .executeTakeFirstOrThrow();
    // Carga anterior (so empreendimentos) foi completa e avancou o carimbo;
    // a falha de clientes NAO pode ter apagado esse carimbo.
    expect(integracao.ultima_carga_valida_em).not.toBeNull();
  });
});

describe('planejarCarga', () => {
  it('estima o custo de cada etapa contra o orcamento restante', async () => {
    const plano = await planejarCarga();
    expect(plano.planos).toHaveLength(6);
    const titulos = plano.planos.find((p) => p.etapa === 'titulos');
    expect(titulos?.registrosNaOrigem).toBe(2);
    const parcelas = plano.planos.find((p) => p.etapa === 'parcelas');
    // Estimativa de parcelas usa o total de titulos como proxy (1 req/titulo).
    expect(parcelas?.registrosNaOrigem).toBe(2);
  });
});
