/**
 * Restauracao pela linha de comando.
 *
 * O procedimento de emergencia, quando a aplicacao nao sobe e a interface nao
 * esta disponivel. Executa os mesmos doze passos do endpoint — inclusive o
 * backup preventivo e as verificacoes de integridade.
 *
 * Uso:
 *   npx tsx scripts/restaurar.ts --listar
 *   npx tsx scripts/restaurar.ts --backup <id|rotulo> --avaliar
 *   npx tsx scripts/restaurar.ts --backup <id|rotulo>            (banco isolado)
 *   npx tsx scripts/restaurar.ts --backup <id> --destino producao \
 *       --confirmacao "SUBSTITUIR DADOS DE PRODUCAO" \
 *       --justificativa "..."
 *
 * A confirmacao literal e obrigatoria em producao, e existe para que nao se
 * substitua a base por engano de digitacao num identificador.
 */
import { db, fecharBanco } from '../src/db/pool.js';
import { config } from '../src/config.js';
import { listarBackups } from '../src/backup/servico.js';
import { avaliar, restaurar, CONFIRMACAO_PRODUCAO } from '../src/backup/restauracao.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

/** Aceita id ou rotulo: numa emergencia, o rotulo e o que se tem a mao. */
async function resolverBackup(referencia: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(referencia)) return referencia;

  const linha = await db
    .selectFrom('backups')
    .select('id')
    .where('rotulo', '=', referencia)
    .executeTakeFirst();

  if (!linha) {
    throw new Error(`Backup nao encontrado: "${referencia}". Use --listar para ver os disponiveis.`);
  }
  return linha.id;
}

function imprimirAvaliacao(a: Awaited<ReturnType<typeof avaliar>>): void {
  console.log(`\nBACKUP    ${a.backup.rotulo}`);
  console.log(`  ambiente de origem  ${a.backup.ambiente}`);
  console.log(`  gerado em           ${a.backup.iniciado_em.toISOString()}`);
  console.log(`  aplicacao / banco   ${a.backup.versao_aplicacao} / PostgreSQL ${a.backup.versao_banco}`);
  console.log(`  registros           ${a.backup.total_registros ?? '—'}`);

  console.log('\nVALIDACOES');
  console.log(`  [${a.checksum.confere ? 'ok' : '!!'}] checksum   ${a.checksum.mensagem}`);
  console.log(
    `  [${a.esquema.compativel ? 'ok' : '!!'}] esquema    ` +
      (a.esquema.impedimentos[0] ?? a.esquema.ressalvas[0] ?? 'compativel'),
  );
  console.log(
    `  [${a.ambiente.mesmo ? 'ok' : '  '}] ambiente   ` +
      (a.ambiente.alerta ?? `mesmo ambiente (${a.ambiente.destino})`),
  );

  console.log('\nIMPACTO');
  console.log(`  ${a.impacto.texto}`);
  for (const t of a.impacto.tabelas_que_perdem.slice(0, 10)) {
    console.log(`    ${t.tabela.padEnd(28)} ${String(t.atual).padStart(7)} → ${t.no_backup}`);
  }

  if (a.esquema.ressalvas.length) {
    console.log('\nRESSALVAS');
    for (const r of a.esquema.ressalvas) console.log(`  - ${r}`);
  }
  if (a.impedimentos.length) {
    console.log('\nIMPEDIMENTOS');
    for (const i of a.impedimentos) console.log(`  ✗ ${i}`);
  }
  console.log(`\nPode prosseguir: ${a.pode_prosseguir ? 'sim' : 'NAO'}`);
  if (a.confirmacao_exigida) {
    console.log(`Confirmacao exigida: "${a.confirmacao_exigida}"`);
  }
}

async function principal(): Promise<void> {
  if (temFlag('listar')) {
    const backups = await listarBackups({ limite: 30 });
    console.log(`Backups (ambiente atual: ${config.ambiente})\n`);
    for (const b of backups as Array<Record<string, unknown>>) {
      const marca = b.protegido ? '🔒' : '  ';
      const tamanho = b.tamanho_bytes ? `${(Number(b.tamanho_bytes) / 1048576).toFixed(1)} MiB` : '—';
      console.log(
        `${marca} ${String(b.rotulo).padEnd(46)} ${String(b.status).padEnd(13)} ` +
          `${tamanho.padStart(10)}  ${String(b.ambiente)}`,
      );
    }
    return;
  }

  const referencia = argumento('backup');
  if (!referencia) {
    console.error('Informe --backup <id|rotulo>, ou --listar para ver os disponiveis.');
    process.exit(2);
  }

  const backupId = await resolverBackup(referencia);
  const destinoBruto = argumento('destino') ?? 'isolado';
  if (destinoBruto !== 'isolado' && destinoBruto !== 'producao') {
    console.error('--destino deve ser "isolado" ou "producao".');
    process.exit(2);
  }

  const contexto = {
    usuarioId: null,
    usuarioNome: process.env.SUDO_USER || process.env.USER || 'cli',
  };

  const avaliacao = await avaliar(backupId, destinoBruto, contexto);
  imprimirAvaliacao(avaliacao);

  if (temFlag('avaliar')) return;

  if (!avaliacao.pode_prosseguir) {
    console.error('\n✗ Restauracao recusada na validacao. Nada foi alterado.');
    process.exit(1);
  }

  if (destinoBruto === 'producao') {
    console.log(`\n⚠  SUBSTITUICAO DO BANCO EM USO: ${avaliacao.banco_destino}`);
    console.log('   Um backup preventivo do estado atual sera gerado antes.\n');
  }

  const relatorio = await restaurar(
    {
      backupId,
      destino: destinoBruto,
      confirmacao: argumento('confirmacao') ?? null,
      justificativa: argumento('justificativa') ?? null,
      bancoIsolado: argumento('banco') ?? null,
    },
    contexto,
  );

  console.log(`\n✓ Restauracao ${relatorio.status}`);
  console.log(`  banco destino  ${relatorio.banco_destino}`);
  console.log(`  duracao        ${((relatorio.duracao_ms ?? 0) / 1000).toFixed(1)}s`);
  if (relatorio.backup_preventivo) {
    console.log(`  preventivo     ${relatorio.backup_preventivo.rotulo}`);
  }

  const i = relatorio.integridade as Record<string, unknown>;
  console.log('\nINTEGRIDADE');
  console.log(`  tabelas             ${i.tabelas}`);
  console.log(`  registros           ${i.total_restaurado}`);
  console.log(`  usuarios ativos     ${i.usuarios_ativos}`);
  console.log(`  permissoes de perfil ${i.permissoes_perfil}`);
  console.log(`  trilha de auditoria ${i.registros_auditoria}`);
  console.log(`  tabelas de negocio  ${i.tabelas_de_negocio}`);

  if (relatorio.divergencias.length) {
    console.log('\nDIVERGENCIAS');
    for (const d of relatorio.divergencias) console.log(`  ! ${d}`);
  }
  if (relatorio.como_reverter) console.log(`\n${relatorio.como_reverter}`);
}

principal()
  .then(() => fecharBanco())
  .then(() => process.exit(0))
  .catch(async (erro) => {
    console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)}`);
    const detalhe = (erro as { detalhe?: Record<string, unknown> }).detalhe;
    if (detalhe && Object.keys(detalhe).length) {
      console.error(JSON.stringify(detalhe, null, 2));
    }
    console.error(`\n(Em producao a confirmacao literal e: "${CONFIRMACAO_PRODUCAO}")`);
    await fecharBanco().catch(() => {});
    process.exit(1);
  });
