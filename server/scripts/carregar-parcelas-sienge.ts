/**
 * Parcelas dos títulos inadimplentes, e a inadimplência por faixa de atraso.
 *
 * Por que só os inadimplentes: parcelas custam **1 requisição por título**
 * (`/accounts-receivable/receivable-bills/{id}/installments`). Os 5.142 títulos
 * estourariam a franquia diária cinco vezes. Os 1.022 inadimplentes são o que
 * responde a pergunta do comitê — inadimplência por faixa — e cabem quase
 * inteiros num dia.
 *
 * Ordem de prioridade: **maior valor primeiro**. Se o orçamento acabar antes do
 * fim, o que ficou de fora é a cauda pequena, e o relatório declara exatamente
 * quanto ficou — nunca um número apresentado como completo.
 *
 * A faixa é PERSISTIDA (`parcelas.faixa`), não recalculada na leitura: a
 * fotografia guarda a faixa apurada na data de referência, e consultar o
 * passado devolve o que valia então.
 *
 * Uso:
 *   SIENGE_HABILITADO=true DATABASE_URL=... npx tsx scripts/carregar-parcelas-sienge.ts
 *     [--saida arq.md] [--teto 850]
 */
import { promises as fs } from 'node:fs';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import { gravarBruto, iniciarExecucao } from '../src/integracoes/execucoes.js';
import { ler, orcamentoRestante, type PaginaSienge } from '../src/integracoes/sienge/cliente.js';
import { carregarHomologacao } from '../src/integracoes/sienge/rotas.js';
import type { FaixaAtraso } from '../src/db/schema.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const linhas: string[] = [];
const escrever = (t = '') => {
  linhas.push(t);
  console.log(t);
};

const hoje = new Date().toISOString().slice(0, 10);

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Faixa de atraso — references/metodologia.md §5.
 *
 * Parcela não vencida não tem faixa: `null`. Zerá-la em `1-30` colocaria
 * dívida em dia dentro da inadimplência.
 */
function faixaDe(diasAtraso: number): FaixaAtraso | null {
  if (diasAtraso <= 0) return null;
  if (diasAtraso <= 30) return '1-30';
  if (diasAtraso <= 60) return '31-60';
  if (diasAtraso <= 90) return '61-90';
  if (diasAtraso <= 120) return '91-120';
  return '>120';
}

function diasEntre(vencimento: string, referencia: string): number {
  const v = Date.UTC(+vencimento.slice(0, 4), +vencimento.slice(5, 7) - 1, +vencimento.slice(8, 10));
  const r = Date.UTC(+referencia.slice(0, 4), +referencia.slice(5, 7) - 1, +referencia.slice(8, 10));
  return Math.floor((r - v) / 86_400_000);
}

interface Parcela {
  receivableBillId?: number;
  installmentId?: number;
  dueDate?: string;
  balanceDue?: number;
  conditionTypeId?: string;
  generatedBoleto?: boolean;
}

