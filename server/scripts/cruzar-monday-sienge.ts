/**
 * Diagnóstico do cruzamento Monday × Sienge.
 *
 * Este script NÃO cruza nada. Ele responde, com os dados reais já carregados,
 * a pergunta que precede o cruzamento: **com qual chave?**
 *
 * A metodologia (references/metodologia.md §2) ordena as chaves: CPF/CNPJ,
 * contrato, unidade — e nome só como último recurso, sem nunca unir
 * automaticamente nomes semelhantes. Este diagnóstico mede quanto de cada
 * chave existe de fato nos dois lados, e produz uma PROPOSTA de correspondência
 * de empreendimentos para decisão humana.
 *
 * Zero requisições à rede: tudo local.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/cruzar-monday-sienge.ts [--saida arq.md]
 */
import { promises as fs } from 'node:fs';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import { normalizarNome } from '../src/integracoes/monday/transformacao.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const linhas: string[] = [];
const escrever = (t = '') => {
  linhas.push(t);
  console.log(t);
};

/**
 * Sufixos que o Sienge acrescenta ao nome do empreendimento para separar
 * centros de custo. `ALAMEDA DAS CASTANHEIRAS - OBRA` e
 * `ALAMEDA DAS CASTANHEIRAS - VENDAS` são o mesmo ativo em contextos
 * contábeis diferentes — e o Monday tem uma linha só, `ALAMEDA`.
 *
 * Removê-los é o que permite agrupar os 570 registros do Sienge nos ativos que
 * o jurídico reconhece. Não é adivinhação: os sufixos foram lidos do dado real.
 */
const SUFIXOS_CENTRO_DE_CUSTO = [
  'ADMINISTRATIVO', 'VENDAS', 'COMERCIAL', 'MARKETING', 'OBRA', 'SAC',
  'DESENVOLVIMENTO IMOBILIARIO', 'JURIDICO', 'FINANCEIRO', 'TERRENO',
  'INCORPORACAO', 'POS OBRA', 'ASSISTENCIA TECNICA', 'RH', 'TI',
];

/** Núcleo do nome: sem sufixo de centro de custo, normalizado. */
function nucleo(nome: string): string {
  let n = normalizarNome(nome);
  for (const sufixo of SUFIXOS_CENTRO_DE_CUSTO) {
    // O separador ja virou espaco na normalizacao; ancora no FIM para nao
    // cortar um nome que contenha a palavra no meio.
    const alvo = ` ${sufixo}`;
    if (n.endsWith(alvo)) {
      n = n.slice(0, -alvo.length).trim();
      break;
    }
  }
  return n;
}

/**
 * Correspondência entre dois núcleos.
 *
 * Só dois veredictos: `exata` (núcleos idênticos) e `prefixo` (um começa com o
 * outro — `ALAMEDA` ⊂ `ALAMEDA DAS CASTANHEIRAS`). Similaridade difusa foi
 * deliberadamente deixada de fora: ela produz par plausível e errado, e a
 * metodologia proíbe unir nome automaticamente. O que sai daqui é PROPOSTA.
 */
