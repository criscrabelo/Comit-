/**
 * Backup agendado.
 *
 * Deliberadamente simples: verifica de tempos em tempos se ja passou da hora
 * marcada e se ainda nao houve backup bem-sucedido hoje. Se as duas coisas
 * forem verdade, executa.
 *
 * Por que assim, e nao com uma expressao cron:
 *
 *   - a decisao e tomada a partir do ESTADO do banco, nao de um cronometro em
 *     memoria. Reiniciar o servidor as 3h05 nao pula o backup das 3h; o de
 *     hoje ainda nao existe, e ele roda;
 *   - duas instancias da aplicacao nao geram dois backups: a segunda encontra
 *     o de hoje ja feito;
 *   - nao ha dependencia nova para interpretar cron.
 *
 * Em infraestrutura que ja tenha agendador proprio (systemd timer, cron do
 * sistema, Kubernetes CronJob), o caminho preferido e `scripts/backup.ts` —
 * ver docs/BACKUP-RESTAURACAO.md. Este agendador embutido existe para que
 * uma instalacao simples nao fique sem backup por falta de configuracao
 * externa.
 */
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from '../logging.js';
import { aplicarRetencao, executarBackup } from './servico.js';

/** Intervalo entre verificacoes. Curto o bastante para nao atrasar a janela. */
const INTERVALO_MS = 10 * 60 * 1000;

const CONTEXTO = {
  usuarioId: null,
  usuarioNome: 'agendador',
} as const;

let temporizador: NodeJS.Timeout | null = null;
let rodando = false;

/** Ja houve backup bem-sucedido hoje neste ambiente? */
async function jaTemDeHoje(): Promise<boolean> {
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const linha = await db
    .selectFrom('backups')
    .select('id')
    .where('ambiente', '=', config.ambiente)
    .where('status', '=', 'concluido')
    .where('iniciado_em', '>=', inicioDoDia)
    .where('tipo', 'in', ['agendado', 'completo'])
    .executeTakeFirst();

  return Boolean(linha);
}

async function verificar(): Promise<void> {
  if (rodando) return;
  if (config.backup.horaDiaria === null) return;
  if (!config.backup.cifraConfigurada) {
    logger.warn('Backup agendado ligado, mas BACKUP_CHAVE nao esta configurada. Nada sera gerado.');
    return;
  }

  const agora = new Date();
  if (agora.getHours() < config.backup.horaDiaria) return;
  if (await jaTemDeHoje()) return;

  rodando = true;
  try {
    logger.info({ hora: config.backup.horaDiaria }, 'Backup agendado: iniciando');
    const resultado = await executarBackup({ tipo: 'agendado', origem: 'agendador' }, CONTEXTO);
    logger.info(
      { rotulo: resultado.rotulo, tamanho: resultado.tamanho_bytes },
      'Backup agendado concluido',
    );

    // Retencao logo depois do backup, e nao antes: um expurgo que rode antes
    // do backup do dia pode deixar a janela momentaneamente sem o minimo.
    const retencao = await aplicarRetencao(CONTEXTO);
    if (retencao.expurgados.length) {
      logger.info({ expurgados: retencao.expurgados }, 'Retencao aplicada');
    }
  } catch (erro) {
    // Falha no agendado nao derruba a aplicacao. O registro fica na tabela de
    // backups com status `erro`, e o relatorio de continuidade denuncia.
    logger.error(
      { erro: erro instanceof Error ? erro.message : String(erro) },
      'Backup agendado falhou',
    );
  } finally {
    rodando = false;
  }
}

export function iniciarAgendador(): void {
  if (temporizador) return;
  if (config.backup.horaDiaria === null) {
    logger.info('Backup agendado desligado (BACKUP_HORA_DIARIA nao configurada).');
    return;
  }

  logger.info({ hora: config.backup.horaDiaria }, 'Backup agendado ativo');

  // `unref` para o temporizador nao segurar o processo no encerramento.
  temporizador = setInterval(() => {
    void verificar();
  }, INTERVALO_MS);
  temporizador.unref();

  // Uma verificacao imediata: se o servidor subiu depois da janela e o backup
  // de hoje nao existe, nao ha razao para esperar dez minutos.
  setTimeout(() => void verificar(), 30_000).unref();
}

export function pararAgendador(): void {
  if (temporizador) {
    clearInterval(temporizador);
    temporizador = null;
  }
}

/** Exposto para teste: decide sem esperar o temporizador. */
export const _verificar = verificar;
