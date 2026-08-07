/**
 * Executa a carga incremental do Sienge pela linha de comando.
 *
 * Mesma rotina que `POST /api/sienge/sync` chama, para operar sem depender do
 * servidor HTTP estar no ar — util para cron, para a primeira carga
 * controlada, e para rodar de novo apos um destravamento de rede.
 *
 * Uso:
 *   SIENGE_HABILITADO=true DATABASE_URL=... npx tsx scripts/executar-carga-sienge.ts
 *
 *   ... --etapas empresas,empreendimentos    so essas etapas (padrao: todas)
 *   ... --modificados-apos 2026-07-01        corte incremental de clientes
 *   ... --simular                            le e transforma sem gravar
 *   ... --teto 50                            limite de requisicoes desta execucao
 *   ... --saida relatorio.md                 grava o relatorio em arquivo
 */
import { promises as fs } from 'node:fs';
import { fecharBanco } from '../src/db/pool.js';
import { carregarHomologacao } from '../src/integracoes/sienge/rotas.js';
import { ETAPAS, planejarCarga, sincronizarSienge, type EtapaCarga } from '../src/integracoes/sienge/sincronizar.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

const linhas: string[] = [];
const escrever = (texto = '') => {
  linhas.push(texto);
  console.log(texto);
};

async function gravarSaida(): Promise<void> {
  const saida = argumento('saida');
  if (!saida) return;
  await fs.writeFile(saida, linhas.join('\n') + '\n');
  console.log(`\n→ relatório gravado em ${saida}`);
}

async function principal(): Promise<void> {
  // Este script roda num processo separado do servidor HTTP: sem isto, os
  // sete candidatos ficam com `confirmado: false` em memoria — o mesmo
  // padrao em branco de todo processo novo — e a carga e recusada mesmo
  // depois de homologada. `server.ts` faz a mesma chamada na partida.
  const confirmados = await carregarHomologacao();
  if (confirmados === 0) {
    throw new Error(
      'Nenhum endpoint homologado neste banco. Rode scripts/homologar-sienge.ts antes da carga.',
    );
  }

  const etapasArg = argumento('etapas');
  const etapas = etapasArg
    ? (etapasArg.split(',').map((s) => s.trim()) as EtapaCarga[])
    : undefined;

  if (etapas) {
    const invalidas = etapas.filter((e) => !ETAPAS.includes(e));
    if (invalidas.length) {
      throw new Error(`Etapa(s) desconhecida(s): ${invalidas.join(', ')}. Validas: ${ETAPAS.join(', ')}`);
    }
  }

  escrever('# Carga incremental do Sienge');
  escrever();
  escrever(`**Executado em:** ${new Date().toISOString()}  `);
  escrever(`**Etapas:** ${etapas?.join(', ') ?? 'todas'}${temFlag('simular') ? ' — SIMULAÇÃO' : ''}`);
  escrever();

  const plano = await planejarCarga();
  escrever('## Planejamento (antes de gastar)');
  escrever();
  escrever('| Etapa | Registros na origem | Requisições estimadas | Cabe hoje? |');
  escrever('| --- | ---: | ---: | --- |');
  for (const p of plano.planos) {
    escrever(
      `| ${p.etapa} | ${p.registrosNaOrigem ?? '—'} | ${p.requisicoesEstimadas} | ` +
        `${p.cabe ? '✅' : '⚠️ ' + (p.motivo ?? '')} |`,
    );
  }
  escrever();
  escrever(
    `Total estimado: **${plano.totalEstimado}** requisições · saldo disponível: **${plano.saldoDisponivel}** · ` +
      `carga completa cabe hoje: ${plano.cabeCompleta ? 'sim' : 'não — parcelas retoma em dias seguintes'}`,
  );
  escrever();

  const resultado = await sincronizarSienge({
    etapas,
    modificadosApos: argumento('modificados-apos') ?? null,
    simular: temFlag('simular'),
    tetoDeRequisicoes: argumento('teto') ? Number(argumento('teto')) : undefined,
  });

  escrever('## Execução');
  escrever();
  escrever('| Etapa | Executada | Requisições | Lidos | Incluídos | Atualizados | Inalterados | Ignorados | Observação |');
  escrever('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const e of resultado.etapas) {
    escrever(
      `| ${e.etapa} | ${e.executada ? '✅' : '⏸️'} | ${e.requisicoes} | ${e.lidos} | ${e.incluidos} | ` +
        `${e.atualizados} | ${e.inalterados} | ${e.ignorados} | ${e.motivo ?? ''} |`,
    );
  }
  escrever();

  escrever('## Orçamento diário');
  escrever();
  escrever(`Saldo antes: ${resultado.orcamento.saldoInicial} · consumidas: ${resultado.orcamento.consumidas} · ` +
    `saldo depois: ${resultado.orcamento.saldoFinal} · reserva preservada: ${resultado.orcamento.reservaPreservada}`);
  escrever();

  if (Object.keys(resultado.retomada).length) {
    escrever('## Retomada');
    escrever();
    escrever('Ponto salvo para a próxima execução continuar sem reprocessar o que já foi lido:');
    escrever();
    escrever('```json');
    escrever(JSON.stringify(resultado.retomada, null, 2));
    escrever('```');
    escrever();
  }

  escrever('---');
  escrever();
  escrever(
    `**Status:** \`${resultado.execucao.status}\`${resultado.execucao.parcial ? ' (parcial)' : ''} · ` +
      `contabilidade fecha: ${resultado.execucao.contabilidade_fecha ? 'sim' : 'NÃO'}`,
  );

  await gravarSaida();
  if (resultado.execucao.status === 'erro') process.exitCode = 1;
}

principal()
  .then(() => fecharBanco())
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(async (erro) => {
    console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)}`);
    await fecharBanco().catch(() => {});
    process.exit(1);
  });