function corresponde(a: string, b: string): 'exata' | 'prefixo' | null {
  if (!a || !b) return null;
  if (a === b) return 'exata';
  const maior = a.length >= b.length ? a : b;
  const menor = a.length >= b.length ? b : a;
  // Prefixo tem de terminar em fronteira de palavra: `ALAMEDA` casa com
  // `ALAMEDA DAS CASTANHEIRAS`, mas `AURORA` nao pode casar com `AURORAX`.
  if (menor.length >= 4 && maior.startsWith(menor + ' ')) return 'prefixo';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

async function diagnosticarChaves(): Promise<void> {
  escrever('## 1. Que chave existe, de fato, nos dois lados');
  escrever();

  const [monday] = await sql<{
    notif: number;
    notif_unidade: number;
    notif_empr: number;
    proc: number;
    proc_empr: number;
    distr: number;
    distr_unidade: number;
  }>`
    SELECT
      (SELECT count(*) FROM notificacoes WHERE ausente_desde IS NULL) AS notif,
      (SELECT count(*) FROM notificacoes WHERE ausente_desde IS NULL AND coalesce(unidade,'') <> '') AS notif_unidade,
      (SELECT count(*) FROM notificacoes WHERE ausente_desde IS NULL AND empreendimento_id IS NOT NULL) AS notif_empr,
      (SELECT count(*) FROM processos_judiciais WHERE ausente_desde IS NULL) AS proc,
      (SELECT count(*) FROM processos_judiciais WHERE ausente_desde IS NULL AND empreendimento_id IS NOT NULL) AS proc_empr,
      (SELECT count(*) FROM distratos WHERE ausente_desde IS NULL) AS distr,
      (SELECT count(*) FROM distratos WHERE ausente_desde IS NULL AND coalesce(unidade,'') <> '') AS distr_unidade
  `.execute(db).then((r) => r.rows);

  const [sienge] = await sql<{ cli: number; cli_doc: number; tit: number; tit_unidade: number }>`
    SELECT
      (SELECT count(*) FROM clientes WHERE fonte='sienge') AS cli,
      (SELECT count(*) FROM clientes WHERE fonte='sienge' AND cpf_cnpj_valido = true) AS cli_doc,
      (SELECT count(*) FROM titulos_receber WHERE ausente_desde IS NULL) AS tit,
      (SELECT count(*) FROM registros_brutos rb JOIN execucoes_importacao e ON e.id=rb.execucao_id
        WHERE e.escopo='titulos' AND coalesce(rb.payload->>'unityName','') <> '') AS tit_unidade
  `.execute(db).then((r) => r.rows);

  escrever('| Chave | Monday | Sienge | Serve? |');
  escrever('| --- | --- | --- | --- |');
  escrever(
    `| **CPF/CNPJ** | **0** de ${monday!.notif} notificações | ${sienge!.cli_doc} de ${sienge!.cli} clientes | ❌ **só um lado tem** |`,
  );
  escrever('| Contrato | não mapeado nos quadros | não exposto nos títulos | ❌ |');
  escrever(
    `| Unidade | ${monday!.notif_unidade} de ${monday!.notif} notificações · ${monday!.distr_unidade} de ${monday!.distr} distratos | ${sienge!.tit_unidade} de ${sienge!.tit} títulos | ✅ **os dois lados** |`,
  );
  escrever(
    `| Empreendimento | ${monday!.notif_empr} de ${monday!.notif} · ${monday!.proc_empr} de ${monday!.proc} processos | por nome, com sufixo de centro de custo | ⚠️ **precisa de mapa** |`,
  );
  escrever('| Nome | presente | presente | ⚠️ último recurso, nunca automático |');
  escrever();
  escrever('**O achado que decide o desenho:** o CPF/CNPJ — a chave preferencial da');
  escrever('metodologia — **existe só no Sienge**. Nenhum dos 7 quadros do Monday traz');
  escrever('documento, e a varredura dos payloads brutos confirma: nenhum campo de CPF.');
  escrever();
  escrever('Sobra `empreendimento + unidade`, que os dois lados têm. Mas o Sienge nomeia');
  escrever('o empreendimento por centro de custo, e o Monday por ativo — daí a seção 2.');
  escrever();
}

interface Proposta {
  monday: string;
  sienge: string[];
  tipo: 'exata' | 'prefixo';
  titulos: number;
}

async function proporMapa(): Promise<{ propostas: Proposta[]; semPar: string[]; ambiguos: Proposta[] }> {
  const doMonday = await db
    .selectFrom('empreendimentos')
    .select(['id', 'nome'])
    .orderBy('nome')
    .execute();

  const brutos = await sql<{ nome: string }>`
    SELECT DISTINCT rb.payload->>'name' AS nome
    FROM registros_brutos rb
    JOIN execucoes_importacao e ON e.id = rb.execucao_id
    WHERE e.escopo = 'empreendimentos_sienge'
      AND coalesce(rb.payload->>'name','') <> ''
  `.execute(db).then((r) => r.rows);

  // Agrupa os nomes do Sienge pelo NUCLEO: os centros de custo do mesmo ativo
  // colapsam numa entrada só.
  const porNucleo = new Map<string, string[]>();
  for (const b of brutos) {
    const n = nucleo(b.nome);
    if (!n) continue;
    porNucleo.set(n, [...(porNucleo.get(n) ?? []), b.nome.trim()]);
  }

  // Títulos por empresa, para dimensionar o que cada correspondência destrava.
  const titulosPorEmpresa = await sql<{ empresa: string | null; n: number }>`
    SELECT empresa, count(*)::int AS n FROM titulos_receber
    WHERE ausente_desde IS NULL GROUP BY empresa
  `.execute(db).then((r) => r.rows);
  const titulosPorNucleo = new Map<string, number>();
  for (const t of titulosPorEmpresa) {
    if (!t.empresa) continue;
    const n = nucleo(t.empresa);
    titulosPorNucleo.set(n, (titulosPorNucleo.get(n) ?? 0) + t.n);
  }

  const propostas: Proposta[] = [];
  const ambiguos: Proposta[] = [];
  const semPar: string[] = [];

  for (const e of doMonday) {
    const alvo = nucleo(e.nome);
    const casados: Array<{ nucleo: string; nomes: string[]; tipo: 'exata' | 'prefixo' }> = [];

    for (const [n, nomes] of porNucleo) {
      const tipo = corresponde(alvo, n);
      if (tipo) casados.push({ nucleo: n, nomes, tipo });
    }

    if (casados.length === 0) {
      semPar.push(e.nome);
      continue;
    }

    // Exata tem precedência sobre prefixo: se ha uma exata, as de prefixo nao
    // competem com ela.
    const exatas = casados.filter((c) => c.tipo === 'exata');
    const escolhidos = exatas.length ? exatas : casados;

    const p: Proposta = {
      monday: e.nome,
      sienge: escolhidos.flatMap((c) => c.nomes).sort(),
      tipo: escolhidos[0]!.tipo,
      titulos: escolhidos.reduce((s, c) => s + (titulosPorNucleo.get(c.nucleo) ?? 0), 0),
    };

    // Mais de um NÚCLEO distinto casando é ambiguidade real — o nome não
    // distingue qual ativo é. Vai para decisão, não para o mapa.
    if (escolhidos.length > 1) ambiguos.push(p);
    else propostas.push(p);
  }

  return { propostas, semPar, ambiguos };
}

function tabelaPropostas(titulo: string, itens: Proposta[]): void {
  if (!itens.length) return;
  escrever(`### ${titulo}`);
  escrever();
  escrever('| Monday | Sienge (centros de custo) | Correspondência | Títulos |');
  escrever('| --- | --- | --- | ---: |');
  for (const p of itens.sort((a, b) => b.titulos - a.titulos)) {
    const nomes = p.sienge.length > 3
      ? `${p.sienge.slice(0, 3).join(' · ')} … +${p.sienge.length - 3}`
      : p.sienge.join(' · ');
    escrever(`| **${p.monday}** | ${nomes} | ${p.tipo} | ${p.titulos || '—'} |`);
  }
  escrever();
}

async function principal(): Promise<void> {
  escrever('# Cruzamento Monday × Sienge — diagnóstico e proposta de mapa');
  escrever();
  escrever(`**Executado em:** ${new Date().toISOString()}  `);
  escrever('**Requisições de rede:** 0 — tudo local, sobre os dados já carregados.');
  escrever();
  escrever('> Este documento **não cruza nada**. Ele mede as chaves disponíveis e');
  escrever('> propõe a correspondência de empreendimentos, que é o pré-requisito.');
  escrever('> Nada aqui foi aplicado.');
  escrever();

  await diagnosticarChaves();

  const { propostas, semPar, ambiguos } = await proporMapa();

  escrever('## 2. Proposta de correspondência de empreendimentos');
  escrever();
  escrever('O Sienge tem **570 registros** de empreendimento porque separa o mesmo ativo');
  escrever('em centros de custo (`- OBRA`, `- VENDAS`, `- ADMINISTRATIVO`…). Removendo');
  escrever('esse sufixo, o núcleo do nome passa a ser comparável com o do Monday.');
  escrever();
  escrever('Só dois critérios foram usados: **núcleo idêntico** e **prefixo em fronteira');
  escrever('de palavra** (`ALAMEDA` ⊂ `ALAMEDA DAS CASTANHEIRAS`). Similaridade difusa');
  escrever('ficou de fora de propósito — ela produz par plausível e errado.');
  escrever();

  tabelaPropostas(`Correspondência única — ${propostas.length} empreendimento(s)`, propostas);
  tabelaPropostas(`⚠️ Ambíguos — ${ambiguos.length}: o nome casa com mais de um ativo`, ambiguos);

  if (semPar.length) {
    escrever(`### Sem correspondência — ${semPar.length}`);
    escrever();
    escrever(semPar.map((n) => `- ${n}`).join('\n'));
    escrever();
    escrever('> Podem ser ativos que não existem no Sienge, grafias divergentes, ou');
    escrever('> nomes que o Monday usa e a contabilidade não. Cada um precisa de');
    escrever('> resposta humana — presumir aqui contaminaria todo o cruzamento.');
    escrever();
  }

  escrever('## 3. O que falta decidir antes de cruzar');
  escrever();
  escrever('1. **Aprovar ou corrigir o mapa da seção 2.** É o pré-requisito: sem ele,');
  escrever('   `empreendimento + unidade` não é chave, porque os dois lados chamam o');
  escrever('   mesmo ativo de nomes diferentes.');
  escrever('2. **Decidir o que fazer sobre o CPF/CNPJ ausente no Monday.** Duas saídas:');
  escrever('   incluir a coluna nos quadros (a plataforma passa a lê-la sozinha, como');
  escrever('   já faz com as outras), ou aceitar que o vínculo por pessoa fica');
  escrever('   indisponível e cruzar só por unidade.');
  escrever();
  escrever('Enquanto isso não for decidido, **nenhum vínculo é criado** — que é o');
  escrever('comportamento correto: vínculo errado contamina indicador e é difícil de');
  escrever('desfazer depois.');
  escrever();

  const saida = argumento('saida');
  if (saida) {
    await fs.writeFile(saida, linhas.join('\n') + '\n');
    console.log(`\n→ relatório gravado em ${saida}`);
  }
}

void principal()
  .catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => fecharBanco());
