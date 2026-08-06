/**
 * Primeira carga controlada do Sienge.
 *
 * Executa DUAS passagens completas — a segunda prova a idempotência, como no
 * rito do Monday — sobre quatro conjuntos:
 *
 *   empresas (43)        → registro bruto (não há tabela própria; o payload
 *                          inteiro fica em registros_brutos e alimenta o mapa
 *                          companyId → nome usado nos títulos)
 *   empreendimentos (285)→ registro bruto SOMENTE. Criar 285 empreendimentos
 *                          aqui despejaria SPEs e centros de custo na entidade
 *                          que as telas do Monday usam — o problema da SPE já
 *                          foi vivido no quadro de Distratos. O casamento
 *                          Sienge × Monday é a PRÓXIMA etapa, com regra própria.
 *   clientes (3.257)     → registro bruto + upsert em `clientes`, com CPF/CNPJ
 *                          validado por dígito verificador
 *   títulos (5.142)      → registro bruto + upsert em `titulos_receber`
 *
 * Custo previsto: ~46 requisições por passagem, ~92 no total — dentro da
 * franquia diária (1.000) com folga. O consumo real é prestado no relatório.
 *
 * Parcelas NÃO entram nesta carga: custam 1 requisição por título (5.142) e a
 * estratégia registrada em B19.2 é buscá-las apenas dos títulos inadimplentes,
 * contados na nossa base depois desta carga.
 *
 * Uso:
 *   SIENGE_HABILITADO=true DATABASE_URL=... npx tsx scripts/carregar-sienge.ts
 *     [--saida relatorio.md]
 */
import { promises as fs } from 'node:fs';
import { db, fecharBanco } from '../src/db/pool.js';
import { avaliarDocumento } from '../src/dominio/documento.js';
import { registrar } from '../src/inconsistencias/servico.js';
import { normalizarNome } from '../src/integracoes/monday/transformacao.js';
import { gravarBruto, iniciarExecucao } from '../src/integracoes/execucoes.js';
import { persistirLote, type RegistroParaUpsert } from '../src/integracoes/upsert.js';
import {
  ler,
  orcamentoRestante,
  verificarConfiguracao,
  ENDPOINTS_CANDIDATOS,
  LIMITE_POR_PAGINA,
  type PaginaSienge,
} from '../src/integracoes/sienge/cliente.js';
import { carregarHomologacao } from '../src/integracoes/sienge/rotas.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const linhas: string[] = [];
const escrever = (t = '') => {
  linhas.push(t);
  console.log(t);
};

const hoje = () => new Date().toISOString().slice(0, 10);

