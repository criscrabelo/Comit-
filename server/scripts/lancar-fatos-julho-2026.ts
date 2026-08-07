/**
 * Lanca os Fatos Relevantes de Julho/2026 no comite correspondente.
 *
 * Origem: relato do juridico (Thamar) em 07/08/2026, transcrito sem alteracao
 * de conteudo. O texto de cada fato e o texto recebido; nada foi resumido,
 * completado ou interpretado.
 *
 * Uso:
 *   npx tsx scripts/lancar-fatos-julho-2026.ts
 *   npx tsx scripts/lancar-fatos-julho-2026.ts --confirmar
 *
 * Sem --confirmar ele apenas mostra o que faria. Rodar de novo e seguro: um
 * fato ja lancado com o mesmo titulo e a mesma data e reconhecido e preservado.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.DATABASE_URL) {
  const caminhoEnv = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (existsSync(caminhoEnv)) {
    for (const linha of readFileSync(caminhoEnv, 'utf8').split(/\r?\n/)) {
      if (/^\s*#/.test(linha)) continue;
      const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && m[2] !== undefined) {
        const valor = m[2].trim().replace(/^["']|["']$/g, '');
        if (valor !== '' && process.env[m[1]!] === undefined) process.env[m[1]!] = valor;
      }
    }
  }
}

const { db, fecharBanco } = await import('../src/db/pool.js');
const { normalizarNome } = await import('../src/integracoes/monday/transformacao.js');

const COMPETENCIA = '2026-07';
const confirmar = process.argv.includes('--confirmar');

interface FatoDeEntrada {
  data: string;
  titulo: string;
  descricao: string;
  /** Nome do empreendimento citado no relato, quando ha um. */
  empreendimento?: string;
  /** Texto que chegou cortado na origem e precisa ser completado por pessoa. */
  truncado?: boolean;
}

/**
 * Os fatos, na ordem cronologica do relato.
 *
 * As quatro recompras sao as mesmas quatro unidades que o quadro do Monday ja
 * traz como recompra em andamento em julho — 001 A, 010 C, 1001 B e 605 C.
 * O relato acrescenta o que o quadro nao tem: o lucro previsto de cada uma.
 */
const FATOS: FatoDeEntrada[] = [
  {
    data: '2026-07-07',
    titulo: 'Memoriais de apelação — restituição de ITBI (Vita Village)',
    descricao:
      'MEMORIAIS APELAÇÃO RESTITUIÇÃO ITBI VITA VILLAGE (SENTENÇA ENTENDEU QUE O '
      + 'MUNICÍPIO DEVE REEMBOLSAR O ITBI PAGO A MAIS POIS TRIBUTOU 2% SOBRE O VALOR '
      + 'DO CONTRATO AO INVÉS DE TRIBUTAR 0,5% SOBRE O VALOR DO TERRENO, MEMORIAIS '
      + 'ENVIADO PARA A TURMA JULGADORA).',
    empreendimento: 'VITA VILLAGE',
  },
  {
    data: '2026-07-07',
    titulo: 'Recompra, procuração e contrato de cessão — unidade 001 A (Verano)',
    descricao:
      'RE-COMPRA + PROCURAÇÃO CARTÓRIO + CONTRATO DE CESSÃO UNIDADE 001 A VERANO '
      + '(LUCRO PREVISTO DE R$ 60.853,13).',
    empreendimento: 'VERANO',
  },
  {
    data: '2026-07-08',
    titulo: 'Recompra, procuração e contrato de cessão — unidade 010 C (Verano)',
    descricao:
      'RE-COMPRA + PROCURAÇÃO CARTÓRIO + CONTRATO DE CESSÃO UNIDADE 010 C VERANO '
      + '(LUCRO PREVISTO DE R$ 63.742,58).',
    empreendimento: 'VERANO',
  },
  {
    data: '2026-07-08',
    titulo: 'Recompra, procuração e contrato de cessão — unidade 1001 B (Verano)',
    descricao:
      'RE-COMPRA + PROCURAÇÃO CARTÓRIO + CONTRATO DE CESSÃO UNIDADE 1001 B VERANO '
      + '(LUCRO PREVISTO DE R$ 52.932,04).',
    empreendimento: 'VERANO',
  },
  {
    data: '2026-07-09',
    titulo: 'Recompra, procuração e contrato de cessão — unidade 605 C (Moratta)',
    descricao:
      'RE-COMPRA + PROCURAÇÃO CARTÓRIO + CONTRATO DE CESSÃO UNIDADE 605 C MORATTA '
      + '(LUCRO PREVISTO DE R$ 57.816,22).',
    empreendimento: 'MORATTA',
  },
  {
    data: '2026-07-16',
    titulo: 'Política psicossocial NR-01 finalizada e assinada',
    descricao: 'POLÍTICA PSICOSSOCIAL NR-01 FINALIZADA E ASSINADA (TETUS).',
  },
  {
    data: '2026-07-24',
    titulo: 'Embargos de declaração — Ipê Home x Bradesco Seguro',
    // O relato chegou cortado. O que falta NAO foi completado: inventar o
    // desfecho de um recurso e o tipo de erro que este projeto existe para
    // evitar. A marcacao fica visivel na tela ate alguem colar o texto inteiro.
    descricao:
      'EMBARGOS DE DECLARAÇÃO IPÊ HOME X BRADESCO SEGURO (DESEMBARGADOR RECONHECEU O '
      + 'FALSO COLETIVO EM SEDE DE AGRAVO DE INSTRUMENTO E DETERMINOU, POR ENQUANTO, A '
      + 'SUBSTITUIÇÃO APENAS DO ÚLTIMO ÍNDICE APLICADO PELA SEGURADORA PELO DA ANS, '
      + 'CONTUDO NÃO SE MANIFESTOU ACERCA DO PAGAMENTO DO VALOR VIA DEPÓSITO JUDICIAL, '
      + 'A IMPOSSIBILIDADE DE COBRANÇA DE MULTA E JUROS DE VALORES RESTANTES, A '
      + 'IMPOSSIB[TEXTO INTERROMPIDO NA ORIGEM — COMPLETAR]).',
    empreendimento: 'IPÊ HOME',
    truncado: true,
  },
];

