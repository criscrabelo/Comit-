/**
 * Ciclo de vida da politica de judicializacao.
 *
 * Quatro verbos, deliberadamente separados:
 *
 *   listar    — o que existe, em que situacao, valendo desde quando
 *   simular   — o que ACONTECERIA se uma politica proposta fosse aprovada
 *   aprovar   — decide o criterio. NAO reclassifica nada.
 *   reapurar  — aplica o criterio aprovado aos registros ja carregados
 *
 * Por que aprovar e reapurar sao passos distintos. Aprovar e um ato de decisao,
 * com autor e data; reapurar e o momento em que 250 registros mudam de estado na
 * tela. Junta-los faria a segunda coisa acontecer como efeito colateral da
 * primeira — e quem aprova precisa poder ver o efeito, pela simulacao, antes que
 * ele alcance qualquer indicador.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/politica-judicializacao.ts listar
 *   ... simular --politica <id>
 *   ... aprovar --politica <id> --usuario <email>
 *   ... reapurar --escopo processos
 */
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import {
  ENTIDADE_PROCESSOS,
  aprovar,
  avaliar,
  consolidar,
  gravarApuracoes,
  politicasPropostas,
  politicasVigentes,
  revogar,
  type Apuracao,
  type Politica,
} from '../src/juridico/judicializacao.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const hoje = () => new Date().toISOString().slice(0, 10);

function tabela(linhas: string[][]): string {
  if (linhas.length === 0) return '  (vazio)';
  const larguras = linhas[0]!.map((_, i) => Math.max(...linhas.map((l) => (l[i] ?? '').length)));
  return linhas
    .map((l) => '  ' + l.map((c, i) => (c ?? '').padEnd(larguras[i]!)).join('  '))
    .join('\n');
}

// ── listar ──────────────────────────────────────────────────────────────────

async function listar(): Promise<void> {
  const linhas = await db
    .selectFrom('politicas_judicializacao')
    .selectAll()
    .orderBy('escopo')
    .orderBy('precedencia')
    .orderBy('vigente_de', 'desc')
    .execute();

  console.log('\nPOLITICAS DE JUDICIALIZACAO\n');
  console.log(
    tabela([
      ['SITUACAO', 'FONTE', 'ESCOPO', 'VERSAO', 'TIPO', 'PREC', 'VIGENCIA', 'ID'],
      ...linhas.map((p) => [
        p.situacao,
        p.fonte,
        p.escopo,
        p.versao,
        p.tipo,
        String(p.precedencia),
        `${p.vigente_de} → ${p.vigente_ate ?? 'aberta'}`,
        p.id,
      ]),
    ]),
  );

  const aprovadas = linhas.filter((p) => p.situacao === 'aprovada');
  if (aprovadas.length === 0) {
    console.log(
      '\n⚠️  Nenhuma politica APROVADA. Enquanto isso, todo registro fica em\n' +
        '   revisao_necessaria — que e o estado correto para "ninguem decidiu ainda".',
    );
  }

  for (const p of linhas.filter((x) => x.situacao === 'proposta')) {
    console.log(`\n── Proposta ${p.versao} (${p.fonte}/${p.escopo}) ${'─'.repeat(30)}`);
    console.log(`  ${p.justificativa}`);
    console.log(`  Simular:  npx tsx scripts/politica-judicializacao.ts simular --politica ${p.id}`);
  }
  console.log();
}

// ── simular ─────────────────────────────────────────────────────────────────

interface RegistroParaSimular {
  id: string;
  id_origem: string | null;
  situacao: string | null;
  judicializado: boolean;
  revisao_necessaria: boolean;
}

async function carregarRegistros(escopo: string): Promise<RegistroParaSimular[]> {
  if (escopo !== 'processos') {
    throw new Error(`Escopo "${escopo}" ainda nao tem tabela de destino mapeada neste comando.`);
  }

  return db
    .selectFrom('processos_judiciais')
    .select(['id', 'id_origem', 'situacao', 'judicializado', 'revisao_necessaria'])
    .where('ausente_desde', 'is', null)
    .execute();
}

/**
 * Mostra o efeito de uma politica SEM aplica-la.
 *
 * Usa a mesma funcao `avaliar` da apuracao real. Uma simulacao escrita a parte
 * poderia divergir do que a aprovacao de fato faria — e ai o numero apresentado
 * para decidir nao seria o numero que aconteceria.
 */
