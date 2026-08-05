/**
 * Backup do Patrono.
 *
 * Estrategia: dump logico integral (`pg_dump -Fc`), cifrado em repouso.
 *
 * Por que logico e nao fisico: o dump logico e restauravel em outra versao do
 * PostgreSQL e em outra maquina, e permite restaurar num banco isolado ao lado
 * do vivo — que e exatamente o que o procedimento de restauracao exige antes
 * de tocar em producao. Backup fisico (pg_basebackup + WAL) e mais rapido para
 * bases grandes e permite recuperacao a um ponto no tempo, mas amarra a
 * restauracao a mesma versao maior e exige acesso ao sistema de arquivos do
 * servidor. Para o tamanho desta base, o logico cobre com folga; o fisico esta
 * documentado em docs/BACKUP-RESTAURACAO.md como evolucao de infraestrutura.
 *
 * O que entra: TUDO. `pg_dump` sem `--exclude-table` — esquema, dados,
 * usuarios da aplicacao, permissoes, proveniencia, historico, fotografias,
 * vinculos, inconsistencias e a trilha de auditoria. Escolher tabelas seria
 * decidir hoje o que sera dispensavel numa emergencia futura.
 *
 * O que NAO entra: nenhuma credencial em claro. Senhas ja estao no banco como
 * hash scrypt, e tokens de sessao como SHA-256 — o dump carrega os hashes, nao
 * os segredos. Credenciais de Monday e Sienge vivem em variavel de ambiente e
 * nunca estiveram no banco.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sql } from 'kysely';
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from '../logging.js';
import { auditar } from '../audit/registrar.js';
import { conflito, entradaInvalida, ErroApi, naoEncontrado } from '../errors.js';
import { cifrarArquivo, ErroCofre, somaDoArquivo } from './cofre.js';
import { levantarVersoes } from './versoes.js';

const executar = promisify(execFile);

export type TipoBackup = 'completo' | 'preventivo' | 'pre_migracao' | 'agendado';
export type OrigemBackup = 'api' | 'cli' | 'agendador' | 'restauracao' | 'migracao';

export interface ContextoBackup {
  usuarioId: string | null;
  usuarioNome: string;
  perfil?: string | null;
  sessaoId?: string | null;
  enderecoIp?: string | null;
}

/** Caminho de um binario do PostgreSQL, respeitando PG_BIN. */
export function binario(nome: string): string {
  return config.backup.binarios ? join(config.backup.binarios, nome) : nome;
}

/**
 * Nome do banco extraido da URL de conexao.
 *
 * Sem `new URL`: uma senha com `@` ou `/` quebra o parser e a mensagem de erro
 * resultante costuma incluir a URL inteira — com a senha.
 */
export function bancoDaUrl(url: string): string {
  const semParametros = url.split('?')[0] ?? '';
  const ultimaBarra = semParametros.lastIndexOf('/');
  return ultimaBarra >= 0 ? semParametros.slice(ultimaBarra + 1) : semParametros;
}

/** Troca o banco na URL, preservando credenciais e parametros. */
export function urlComBanco(url: string, banco: string): string {
  const [base, parametros] = url.split('?');
  const ultimaBarra = (base ?? '').lastIndexOf('/');
  const prefixo = ultimaBarra >= 0 ? (base ?? '').slice(0, ultimaBarra) : (base ?? '');
  return `${prefixo}/${banco}${parametros ? `?${parametros}` : ''}`;
}

/**
 * Remove credencial de qualquer texto antes de gravar ou registrar.
 *
 * `pg_dump` e `pg_restore` costumam ecoar a URL de conexao na mensagem de erro.
 * Sem isto, a senha do banco iria para a coluna `erro` da tabela de backups e
 * para o log da aplicacao.
 */
export function mascarar(texto: string): string {
  return texto
    .replace(/(postgres(?:ql)?:\/\/)[^:@\s]+:[^@\s]+@/gi, '$1***:***@')
    .replace(/(PGPASSWORD|BACKUP_CHAVE|password)\s*=\s*\S+/gi, '$1=***');
}

function rotuloDe(ambiente: string, tipo: TipoBackup, quando: Date): string {
  const iso = quando.toISOString();
  const data = iso.slice(0, 10).replace(/-/g, '');
  const hora = iso.slice(11, 19).replace(/:/g, '');
  // Milissegundos no rotulo porque dois backups podem nascer no mesmo segundo:
  // uma restauracao gera o preventivo e, logo em seguida, outro backup. Sem
  // isso, o indice unico do rotulo derrubaria a operacao inteira.
  const ms = iso.slice(20, 23);
  return `patrono-${ambiente}-${tipo}-${data}-${hora}-${ms}`;
}