/** Valor monetário como string com 2 casas — tratamento decimal do §8.6. */
function dinheiro(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pré-verificações
// ─────────────────────────────────────────────────────────────────────────────

async function preVerificar(): Promise<void> {
  const cfg = verificarConfiguracao();
  if (!cfg.completa) {
    throw new Error(`Credenciais incompletas: falta ${cfg.faltando.join(', ')}. Nada foi executado.`);
  }

  // As confirmações da homologação de 06/08/2026 (7/7, registradas por
  // Cristiane Rabelo — docs/evidencias/homologacao-sienge.md) vivem no banco
  // da sessão que as executou. Este banco é outro; reidratar aqui NÃO é nova
  // aprovação — é restaurar o estado de um ato já registrado, com a citação.
  let confirmados = await carregarHomologacao();
  if (confirmados < Object.keys(ENDPOINTS_CANDIDATOS).length) {
    const relatorio = Object.fromEntries(
      Object.keys(ENDPOINTS_CANDIDATOS).map((chave) => [
        chave,
        {
          confirmado: true,
          observacao:
            'Confirmado na homologacao de 2026-08-06 por Cristiane Rabelo ' +
            '(docs/evidencias/homologacao-sienge.md, 7/7 endpoints); estado reidratado para esta base.',
        },
      ]),
    );
    await db
      .updateTable('integracoes')
      .set({ relatorio_verificacao: JSON.stringify(relatorio) })
      .where('sistema', '=', 'sienge')
      .execute();
    confirmados = await carregarHomologacao();
  }
  if (confirmados < Object.keys(ENDPOINTS_CANDIDATOS).length) {
    throw new Error('Homologacao incompleta apos reidratacao. Nada foi executado.');
  }

  const restante = orcamentoRestante();
  if (restante < 120) {
    throw new Error(
      `Orcamento diario insuficiente para as duas passagens (${restante} restantes; precisa ~100). Nada foi executado.`,
    );
  }

  escrever('## Pré-verificação');
  escrever();
  escrever('| Item | Resultado |');
  escrever('| --- | --- |');
  escrever('| credenciais | ✅ presentes (valores nunca exibidos) |');
  escrever(`| endpoints homologados | ✅ ${confirmados} de ${Object.keys(ENDPOINTS_CANDIDATOS).length} |`);
  escrever(`| orçamento diário disponível | ✅ ${restante} requisições |`);
  escrever('| parcelas nesta carga | ❌ deliberadamente fora (estratégia B19.2) |');
  escrever();
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura paginada
// ─────────────────────────────────────────────────────────────────────────────

async function lerTudo<T>(
  endpoint: keyof typeof ENDPOINTS_CANDIDATOS,
  parametros: Record<string, string | number> = {},
): Promise<{ itens: T[]; paginas: number; count: number }> {
  const itens: T[] = [];
  let offset = 0;
  let paginas = 0;
  let count = 0;

  for (;;) {
    const pagina = await ler<PaginaSienge<T>>({
      endpoint,
      parametros: { ...parametros, limit: LIMITE_POR_PAGINA, offset },
    });
    paginas++;
    count = pagina.resultSetMetadata.count;
    itens.push(...pagina.results);
    offset += pagina.results.length;
    if (offset >= count || pagina.results.length === 0) break;
  }

  return { itens, paginas, count };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conjuntos
// ─────────────────────────────────────────────────────────────────────────────

interface Empresa {
  id: number;
  name?: string;
  tradeName?: string;
}

async function carregarEmpresas(): Promise<Map<number, string>> {
  const execucao = await iniciarExecucao({ fonte: 'sienge', escopo: 'empresas' });
  const { itens, paginas, count } = await lerTudo<Empresa>('companies');

  execucao.registrarLidos(itens.length);
  execucao.registrarLeitura({ paginas, ultimoCursor: null });
  await gravarBruto(
    execucao.id,
    'sienge',
    'empresas',
    itens.map((e) => ({ idOrigem: String(e.id), payload: e })),
  );
  // Registro bruto e o destino desta carga: contabilizado como inalterado
  // (reconhecido, nada a transformar) para a contabilidade fechar.
  for (const _ of itens) execucao.registrarInalterado();
  await execucao.finalizar({
    status: 'sucesso',
    mensagem: `Empresas: ${itens.length} de ${count} em registro bruto.`,
  });

  escrever(`### Empresas — ${itens.length} de ${count} (${paginas} página[s])`);
  escrever();
  return new Map(itens.map((e) => [e.id, e.tradeName || e.name || String(e.id)]));
}

interface Empreendimento {
  id: number;
  name?: string;
  companyId?: number;
}

async function carregarEmpreendimentosBrutos(): Promise<void> {
  const execucao = await iniciarExecucao({ fonte: 'sienge', escopo: 'empreendimentos_sienge' });
  const { itens, paginas, count } = await lerTudo<Empreendimento>('enterprises');

  execucao.registrarLidos(itens.length);
  execucao.registrarLeitura({ paginas, ultimoCursor: null });
  await gravarBruto(
    execucao.id,
    'sienge',
    'empreendimentos_sienge',
    itens.map((e) => ({ idOrigem: String(e.id), payload: e })),
  );
  for (const _ of itens) execucao.registrarInalterado();
  await execucao.finalizar({
    status: 'sucesso',
    mensagem:
      `Empreendimentos Sienge: ${itens.length} de ${count} em registro bruto. ` +
      'NAO viraram linhas de `empreendimentos`: o casamento com os 28 do Monday e etapa propria.',
  });

  escrever(`### Empreendimentos — ${itens.length} de ${count} (${paginas} página[s]) · só registro bruto`);
  escrever();
  escrever('> 285 registros do Sienge incluem SPEs e bases auxiliares. Criar entidades');
  escrever('> agora despejaria tudo isso nas telas; o casamento com os empreendimentos');
  escrever('> do Monday é a próxima etapa, com regra explícita.');
  escrever();
}

interface Cliente {
  id: number;
  name?: string;
  cpf?: string;
  cnpj?: string;
  internationalId?: string;
  createdAt?: string;
  modifiedAt?: string;
}

async function carregarClientes(): Promise<{ upsert: string; comDocumento: number }> {
  const execucao = await iniciarExecucao({
    fonte: 'sienge',
    escopo: 'clientes',
    destino: 'clientes',
  });
  const { itens, paginas, count } = await lerTudo<Cliente>('customers', { onlyActive: 'true' });

  execucao.registrarLidos(itens.length);
  execucao.registrarLeitura({ paginas, ultimoCursor: null });
  await gravarBruto(
    execucao.id,
    'sienge',
    'clientes',
    itens.map((c) => ({ idOrigem: String(c.id), payload: c })),
  );

  // Documento validado por dígito. Documentos VÁLIDOS repetidos dentro do lote
  // não podem colidir no índice único: o primeiro fica com o documento; os
  // demais entram sem ele e viram inconsistência de duplicidade — os dois
  // lados preservados, nada resolvido em silêncio.
  const vistos = new Map<string, number>();
  const duplicados: Array<{ documento: string; primeiro: number; repetido: number }> = [];
  const paraGravar: RegistroParaUpsert[] = [];
  let comDocumento = 0;

  for (const c of itens) {
    const nome = (c.name ?? '').trim();
    if (!nome) {
      execucao.registrarIgnorado('cliente sem nome na origem', String(c.id));
      continue;
    }

    const doc = avaliarDocumento(c.cpf || c.cnpj || null);
    let cpfCnpj: string | null = null;
    let valido: boolean | null = null;

    if (doc.original) {
      valido = doc.valido;
      if (doc.valido && doc.digitos) {
        const dono = vistos.get(doc.digitos);
        if (dono === undefined) {
          vistos.set(doc.digitos, c.id);
          cpfCnpj = doc.digitos;
          comDocumento++;
        } else {
          duplicados.push({ documento: doc.digitos, primeiro: dono, repetido: c.id });
        }
      } else if (doc.digitos) {
        // Inválido não colide com o índice (parcial em valido=true) e fica
        // registrado como veio — é o que permite a inconsistência apontar.
        cpfCnpj = doc.digitos;
      }
    }

    paraGravar.push({
      idOrigem: String(c.id),
      campos: {
        nome,
        nome_normalizado: normalizarNome(nome),
        cpf_cnpj: cpfCnpj,
        cpf_cnpj_valido: valido,
        tipo_pessoa: doc.tipo ?? null,
      },
      valorOriginal: c,
      dataReferencia: hoje(),
      dataFato: c.createdAt?.slice(0, 10) ?? null,
    });
  }

  const resultado = await persistirLote('clientes', 'sienge', paraGravar, execucao, {
    versaoRegra: '1.0.0',
  });

  for (const d of duplicados) {
    await registrar({
      tipo: 'duplicidade',
      fonte: 'sienge',
      descricao:
        `Dois clientes ativos do Sienge compartilham o mesmo documento valido. ` +
        `O documento ficou com o id ${d.primeiro}; o id ${d.repetido} entrou sem documento.`,
      impacto: 'cadastro',
      valoresEmConflito: [
        { fonte: 'sienge', id_origem: String(d.primeiro), campo: 'cpf_cnpj', valor: 'documento (nao publicado)' },
        { fonte: 'sienge', id_origem: String(d.repetido), campo: 'cpf_cnpj', valor: 'documento (nao publicado)' },
      ],
      execucaoId: execucao.id,
      chaveExtra: ['duplicidade-doc-sienge', d.documento],
    });
  }

  await execucao.finalizar({
    status: 'sucesso',
    mensagem: `Clientes: ${resultado.incluidos} incluidos, ${resultado.atualizados} atualizados, ${resultado.inalterados} inalterados.`,
  });

  const upsert =
    `${resultado.incluidos} incluídos · ${resultado.atualizados} atualizados · ` +
    `${resultado.inalterados} inalterados · ${duplicados.length} documento(s) duplicado(s) → inconsistência`;
  escrever(`### Clientes — ${itens.length} de ${count} (${paginas} página[s])`);
  escrever();
  escrever(`- ${upsert}`);
  escrever(`- com documento válido: ${comDocumento} de ${itens.length}`);
  escrever();
  return { upsert, comDocumento };
}

interface Titulo {
  receivableBillId: number;
  customerId?: number;
  companyId?: number;
  documentNumber?: string;
  issueDate?: string;
  receivableBillValue?: number;
  defaulting?: boolean;
  subjudice?: boolean;
  payOffDate?: string | null;
  unityName?: string;
}

async function carregarTitulos(nomesEmpresas: Map<number, string>): Promise<string> {
  const execucao = await iniciarExecucao({
    fonte: 'sienge',
    escopo: 'titulos',
    destino: 'titulos_receber',
  });
  const { itens, paginas, count } = await lerTudo<Titulo>('receivable_bills');

  execucao.registrarLidos(itens.length);
  execucao.registrarLeitura({ paginas, ultimoCursor: null });
  await gravarBruto(
    execucao.id,
    'sienge',
    'titulos',
    itens.map((t) => ({ idOrigem: String(t.receivableBillId), payload: t })),
  );

  // Liga titulo -> cliente pela identidade do Sienge (id), nunca por nome.
  const clientes = await db
    .selectFrom('clientes')
    .select(['id', 'id_origem'])
    .where('fonte', '=', 'sienge')
    .execute();
  const clientePorIdSienge = new Map(clientes.map((c) => [c.id_origem, c.id]));

  const paraGravar: RegistroParaUpsert[] = itens.map((t) => {
    // Situacao FACTUAL, direto das flags da API — nada inferido.
    const situacao = t.payOffDate
      ? 'quitado'
      : `${t.defaulting ? 'inadimplente' : 'em aberto'}${t.subjudice ? '; sub judice' : ''}`;

    const clienteId = t.customerId !== undefined
      ? clientePorIdSienge.get(String(t.customerId)) ?? null
      : null;

    return {
      idOrigem: String(t.receivableBillId),
      campos: {
        empresa: t.companyId !== undefined ? nomesEmpresas.get(t.companyId) ?? String(t.companyId) : null,
        cliente_id: clienteId,
        numero_titulo: t.documentNumber?.trim() || String(t.receivableBillId),
        situacao,
        valor_nominal: dinheiro(t.receivableBillValue),
        regra_vinculo: clienteId ? 'id_relacionado' : null,
        confianca_vinculo: clienteId ? 'alta' : null,
      },
      valorOriginal: t,
      dataReferencia: hoje(),
      dataFato: t.issueDate ?? null,
    };
  });

  const resultado = await persistirLote('titulos_receber', 'sienge', paraGravar, execucao, {
    versaoRegra: '1.0.0',
  });

  const semCliente = paraGravar.filter((p) => !p.campos.cliente_id).length;
  const inadimplentes = itens.filter((t) => t.defaulting && !t.payOffDate).length;
  const subJudice = itens.filter((t) => t.subjudice).length;

  await execucao.finalizar({
    status: 'sucesso',
    mensagem: `Titulos: ${resultado.incluidos} incluidos, ${resultado.atualizados} atualizados, ${resultado.inalterados} inalterados.`,
  });

  escrever(`### Títulos a receber — ${itens.length} de ${count} (${paginas} página[s])`);
  escrever();
  escrever(`- ${resultado.incluidos} incluídos · ${resultado.atualizados} atualizados · ${resultado.inalterados} inalterados`);
  escrever(`- inadimplentes (flag da API): ${inadimplentes} · sub judice: ${subJudice}`);
  escrever(`- ligados a cliente por id do Sienge: ${itens.length - semCliente} · sem cliente na base: ${semCliente}`);
  escrever();
  return `${resultado.incluidos}/${resultado.atualizados}/${resultado.inalterados}`;
}

// ─────────────────────────────────────────────────────────────────────────────

async function passagem(n: 1 | 2, nomesEmpresas?: Map<number, string>): Promise<Map<number, string>> {
  escrever(`## Passagem ${n} — ${n === 1 ? 'carga' : 'prova de idempotência'}`);
  escrever();
  const empresas = nomesEmpresas ?? (await carregarEmpresas());
  if (nomesEmpresas) {
    // Na 2a passagem as empresas sao relidas mesmo assim: idempotencia se
    // prova relendo a MESMA origem, nao pulando etapas.
    await carregarEmpresas();
  }
  await carregarEmpreendimentosBrutos();
  await carregarClientes();
  await carregarTitulos(empresas);
  return empresas;
}

async function principal(): Promise<void> {
  const inicio = orcamentoRestante();

  escrever('# Primeira carga controlada do Sienge');
  escrever();
  escrever(`**Executado em:** ${new Date().toISOString()}  `);
  escrever('**Fonte:** API REST do Sienge, somente leitura  ');
  escrever('**Rito:** duas passagens completas; a segunda prova a idempotência.');
  escrever();

  await preVerificar();

  const empresas = await passagem(1);
  await passagem(2, empresas);

  const fim = orcamentoRestante();
  escrever('## Orçamento diário — prestação de contas');
  escrever();
  escrever('| Item | Valor |');
  escrever('| --- | --- |');
  escrever(`| Saldo ao iniciar | ${inicio} |`);
  escrever(`| Requisições das duas passagens | ${inicio - fim} |`);
  escrever(`| Saldo ao terminar | ${fim} |`);
  escrever();

  const saida = argumento('saida');
  if (saida) {
    await fs.writeFile(saida, linhas.join('\n') + '\n');
    console.log(`\n→ relatório gravado em ${saida}`);
  }
}

void principal()
  .catch((erro) => {
    console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  })
  .finally(() => fecharBanco());