async function simular(politicaId: string): Promise<void> {
  const politica = (await db
    .selectFrom('politicas_judicializacao')
    .selectAll()
    .where('id', '=', politicaId)
    .executeTakeFirst()) as unknown as Politica | undefined;

  if (!politica) throw new Error(`Politica ${politicaId} nao encontrada.`);

  const registros = await carregarRegistros(politica.escopo);
  const vigentes = await politicasVigentes(politica.escopo, hoje());
  // A politica simulada entra no lugar da vigente da MESMA fonte: e isso que
  // aprovar faria. Politicas de outras fontes continuam valendo.
  const conjunto = [...vigentes.filter((p) => p.fonte !== politica.fonte), politica].sort(
    (a, b) => a.precedencia - b.precedencia,
  );

  let vira = { sim: 0, nao: 0, revisao: 0 };
  const mudancas = { paraSim: 0, paraNao: 0, saiuDeRevisao: 0, entrouEmRevisao: 0 };
  const amostra: string[][] = [];

  for (const r of registros) {
    const apuracoes: Apuracao[] = conjunto
      .filter((p) => p.fonte === 'monday')
      .map((p) => avaliar(p, { situacao: r.situacao }));
    const c = consolidar(apuracoes);

    if (c.revisaoNecessaria) vira.revisao++;
    else if (c.judicializado) vira.sim++;
    else vira.nao++;

    if (r.revisao_necessaria && !c.revisaoNecessaria) mudancas.saiuDeRevisao++;
    if (!r.revisao_necessaria && c.revisaoNecessaria) mudancas.entrouEmRevisao++;
    if (!r.judicializado && c.judicializado && !c.revisaoNecessaria) mudancas.paraSim++;
    if (r.judicializado && !c.judicializado && !c.revisaoNecessaria) mudancas.paraNao++;

    if (amostra.length < 5) {
      amostra.push([
        r.id_origem ?? r.id.slice(0, 8),
        (r.situacao ?? '(vazia)').slice(0, 28),
        r.revisao_necessaria ? 'revisao' : r.judicializado ? 'sim' : 'nao',
        '→',
        c.revisaoNecessaria ? 'revisao' : c.judicializado ? 'sim' : 'nao',
      ]);
    }
  }

  console.log(`\nSIMULACAO — politica ${politica.versao} (${politica.fonte}/${politica.escopo})`);
  console.log(`Situacao atual da politica: ${politica.situacao.toUpperCase()}`);
  console.log(`\n${politica.justificativa}\n`);
  console.log(`Registros avaliados: ${registros.length}`);
  console.log(
    tabela([
      ['RESULTADO', 'REGISTROS'],
      ['judicializado', String(vira.sim)],
      ['nao judicializado', String(vira.nao)],
      ['em revisao', String(vira.revisao)],
    ]),
  );
  console.log('\nMudancas em relacao ao estado atual:');
  console.log(
    tabela([
      ['MUDANCA', 'REGISTROS'],
      ['sairiam de revisao', String(mudancas.saiuDeRevisao)],
      ['entrariam em revisao', String(mudancas.entrouEmRevisao)],
      ['passariam a judicializado', String(mudancas.paraSim)],
      ['deixariam de ser judicializado', String(mudancas.paraNao)],
    ]),
  );

  if (amostra.length) {
    console.log('\nAmostra (id de origem, situacao, antes → depois):');
    console.log(tabela(amostra));
  }

  console.log(
    '\n⚠️  NADA foi alterado. Esta simulacao nao grava.' +
      (politica.situacao === 'proposta'
        ? `\n   Para aprovar:  npx tsx scripts/politica-judicializacao.ts aprovar --politica ${politica.id} --usuario <email>`
        : ''),
  );
  console.log();
}

// ── aprovar ─────────────────────────────────────────────────────────────────

async function usuarioPorEmail(email: string): Promise<string> {
  const u = await db
    .selectFrom('usuarios')
    .select(['id', 'nome'])
    .where(sql<boolean>`lower(email::text) = lower(${email})`)
    .executeTakeFirst();

  if (!u) throw new Error(`Usuario ${email} nao encontrado. Aprovacao exige autor identificado.`);
  return u.id;
}

async function executarAprovacao(politicaId: string, email: string): Promise<void> {
  const usuarioId = await usuarioPorEmail(email);
  const p = await aprovar(politicaId, usuarioId);

  console.log(`\n✓ Politica ${p.versao} (${p.fonte}/${p.escopo}) APROVADA por ${email}.`);
  console.log(`  Vigente de ${p.vigente_de}.`);
  console.log(
    '\n  Aprovar decidiu o criterio; nenhum registro foi reclassificado ainda.\n' +
      `  Para aplicar:  npx tsx scripts/politica-judicializacao.ts reapurar --escopo ${p.escopo}\n`,
  );
}

