/**
 * Demonstracao da Central de Inconsistencias pela API, com o servidor no ar.
 *
 * Reproduz o caso desenhado na secao 3d do Diagnostico e Wireframes — contrato
 * C-1042, divergencia entre Monday e Sienge — e percorre o fluxo completo de
 * tratamento, imprimindo as respostas reais de cada endpoint.
 *
 * Serve como evidencia da implementacao: nesta fase o backend nao tem tela, e a
 * resposta da API e o artefato verificavel.
 *
 * Uso: BASE=http://localhost:3199 npx tsx scripts/demonstrar-central.ts
 */
import { db, fecharBanco } from '../src/db/pool.js';
import { gravarBruto, iniciarExecucao } from '../src/integracoes/execucoes.js';
import { registrarAmbiguidade, registrarDivergencia } from '../src/inconsistencias/servico.js';

const BASE = process.env.BASE ?? 'http://localhost:3199';
const USUARIO = process.env.USUARIO ?? 'cristiane';
const SENHA = process.env.SENHA ?? 'senha-de-teste-longa-1';

let token = '';

async function chamar(metodo: string, caminho: string, corpo?: unknown) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

function secao(titulo: string): void {
  console.log(`\n${'═'.repeat(78)}\n${titulo}\n${'═'.repeat(78)}`);
}

function mostrar(rotulo: string, valor: unknown): void {
  console.log(`\n── ${rotulo}`);
  console.log(JSON.stringify(valor, null, 2));
}

async function prepararDados(): Promise<{ divergenciaId: string; ambiguidadeId: string }> {
  const empreendimento = await db
    .insertInto('empreendimentos')
    .values({
      nome: 'VERANO',
      nome_normalizado: 'VERANO',
      fonte: 'manual',
      id_origem: 'demo-verano',
    })
    .onConflict((oc) => oc.column('nome_normalizado').doUpdateSet({ nome: 'VERANO' }))
    .returning('id')
    .executeTakeFirstOrThrow();

  // Area bruta: os payloads originais das duas fontes, para o requisito 14.
  const execMonday = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });
  await gravarBruto(execMonday.id, 'monday', 'notificacoes', [
    {
      idOrigem: 'item-99887',
      payload: {
        id: 'item-99887',
        name: 'VERANO 1105B',
        group: { title: 'MARÇO 2026' },
        column_values: [
          { id: 'texto1', text: 'C-1042' },
          { id: 'valor1', text: 'R$ 64.000,00' },
        ],
      },
    },
  ]);
  await execMonday.finalizar({ status: 'sucesso' });

  const execSienge = await iniciarExecucao({ fonte: 'sienge', escopo: 'receivable-bills' });
  await gravarBruto(execSienge.id, 'sienge', 'receivable-bills', [
    {
      idOrigem: 'titulo-4471',
      payload: {
        billId: 'titulo-4471',
        contractNumber: 'C-1042',
        overdueBalance: 66071.1,
        referenceDate: '2026-05-28',
      },
    },
  ]);
  await execSienge.finalizar({ status: 'sucesso' });

  // Caso 1 — divergencia de valor entre Monday e Sienge (3d do wireframe).
  const divergencia = await registrarDivergencia({
    campo: 'saldo_vencido',
    ladoA: {
      fonte: 'monday',
      id_origem: 'item-99887',
      campo: 'saldo_vencido',
      valor: 64000,
      data_referencia: '2026-03-04',
      extraido_em: '2026-03-04T06:00:00.000Z',
      url_origem: 'https://coevo.monday.com/boards/5630368737/pulses/item-99887',
    },
    ladoB: {
      fonte: 'sienge',
      id_origem: 'titulo-4471',
      campo: 'saldo_vencido',
      valor: 66071.1,
      data_referencia: '2026-05-28',
      extraido_em: '2026-05-28T05:00:00.000Z',
    },
    precedencia: 'financeiro: sienge > base validada > monday',
    valorAplicado: 66071.1,
    contrato: 'C-1042',
    empreendimento: 'VERANO',
    empreendimentoId: empreendimento.id,
    dataReferencia: '2026-05-28',
    regraVinculo: 'contrato',
    confiancaVinculo: 'alta',
  });

  // Caso 2 — vinculo ambiguo: tres candidatos, nenhum escolhido.
  const ambiguidade = await registrarAmbiguidade({
    fonte: 'consolidacao',
    entidade: 'cliente',
    chaveUsada: 'MARIA APARECIDA SILVA',
    regraVinculo: 'nome',
    candidatos: [
      {
        fonte: 'monday',
        id_origem: 'item-12001',
        campo: 'cliente',
        valor: 'MARIA APARECIDA SILVA',
        data_referencia: '2026-05-10',
      },
      {
        fonte: 'sienge',
        id_origem: 'cli-77',
        campo: 'cliente',
        valor: 'MARIA APARECIDA SILVA',
        data_referencia: '2026-05-28',
      },
      {
        fonte: 'sienge',
        id_origem: 'cli-91',
        campo: 'cliente',
        valor: 'MARIA APARECIDA SILVA',
        data_referencia: '2026-05-28',
      },
    ],
    empreendimentoId: empreendimento.id,
  });

  return { divergenciaId: divergencia.id, ambiguidadeId: ambiguidade.id };
}

