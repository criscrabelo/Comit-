/**
 * Vigilancia da continuidade — requisitos B15.5 e B15.6.
 *
 * Duas coisas que nao podem depender de alguem lembrar:
 *
 *   B15.5  verificacao periodica dos checksums e ensaio amostral de restauracao.
 *          Um arquivo pode se corromper em repouso sem nenhum aviso; e um
 *          backup que nunca foi restaurado e uma hipotese, nao uma garantia.
 *
 *   B15.6  alerta quando um backup agendado NAO conclui. Sem isto, um
 *          agendamento quebrado e indistinguivel de um dia em que ninguem
 *          olhou — e a descoberta acontece no pior momento possivel.
 *
 * O estado vive no banco (`verificacoes_backup`, `janelas_backup`), e nao em
 * memoria: reiniciar o servidor nao apaga a memoria de que a janela de ontem
 * ficou aberta.
 */
import { sql } from 'kysely';
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from '../logging.js';
import { auditar } from '../audit/registrar.js';
import { verificarBackup, type ContextoBackup } from './servico.js';
import { restaurar } from './restauracao.js';

/** Quantos backups o ensaio amostral restaura de fato por rodada. */
const AMOSTRA = 1;

export interface ResultadoVerificacao {
  id: string;
  avaliados: number;
  integros: number;
  corrompidos: number;
  ausentes: number;
  detalhe: Array<{ rotulo: string; situacao: 'integro' | 'corrompido' | 'ausente' }>;
}

/**
 * Confere o checksum de todos os backups recuperaveis.
 *
 * Nao precisa da chave de cifra: o checksum e do arquivo cifrado. Um backup que
 * falha aqui e marcado `corrompido` pelo proprio `verificarBackup` — e nao
 * excluido, porque a corrupcao e a pista de um problema de armazenamento que
 * alguem precisa investigar.
 */
export async function verificarChecksums(
  contexto: ContextoBackup,
  origem: 'agendador' | 'api' | 'cli' = 'agendador',
): Promise<ResultadoVerificacao> {
  const comeco = Date.now();

  const recuperaveis = await db
    .selectFrom('backups')
    .select(['id', 'rotulo'])
    .where('status', '=', 'concluido')
    .where('expurgado_em', 'is', null)
    .where('ambiente', '=', config.ambiente)
    .orderBy('iniciado_em', 'desc')
    .execute();

  const detalhe: ResultadoVerificacao['detalhe'] = [];
  let integros = 0;
  let corrompidos = 0;
  let ausentes = 0;

  for (const b of recuperaveis) {
    const r = await verificarBackup(b.id);
    if (!r.arquivo_existe) {
      ausentes++;
      detalhe.push({ rotulo: b.rotulo, situacao: 'ausente' });
    } else if (r.checksum_confere) {
      integros++;
      detalhe.push({ rotulo: b.rotulo, situacao: 'integro' });
    } else {
      corrompidos++;
      detalhe.push({ rotulo: b.rotulo, situacao: 'corrompido' });
    }
  }

  const registro = await db
    .insertInto('verificacoes_backup')
    .values({
      origem,
      tipo: 'checksum',
      backups_avaliados: recuperaveis.length,
      integros,
      corrompidos,
      ausentes,
      duracao_ms: Date.now() - comeco,
      detalhe: JSON.stringify({ backups: detalhe }),
    } as never)
    .returning('id')
    .executeTakeFirstOrThrow();

  if (corrompidos > 0 || ausentes > 0) {
    logger.error(
      { corrompidos, ausentes, detalhe },
      'Verificacao de checksum encontrou backups corrompidos ou ausentes',
    );
    await auditar({
      usuarioId: contexto.usuarioId,
      usuarioNome: contexto.usuarioNome,
      acao: 'backup_protegido',
      recurso: 'verificacoes_backup',
      recursoId: registro.id,
      modulo: 'sistema',
      resultado: 'erro',
      detalhe: { tipo: 'checksum', corrompidos, ausentes },
    });
  }

  return { id: registro.id, avaliados: recuperaveis.length, integros, corrompidos, ausentes, detalhe };
}