// ── reapurar ────────────────────────────────────────────────────────────────

/**
 * Aplica as politicas APROVADAS aos registros ja carregados.
 *
 * Existe porque aprovar nao reclassifica: sem este passo, a nova regra so
 * alcancaria os registros na proxima sincronizacao, e o quadro ficaria metade
 * sob a regra nova e metade sob a antiga.
 */
async function reapurar(escopo: string): Promise<void> {
  const politicas = await politicasVigentes(escopo, hoje());

  if (politicas.length === 0) {
    console.log(
      `\n⚠️  Nenhuma politica aprovada para "${escopo}". Nada a reapurar.\n` +
        '   Os registros permanecem em revisao — que e o estado correto.\n',
    );
    return;
  }

  const registros = await carregarRegistros(escopo);
  let alterados = 0;
  let divergentes = 0;

  for (const r of registros) {
    const apuracoes: Apuracao[] = politicas
      .filter((p) => p.fonte === 'monday')
      .map((p) => avaliar(p, { situacao: r.situacao }));
    const c = consolidar(apuracoes);

    await gravarApuracoes(ENTIDADE_PROCESSOS, r.id, c.apuracoes);

    if (r.judicializado === c.judicializado && r.revisao_necessaria === c.revisaoNecessaria) {
      continue;
    }

    await db
      .updateTable('processos_judiciais')
      .set({
        judicializado: c.judicializado,
        revisao_necessaria: c.revisaoNecessaria,
        judicializacao_fonte: c.fonte,
        judicializacao_politica: c.politicaId,
        judicializacao_divergente: c.divergente,
      })
      .where('id', '=', r.id)
      .execute();

    alterados++;
    if (c.divergente) divergentes++;
  }

  console.log(`\n✓ Reapuracao concluida em "${escopo}".`);
  console.log(`  Registros avaliados: ${registros.length}`);
  console.log(`  Registros alterados: ${alterados}`);
  if (divergentes) console.log(`  Com divergencia entre fontes: ${divergentes}`);
  console.log(
    `  Politicas aplicadas: ${politicas.map((p) => `${p.fonte}/${p.versao}`).join(', ')}\n`,
  );
}

// ── principal ───────────────────────────────────────────────────────────────

async function principal(): Promise<void> {
  const comando = process.argv[2];

  try {
    switch (comando) {
      case 'listar':
        await listar();
        break;

      case 'simular': {
        const id = argumento('politica');
        if (id) {
          await simular(id);
        } else {
          const propostas = await politicasPropostas(argumento('escopo') ?? 'processos');
          if (propostas.length === 0) console.log('\nNenhuma politica proposta para simular.\n');
          for (const p of propostas) await simular(p.id);
        }
        break;
      }

      case 'aprovar': {
        const id = argumento('politica');
        const email = argumento('usuario');
        if (!id || !email) {
          throw new Error('aprovar exige --politica <id> e --usuario <email>.');
        }
        await executarAprovacao(id, email);
        break;
      }

      case 'revogar': {
        const id = argumento('politica');
        const email = argumento('usuario');
        const motivo = argumento('motivo');
        if (!id || !email || !motivo) {
          throw new Error('revogar exige --politica <id>, --usuario <email> e --motivo "<texto>".');
        }
        await revogar(id, await usuarioPorEmail(email), motivo);
        console.log(`\n✓ Politica ${id} revogada. Motivo registrado.\n`);
        break;
      }

      case 'reapurar':
        await reapurar(argumento('escopo') ?? 'processos');
        break;

      default:
        console.log(
          '\nUso:\n' +
            '  politica-judicializacao.ts listar\n' +
            '  politica-judicializacao.ts simular [--politica <id>] [--escopo processos]\n' +
            '  politica-judicializacao.ts aprovar --politica <id> --usuario <email>\n' +
            '  politica-judicializacao.ts revogar --politica <id> --usuario <email> --motivo "<texto>"\n' +
            '  politica-judicializacao.ts reapurar [--escopo processos]\n',
        );
        process.exitCode = 1;
    }
  } finally {
    await fecharBanco();
  }
}

void principal().catch((erro) => {
  console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exit(1);
});