async function principal(): Promise<void> {
  const confirmados = await carregarHomologacao();
  if (confirmados < 7) {
    throw new Error(`Homologacao incompleta (${confirmados}/7). Nada foi executado.`);
  }

  const inicio = orcamentoRestante();
  const teto = Number(argumento('teto') ?? Math.max(0, inicio - 50));

  escrever('# Parcelas dos títulos inadimplentes e inadimplência por faixa');
  escrever();
  escrever(`**Executado em:** ${new Date().toISOString()}  `);
  escrever(`**Data de referência:** ${hoje}  `);
  escrever('**Fonte:** Sienge, somente leitura');
  escrever();

  // Maior valor primeiro: se o orcamento acabar, sai a cauda, nao o topo.
  const alvos = await db
    .selectFrom('titulos_receber')
    .select(['id', 'id_origem', 'cliente_id', 'empresa', 'valor_nominal'])
    .where('ausente_desde', 'is', null)
    .where('situacao', '=', 'inadimplente')
    .orderBy(sql`valor_nominal DESC NULLS LAST`)
    .execute();

  escrever('## Escopo');
  escrever();
  escrever('| Item | Valor |');
  escrever('| --- | --- |');
  escrever(`| Títulos inadimplentes na base | ${alvos.length} |`);
  escrever(`| Orçamento disponível hoje | ${inicio} |`);
  escrever(`| Teto desta execução | ${teto} |`);
  escrever(`| Ordem | maior valor primeiro |`);
  escrever();

  const execucao = await iniciarExecucao({
    fonte: 'sienge',
    escopo: 'parcelas',
    destino: 'parcelas',
  });

  const paraGravar: Array<Record<string, unknown>> = [];
  const brutos: Array<{ idOrigem: string; payload: unknown }> = [];
  let lidos = 0;
  let requisicoes = 0;
  let titulosVisitados = 0;
  let interrompido = false;

  for (const t of alvos) {
    if (requisicoes >= teto) {
      interrompido = true;
      break;
    }

    let pagina: PaginaSienge<Parcela>;
    try {
      pagina = await ler<PaginaSienge<Parcela>>({
        endpoint: 'installments',
        parametrosDeCaminho: { receivableBillId: t.id_origem! },
      });
      requisicoes++;
    } catch (erro) {
      requisicoes++;
      execucao.registrarErro(
        `titulo ${t.id_origem}: ${(erro as Error).message.slice(0, 120)}`,
        t.id_origem ?? undefined,
      );
      // Orcamento esgotado interrompe; outro erro segue para o proximo titulo.
      if ((erro as Error).message.includes('Orcamento diario')) {
        interrompido = true;
        break;
      }
      continue;
    }

    titulosVisitados++;

    for (const p of pagina.results) {
      lidos++;
      const idOrigem = `${t.id_origem}:${p.installmentId ?? lidos}`;
      brutos.push({ idOrigem, payload: p });

      const saldo = Number(p.balanceDue ?? 0);
      const dias = p.dueDate ? diasEntre(p.dueDate, hoje) : 0;
      // So parcela EM ABERTO e vencida entra na inadimplencia. Saldo zerado
      // e parcela paga: contar como vencida inflaria todas as faixas.
      const emAberto = saldo > 0;
      const faixa = emAberto ? faixaDe(dias) : null;

      paraGravar.push({
        titulo_id: t.id,
        cliente_id: t.cliente_id,
        numero_parcela: p.installmentId != null ? String(p.installmentId) : null,
        vencimento: p.dueDate ?? null,
        saldo_atualizado: saldo.toFixed(2),
        saldo_vencido: faixa ? saldo.toFixed(2) : null,
        dias_atraso: emAberto && dias > 0 ? dias : null,
        faixa,
        status: p.conditionTypeId ?? null,
        fonte: 'sienge' as const,
        id_origem: idOrigem,
        valor_original: JSON.stringify(p),
        data_referencia: hoje,
        data_fato: p.dueDate ?? null,
        versao_regra: '1.0.0',
        execucao_id: execucao.id,
      });
    }
  }

  execucao.registrarLidos(lidos);
  if (brutos.length) await gravarBruto(execucao.id, 'sienge', 'parcelas', brutos);

  // Upsert manual: `parcelas` nao esta em TabelaIntegravel porque nao e um
  // conjunto que a origem republica inteiro — e sempre um recorte deliberado.
  let gravadas = 0;
  const LOTE = 500;
  for (let i = 0; i < paraGravar.length; i += LOTE) {
    const fatia = paraGravar.slice(i, i + LOTE);
    await db
      .insertInto('parcelas')
      .values(fatia as never)
      .onConflict((oc) =>
        oc.columns(['fonte', 'id_origem']).doUpdateSet((eb) => ({
          saldo_atualizado: eb.ref('excluded.saldo_atualizado'),
          saldo_vencido: eb.ref('excluded.saldo_vencido'),
          dias_atraso: eb.ref('excluded.dias_atraso'),
          faixa: eb.ref('excluded.faixa'),
          data_referencia: eb.ref('excluded.data_referencia'),
          execucao_id: eb.ref('excluded.execucao_id'),
        })),
      )
      .execute();
    gravadas += fatia.length;
    for (const _ of fatia) execucao.registrarIncluido();
  }

  await execucao.finalizar({
    status: interrompido ? 'parcial' : 'sucesso',
    mensagem: `Parcelas: ${gravadas} de ${titulosVisitados} titulos${interrompido ? ' (interrompido pelo orcamento)' : ''}.`,
  });

  escrever('## Carga');
  escrever();
  escrever(`- títulos visitados: **${titulosVisitados}** de ${alvos.length}`);
  escrever(`- parcelas gravadas: **${gravadas}**`);
  escrever(`- requisições: ${requisicoes} · saldo restante: ${orcamentoRestante()}`);
  if (interrompido) {
    const faltam = alvos.length - titulosVisitados;
    escrever();
    escrever(`> ⚠️ **Interrompido pelo orçamento: ${faltam} título(s) não foram lidos.**`);
    escrever('> Como a ordem foi por valor decrescente, o que ficou de fora é a cauda');
    escrever('> de menor exposição. Os números abaixo são de uma carga **parcial** e');
    escrever('> estão declarados como tal.');
  }
  escrever();

  // ── Inadimplência por faixa ────────────────────────────────────────────────
  const faixas = await sql<{ faixa: string; parcelas: number; clientes: number; valor: string }>`
    SELECT faixa::text AS faixa,
           count(*)::int AS parcelas,
           count(DISTINCT cliente_id)::int AS clientes,
           coalesce(sum(saldo_vencido), 0)::text AS valor
    FROM parcelas
    WHERE faixa IS NOT NULL AND ausente_desde IS NULL
    GROUP BY faixa
    ORDER BY CASE faixa::text
      WHEN '1-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3
      WHEN '91-120' THEN 4 ELSE 5 END
  `.execute(db).then((r) => r.rows);

  const totalVencido = faixas.reduce((s, f) => s + Number(f.valor), 0);
  const ate120 = faixas.filter((f) => f.faixa !== '>120').reduce((s, f) => s + Number(f.valor), 0);
  const acima120 = totalVencido - ate120;

  escrever('## Inadimplência por faixa de atraso');
  escrever();
  escrever('| Faixa | Parcelas | Clientes | Saldo vencido | % do vencido |');
  escrever('| --- | ---: | ---: | ---: | ---: |');
  for (const f of faixas) {
    const v = Number(f.valor);
    escrever(
      `| **${f.faixa} dias** | ${f.parcelas} | ${f.clientes} | ${brl(v)} | ${totalVencido ? ((v / totalVencido) * 100).toFixed(1) : '0'}% |`,
    );
  }
  escrever(`| **Total vencido** | ${faixas.reduce((s, f) => s + f.parcelas, 0)} | | **${brl(totalVencido)}** | 100% |`);
  escrever();

  escrever('### Contra as metas gerenciais');
  escrever();
  escrever('> Metas de `references/metodologia.md` §5: até 120 dias, **até 4%** da');
  escrever('> carteira de referência; acima de 120 dias, **entre 2% e 2,1%**.');
  escrever();
  escrever('| Recorte | Saldo vencido |');
  escrever('| --- | ---: |');
  escrever(`| Até 120 dias | ${brl(ate120)} |`);
  escrever(`| Acima de 120 dias | ${brl(acima120)} |`);
  escrever();
  escrever('⚠️ **O percentual NÃO é apresentado.** A metodologia exige que o');
  escrever('denominador seja a **carteira ativa exigível**, e o que é carteira ativa');
  escrever('exigível no Sienge da Coevo está declarado como pendência de regra de');
  escrever('negócio (`docs/SIENGE-INFORMACOES-PREENCHIDAS.md` §12). Dividir pelo total');
  escrever('de títulos daria um número plausível e errado — e o documento pede,');
  escrever('literalmente, "sempre informar o denominador utilizado".');
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