/**
 * Classe de retencao pela data.
 *
 * Primeiro dia do mes vale como mensal; domingo vale como semanal; o resto e
 * diario. Um mesmo backup pode ser mensal E semanal — fica com a classe mais
 * duradoura, que e o que o operador espera ao procurar "o backup do mes".
 */
export function classeDe(quando: Date): 'diario' | 'semanal' | 'mensal' {
  if (quando.getDate() === 1) return 'mensal';
  if (quando.getDay() === 0) return 'semanal';
  return 'diario';
}

/** Contagem por tabela. Base da conferencia depois da restauracao. */
export async function contarTudo(): Promise<{ contagens: Record<string, number>; total: number }> {
  const tabelas = await sql<{ nome: string }>`
    SELECT tablename AS nome FROM pg_tables
    WHERE schemaname = 'public' ORDER BY tablename
  `.execute(db);

  const contagens: Record<string, number> = {};
  let total = 0;

  for (const { nome } of tabelas.rows) {
    const r = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM ${sql.table(nome)}
    `.execute(db);
    const n = r.rows[0]?.n ?? 0;
    contagens[nome] = n;
    total += n;
  }

  return { contagens, total };
}

async function garantirDiretorio(caminho: string): Promise<void> {
  // 0700: o arquivo e uma copia integral da base pessoal. Ninguem alem do
  // dono do processo precisa sequer listar o diretorio.
  await fs.mkdir(caminho, { recursive: true, mode: 0o700 });
  await fs.chmod(caminho, 0o700).catch(() => {
    // Diretorio de outro dono (montagem de rede): seguimos, e o arquivo em si
    // continua 0600.
  });
}

export interface ResultadoBackup {
  id: string;
  rotulo: string;
  status: string;
  arquivo: string | null;
  tamanho_bytes: number | null;
  checksum: string | null;
  duracao_ms: number | null;
  total_registros: number | null;
  classe_retencao: string;
  local_armazenamento: string | null;
  copia_redundante: string | null;
  erro: string | null;
}

/**
 * Executa um backup completo.
 *
 * Sequencia, e a ordem importa:
 *   1. abre o registro com status `em_andamento` — se o processo morrer, fica
 *      a evidencia de que houve tentativa
 *   2. levanta versoes e contagens ANTES do dump
 *   3. `pg_dump` para arquivo temporario
 *   4. cifra, calculando os dois checksums
 *   5. remove o temporario em claro
 *   6. copia redundante, quando configurada
 *   7. relê o arquivo gravado e confere o checksum — sem isto, um disco cheio
 *      produziria um "backup concluido" truncado
 */
export async function executarBackup(
  opcoes: { tipo?: TipoBackup; origem?: OrigemBackup; protegido?: boolean; motivo?: string },
  contexto: ContextoBackup,
): Promise<ResultadoBackup> {
  const tipo = opcoes.tipo ?? 'completo';
  const origem = opcoes.origem ?? 'api';
  const inicio = new Date();
  const comeco = Date.now();

  if (!config.backup.cifraConfigurada) {
    throw new ErroApi(
      'entrada_invalida',
      'BACKUP_CHAVE nao configurada (minimo de 16 caracteres). O backup nao e gerado ' +
        'em claro: o dump contem CPF, contrato e situacao juridica de clientes reais.',
      { variavel: 'BACKUP_CHAVE' },
    );
  }

  const rotulo = rotuloDe(config.ambiente, tipo, inicio);
  const versoes = await levantarVersoes();

  const registro = await db
    .insertInto('backups')
    .values({
      rotulo,
      ambiente: config.ambiente,
      tipo,
      status: 'em_andamento',
      iniciado_em: inicio,
      versao_aplicacao: versoes.aplicacao,
      versao_banco: versoes.banco,
      versao_esquema: versoes.esquema,
      migracoes: JSON.stringify(versoes.aplicadas),
      iniciado_por: contexto.usuarioId,
      iniciado_por_nome: contexto.usuarioNome,
      origem,
      classe_retencao: classeDe(inicio),
      protegido: opcoes.protegido ?? false,
      detalhe: JSON.stringify({
        motivo: opcoes.motivo ?? null,
        migracoes_pendentes: versoes.pendentes,
        migracoes_divergentes: versoes.divergentes,
      }),
    } as never)
    .returning('id')
    .executeTakeFirstOrThrow();

  const diretorio = config.backup.diretorio;
  const arquivo = `${rotulo}.dump.enc`;
  const destino = join(diretorio, arquivo);
  const temporario = join(diretorio, `.${rotulo}.dump.tmp`);

  try {
    await garantirDiretorio(diretorio);

    const { contagens, total } = await contarTudo();

    // ── pg_dump ────────────────────────────────────────────────────────────
    //
    // -Fc (custom): comprimido, restauravel seletivamente e independente da
    // ordem das tabelas. --no-owner e --no-privileges porque o dono do banco
    // muda entre ambientes; as permissoes DA APLICACAO estao em
    // permissoes_perfil e vao nos dados, nao nos GRANTs do PostgreSQL.
    await executar(
      binario('pg_dump'),
      [
        '--dbname', config.banco.url,
        '--format', 'custom',
        '--compress', '6',
        '--no-owner',
        '--no-privileges',
        // Exclui os schemas de rollback. Uma restauracao em producao deixa o
        // estado anterior preservado em `antes_<carimbo>` (requisito B15.2);
        // sem isto, o backup seguinte carregaria duas copias da base.
        //
        // Por exclusao, e nao por `--schema public`: restringir a um schema faz
        // o pg_dump omitir `CREATE EXTENSION`, e o banco restaurado ficaria sem
        // pgcrypto — ou seja, sem `gen_random_uuid()` em toda chave primaria.
        '--exclude-schema', 'antes_*',
        '--exclude-schema', 'descartado_*',
        '--file', temporario,
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );

    const cifra = await cifrarArquivo(temporario, destino, config.backup.chave!);
    await fs.rm(temporario, { force: true });

    // ── Copia redundante ───────────────────────────────────────────────────
    let redundante: string | null = null;
    if (config.backup.diretorioRedundante) {
      try {
        await garantirDiretorio(config.backup.diretorioRedundante);
        const alvo = join(config.backup.diretorioRedundante, arquivo);
        await fs.copyFile(destino, alvo);
        await fs.chmod(alvo, 0o600);
        redundante = config.backup.diretorioRedundante;
      } catch (erro) {
        // Falha na copia redundante NAO invalida o backup primario. Fica
        // registrada: um backup sem redundancia e pior que dois, mas melhor
        // que nenhum.
        logger.error(
          { erro: mascarar(erro instanceof Error ? erro.message : String(erro)) },
          'Copia redundante do backup falhou; a copia primaria esta intacta',
        );
      }
    }

    // ── Conferencia do que ficou no disco ──────────────────────────────────
    //
    // Relê o arquivo. Disco cheio, montagem de rede caindo no meio da escrita
    // ou processo morto produzem arquivo truncado sem erro visivel.
    const conferencia = await somaDoArquivo(destino);
    if (conferencia.sha256 !== cifra.checksum) {
      throw new Error(
        'O arquivo gravado nao confere com o que foi cifrado: gravacao incompleta ou disco com problema.',
      );
    }

    const duracao = Date.now() - comeco;

    await db
      .updateTable('backups')
      .set({
        status: 'concluido',
        concluido_em: new Date(),
        duracao_ms: duracao,
        arquivo,
        local_armazenamento: diretorio,
        copia_redundante: redundante,
        tamanho_bytes: BigInt(cifra.tamanho) as never,
        tamanho_claro_bytes: BigInt(cifra.tamanhoClaro) as never,
        checksum: cifra.checksum,
        checksum_claro: cifra.checksumClaro,
        contagens: JSON.stringify(contagens),
        total_registros: BigInt(total) as never,
        verificado_em: new Date(),
      } as never)
      .where('id', '=', registro.id)
      .execute();

    await auditar({
      usuarioId: contexto.usuarioId,
      usuarioNome: contexto.usuarioNome,
      sessaoId: contexto.sessaoId ?? null,
      enderecoIp: contexto.enderecoIp ?? null,
      acao: 'backup_criado',
      recurso: 'backups',
      recursoId: registro.id,
      modulo: 'sistema',
      detalhe: {
        rotulo,
        tipo,
        origem,
        tamanho_bytes: cifra.tamanho,
        total_registros: total,
        duracao_ms: duracao,
        // Checksum na trilha permite conferir depois que o arquivo e o mesmo.
        checksum: cifra.checksum,
      },
    });

    logger.info({ rotulo, tamanho: cifra.tamanho, duracao }, 'Backup concluido');

    return detalharLinha({
      id: registro.id,
      rotulo,
      status: 'concluido',
      arquivo,
      tamanho_bytes: cifra.tamanho,
      checksum: cifra.checksum,
      duracao_ms: duracao,
      total_registros: total,
      classe_retencao: classeDe(inicio),
      local_armazenamento: diretorio,
      copia_redundante: redundante,
      erro: null,
    });
  } catch (erro) {
    const mensagem = mascarar(erro instanceof Error ? erro.message : String(erro));

    // Nao deixa arquivo pela metade fingindo ser backup.
    await fs.rm(temporario, { force: true }).catch(() => {});
    await fs.rm(destino, { force: true }).catch(() => {});

    await db
      .updateTable('backups')
      .set({
        status: 'erro',
        concluido_em: new Date(),
        duracao_ms: Date.now() - comeco,
        erro: mensagem.slice(0, 2000),
      } as never)
      .where('id', '=', registro.id)
      .execute();

    await auditar({
      usuarioId: contexto.usuarioId,
      usuarioNome: contexto.usuarioNome,
      sessaoId: contexto.sessaoId ?? null,
      enderecoIp: contexto.enderecoIp ?? null,
      acao: 'backup_criado',
      recurso: 'backups',
      recursoId: registro.id,
      modulo: 'sistema',
      resultado: 'erro',
      detalhe: { rotulo, tipo, erro: mensagem.slice(0, 500) },
    });

    logger.error({ rotulo, erro: mensagem }, 'Backup falhou');

    if (erro instanceof ErroCofre) throw erro;
    throw new ErroApi(
      'erro_interno',
      `Falha ao gerar o backup: ${mensagem.slice(0, 300)}`,
      { backup_id: registro.id },
    );
  }
}

function detalharLinha<T>(linha: T): T {
  return linha;
}

// ═══════════════════════════════════════════════════════════════════════════
// Consulta
// ═══════════════════════════════════════════════════════════════════════════

const CAMPOS_PUBLICOS = [
  'id', 'rotulo', 'ambiente', 'tipo', 'status', 'iniciado_em', 'concluido_em',
  'duracao_ms', 'versao_aplicacao', 'versao_banco', 'versao_esquema',
  'arquivo', 'local_armazenamento', 'copia_redundante', 'tamanho_bytes',
  'tamanho_claro_bytes', 'checksum', 'total_registros', 'iniciado_por_nome',
  'origem', 'classe_retencao', 'reter_ate', 'protegido', 'expurgado_em',
  'verificado_em', 'restauracao_testada_em', 'erro',
] as const;

export async function listarBackups(filtros: {
  ambiente?: string | null;
  status?: string | null;
  limite?: number;
}) {
  let consulta = db.selectFrom('backups').select(CAMPOS_PUBLICOS as never);

  if (filtros.ambiente) consulta = consulta.where('ambiente', '=', filtros.ambiente);
  if (filtros.status) consulta = consulta.where('status', '=', filtros.status as never);

  return consulta
    .orderBy('iniciado_em', 'desc')
    .limit(Math.min(filtros.limite ?? 50, 200))
    .execute();
}

export async function detalharBackup(id: string) {
  const linha = await db
    .selectFrom('backups')
    .select([...CAMPOS_PUBLICOS, 'migracoes', 'contagens', 'detalhe', 'checksum_claro'] as never)
    .where('id', '=', id)
    .executeTakeFirst();

  if (!linha) throw naoEncontrado('Backup nao encontrado.');

  const restauracoes = await db
    .selectFrom('restauracoes')
    .select([
      'id', 'destino', 'banco_destino', 'ambiente_destino', 'status',
      'iniciada_em', 'concluida_em', 'solicitada_por_nome', 'divergencias', 'erro',
    ])
    .where('backup_id', '=', id)
    .orderBy('iniciada_em', 'desc')
    .execute();

  return { ...linha, restauracoes };
}

/** Situacao da continuidade. E o que a Diretoria consulta. */
export async function relatorioContinuidade() {
  const recuperaveis = await db
    .selectFrom('backups')
    .select(['id', 'rotulo', 'iniciado_em', 'tamanho_bytes', 'total_registros', 'classe_retencao'])
    .where('status', '=', 'concluido')
    .where('expurgado_em', 'is', null)
    .where('ambiente', '=', config.ambiente)
    .orderBy('iniciado_em', 'desc')
    .execute();

  const ultimoSucesso = recuperaveis[0] ?? null;
  const ultimaFalha = await db
    .selectFrom('backups')
    .select(['rotulo', 'iniciado_em', 'erro'])
    .where('status', '=', 'erro')
    .orderBy('iniciado_em', 'desc')
    .executeTakeFirst();

  const ultimaRestauracaoTestada = await db
    .selectFrom('restauracoes')
    .select(['id', 'iniciada_em', 'status', 'destino', 'banco_destino'])
    .where('status', 'in', ['concluida', 'concluida_com_ressalvas'])
    .orderBy('iniciada_em', 'desc')
    .executeTakeFirst();

  const horasDesdeUltimo = ultimoSucesso
    ? (Date.now() - new Date(ultimoSucesso.iniciado_em).getTime()) / 3_600_000
    : null;

  const politica = await db
    .selectFrom('politica_retencao')
    .selectAll()
    .where('id', '=', 1)
    .executeTakeFirst();

  // Requisitos B15.5 e B15.6: a vigilancia entra no relatorio, porque um
  // backup nunca verificado e uma janela agendada que nao fechou sao
  // exatamente o que ninguem descobre sozinho.
  const { janelasPerdidas, ultimasVerificacoes } = await import('./vigilancia.js');
  const [perdidas, verificacoes] = await Promise.all([janelasPerdidas(), ultimasVerificacoes()]);

  return {
    janelas_perdidas: perdidas,
    verificacoes,
    ambiente: config.ambiente,
    cifra_configurada: config.backup.cifraConfigurada,
    agendamento_ativo: config.backup.horaDiaria !== null,
    copia_redundante_configurada: Boolean(config.backup.diretorioRedundante),
    backups_recuperaveis: recuperaveis.length,
    ultimo_backup: ultimoSucesso,
    horas_desde_ultimo: horasDesdeUltimo === null ? null : Math.round(horasDesdeUltimo * 10) / 10,
    ultima_falha: ultimaFalha ?? null,
    ultima_restauracao_testada: ultimaRestauracaoTestada ?? null,
    politica,
    // Um backup nunca testado e uma hipotese, nao uma garantia.
    alertas: montarAlertas({
      recuperaveis: recuperaveis.length,
      horasDesdeUltimo,
      testado: Boolean(ultimaRestauracaoTestada),
      minimo: politica?.minimo_recuperaveis ?? 3,
      perdidas,
      verificacoes,
    }),
  };
}

function montarAlertas(estado: {
  recuperaveis: number;
  horasDesdeUltimo: number | null;
  testado: boolean;
  minimo: number;
  perdidas: Array<{ dia: string; horas_em_aberto: number; ultimo_erro: string | null }>;
  verificacoes: {
    checksum: { executada_em: unknown; corrompidos: number; ausentes: number } | null;
    ensaio: { executada_em: unknown; corrompidos: number; erro: string | null } | null;
  };
}): string[] {
  const alertas: string[] = [];

  // B15.6 — backup agendado que nao concluiu.
  for (const j of estado.perdidas) {
    alertas.push(
      `Backup agendado de ${j.dia} NAO concluiu (${j.horas_em_aberto}h em aberto)` +
        (j.ultimo_erro ? `: ${j.ultimo_erro.slice(0, 160)}` : '.'),
    );
  }

  // B15.5 — verificacao periodica.
  const c = estado.verificacoes.checksum;
  if (!c) {
    alertas.push('Nenhuma verificacao de checksum foi executada ainda.');
  } else {
    if (c.corrompidos > 0) {
      alertas.push(`${c.corrompidos} backup(s) com checksum divergente na ultima verificacao.`);
    }
    if (c.ausentes > 0) {
      alertas.push(`${c.ausentes} backup(s) com arquivo ausente no armazenamento.`);
    }
    const dias = (Date.now() - new Date(c.executada_em as string).getTime()) / 86_400_000;
    if (dias > 2) {
      alertas.push(`A ultima verificacao de checksum tem ${Math.round(dias)} dias.`);
    }
  }

  const e = estado.verificacoes.ensaio;
  if (e) {
    if (e.erro) alertas.push(`O ultimo ensaio de restauracao falhou: ${e.erro.slice(0, 160)}`);
    else if (e.corrompidos > 0) alertas.push('O ultimo ensaio de restauracao divergiu na conferencia.');
    const dias = (Date.now() - new Date(e.executada_em as string).getTime()) / 86_400_000;
    if (dias > 10) {
      alertas.push(`O ultimo ensaio de restauracao tem ${Math.round(dias)} dias.`);
    }
  }

  if (!config.backup.cifraConfigurada) {
    alertas.push('BACKUP_CHAVE nao configurada: nenhum backup pode ser gerado.');
  }
  if (estado.recuperaveis === 0) {
    alertas.push('Nenhum backup recuperavel neste ambiente.');
  } else if (estado.recuperaveis < estado.minimo) {
    alertas.push(
      `Apenas ${estado.recuperaveis} backup(s) recuperavel(is); a politica pede ao menos ${estado.minimo}.`,
    );
  }
  if (estado.horasDesdeUltimo !== null && estado.horasDesdeUltimo > 48) {
    alertas.push(
      `O ultimo backup tem ${Math.round(estado.horasDesdeUltimo)} horas. Verifique o agendamento.`,
    );
  }
  if (!config.backup.horaDiaria) {
    alertas.push('Backup agendado desligado (BACKUP_HORA_DIARIA nao configurada).');
  }
  if (!config.backup.diretorioRedundante) {
    alertas.push('Sem copia redundante: um unico disco guarda todos os backups.');
  }
  if (!estado.testado) {
    alertas.push('Nenhuma restauracao foi testada. Backup nao testado e hipotese, nao garantia.');
  }

  return alertas;
}

// ═══════════════════════════════════════════════════════════════════════════
// Verificacao de integridade do arquivo
// ═══════════════════════════════════════════════════════════════════════════

export interface Verificacao {
  backup_id: string;
  rotulo: string;
  arquivo_existe: boolean;
  checksum_confere: boolean;
  tamanho_confere: boolean;
  esperado: string | null;
  obtido: string | null;
  mensagem: string;
}

/**
 * Confere o arquivo contra o checksum registrado.
 *
 * Nao precisa da chave: o checksum e do arquivo cifrado. Um backup que falha
 * aqui e marcado `corrompido` — e nao excluido. Excluir apagaria a unica pista
 * de que houve corrupcao, e um arquivo corrompido ainda pode ser parcialmente
 * recuperavel por quem entenda do formato.
 */
export async function verificarBackup(id: string): Promise<Verificacao> {
  const b = await db
    .selectFrom('backups')
    .select(['id', 'rotulo', 'arquivo', 'local_armazenamento', 'checksum', 'tamanho_bytes', 'status'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!b) throw naoEncontrado('Backup nao encontrado.');
  if (!b.arquivo || !b.checksum) {
    return {
      backup_id: id,
      rotulo: b.rotulo,
      arquivo_existe: false,
      checksum_confere: false,
      tamanho_confere: false,
      esperado: null,
      obtido: null,
      mensagem: 'Este backup nao chegou a gerar arquivo.',
    };
  }

  const caminho = join(b.local_armazenamento ?? config.backup.diretorio, b.arquivo);

  let obtido: { sha256: string; bytes: number };
  try {
    obtido = await somaDoArquivo(caminho);
  } catch {
    await db
      .updateTable('backups')
      .set({ status: 'corrompido', erro: 'Arquivo ausente no armazenamento.' } as never)
      .where('id', '=', id)
      .where('status', '=', 'concluido')
      .execute();

    return {
      backup_id: id,
      rotulo: b.rotulo,
      arquivo_existe: false,
      checksum_confere: false,
      tamanho_confere: false,
      esperado: b.checksum,
      obtido: null,
      mensagem: `Arquivo nao encontrado em ${caminho}. Verifique a montagem do armazenamento.`,
    };
  }

  const confere = obtido.sha256 === b.checksum;
  const tamanhoConfere = Number(b.tamanho_bytes) === obtido.bytes;

  if (!confere) {
    await db
      .updateTable('backups')
      .set({
        status: 'corrompido',
        erro: `Checksum divergente: esperado ${b.checksum}, obtido ${obtido.sha256}.`,
      } as never)
      .where('id', '=', id)
      .execute();
  } else if (b.status === 'concluido') {
    await db
      .updateTable('backups')
      .set({ verificado_em: new Date() } as never)
      .where('id', '=', id)
      .execute();
  }

  return {
    backup_id: id,
    rotulo: b.rotulo,
    arquivo_existe: true,
    checksum_confere: confere,
    tamanho_confere: tamanhoConfere,
    esperado: b.checksum,
    obtido: obtido.sha256,
    mensagem: confere
      ? 'Arquivo integro.'
      : 'O arquivo mudou depois de gravado. Marcado como corrompido; nao use para restaurar.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Retencao
// ═══════════════════════════════════════════════════════════════════════════

export interface ResultadoRetencao {
  avaliados: number;
  expurgados: string[];
  preservados: Array<{ rotulo: string; motivo: string }>;
}

/**
 * Aplica a politica de retencao.
 *
 * Tres travas contra apagar o que nao devia, nesta ordem:
 *   1. backup protegido nunca sai
 *   2. nada e expurgado antes da retencao minima, qualquer que seja a classe
 *   3. nunca ficam menos backups recuperaveis que o minimo da politica
 *
 * Backups `corrompido` NAO sao expurgados automaticamente: sao a evidencia de
 * um problema de armazenamento que alguem precisa olhar.
 */
export async function aplicarRetencao(
  contexto: ContextoBackup,
  opcoes: { simular?: boolean } = {},
): Promise<ResultadoRetencao> {
  const politica = await db
    .selectFrom('politica_retencao')
    .selectAll()
    .where('id', '=', 1)
    .executeTakeFirstOrThrow();

  const candidatos = await db
    .selectFrom('backups')
    .select([
      'id', 'rotulo', 'iniciado_em', 'classe_retencao', 'protegido',
      'arquivo', 'local_armazenamento', 'copia_redundante', 'status',
    ])
    .where('expurgado_em', 'is', null)
    .where('ambiente', '=', config.ambiente)
    .orderBy('iniciado_em', 'desc')
    .execute();

  const expurgados: string[] = [];
  const preservados: Array<{ rotulo: string; motivo: string }> = [];
  const manterPorClasse = {
    diario: politica.diarios_manter,
    semanal: politica.semanais_manter,
    mensal: politica.mensais_manter,
    permanente: Number.POSITIVE_INFINITY,
  };
  const vistosPorClasse: Record<string, number> = {};
  const agora = Date.now();
  const pisoMs = politica.retencao_minima_dias * 86_400_000;

  let recuperaveisRestantes = candidatos.filter((c) => c.status === 'concluido').length;

  for (const b of candidatos) {
    const classe = b.classe_retencao as keyof typeof manterPorClasse;
    vistosPorClasse[classe] = (vistosPorClasse[classe] ?? 0) + 1;

    if (b.protegido) {
      preservados.push({ rotulo: b.rotulo, motivo: 'protegido contra exclusao' });
      continue;
    }
    if (b.status === 'corrompido') {
      preservados.push({
        rotulo: b.rotulo,
        motivo: 'corrompido — mantido como evidencia para investigacao',
      });
      continue;
    }

    const idade = agora - new Date(b.iniciado_em).getTime();
    if (idade < pisoMs) {
      preservados.push({
        rotulo: b.rotulo,
        motivo: `dentro da retencao minima de ${politica.retencao_minima_dias} dias`,
      });
      continue;
    }

    if (vistosPorClasse[classe]! <= manterPorClasse[classe]) {
      preservados.push({ rotulo: b.rotulo, motivo: `dentro da cota de ${classe}s` });
      continue;
    }

    if (b.status === 'concluido' && recuperaveisRestantes <= politica.minimo_recuperaveis) {
      preservados.push({
        rotulo: b.rotulo,
        motivo: `sobrariam menos de ${politica.minimo_recuperaveis} backups recuperaveis`,
      });
      continue;
    }

    if (opcoes.simular) {
      expurgados.push(b.rotulo);
      continue;
    }

    // Remove o arquivo dos dois destinos; o metadado PERMANECE. Saber que
    // existiu um backup daquele dia, e que foi expurgado pela politica, faz
    // parte da trilha de continuidade.
    for (const base of [b.local_armazenamento, b.copia_redundante]) {
      if (!base || !b.arquivo) continue;
      await fs.rm(join(base, b.arquivo), { force: true }).catch((erro) => {
        logger.warn(
          { rotulo: b.rotulo, erro: mascarar(String(erro)) },
          'Falha ao remover arquivo de backup expurgado',
        );
      });
    }

    await db
      .updateTable('backups')
      .set({
        status: 'expurgado',
        expurgado_em: new Date(),
        expurgado_por: contexto.usuarioId,
      } as never)
      .where('id', '=', b.id)
      .where('protegido', '=', false)
      .execute();

    if (b.status === 'concluido') recuperaveisRestantes--;
    expurgados.push(b.rotulo);
  }

  if (expurgados.length && !opcoes.simular) {
    await auditar({
      usuarioId: contexto.usuarioId,
      usuarioNome: contexto.usuarioNome,
      sessaoId: contexto.sessaoId ?? null,
      enderecoIp: contexto.enderecoIp ?? null,
      acao: 'backup_expurgado',
      recurso: 'backups',
      modulo: 'sistema',
      detalhe: { expurgados, politica: { ...politica } },
    });
  }

  return { avaliados: candidatos.length, expurgados, preservados };
}

/** Marca ou desmarca a protecao contra exclusao. */
export async function definirProtecao(
  id: string,
  protegido: boolean,
  contexto: ContextoBackup,
): Promise<{ id: string; protegido: boolean }> {
  const b = await db
    .selectFrom('backups')
    .select(['id', 'rotulo', 'expurgado_em'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!b) throw naoEncontrado('Backup nao encontrado.');
  if (b.expurgado_em && protegido) {
    throw conflito('Este backup ja foi expurgado; proteger agora nao traz o arquivo de volta.');
  }

  await db.updateTable('backups').set({ protegido } as never).where('id', '=', id).execute();

  await auditar({
    usuarioId: contexto.usuarioId,
    usuarioNome: contexto.usuarioNome,
    sessaoId: contexto.sessaoId ?? null,
    enderecoIp: contexto.enderecoIp ?? null,
    acao: 'backup_protegido',
    recurso: 'backups',
    recursoId: id,
    modulo: 'sistema',
    detalhe: { rotulo: b.rotulo, protegido },
  });

  return { id, protegido };
}

/** Exclusao manual. Recusa backup protegido — a trava e do banco, nao daqui. */
export async function excluirBackup(
  id: string,
  contexto: ContextoBackup,
): Promise<{ excluido: boolean; rotulo: string }> {
  const b = await db
    .selectFrom('backups')
    .select(['id', 'rotulo', 'arquivo', 'local_armazenamento', 'copia_redundante', 'protegido', 'status'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!b) throw naoEncontrado('Backup nao encontrado.');
  if (b.protegido) {
    throw conflito(
      'Backup protegido contra exclusao. Retire a protecao primeiro — ' +
        'e a etapa que existe para que ninguem apague por engano.',
      { rotulo: b.rotulo },
    );
  }

  const restantes = await db
    .selectFrom('backups')
    .select(({ fn }) => [fn.countAll().as('n')])
    .where('status', '=', 'concluido')
    .where('expurgado_em', 'is', null)
    .where('ambiente', '=', config.ambiente)
    .where('id', '!=', id)
    .executeTakeFirst();

  const politica = await db
    .selectFrom('politica_retencao')
    .select('minimo_recuperaveis')
    .where('id', '=', 1)
    .executeTakeFirstOrThrow();

  if (b.status === 'concluido' && Number(restantes?.n ?? 0) < politica.minimo_recuperaveis) {
    throw conflito(
      `Excluir deixaria menos de ${politica.minimo_recuperaveis} backups recuperaveis neste ambiente. ` +
        'Gere um novo backup antes de excluir este.',
    );
  }

  for (const base of [b.local_armazenamento, b.copia_redundante]) {
    if (!base || !b.arquivo) continue;
    await fs.rm(join(base, b.arquivo), { force: true }).catch(() => {});
  }

  await db
    .updateTable('backups')
    .set({ status: 'expurgado', expurgado_em: new Date(), expurgado_por: contexto.usuarioId } as never)
    .where('id', '=', id)
    .where('protegido', '=', false)
    .execute();

  await auditar({
    usuarioId: contexto.usuarioId,
    usuarioNome: contexto.usuarioNome,
    sessaoId: contexto.sessaoId ?? null,
    enderecoIp: contexto.enderecoIp ?? null,
    acao: 'backup_expurgado',
    recurso: 'backups',
    recursoId: id,
    modulo: 'sistema',
    detalhe: { rotulo: b.rotulo, manual: true },
  });

  return { excluido: true, rotulo: b.rotulo };
}

export { entradaInvalida };
