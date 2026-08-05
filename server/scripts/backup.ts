/**
 * Backup pela linha de comando.
 *
 * E o caminho usado por agendador externo (cron, systemd timer, CronJob) e o
 * unico disponivel quando a aplicacao esta fora do ar — que e, justamente, a
 * hora em que mais se precisa de um backup antes de mexer.
 *
 * Uso:
 *   npx tsx scripts/backup.ts
 *   npx tsx scripts/backup.ts --tipo pre_migracao --motivo "antes da 016"
 *   npx tsx scripts/backup.ts --proteger
 *   npx tsx scripts/backup.ts --retencao          aplica a politica depois
 *   npx tsx scripts/backup.ts --simular-retencao  mostra o que seria expurgado
 *
 * Variaveis obrigatorias: DATABASE_URL, BACKUP_CHAVE.
 * A chave NUNCA e passada por argumento: argumento aparece em `ps`.
 */
import { fecharBanco } from '../src/db/pool.js';
import { config } from '../src/config.js';
import {
  aplicarRetencao,
  executarBackup,
  relatorioContinuidade,
  type TipoBackup,
} from '../src/backup/servico.js';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

const TIPOS: TipoBackup[] = ['completo', 'preventivo', 'pre_migracao', 'agendado'];

function formatarBytes(n: number | null): string {
  if (n === null) return '—';
  const unidades = ['B', 'KiB', 'MiB', 'GiB'];
  let valor = n;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(i === 0 ? 0 : 1)} ${unidades[i]}`;
}

async function principal(): Promise<void> {
  const contexto = {
    usuarioId: null,
    usuarioNome: process.env.SUDO_USER || process.env.USER || 'cli',
  };

  if (temFlag('simular-retencao')) {
    const r = await aplicarRetencao(contexto, { simular: true });
    console.log(`Avaliados: ${r.avaliados}`);
    console.log(`Seriam expurgados: ${r.expurgados.length ? r.expurgados.join(', ') : 'nenhum'}`);
    for (const p of r.preservados) console.log(`  mantido  ${p.rotulo} — ${p.motivo}`);
    return;
  }

  if (temFlag('continuidade')) {
    const r = await relatorioContinuidade();
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  const tipoBruto = argumento('tipo') ?? 'completo';
  if (!TIPOS.includes(tipoBruto as TipoBackup)) {
    console.error(`Tipo invalido: ${tipoBruto}. Use um de: ${TIPOS.join(', ')}`);
    process.exit(2);
  }

  if (!config.backup.cifraConfigurada) {
    console.error(
      'BACKUP_CHAVE ausente ou com menos de 16 caracteres.\n' +
        'O backup nao e gerado em claro: o dump contem CPF, contrato e situacao\n' +
        'juridica de clientes reais. Defina a variavel e repita.',
    );
    process.exit(2);
  }

  console.log(`→ backup ${tipoBruto} do ambiente ${config.ambiente}`);
  console.log(`  destino: ${config.backup.diretorio}`);
  if (config.backup.diretorioRedundante) {
    console.log(`  copia redundante: ${config.backup.diretorioRedundante}`);
  } else {
    console.log('  copia redundante: NAO CONFIGURADA (BACKUP_DIRETORIO_REDUNDANTE)');
  }

  const r = await executarBackup(
    {
      tipo: tipoBruto as TipoBackup,
      origem: 'cli',
      motivo: argumento('motivo'),
      protegido: temFlag('proteger'),
    },
    contexto,
  );

  console.log(`\n✓ ${r.rotulo}`);
  console.log(`  arquivo   ${r.arquivo}`);
  console.log(`  tamanho   ${formatarBytes(r.tamanho_bytes)}`);
  console.log(`  registros ${r.total_registros ?? '—'}`);
  console.log(`  duracao   ${((r.duracao_ms ?? 0) / 1000).toFixed(1)}s`);
  console.log(`  checksum  ${r.checksum}`);
  console.log(`  retencao  ${r.classe_retencao}`);

  if (temFlag('retencao')) {
    const ret = await aplicarRetencao(contexto);
    console.log(
      `\n→ retencao: ${ret.expurgados.length} expurgado(s) de ${ret.avaliados} avaliado(s)`,
    );
    for (const rotulo of ret.expurgados) console.log(`  expurgado ${rotulo}`);
  }
}

principal()
  .then(() => fecharBanco())
  .then(() => process.exit(0))
  .catch(async (erro) => {
    console.error(`\n✗ ${erro instanceof Error ? erro.message : String(erro)}`);
    await fecharBanco().catch(() => {});
    process.exit(1);
  });
