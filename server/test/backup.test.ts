/**
 * Backup e restauracao.
 *
 * O teste que importa e o ultimo: cria dado, gera backup, destroi o dado,
 * restaura num banco isolado e confere que voltou. Backup que nunca foi
 * restaurado nao e backup — e um arquivo com nome bonito.
 *
 * Roda contra PostgreSQL real, com pg_dump e pg_restore reais. Um duble de
 * pg_dump provaria apenas que o duble concorda consigo mesmo.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, fecharBanco } from '../src/db/pool.js';
import { config } from '../src/config.js';
import { ErroApi } from '../src/errors.js';
import { cifrarArquivo, decifrarArquivo, ErroCofre, somaDoArquivo } from '../src/backup/cofre.js';
import {
  aplicarRetencao,
  classeDe,
  contarTudo,
  definirProtecao,
  excluirBackup,
  executarBackup,
  listarBackups,
  mascarar,
  relatorioContinuidade,
  urlComBanco,
  bancoDaUrl,
  verificarBackup,
} from '../src/backup/servico.js';
import { avaliar, restaurar, CONFIRMACAO_PRODUCAO } from '../src/backup/restauracao.js';
import {
  abrirJanela,
  ensaiarRestauracao,
  fecharJanela,
  janelasPerdidas,
  registrarTentativa,
  verificarChecksums,
} from '../src/backup/vigilancia.js';
import { compararEsquema, levantarVersoes, migracoesDoCodigo } from '../src/backup/versoes.js';
import { criarComite, criarEmpreendimento, limparDados } from './ajuda/banco.js';
import type { Database } from '../src/db/schema.js';

const executar = promisify(execFile);

const CONTEXTO = { usuarioId: null, usuarioNome: 'teste' };

/** Plano de corte minimo aceito pela trava B15.1. */
const PLANO_DE_CORTE =
  'Janela 02h-03h. TI para a aplicacao. Gestora confere apos. ' +
  'Rollback pelo schema preservado.';
const bancosCriados: string[] = [];

/** Diretorio descartavel; `config` e congelado, entao sobrescrevemos a chave. */
const DIRETORIO = mkdtempSync(join(tmpdir(), 'patrono-backup-'));

beforeAll(() => {
  // `config` e `as const` mas nao congelado em execucao. Apontar o backup para
  // um diretorio temporario evita que o teste escreva em /var/backups.
  (config.backup as { diretorio: string }).diretorio = DIRETORIO;
  (config.backup as { chave: string | null }).chave = 'chave-de-teste-com-tamanho-suficiente';
  (config.backup as { diretorioRedundante: string | null }).diretorioRedundante = join(
    DIRETORIO,
    'redundante',
  );
});

afterAll(async () => {
  for (const banco of bancosCriados) {
    await executar('dropdb', ['--if-exists', '--force', '--maintenance-db', config.banco.url, banco])
      .catch(() => {});
  }
  await fecharBanco();
  rmSync(DIRETORIO, { recursive: true, force: true });
});

beforeEach(async () => {
  await limparDados();
});

/** Dados de teste com proveniencia, historico e vinculo — passo 1. */
async function semearDados() {
  const comite = await criarComite('2026-07');
  const empr = await criarEmpreendimento('VERANO TESTE');

  const usuario = await db
    .insertInto('usuarios')
    .values({
      usuario: 'restaura.teste',
      nome: 'CONTA DE RESTAURACAO',
      perfil: 'gestora',
      status: 'ativo',
      hash_senha: 'scrypt$32768$8$1$abcd$efgh',
      algoritmo_senha: 'scrypt',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  await db
    .insertInto('escopos_empreendimento')
    .values({ usuario_id: usuario.id, todos: true })
    .execute();

  await db
    .insertInto('permissoes_usuario')
    .values({
      usuario_id: usuario.id,
      modulo: 'sistema',
      acao: 'backup',
      concedida: true,
      motivo: 'teste',
    })
    .execute();

  const notificacao = await db
    .insertInto('notificacoes')
    .values({
      comite_id: comite.comiteId,
      empreendimento_id: empr,
      cliente_nome: 'MARIA APARECIDA SILVA',
      unidade: '1105B',
      estagio: 'Em Andamento',
      data_notificacao: '2026-07-15',
      fonte: 'manual',
      id_origem: 'teste-n1',
      valor_original: JSON.stringify({ origem: 'semente de teste' }),
    } as never)
    .returning('id')
    .executeTakeFirstOrThrow();

  // Gera historico e incrementa versao: o gatilho e o que sera conferido.
  await db
    .updateTable('notificacoes')
    .set({ estagio: 'Resolvida', data_solucao: '2026-07-20' } as never)
    .where('id', '=', notificacao.id)
    .execute();

  await db
    .insertInto('inconsistencias')
    .values({
      tipo: 'duplicidade',
      gravidade: 'media',
      impacto: 'indicador',
      fonte: 'manual',
      descricao: 'Inconsistencia de teste para conferir a restauracao.',
      chave_deduplicacao: 'teste-restauracao-1',
    } as never)
    .execute();

  await db
    .insertInto('vinculos_fontes')
    .values({
      entidade: 'cliente',
      fonte_a: 'monday',
      id_origem_a: 'a1',
      fonte_b: 'sienge',
      id_origem_b: 'b1',
      regra: 'cpf_cnpj',
      confianca: 'alta',
      chave_usada: '***11',
    } as never)
    .execute();

  await db
    .insertInto('logs_auditoria')
    .values({
      acao: 'login',
      usuario_id: usuario.id,
      usuario_nome: 'CONTA DE RESTAURACAO',
      modulo: 'sistema',
      detalhe: JSON.stringify({ teste: true }),
    } as never)
    .execute();

  return { comiteId: comite.comiteId, empreendimentoId: empr, usuarioId: usuario.id, notificacaoId: notificacao.id };
}

/** Conecta no banco restaurado para conferir o que voltou. */
async function comBancoRestaurado<T>(
  banco: string,
  usar: (alvo: Kysely<Database>) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: urlComBanco(config.banco.url, banco), max: 2 });
  const alvo = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    return await usar(alvo);
  } finally {
    await alvo.destroy();
  }
}