async function principal(): Promise<void> {
  const { divergenciaId, ambiguidadeId } = await prepararDados();

  secao('AUTENTICACAO');
  const login = await chamar('POST', '/api/auth/login', { usuario: USUARIO, senha: SENHA });
  if (login.status !== 200) {
    console.error('Login falhou:', login.corpo);
    process.exit(1);
  }
  token = (login.corpo as { token: string }).token;
  console.log(`\nSessao iniciada como ${USUARIO} (token de ${token.length} caracteres, opaco).`);

  secao('REQUISITO 8 — CATALOGO DE TIPOS');
  const cat = await chamar('GET', '/api/cobranca/inconsistencias/catalogo');
  const tipos = (cat.corpo as { tipos: unknown[] }).tipos;
  console.log(`\n${tipos.length} tipos catalogados. Amostra:`);
  mostrar('primeiros tres', tipos.slice(0, 3));

  secao('RESUMO PARA OS CARTOES DA TELA');
  mostrar('GET /resumo', (await chamar('GET', '/api/cobranca/inconsistencias/resumo')).corpo);

  secao('REQUISITO 13 — LISTA COM FILTROS');
  const lista = await chamar(
    'GET',
    '/api/cobranca/inconsistencias?gravidade=critica&status=pendente',
  );
  mostrar('GET ?gravidade=critica&status=pendente', lista.corpo);

  secao('REQUISITOS 1 a 5 — OS DOIS VALORES, FONTES, IDS, REGRA E CONFIANCA');
  const detalhe = await chamar('GET', `/api/cobranca/inconsistencias/${divergenciaId}`);
  mostrar(`GET /${divergenciaId}`, detalhe.corpo);

  secao('REQUISITO 14 — REGISTRO ORIGINAL DO MONDAY E DO SIENGE');
  mostrar(
    `GET /${divergenciaId}/origem`,
    (await chamar('GET', `/api/cobranca/inconsistencias/${divergenciaId}/origem`)).corpo,
  );

  secao('REQUISITO 6 — AMBIGUIDADE SEM ESCOLHA AUTOMATICA');
  const ambiguo = await chamar('GET', `/api/cobranca/inconsistencias/${ambiguidadeId}`);
  const corpoAmbiguo = ambiguo.corpo as Record<string, unknown>;
  mostrar('candidatos preservados, nenhum eleito', {
    tipo: corpoAmbiguo.tipo,
    gravidade: corpoAmbiguo.gravidade,
    confianca_vinculo: corpoAmbiguo.confianca_vinculo,
    regra_vinculo: corpoAmbiguo.regra_vinculo,
    bloqueia_indicador: corpoAmbiguo.bloqueia_indicador,
    valor_aplicado: corpoAmbiguo.valor_aplicado,
    precedencia_aplicada: corpoAmbiguo.precedencia_aplicada,
    candidatos: corpoAmbiguo.valores_em_conflito,
  });

  secao('REQUISITO 7 — ATRIBUICAO DE RESPONSAVEL');
  const eu = await chamar('GET', '/api/auth/eu');
  const meuId = ((eu.corpo as { usuario: { id: string } }).usuario).id;
  mostrar(
    'POST /responsavel',
    (await chamar('POST', `/api/cobranca/inconsistencias/${divergenciaId}/responsavel`, {
      responsavel_id: meuId,
    })).corpo,
  );

  secao('REQUISITO 9 — ANALISE');
  mostrar(
    'POST /analise',
    (await chamar('POST', `/api/cobranca/inconsistencias/${divergenciaId}/analise`, {
      analise:
        'As datas de referencia sao diferentes: o Monday traz a posicao de 04/03 e o Sienge a de 28/05. Nao ha erro de valor, ha defasagem de leitura.',
      impacto: 'valor_financeiro',
    })).corpo,
  );

  secao('REQUISITO 10 — ENCERRAMENTO EXIGE DECISAO E JUSTIFICATIVA');
  const semJustificativa = await chamar(
    'POST',
    `/api/cobranca/inconsistencias/${divergenciaId}/encerrar`,
    { status: 'resolvida', decisao: 'manter sienge' },
  );
  mostrar('sem justificativa — recusado', {
    status_http: semJustificativa.status,
    ...(semJustificativa.corpo as object),
  });

  mostrar(
    'com decisao e justificativa — aceito',
    (await chamar('POST', `/api/cobranca/inconsistencias/${divergenciaId}/encerrar`, {
      status: 'resolvida',
      decisao: 'Mantido o saldo do Sienge: R$ 66.071,10.',
      justificativa:
        'Precedencia financeira e do Sienge e a posicao de 28/05 e a mais recente. O valor do Monday permanece registrado para auditoria.',
    })).corpo,
  );

  secao('REQUISITO 11 — HISTORICO COMPLETO');
  mostrar(
    `GET /${divergenciaId}/historico`,
    (await chamar('GET', `/api/cobranca/inconsistencias/${divergenciaId}/historico`)).corpo,
  );

  secao('REQUISITO 12 — OS VALORES ORIGINAIS DEPOIS DE RESOLVIDA');
  const depois = await chamar('GET', `/api/cobranca/inconsistencias/${divergenciaId}`);
  const corpoDepois = depois.corpo as Record<string, unknown>;
  mostrar('valores em conflito permanecem intactos', {
    status: corpoDepois.status,
    decisao: corpoDepois.decisao,
    valores_em_conflito: corpoDepois.valores_em_conflito,
  });

  secao('REQUISITO 15 — TRILHA DE AUDITORIA GERADA POR ESTA DEMONSTRACAO');
  const trilha = await db
    .selectFrom('logs_auditoria')
    .select(['ocorrido_em', 'acao', 'usuario_nome', 'recurso', 'resultado', 'detalhe'])
    .where('recurso', '=', 'inconsistencias')
    .orderBy('id')
    .execute();
  console.log('');
  for (const t of trilha) {
    const operacao = (t.detalhe as { operacao?: string }).operacao ?? '';
    console.log(
      `  ${new Date(t.ocorrido_em).toISOString()}  ${t.acao.padEnd(24)} ${String(t.usuario_nome).padEnd(20)} ${operacao}`,
    );
  }

  console.log('\n');
  await fecharBanco();
}

principal().catch(async (erro) => {
  console.error('Falha:', erro instanceof Error ? erro.message : erro);
  await fecharBanco().catch(() => {});
  process.exit(1);
});