// ── Comite de julho ─────────────────────────────────────────────────────────
const comite = await db
  .selectFrom('comites')
  .select(['id', 'rotulo'])
  .where('competencia_ref', '=', COMPETENCIA)
  .executeTakeFirst();

if (!comite) {
  console.error(
    `Nao existe comite para a competencia ${COMPETENCIA}.\n`
    + 'Crie o comite na tela (+ Mes -> Julho -> 2026) e rode de novo.',
  );
  await fecharBanco();
  process.exit(1);
}

// ── Empreendimentos citados ─────────────────────────────────────────────────
// Vinculo so por correspondencia exata do nome normalizado. Sem palpite: um
// fato ligado ao empreendimento errado e pior que um fato sem vinculo.
const empreendimentos = await db.selectFrom('empreendimentos').select(['id', 'nome']).execute();
const porNome = new Map(empreendimentos.map((e) => [normalizarNome(e.nome), e.id]));

function acharEmpreendimento(nome: string | undefined): { id: string | null; achou: boolean } {
  if (!nome) return { id: null, achou: true };
  const id = porNome.get(normalizarNome(nome));
  return { id: id ?? null, achou: id !== undefined };
}

// ── Lancamento ──────────────────────────────────────────────────────────────
console.log('');
console.log(`  Comite: ${comite.rotulo}`);
console.log(`  Fatos no relato: ${FATOS.length}`);
console.log('');

let novos = 0;
let existentes = 0;
const semEmpreendimento: string[] = [];

for (const fato of FATOS) {
  const { id: empreendimentoId, achou } = acharEmpreendimento(fato.empreendimento);
  if (!achou && fato.empreendimento) semEmpreendimento.push(fato.empreendimento);

  const jaExiste = await db
    .selectFrom('fatos')
    .select('id')
    .where('comite_id', '=', comite.id)
    .where('titulo', '=', fato.titulo)
    .where('data', '=', fato.data)
    .executeTakeFirst();

  const marca = jaExiste ? 'ja existe' : 'novo';
  const vinculo = fato.empreendimento
    ? (empreendimentoId ? ` [${fato.empreendimento}]` : ` [${fato.empreendimento}: sem cadastro]`)
    : '';
  const alerta = fato.truncado ? '  <-- TEXTO INCOMPLETO NA ORIGEM' : '';
  console.log(`  ${fato.data}  ${marca.padEnd(9)} ${fato.titulo}${vinculo}${alerta}`);

  if (jaExiste) { existentes++; continue; }
  novos++;

  if (confirmar) {
    await db
      .insertInto('fatos')
      .values({
        // `fatos` nao tem competencia_ref: a competencia vem pelo comite.
        comite_id: comite.id,
        empreendimento_id: empreendimentoId,
        data: fato.data,
        titulo: fato.titulo,
        descricao: fato.descricao,
        fonte: 'manual',
        valor_original: JSON.stringify({
          origem: 'relato do juridico em 07/08/2026',
          texto_recebido: fato.descricao,
          empreendimento_citado: fato.empreendimento ?? null,
          texto_truncado_na_origem: fato.truncado === true,
        }),
        data_referencia: '2026-08-07',
        data_fato: fato.data,
        versao_regra: 'relato-juridico-1.0.0',
      } as never)
      .execute();
  }
}

console.log('');
if (confirmar) {
  console.log(`  Lancados agora: ${novos}. Ja existiam: ${existentes}.`);
} else {
  console.log(`  Simulacao: ${novos} seriam lancados, ${existentes} ja existem.`);
  console.log('  Para gravar de verdade, rode de novo com --confirmar');
}

if (semEmpreendimento.length) {
  console.log('');
  console.log('  Empreendimentos citados que nao existem no cadastro:');
  for (const nome of [...new Set(semEmpreendimento)]) console.log(`    - ${nome}`);
  console.log('  Os fatos ficam lancados sem vinculo. Cadastre e vincule na tela,');
  console.log('  ou sincronize o Monday se eles vierem de la.');
}

console.log('');
await fecharBanco();