export interface ResultadoEnsaio {
  id: string;
  executado: boolean;
  motivo: string | null;
  backup: string | null;
  restauracao_id: string | null;
  status: string | null;
  divergencias: string[];
}

/**
 * Ensaio amostral: restaura de verdade um backup em banco isolado.
 *
 * O banco criado e removido ao fim — o ensaio prova que o arquivo restaura, nao
 * pretende deixar copia. Se a restauracao falhar, o banco fica de pe para
 * investigacao, e o nome sai no resultado.
 *
 * Escolhe o backup MAIS ANTIGO ainda nao testado. O recente costuma estar bom;
 * quem se degrada em repouso e o que esta ha mais tempo no disco.
 */
export async function ensaiarRestauracao(
  contexto: ContextoBackup,
  origem: 'agendador' | 'api' | 'cli' = 'agendador',
): Promise<ResultadoEnsaio> {
  const comeco = Date.now();

  const candidato = await db
    .selectFrom('backups')
    .select(['id', 'rotulo'])
    .where('status', '=', 'concluido')
    .where('expurgado_em', 'is', null)
    .where('ambiente', '=', config.ambiente)
    .orderBy('restauracao_testada_em', sql`asc nulls first`)
    .orderBy('iniciado_em', 'asc')
    .limit(AMOSTRA)
    .executeTakeFirst();

  if (!candidato) {
    const vazio = await db
      .insertInto('verificacoes_backup')
      .values({
        origem,
        tipo: 'ensaio_restauracao',
        duracao_ms: Date.now() - comeco,
        detalhe: JSON.stringify({ motivo: 'nenhum backup recuperavel para ensaiar' }),
      } as never)
      .returning('id')
      .executeTakeFirstOrThrow();

    return {
      id: vazio.id,
      executado: false,
      motivo: 'Nenhum backup recuperavel neste ambiente.',
      backup: null,
      restauracao_id: null,
      status: null,
      divergencias: [],
    };
  }

  const banco = `patrono_ensaio_${Date.now().toString(36)}`.toLowerCase();

  try {
    const relatorio = await restaurar(
      { backupId: candidato.id, destino: 'isolado', bancoIsolado: banco },
      contexto,
    );

    const registro = await db
      .insertInto('verificacoes_backup')
      .values({
        origem,
        tipo: 'ensaio_restauracao',
        backups_avaliados: 1,
        integros: relatorio.divergencias.length === 0 ? 1 : 0,
        corrompidos: relatorio.divergencias.length === 0 ? 0 : 1,
        backup_id: candidato.id,
        restauracao_id: relatorio.id,
        duracao_ms: Date.now() - comeco,
        detalhe: JSON.stringify({
          banco,
          status: relatorio.status,
          divergencias: relatorio.divergencias,
          integridade: relatorio.integridade,
        }),
      } as never)
      .returning('id')
      .executeTakeFirstOrThrow();

    // O banco do ensaio nao serve para nada depois da conferencia; deixa-lo de
    // pe so acumularia bancos abandonados. Em caso de divergencia, permanece.
    if (relatorio.divergencias.length === 0) {
      await removerBanco(banco);
    } else {
      logger.error(
        { banco, divergencias: relatorio.divergencias },
        'Ensaio de restauracao divergiu; o banco foi mantido para investigacao',
      );
    }

    return {
      id: registro.id,
      executado: true,
      motivo: null,
      backup: candidato.rotulo,
      restauracao_id: relatorio.id,
      status: relatorio.status,
      divergencias: relatorio.divergencias,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await removerBanco(banco);

    const registro = await db
      .insertInto('verificacoes_backup')
      .values({
        origem,
        tipo: 'ensaio_restauracao',
        backups_avaliados: 1,
        corrompidos: 1,
        backup_id: candidato.id,
        duracao_ms: Date.now() - comeco,
        erro: mensagem.slice(0, 2000),
      } as never)
      .returning('id')
      .executeTakeFirstOrThrow();

    logger.error(
      { backup: candidato.rotulo, erro: mensagem },
      'Ensaio de restauracao FALHOU: este backup nao restaura',
    );

    return {
      id: registro.id,
      executado: true,
      motivo: mensagem,
      backup: candidato.rotulo,
      restauracao_id: null,
      status: 'erro',
      divergencias: [mensagem],
    };
  }
}

async function removerBanco(nome: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { binario } = await import('./servico.js');
  await promisify(execFile)(binario('dropdb'), [
    '--if-exists',
    '--force',
    '--maintenance-db',
    config.banco.url,
    nome,
  ]).catch((erro) => {
    logger.warn({ banco: nome, erro: String(erro) }, 'Banco de ensaio nao pode ser removido');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// B15.6 — janela de backup agendado
// ═══════════════════════════════════════════════════════════════════════════

function diaDe(momento: Date): string {
  return momento.toISOString().slice(0, 10);
}

/** Abre a janela do dia. Idempotente: duas instancias nao criam duas linhas. */
export async function abrirJanela(esperadaPara: Date): Promise<void> {
  await db
    .insertInto('janelas_backup')
    .values({
      dia: diaDe(esperadaPara),
      ambiente: config.ambiente,
      esperada_para: esperadaPara,
    } as never)
    .onConflict((oc) => oc.column('dia').doNothing())
    .execute();
}

export async function registrarTentativa(dia: Date, erro: string | null): Promise<void> {
  await db
    .updateTable('janelas_backup')
    .set((eb) => ({
      tentativas: eb('tentativas', '+', 1),
      ultimo_erro: erro,
    }))
    .where('dia', '=', diaDe(dia))
    .execute();
}

export async function fecharJanela(dia: Date, backupId: string): Promise<void> {
  await db
    .updateTable('janelas_backup')
    .set({ concluida_em: new Date(), backup_id: backupId, ultimo_erro: null } as never)
    .where('dia', '=', diaDe(dia))
    .execute();
}

export interface JanelaPerdida {
  dia: string;
  esperada_para: Date;
  tentativas: number;
  ultimo_erro: string | null;
  horas_em_aberto: number;
}

/**
 * Janelas que abriram e nunca fecharam.
 *
 * Tolerancia de 2 horas depois da hora esperada: uma janela aberta as 3h e
 * consultada as 3h05 ainda pode estar rodando, e alarmar ali seria ruido.
 */
export async function janelasPerdidas(): Promise<JanelaPerdida[]> {
  const limite = new Date(Date.now() - 2 * 3_600_000);

  const linhas = await db
    .selectFrom('janelas_backup')
    .select(['dia', 'esperada_para', 'tentativas', 'ultimo_erro'])
    .where('ambiente', '=', config.ambiente)
    .where('concluida_em', 'is', null)
    .where('esperada_para', '<=', limite)
    .orderBy('dia', 'desc')
    .limit(30)
    .execute();

  return linhas.map((l) => ({
    dia: String(l.dia),
    esperada_para: new Date(l.esperada_para),
    tentativas: l.tentativas,
    ultimo_erro: l.ultimo_erro,
    horas_em_aberto:
      Math.round(((Date.now() - new Date(l.esperada_para).getTime()) / 3_600_000) * 10) / 10,
  }));
}

/** Ultima verificacao de cada tipo, para o relatorio de continuidade. */
export async function ultimasVerificacoes() {
  const [checksum, ensaio] = await Promise.all([
    db
      .selectFrom('verificacoes_backup')
      .select(['id', 'executada_em', 'backups_avaliados', 'integros', 'corrompidos', 'ausentes'])
      .where('tipo', '=', 'checksum')
      .orderBy('executada_em', 'desc')
      .executeTakeFirst(),
    db
      .selectFrom('verificacoes_backup')
      .select(['id', 'executada_em', 'backup_id', 'restauracao_id', 'corrompidos', 'erro'])
      .where('tipo', '=', 'ensaio_restauracao')
      .orderBy('executada_em', 'desc')
      .executeTakeFirst(),
  ]);

  return { checksum: checksum ?? null, ensaio: ensaio ?? null };
}