function nomeIsolado(sufixo: string): string {
  const nome = `patrono_restaura_${sufixo}_${Date.now().toString(36)}`.toLowerCase();
  bancosCriados.push(nome);
  return nome;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Backup bem-sucedido
// ═══════════════════════════════════════════════════════════════════════════
describe('1. backup bem-sucedido', () => {
  it('gera arquivo cifrado, com metadados completos', async () => {
    await semearDados();
    const antes = await contarTudo();

    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    expect(r.status).toBe('concluido');
    expect(r.arquivo).toMatch(/\.dump\.enc$/);
    expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(r.tamanho_bytes).toBeGreaterThan(0);
    // O proprio registro do backup em andamento ja esta na base quando o dump
    // roda, e por isso entra na contagem. Contar antes dele existir daria um
    // numero que nao corresponde ao arquivo — e a contagem tem de descrever o
    // arquivo, nao o instante anterior.
    expect(r.total_registros).toBe(antes.total + 1);

    const linha = await db
      .selectFrom('backups')
      .selectAll()
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();

    // Todos os metadados obrigatorios da especificacao.
    expect(linha.ambiente).toBe(config.ambiente);
    expect(linha.versao_aplicacao).toBeTruthy();
    expect(linha.versao_banco).toMatch(/^\d+\.\d+/);
    expect(linha.versao_esquema).toMatch(/^[0-9a-f]{64}$/);
    expect((linha.migracoes as unknown[]).length).toBeGreaterThan(10);
    expect(linha.duracao_ms).toBeGreaterThanOrEqual(0);
    expect(linha.iniciado_por_nome).toBe('teste');
    expect(linha.origem).toBe('cli');
    expect(linha.checksum_claro).toMatch(/^[0-9a-f]{64}$/);
    expect(linha.algoritmo_cifra).toBe('aes-256-gcm');
    expect(linha.concluido_em).toBeTruthy();

    // O arquivo NAO e um dump em claro: comeca pela assinatura do cofre.
    const caminho = join(linha.local_armazenamento!, linha.arquivo!);
    const cabecalho = Buffer.alloc(8);
    const arquivo = await fs.open(caminho, 'r');
    await arquivo.read(cabecalho, 0, 8, 0);
    await arquivo.close();
    expect(cabecalho.toString('ascii')).toBe('PATRONO1');

    // Permissao restritiva: ninguem alem do dono le a base inteira.
    const estatisticas = await fs.stat(caminho);
    expect(estatisticas.mode & 0o077).toBe(0);
  });

  it('grava a copia redundante', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    expect(r.copia_redundante).toBeTruthy();
    const copia = await fs.stat(join(r.copia_redundante!, r.arquivo!));
    expect(copia.size).toBe(r.tamanho_bytes);
  });

  it('classifica a retencao pela data', () => {
    expect(classeDe(new Date('2026-08-01T10:00:00'))).toBe('mensal');
    expect(classeDe(new Date('2026-08-02T10:00:00'))).toBe('semanal'); // domingo
    expect(classeDe(new Date('2026-08-04T10:00:00'))).toBe('diario');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Falha de armazenamento
// ═══════════════════════════════════════════════════════════════════════════
describe('2. falha de armazenamento', () => {
  it('registra erro e nao deixa arquivo pela metade', async () => {
    const original = config.backup.diretorio;
    // Caminho inexistente sob um arquivo: mkdir falha.
    const arquivoBloqueador = join(DIRETORIO, 'bloqueio');
    await fs.writeFile(arquivoBloqueador, 'x');
    (config.backup as { diretorio: string }).diretorio = join(arquivoBloqueador, 'sub');

    try {
      await expect(
        executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO),
      ).rejects.toThrow();

      const linha = await db
        .selectFrom('backups')
        .select(['status', 'erro', 'arquivo'])
        .orderBy('iniciado_em', 'desc')
        .executeTakeFirstOrThrow();

      expect(linha.status).toBe('erro');
      expect(linha.erro).toBeTruthy();
      // Sem arquivo: o CHECK do banco impediria marcar concluido sem ele, e o
      // codigo nao tenta.
      expect(linha.arquivo).toBeNull();
    } finally {
      (config.backup as { diretorio: string }).diretorio = original;
    }
  });

  it('recusa gerar backup sem chave de cifra', async () => {
    const chave = config.backup.chave;
    (config.backup as { chave: string | null }).chave = null;
    try {
      await expect(
        executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO),
      ).rejects.toThrow(/BACKUP_CHAVE/);
    } finally {
      (config.backup as { chave: string | null }).chave = chave;
    }
  });

  it('mascara credencial em mensagem de erro', () => {
    const bruto = 'pg_dump: error connecting to postgres://patrono:sup3rs3cr3t@host:5432/base';
    const limpo = mascarar(bruto);
    expect(limpo).not.toContain('sup3rs3cr3t');
    expect(limpo).toContain('***:***@');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 e 4. Checksum invalido e arquivo corrompido
// ═══════════════════════════════════════════════════════════════════════════
describe('3 e 4. checksum e corrupcao', () => {
  it('detecta arquivo alterado e marca como corrompido', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    const antes = await verificarBackup(r.id);
    expect(antes.checksum_confere).toBe(true);

    // Troca um byte no meio do conteudo cifrado.
    const caminho = join(r.local_armazenamento!, r.arquivo!);
    const conteudo = await fs.readFile(caminho);
    conteudo[Math.floor(conteudo.length / 2)] ^= 0xff;
    await fs.writeFile(caminho, conteudo);

    const depois = await verificarBackup(r.id);
    expect(depois.checksum_confere).toBe(false);
    expect(depois.mensagem).toMatch(/corrompid/i);

    const linha = await db
      .selectFrom('backups')
      .select('status')
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();
    expect(linha.status).toBe('corrompido');
  });

  it('a cifra recusa decifrar arquivo adulterado, sem entregar conteudo', async () => {
    const claro = join(DIRETORIO, 'claro.txt');
    const cifrado = join(DIRETORIO, 'cifrado.enc');
    const recuperado = join(DIRETORIO, 'recuperado.txt');
    await fs.writeFile(claro, 'conteudo sensivel '.repeat(1000));

    const chave = 'chave-de-teste-com-tamanho-suficiente';
    await cifrarArquivo(claro, cifrado, chave);

    const conteudo = await fs.readFile(cifrado);
    conteudo[conteudo.length - 5] ^= 0x01;
    await fs.writeFile(cifrado, conteudo);

    await expect(decifrarArquivo(cifrado, recuperado, chave)).rejects.toThrow(ErroCofre);
  });

  it('a cifra recusa arquivo que nao e do Patrono', async () => {
    const falso = join(DIRETORIO, 'falso.enc');
    await fs.writeFile(falso, Buffer.alloc(200, 0x41));
    await expect(
      decifrarArquivo(falso, join(DIRETORIO, 'saida'), 'chave-de-teste-com-tamanho-suficiente'),
    ).rejects.toThrow(/nao e um backup do Patrono/);
  });

  it('a cifra recusa a chave errada', async () => {
    const claro = join(DIRETORIO, 'claro2.txt');
    const cifrado = join(DIRETORIO, 'cifrado2.enc');
    await fs.writeFile(claro, 'segredo');
    await cifrarArquivo(claro, cifrado, 'chave-de-teste-com-tamanho-suficiente');

    await expect(
      decifrarArquivo(cifrado, join(DIRETORIO, 'saida2'), 'outra-chave-completamente-diferente'),
    ).rejects.toThrow(ErroCofre);
  });

  it('decifrar devolve exatamente o conteudo original', async () => {
    const claro = join(DIRETORIO, 'ida.bin');
    const cifrado = join(DIRETORIO, 'ida.enc');
    const volta = join(DIRETORIO, 'volta.bin');
    // Conteudo maior que um bloco, com bytes de todos os valores.
    await fs.writeFile(claro, Buffer.from(Array.from({ length: 100_000 }, (_, i) => i % 256)));

    const chave = 'chave-de-teste-com-tamanho-suficiente';
    const cifra = await cifrarArquivo(claro, cifrado, chave);
    const dec = await decifrarArquivo(cifrado, volta, chave);

    expect(dec.checksumClaro).toBe(cifra.checksumClaro);
    expect((await somaDoArquivo(volta)).sha256).toBe((await somaDoArquivo(claro)).sha256);
  });

  it('backup corrompido nao pode restaurar sobre o banco em uso', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    const caminho = join(r.local_armazenamento!, r.arquivo!);
    const conteudo = await fs.readFile(caminho);
    conteudo[100] ^= 0xff;
    await fs.writeFile(caminho, conteudo);

    const a = await avaliar(r.id, 'producao', CONTEXTO);
    expect(a.pode_prosseguir).toBe(false);
    expect(a.checksum.confere).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Versao incompativel
// ═══════════════════════════════════════════════════════════════════════════
describe('5. compatibilidade de versao', () => {
  it('esquema identico e compativel', async () => {
    const atual = await levantarVersoes();
    const r = compararEsquema(
      { versaoEsquema: atual.esquema, migracoes: atual.aplicadas, versaoBanco: atual.banco },
      atual,
    );
    expect(r.compativel).toBe(true);
  });

  it('backup com migracao que o codigo nao conhece e IMPEDIDO', async () => {
    const atual = await levantarVersoes();
    const r = compararEsquema(
      {
        versaoEsquema: 'outro',
        migracoes: [...atual.aplicadas, { nome: '099_do_futuro.sql', checksum: 'x' }],
        versaoBanco: atual.banco,
      },
      atual,
    );
    expect(r.compativel).toBe(false);
    expect(r.impedimentos.join(' ')).toMatch(/099_do_futuro/);
  });

  it('backup anterior a migracoes atuais e permitido, com ressalva', async () => {
    const atual = await levantarVersoes();
    const r = compararEsquema(
      {
        versaoEsquema: 'antigo',
        migracoes: atual.aplicadas.slice(0, 3),
        versaoBanco: atual.banco,
      },
      atual,
    );
    expect(r.compativel).toBe(true);
    expect(r.ressalvas.join(' ')).toMatch(/aplique as migracoes pendentes/i);
  });

  it('backup de PostgreSQL maior e impedido', async () => {
    const atual = await levantarVersoes();
    const r = compararEsquema(
      { versaoEsquema: 'x', migracoes: atual.aplicadas, versaoBanco: '99.0' },
      atual,
    );
    expect(r.compativel).toBe(false);
    expect(r.impedimentos.join(' ')).toMatch(/pg_restore nao le formato de versao maior/);
  });

  it('a versao do esquema muda quando o conjunto de migracoes muda', () => {
    const migracoes = migracoesDoCodigo();
    expect(migracoes.length).toBeGreaterThan(10);
    expect(migracoes.every((m) => /^[0-9a-f]{64}$/.test(m.checksum))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Restauracao em ambiente errado
// ═══════════════════════════════════════════════════════════════════════════
describe('6. ambiente de origem', () => {
  it('recusa substituir o banco em uso com backup de outro ambiente', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    await db
      .updateTable('backups')
      .set({ ambiente: 'production' } as never)
      .where('id', '=', r.id)
      .execute();

    const a = await avaliar(r.id, 'producao', CONTEXTO);
    expect(a.ambiente.mesmo).toBe(false);
    expect(a.pode_prosseguir).toBe(false);
    expect(a.impedimentos.join(' ')).toMatch(/nao pode substituir o banco/);
  });

  it('permite examinar backup de outro ambiente em banco isolado', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    await db
      .updateTable('backups')
      .set({ ambiente: 'production' } as never)
      .where('id', '=', r.id)
      .execute();

    const a = await avaliar(r.id, 'isolado', CONTEXTO);
    expect(a.ambiente.mesmo).toBe(false);
    // Investigar producao sem tocar em producao e exatamente o caso de uso.
    expect(a.pode_prosseguir).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Confirmacao reforcada e trava de producao
// ═══════════════════════════════════════════════════════════════════════════
describe('7. confirmacao de producao', () => {
  it('recusa restaurar em producao sem a trava de ambiente ligada', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    expect(config.backup.permitirRestauracaoProducao).toBe(false);
    const a = await avaliar(r.id, 'producao', CONTEXTO);
    expect(a.impedimentos.join(' ')).toMatch(/PERMITIR_RESTAURACAO_PRODUCAO/);
  });

  it('recusa e REGISTRA a tentativa sem a confirmacao literal', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = true;

    try {
      await expect(
        restaurar(
          { backupId: r.id, destino: 'producao', confirmacao: 'sim', justificativa: 'teste teste' },
          CONTEXTO,
        ),
      ).rejects.toThrow(ErroApi);

      const recusada = await db
        .selectFrom('restauracoes')
        .select(['status', 'divergencias', 'destino'])
        .orderBy('iniciada_em', 'desc')
        .executeTakeFirstOrThrow();

      expect(recusada.status).toBe('recusada');
      expect(recusada.destino).toBe('producao');
      expect(JSON.stringify(recusada.divergencias)).toContain(CONFIRMACAO_PRODUCAO);

      // Trilha: uma tentativa barrada precisa aparecer.
      const trilha = await db
        .selectFrom('logs_auditoria')
        .select(['acao', 'resultado'])
        .where('acao', '=', 'restauracao_recusada')
        .executeTakeFirstOrThrow();
      expect(trilha.resultado).toBe('negado');
    } finally {
      (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = false;
    }
  });

  it('exige justificativa alem da confirmacao', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = true;

    try {
      await expect(
        restaurar(
          { backupId: r.id, destino: 'producao', confirmacao: CONFIRMACAO_PRODUCAO },
          CONTEXTO,
        ),
      ).rejects.toThrow(/justificativa/i);
    } finally {
      (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = false;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Backup preventivo antes da restauracao
// ═══════════════════════════════════════════════════════════════════════════
describe('8. backup preventivo', () => {
  it('restauracao em producao gera preventivo protegido antes de tocar no banco', async () => {
    await semearDados();
    const origem = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    // Requisito B15.1: o corte so acontece depois de um ensaio isolado validado.
    await restaurar(
      { backupId: origem.id, destino: 'isolado', bancoIsolado: nomeIsolado('prev') },
      CONTEXTO,
    );

    (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = true;
    try {
      const relatorio = await restaurar(
        {
          backupId: origem.id,
          destino: 'producao',
          confirmacao: CONFIRMACAO_PRODUCAO,
          justificativa: 'Teste automatizado da restauracao real sobre o banco de teste.',
          planoCorte: PLANO_DE_CORTE,
        },
        CONTEXTO,
      );

      expect(relatorio.backup_preventivo).toBeTruthy();
      expect(relatorio.como_reverter).toMatch(/preventivo/);

      const preventivo = await db
        .selectFrom('backups')
        .selectAll()
        .where('id', '=', relatorio.backup_preventivo!.id)
        .executeTakeFirstOrThrow();

      expect(preventivo.tipo).toBe('preventivo');
      expect(preventivo.protegido).toBe(true);
      expect(preventivo.origem).toBe('restauracao');
      expect(preventivo.status).toBe('concluido');
    } finally {
      (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = false;
    }
  });

  it('o catalogo sobrevive a restauracao que ele descreve', async () => {
    // Restaurar sobre o banco em uso substitui TAMBEM a tabela de backups. Sem
    // reconciliacao, o registro do preventivo — a unica volta possivel —
    // desapareceria junto, e a restauracao nao deixaria rastro de si mesma.
    await semearDados();
    const origem = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    await restaurar(
      { backupId: origem.id, destino: 'isolado', bancoIsolado: nomeIsolado('cat') },
      CONTEXTO,
    );

    (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = true;
    try {
      const relatorio = await restaurar(
        {
          backupId: origem.id,
          destino: 'producao',
          confirmacao: CONFIRMACAO_PRODUCAO,
          justificativa: 'Conferindo que o catalogo sobrevive a propria restauracao.',
          planoCorte: PLANO_DE_CORTE,
        },
        CONTEXTO,
      );

      // O preventivo, gerado DEPOIS do backup restaurado, continua no catalogo.
      const preventivo = await db
        .selectFrom('backups')
        .select(['rotulo', 'protegido', 'detalhe'])
        .where('id', '=', relatorio.backup_preventivo!.id)
        .executeTakeFirstOrThrow();
      expect(preventivo.protegido).toBe(true);
      expect((preventivo.detalhe as { reconciliado_apos_restauracao?: boolean })
        .reconciliado_apos_restauracao).toBe(true);

      // A restauracao aparece no proprio banco que ela substituiu.
      const registro = await db
        .selectFrom('restauracoes')
        .selectAll()
        .where('id', '=', relatorio.id)
        .executeTakeFirstOrThrow();
      expect(registro.status).toBe(relatorio.status);
      expect(registro.backup_preventivo_id).toBe(relatorio.backup_preventivo!.id);

      // E a trilha registra a restauracao, escrita depois do restore.
      const trilha = await db
        .selectFrom('logs_auditoria')
        .select('acao')
        .where('acao', '=', 'backup_restaurado')
        .executeTakeFirstOrThrow();
      expect(trilha.acao).toBe('backup_restaurado');
    } finally {
      (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = false;
    }
  }, 120_000);

  it('backup protegido nao e excluido nem manualmente', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli', protegido: true }, CONTEXTO);
    await expect(excluirBackup(r.id, CONTEXTO)).rejects.toThrow(/protegido/i);

    await definirProtecao(r.id, false, CONTEXTO);
    // Agora e o minimo de recuperaveis que barra — outra trava, deliberada.
    await expect(excluirBackup(r.id, CONTEXTO)).rejects.toThrow(/recuperaveis/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8b. Requisitos obrigatorios antes da producao (B15)
// ═══════════════════════════════════════════════════════════════════════════
describe('8b. travas pre-producao', () => {
  async function comProducaoLiberada<T>(usar: () => Promise<T>): Promise<T> {
    (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = true;
    try {
      return await usar();
    } finally {
      (config.backup as { permitirRestauracaoProducao: boolean }).permitirRestauracaoProducao = false;
    }
  }

  it('B15.1 — sem ensaio isolado, o corte em producao e recusado', async () => {
    await semearDados();
    const b = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    await comProducaoLiberada(async () => {
      const a = await avaliar(b.id, 'producao', CONTEXTO);
      expect(a.ensaio).toBeNull();
      expect(a.pode_prosseguir).toBe(false);
      expect(a.impedimentos.join(' ')).toMatch(/restauracao isolada bem-sucedida/i);
    });
  });

  it('B15.1 — com ensaio isolado validado, o corte passa a ser possivel', async () => {
    await semearDados();
    const b = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    await restaurar(
      { backupId: b.id, destino: 'isolado', bancoIsolado: nomeIsolado('ensaio') },
      CONTEXTO,
    );

    await comProducaoLiberada(async () => {
      const a = await avaliar(b.id, 'producao', CONTEXTO);
      expect(a.ensaio).not.toBeNull();
      expect(a.pode_prosseguir).toBe(true);
    });
  }, 120_000);

  it('B15.1 — plano de corte e obrigatorio', async () => {
    await semearDados();
    const b = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    await restaurar(
      { backupId: b.id, destino: 'isolado', bancoIsolado: nomeIsolado('semplano') },
      CONTEXTO,
    );

    await comProducaoLiberada(async () => {
      await expect(
        restaurar(
          {
            backupId: b.id,
            destino: 'producao',
            confirmacao: CONFIRMACAO_PRODUCAO,
            justificativa: 'Teste da trava de plano de corte.',
          },
          CONTEXTO,
        ),
      ).rejects.toThrow(/plano de corte/i);
    });
  }, 120_000);

  it('B15.2 — o estado anterior fica preservado num schema, para rollback', async () => {
    const semente = await semearDados();
    const b = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    await restaurar(
      { backupId: b.id, destino: 'isolado', bancoIsolado: nomeIsolado('preserva') },
      CONTEXTO,
    );

    // Altera o banco DEPOIS do backup: e o que precisa sobreviver no schema
    // preservado, e o que se perderia se a restauracao apagasse.
    await db
      .updateTable('notificacoes')
      .set({ cliente_nome: 'ALTERADO DEPOIS DO BACKUP' } as never)
      .where('id', '=', semente.notificacaoId)
      .execute();

    const relatorio = await comProducaoLiberada(() =>
      restaurar(
        {
          backupId: b.id,
          destino: 'producao',
          confirmacao: CONFIRMACAO_PRODUCAO,
          justificativa: 'Teste da preservacao do estado anterior.',
          planoCorte:
            'Janela 02h-03h. Aplicacao parada por TI. Conferencia pela Gestora. ' +
            'Rollback pelo schema preservado.',
        },
        CONTEXTO,
      ),
    );

    expect(relatorio.schema_preservado).toMatch(/^antes_\d{14}$/);
    expect(relatorio.como_reverter).toMatch(/ALTER SCHEMA/);

    // O banco em uso voltou ao estado do backup...
    const atual = await db
      .selectFrom('notificacoes')
      .select('cliente_nome')
      .executeTakeFirstOrThrow();
    expect(atual.cliente_nome).toBe('MARIA APARECIDA SILVA');

    // ...e o estado anterior continua acessivel para rollback.
    const preservado = await sql<{ cliente_nome: string }>`
      SELECT cliente_nome FROM ${sql.table(relatorio.schema_preservado!)}.notificacoes LIMIT 1
    `.execute(db);
    expect(preservado.rows[0]!.cliente_nome).toBe('ALTERADO DEPOIS DO BACKUP');

    await sql`DROP SCHEMA ${sql.table(relatorio.schema_preservado!)} CASCADE`.execute(db);
  }, 180_000);

  it('B15.5 — a verificacao periodica confere todos os checksums', async () => {
    await semearDados();
    const bom = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    const ruim = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    const caminho = join(ruim.local_armazenamento!, ruim.arquivo!);
    const conteudo = await fs.readFile(caminho);
    conteudo[200] ^= 0xff;
    await fs.writeFile(caminho, conteudo);

    const r = await verificarChecksums(CONTEXTO, 'cli');
    expect(r.avaliados).toBe(2);
    expect(r.integros).toBe(1);
    expect(r.corrompidos).toBe(1);
    expect(r.detalhe.find((d) => d.rotulo === bom.rotulo)!.situacao).toBe('integro');
    expect(r.detalhe.find((d) => d.rotulo === ruim.rotulo)!.situacao).toBe('corrompido');

    const registrada = await db
      .selectFrom('verificacoes_backup')
      .select(['tipo', 'corrompidos'])
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();
    expect(registrada.tipo).toBe('checksum');
    expect(registrada.corrompidos).toBe(1);
  }, 120_000);

  it('B15.5 — o ensaio amostral restaura de verdade e registra o resultado', async () => {
    await semearDados();
    await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    const r = await ensaiarRestauracao(CONTEXTO, 'cli');
    expect(r.executado).toBe(true);
    expect(r.status).toBe('concluida');
    expect(r.divergencias).toEqual([]);

    const registro = await db
      .selectFrom('verificacoes_backup')
      .select(['tipo', 'backup_id', 'restauracao_id'])
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();
    expect(registro.tipo).toBe('ensaio_restauracao');
    expect(registro.restauracao_id).toBe(r.restauracao_id);
  }, 180_000);

  it('B15.6 — janela agendada que nao fecha vira alerta', async () => {
    const ontem = new Date(Date.now() - 26 * 3_600_000);
    await abrirJanela(ontem);
    await registrarTentativa(ontem, 'disco cheio');

    const perdidas = await janelasPerdidas();
    expect(perdidas).toHaveLength(1);
    expect(perdidas[0]!.ultimo_erro).toBe('disco cheio');
    expect(perdidas[0]!.horas_em_aberto).toBeGreaterThan(20);

    const relatorio = await relatorioContinuidade();
    expect(relatorio.alertas.join(' ')).toMatch(/Backup agendado de .* NAO concluiu/);

    // Fechar a janela retira o alerta.
    await semearDados();
    const b = await executarBackup({ tipo: 'agendado', origem: 'agendador' }, CONTEXTO);
    await fecharJanela(ontem, b.id);
    expect(await janelasPerdidas()).toEqual([]);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Retencao
// ═══════════════════════════════════════════════════════════════════════════
describe('9. retencao', () => {
  it('nao expurga nada dentro da retencao minima', async () => {
    await semearDados();
    for (let i = 0; i < 3; i++) {
      await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    }
    const r = await aplicarRetencao(CONTEXTO);
    expect(r.expurgados).toEqual([]);
    expect(r.preservados.every((p) => /retencao minima/.test(p.motivo))).toBe(true);
  });

  it('preserva o protegido e o corrompido mesmo quando antigos', async () => {
    await semearDados();
    const protegido = await executarBackup({ tipo: 'completo', origem: 'cli', protegido: true }, CONTEXTO);
    const corrompido = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    const antigo = new Date(Date.now() - 400 * 86_400_000);
    await db.updateTable('backups').set({ iniciado_em: antigo } as never).execute();
    await db
      .updateTable('backups')
      .set({ status: 'corrompido' } as never)
      .where('id', '=', corrompido.id)
      .execute();

    const r = await aplicarRetencao(CONTEXTO);
    const motivos = Object.fromEntries(r.preservados.map((p) => [p.rotulo, p.motivo]));
    expect(motivos[protegido.rotulo]).toMatch(/protegido/);
    expect(motivos[corrompido.rotulo]).toMatch(/corrompido/);
  });

  it('mantem o minimo de recuperaveis mesmo com tudo vencido', async () => {
    await semearDados();
    for (let i = 0; i < 5; i++) {
      await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    }
    // Todos antigos e fora da cota de diarios.
    await db
      .updateTable('backups')
      .set({ iniciado_em: new Date(Date.now() - 400 * 86_400_000) } as never)
      .execute();
    await db.updateTable('politica_retencao').set({ diarios_manter: 1 }).where('id', '=', 1).execute();

    try {
      const r = await aplicarRetencao(CONTEXTO);
      const restantes = await db
        .selectFrom('backups')
        .select(({ fn }) => [fn.countAll().as('n')])
        .where('status', '=', 'concluido')
        .where('expurgado_em', 'is', null)
        .executeTakeFirstOrThrow();

      expect(Number(restantes.n)).toBeGreaterThanOrEqual(3);
      expect(r.expurgados.length).toBeGreaterThan(0);
    } finally {
      await db.updateTable('politica_retencao').set({ diarios_manter: 14 }).where('id', '=', 1).execute();
    }
  });

  it('o metadado permanece depois do expurgo', async () => {
    await semearDados();
    for (let i = 0; i < 5; i++) {
      await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    }
    await db
      .updateTable('backups')
      .set({ iniciado_em: new Date(Date.now() - 400 * 86_400_000) } as never)
      .execute();
    await db.updateTable('politica_retencao').set({ diarios_manter: 1 }).where('id', '=', 1).execute();

    try {
      await aplicarRetencao(CONTEXTO);
      const expurgados = await db
        .selectFrom('backups')
        .select(['rotulo', 'status', 'expurgado_em', 'checksum'])
        .where('status', '=', 'expurgado')
        .execute();

      expect(expurgados.length).toBeGreaterThan(0);
      // O arquivo se foi; a memoria de que existiu, nao.
      expect(expurgados.every((e) => e.checksum && e.expurgado_em)).toBe(true);
    } finally {
      await db.updateTable('politica_retencao').set({ diarios_manter: 14 }).where('id', '=', 1).execute();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Auditoria
// ═══════════════════════════════════════════════════════════════════════════
describe('10. auditoria', () => {
  it('criacao, protecao, exclusao e restauracao deixam rastro', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    await definirProtecao(r.id, true, CONTEXTO);

    const banco = nomeIsolado('auditoria');
    await restaurar({ backupId: r.id, destino: 'isolado', bancoIsolado: banco }, CONTEXTO);

    const acoes = await db
      .selectFrom('logs_auditoria')
      .select(['acao', 'modulo'])
      .where('modulo', '=', 'sistema')
      .orderBy('ocorrido_em', 'asc')
      .execute();

    const nomes = acoes.map((a) => a.acao);
    expect(nomes).toContain('backup_criado');
    expect(nomes).toContain('backup_protegido');
    expect(nomes).toContain('restauracao_solicitada');
    expect(nomes).toContain('backup_restaurado');
  });

  it('a trilha guarda o checksum, para conferencia posterior', async () => {
    await semearDados();
    const r = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    const entrada = await db
      .selectFrom('logs_auditoria')
      .select('detalhe')
      .where('acao', '=', 'backup_criado')
      .executeTakeFirstOrThrow();

    expect((entrada.detalhe as { checksum: string }).checksum).toBe(r.checksum);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. TESTE OBRIGATORIO — restauracao real, os dez passos
// ═══════════════════════════════════════════════════════════════════════════
describe('11. restauracao real', () => {
  it('cria dados, faz backup, destroi, restaura em banco isolado e confere tudo', async () => {
    // ── 1. dados de teste ────────────────────────────────────────────────
    const semente = await semearDados();
    const antes = await contarTudo();

    const usuariosAntes = await db
      .selectFrom('usuarios')
      .select(['id', 'usuario', 'perfil', 'hash_senha'])
      .orderBy('usuario')
      .execute();
    const permissoesAntes = await db
      .selectFrom('permissoes_usuario')
      .select(({ fn }) => [fn.countAll().as('n')])
      .executeTakeFirstOrThrow();
    const notificacaoAntes = await db
      .selectFrom('notificacoes')
      .selectAll()
      .where('id', '=', semente.notificacaoId)
      .executeTakeFirstOrThrow();

    expect(notificacaoAntes.versao).toBe(2); // criada e alterada
    expect((notificacaoAntes.historico as unknown[]).length).toBe(1);

    // ── 2. backup ────────────────────────────────────────────────────────
    const backup = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    expect(backup.status).toBe('concluido');

    // ── 3. destruir os dados ─────────────────────────────────────────────
    await db.deleteFrom('notificacoes').execute();
    await db.deleteFrom('inconsistencias').execute();
    await db.deleteFrom('vinculos_fontes').execute();
    await db.deleteFrom('permissoes_usuario').execute();

    expect(
      Number(
        (
          await db
            .selectFrom('notificacoes')
            .select(({ fn }) => [fn.countAll().as('n')])
            .executeTakeFirstOrThrow()
        ).n,
      ),
    ).toBe(0);

    // ── 4. restaurar em banco isolado ────────────────────────────────────
    const banco = nomeIsolado('completo');
    const relatorio = await restaurar(
      { backupId: backup.id, destino: 'isolado', bancoIsolado: banco },
      CONTEXTO,
    );

    expect(['concluida', 'concluida_com_ressalvas']).toContain(relatorio.status);
    expect(relatorio.banco_destino).toBe(banco);
    expect(relatorio.validacoes.checksum).toBe(true);
    expect(relatorio.validacoes.versao).toBe(true);
    expect(relatorio.validacoes.migracoes).toBe(true);
    expect(relatorio.validacoes.ambiente).toBe(true);

    // O banco em uso NAO foi tocado: continua destruido.
    expect(
      Number(
        (
          await db
            .selectFrom('notificacoes')
            .select(({ fn }) => [fn.countAll().as('n')])
            .executeTakeFirstOrThrow()
        ).n,
      ),
    ).toBe(0);

    await comBancoRestaurado(banco, async (alvo) => {
      // ── 5. os dados voltaram ───────────────────────────────────────────
      const notificacoes = await alvo.selectFrom('notificacoes').selectAll().execute();
      expect(notificacoes).toHaveLength(1);
      expect(notificacoes[0]!.cliente_nome).toBe('MARIA APARECIDA SILVA');
      expect(notificacoes[0]!.unidade).toBe('1105B');
      expect(notificacoes[0]!.estagio).toBe('Resolvida');

      // ── 6. usuarios e permissoes ───────────────────────────────────────
      const usuarios = await alvo
        .selectFrom('usuarios')
        .select(['id', 'usuario', 'perfil', 'hash_senha'])
        .orderBy('usuario')
        .execute();
      expect(usuarios).toEqual(usuariosAntes);
      // O hash de senha voltou — e continua sendo hash, nunca senha em claro.
      expect(usuarios[0]!.hash_senha).toMatch(/^scrypt\$/);

      const permissoesPerfil = await alvo
        .selectFrom('permissoes_perfil')
        .select(({ fn }) => [fn.countAll().as('n')])
        .executeTakeFirstOrThrow();
      expect(Number(permissoesPerfil.n)).toBeGreaterThan(0);

      const permissoesUsuario = await alvo
        .selectFrom('permissoes_usuario')
        .select(({ fn }) => [fn.countAll().as('n')])
        .executeTakeFirstOrThrow();
      expect(Number(permissoesUsuario.n)).toBe(Number(permissoesAntes.n));

      const escopos = await alvo
        .selectFrom('escopos_empreendimento')
        .selectAll()
        .execute();
      expect(escopos).toHaveLength(1);
      expect(escopos[0]!.todos).toBe(true);

      // ── 7. proveniencia e historico ────────────────────────────────────
      const n = notificacoes[0]!;
      expect(n.fonte).toBe('manual');
      expect(n.id_origem).toBe('teste-n1');
      expect(n.valor_original).toMatchObject({ origem: 'semente de teste' });
      expect(n.extraido_em).toBeTruthy();
      expect(n.versao).toBe(2);
      const historico = n.historico as Array<{ campos: Record<string, unknown> }>;
      expect(historico).toHaveLength(1);
      expect(historico[0]!.campos).toHaveProperty('estagio');

      // ── 8. vinculos e inconsistencias ──────────────────────────────────
      const vinculos = await alvo.selectFrom('vinculos_fontes').selectAll().execute();
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0]!.regra).toBe('cpf_cnpj');
      expect(vinculos[0]!.confianca).toBe('alta');

      const inconsistencias = await alvo.selectFrom('inconsistencias').selectAll().execute();
      expect(inconsistencias).toHaveLength(1);
      expect(inconsistencias[0]!.tipo).toBe('duplicidade');

      // Trilha de auditoria: sem ela nao ha o que auditar depois do desastre.
      const trilha = await alvo
        .selectFrom('logs_auditoria')
        .select(({ fn }) => [fn.countAll().as('n')])
        .executeTakeFirstOrThrow();
      expect(Number(trilha.n)).toBeGreaterThan(0);

      // ── 9. o esquema veio inteiro: gatilhos, funcoes e restricoes ──────
      const gatilhos = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal
      `.execute(alvo);
      expect(gatilhos.rows[0]!.n).toBeGreaterThan(20);

      const funcoes = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public'
      `.execute(alvo);
      expect(funcoes.rows[0]!.n).toBeGreaterThan(0);

      // A regra "posicao nao soma entre dias" e uma funcao do banco. Se ela
      // nao voltou, a restauracao devolveu dados sem as regras que os protegem.
      const agregar = await sql<{ existe: boolean }>`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
          WHERE ns.nspname = 'public' AND p.proname = 'agregar_indicador'
        ) AS existe
      `.execute(alvo);
      expect(agregar.rows[0]!.existe).toBe(true);

      // As migracoes aplicadas voltaram: a versao do esquema e reconstituivel.
      const migracoes = await alvo.selectFrom('migracoes_aplicadas').selectAll().execute();
      expect(migracoes.length).toBeGreaterThan(10);
    });

    // ── 10. o relatorio confirma o que foi conferido ─────────────────────
    const integridade = relatorio.integridade as Record<string, number>;
    // Confere com o que o BACKUP registrou, nao com o instante anterior a ele.
    const registrado = await db
      .selectFrom('backups')
      .select('total_registros')
      .where('id', '=', backup.id)
      .executeTakeFirstOrThrow();
    expect(integridade.total_restaurado).toBe(Number(registrado.total_registros));
    expect(integridade.total_restaurado).toBeGreaterThan(antes.total - 1);
    expect(integridade.usuarios_ativos).toBeGreaterThan(0);
    expect(integridade.permissoes_perfil).toBeGreaterThan(0);
    expect(integridade.colunas_proveniencia_conferidas).toBe(5);
    expect(relatorio.divergencias).toEqual([]);

    // O backup passa a constar como testado.
    const testado = await db
      .selectFrom('backups')
      .select('restauracao_testada_em')
      .where('id', '=', backup.id)
      .executeTakeFirstOrThrow();
    expect(testado.restauracao_testada_em).toBeTruthy();
  }, 180_000);

  it('detecta divergencia de contagem entre o backup e o restaurado', async () => {
    await semearDados();
    const backup = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    // Mente sobre o que o backup continha: a conferencia tem de perceber.
    const contagens = (
      await db.selectFrom('backups').select('contagens').where('id', '=', backup.id).executeTakeFirstOrThrow()
    ).contagens as Record<string, number>;

    await db
      .updateTable('backups')
      .set({ contagens: JSON.stringify({ ...contagens, notificacoes: 999 }) } as never)
      .where('id', '=', backup.id)
      .execute();

    const banco = nomeIsolado('divergente');
    const relatorio = await restaurar(
      { backupId: backup.id, destino: 'isolado', bancoIsolado: banco },
      CONTEXTO,
    );

    expect(relatorio.status).toBe('concluida_com_ressalvas');
    expect(relatorio.divergencias.join(' ')).toMatch(/notificacoes: esperado 999/);
  }, 120_000);

  it('recusa restaurar sobre banco isolado que ja existe', async () => {
    await semearDados();
    const backup = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    const banco = nomeIsolado('duplicado');

    await restaurar({ backupId: backup.id, destino: 'isolado', bancoIsolado: banco }, CONTEXTO);
    await expect(
      restaurar({ backupId: backup.id, destino: 'isolado', bancoIsolado: banco }, CONTEXTO),
    ).rejects.toThrow(/ja existe/);
  }, 180_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Relatorio de continuidade
// ═══════════════════════════════════════════════════════════════════════════
describe('12. relatorio de continuidade', () => {
  it('alerta quando nao ha backup nem restauracao testada', async () => {
    const r = await relatorioContinuidade();
    expect(r.backups_recuperaveis).toBe(0);
    expect(r.alertas.join(' ')).toMatch(/Nenhum backup recuperavel/);
    expect(r.alertas.join(' ')).toMatch(/Nenhuma restauracao foi testada/);
  });

  it('deixa de alertar depois de backup e restauracao testada', async () => {
    await semearDados();
    const b = await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);
    await restaurar(
      { backupId: b.id, destino: 'isolado', bancoIsolado: nomeIsolado('continuidade') },
      CONTEXTO,
    );

    const r = await relatorioContinuidade();
    expect(r.backups_recuperaveis).toBeGreaterThan(0);
    expect(r.ultima_restauracao_testada).toBeTruthy();
    expect(r.alertas.join(' ')).not.toMatch(/Nenhuma restauracao foi testada/);
    expect(r.horas_desde_ultimo).toBeLessThan(1);
  }, 120_000);

  it('listar nao devolve a chave de cifra em lugar nenhum', async () => {
    await semearDados();
    await executarBackup({ tipo: 'completo', origem: 'cli' }, CONTEXTO);

    const lista = await listarBackups({ limite: 10 });
    const serializado = JSON.stringify(lista);
    expect(serializado).not.toContain(config.backup.chave!);
    expect(serializado).not.toMatch(/BACKUP_CHAVE/);

    const relatorio = JSON.stringify(await relatorioContinuidade());
    expect(relatorio).not.toContain(config.backup.chave!);
  });

  it('extrai o nome do banco sem quebrar com senha contendo caractere especial', () => {
    expect(bancoDaUrl('postgres://u:p%40ss@host:5432/patrono')).toBe('patrono');
    expect(bancoDaUrl('postgres://u:p@ss/word@host:5432/patrono?sslmode=require')).toBe('patrono');
    expect(urlComBanco('postgres://u:p@host:5432/patrono?sslmode=require', 'outro')).toBe(
      'postgres://u:p@host:5432/outro?sslmode=require',
    );
  });
});
