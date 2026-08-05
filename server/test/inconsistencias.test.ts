/**
 * Central de Inconsistencias — um teste por requisito obrigatorio.
 *
 * Roda contra PostgreSQL real. Os requisitos 12 (nao alterar os originais) e 11
 * (historico completo) sao impostos por gatilho no banco; testa-los contra mock
 * nao provaria nada.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import { gravarBruto, iniciarExecucao } from '../src/integracoes/execucoes.js';
import {
  atribuir,
  catalogo,
  encerrar,
  historico,
  listar,
  obter,
  paraStatusApi,
  registrar,
  registrarAmbiguidade,
  registrarAnalise,
  registrarDivergencia,
  registrosDeOrigem,
  resumo,
  type ContextoUsuario,
  type LadoDoConflito,
} from '../src/inconsistencias/servico.js';
import { TIPOS, traduzirMensagem } from '../src/inconsistencias/tipos.js';
import { contar, criarComite, criarEmpreendimento, limparDados } from './ajuda/banco.js';

/** O caso desenhado em 3d do Diagnostico e Wireframes: contrato C-1042. */
const LADO_MONDAY: LadoDoConflito = {
  fonte: 'monday',
  id_origem: 'item-99887',
  campo: 'saldo_vencido',
  valor: 64000,
  data_referencia: '2026-03-04',
  extraido_em: '2026-03-04T06:00:00.000Z',
  url_origem: 'https://coevo.monday.com/boards/5630368737/pulses/item-99887',
};

const LADO_SIENGE: LadoDoConflito = {
  fonte: 'sienge',
  id_origem: 'titulo-4471',
  campo: 'saldo_vencido',
  valor: 66071.1,
  data_referencia: '2026-05-28',
  extraido_em: '2026-05-28T05:00:00.000Z',
};

let contexto: ContextoUsuario;
let usuarioId: string;
let outroUsuarioId: string;
let empreendimentoId: string;
let competenciaRef: string;

async function criarUsuario(login: string, perfil: 'gestora' | 'lider' | 'colaborador') {
  const linha = await db
    .insertInto('usuarios')
    .values({
      usuario: login,
      nome: login.toUpperCase(),
      perfil,
      area: 'juridico',
      status: 'ativo',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return linha.id;
}

beforeEach(async () => {
  await limparDados();
  const c = await criarComite('2026-05');
  competenciaRef = c.competenciaRef;
  empreendimentoId = await criarEmpreendimento('VERANO');
  usuarioId = await criarUsuario('cristiane', 'gestora');
  outroUsuarioId = await criarUsuario('ana.lider', 'lider');
  contexto = {
    usuarioId,
    usuarioNome: 'CRISTIANE',
    perfil: 'gestora',
    enderecoIp: '10.0.0.1',
  };
});

afterAll(async () => {
  await fecharBanco();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisitos 1, 2 e 3 — dois valores, fontes e identificadores originais', () => {
  it('preserva os dois valores com fonte, id_origem e datas de cada lado', async () => {
    const { id } = await registrarDivergencia(
      {
        campo: 'saldo_vencido',
        ladoA: LADO_MONDAY,
        ladoB: LADO_SIENGE,
        precedencia: 'financeiro: sienge > monday',
        valorAplicado: 66071.1,
        contrato: 'C-1042',
        empreendimentoId,
        competenciaRef,
        dataReferencia: '2026-05-28',
      },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    const lados = linha.valores_em_conflito as LadoDoConflito[];
    expect(lados).toHaveLength(2);

    const monday = lados.find((l) => l.fonte === 'monday')!;
    const sienge = lados.find((l) => l.fonte === 'sienge')!;

    // Requisito 1: os dois valores originais, intactos.
    expect(monday.valor).toBe(64000);
    expect(sienge.valor).toBe(66071.1);
    // Requisito 2: a fonte de cada lado.
    expect(monday.fonte).toBe('monday');
    expect(sienge.fonte).toBe('sienge');
    // Requisito 3: o identificador original de cada registro.
    expect(monday.id_origem).toBe('item-99887');
    expect(sienge.id_origem).toBe('titulo-4471');
    // As datas de referencia diferentes ficam visiveis — e o que explica a
    // divergencia sem acusar erro de ninguem.
    expect(monday.data_referencia).toBe('2026-03-04');
    expect(sienge.data_referencia).toBe('2026-05-28');

    // Precedencia aplicada e o valor que entrou no indicador, declarados.
    expect(linha.precedencia_aplicada).toBe('financeiro: sienge > monday');
    expect(linha.valor_aplicado).toBe(66071.1);
    // Diferenca monetaria calculada, para triagem por dinheiro em risco.
    expect(Number(linha.impacto_valor)).toBeCloseTo(2071.1, 2);
    expect(linha.impacto).toBe('valor_financeiro');
    // Monday x Sienge tem tipo proprio (extensao ao schema da skill).
    expect(linha.tipo).toBe('conflito_monday_sienge');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisitos 4 e 5 — regra e confianca do vinculo', () => {
  it('grava a regra usada e o nivel de confianca', async () => {
    const { id } = await registrarDivergencia(
      {
        campo: 'saldo_vencido',
        ladoA: LADO_MONDAY,
        ladoB: LADO_SIENGE,
        precedencia: 'financeiro: sienge > monday',
        valorAplicado: 66071.1,
        regraVinculo: 'cpf_cnpj',
        confiancaVinculo: 'alta',
        empreendimentoId,
      },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .select(['regra_vinculo', 'confianca_vinculo'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(linha.regra_vinculo).toBe('cpf_cnpj');
    expect(linha.confianca_vinculo).toBe('alta');
  });

  it('ambiguidade sempre entra com confianca baixa', async () => {
    const { id } = await registrarAmbiguidade(
      {
        fonte: 'consolidacao',
        entidade: 'cliente',
        chaveUsada: 'MARIA SILVA',
        regraVinculo: 'nome',
        candidatos: [
          { fonte: 'monday', id_origem: 'item-1', campo: 'cliente', valor: 'MARIA SILVA' },
          { fonte: 'sienge', id_origem: 'cli-77', campo: 'cliente', valor: 'MARIA SILVA' },
          { fonte: 'sienge', id_origem: 'cli-91', campo: 'cliente', valor: 'MARIA SILVA' },
        ],
        empreendimentoId,
      },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .select(['confianca_vinculo', 'regra_vinculo', 'gravidade', 'bloqueia_indicador'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    // Confianca baixa e exatamente o motivo de nao decidir sozinho.
    expect(linha.confianca_vinculo).toBe('baixa');
    expect(linha.regra_vinculo).toBe('nome');
    expect(linha.gravidade).toBe('critica');
    expect(linha.bloqueia_indicador).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisito 6 — nao escolher automaticamente na ambiguidade', () => {
  it('preserva TODOS os candidatos e nao elege nenhum', async () => {
    const { id } = await registrarAmbiguidade(
      {
        fonte: 'consolidacao',
        entidade: 'contrato',
        chaveUsada: 'CT-2024-001',
        regraVinculo: 'contrato',
        candidatos: [
          { fonte: 'sienge', id_origem: 'doc-A', campo: 'cpf_cnpj', valor: '52998224725' },
          { fonte: 'sienge', id_origem: 'doc-B', campo: 'cpf_cnpj', valor: '11144477735' },
        ],
        empreendimentoId,
      },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .select(['valores_em_conflito', 'valor_aplicado', 'precedencia_aplicada', 'status_revisao'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect((linha.valores_em_conflito as unknown[]).length).toBe(2);
    // O ponto central: NENHUM valor foi eleito.
    expect(linha.valor_aplicado).toBeNull();
    expect(linha.precedencia_aplicada).toBeNull();
    // Fica pendente, aguardando decisao humana.
    expect(paraStatusApi(linha.status_revisao)).toBe('pendente');
  });

  it('recusa registrar ambiguidade com menos de dois candidatos', async () => {
    await expect(
      registrarAmbiguidade(
        {
          fonte: 'consolidacao',
          entidade: 'cliente',
          chaveUsada: 'X',
          regraVinculo: 'nome',
          candidatos: [{ fonte: 'monday', id_origem: 'a', campo: 'cliente', valor: 'X' }],
        },
        contexto,
      ),
    ).rejects.toThrow(/dois candidatos/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisito 7 — atribuicao de responsavel', () => {
  it('atribui e move de pendente para em revisao', async () => {
    const { id } = await registrar(
      { tipo: 'cpf_cnpj_invalido', fonte: 'monday', descricao: 'CPF invalido', empreendimentoId },
      contexto,
    );

    await atribuir(id, outroUsuarioId, contexto);

    const linha = await db
      .selectFrom('inconsistencias')
      .select(['responsavel_id', 'status_revisao'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(linha.responsavel_id).toBe(outroUsuarioId);
    // A fila de triagem deve mostrar so o que ainda nao tem dono.
    expect(paraStatusApi(linha.status_revisao)).toBe('em_revisao');
  });

  it('area responsavel padrao vem do catalogo do tipo', async () => {
    const { id } = await registrar(
      { tipo: 'saldo_duplicado', fonte: 'sienge', descricao: 'Saldo duplicado', empreendimentoId },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .select('responsavel_area')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    // saldo_duplicado e do financeiro, nao do juridico.
    expect(linha.responsavel_area).toBe('financeiro');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisito 8 — tipo, gravidade e impacto', () => {
  it('os 20 tipos do catalogo estao completos e classificados', () => {
    const tipos = catalogo();
    // 17 do schema da skill + 3 extensoes documentadas em DECISOES.md
    // + `divergencia_judicializacao`, criado com a politica de judicializacao.
    expect(tipos).toHaveLength(21);
    for (const t of tipos) {
      expect(t.gravidade_padrao).toMatch(/^(baixa|media|alta|critica)$/);
      expect(t.area_responsavel).toBeTruthy();
      expect(t.orientacao.length).toBeGreaterThan(20);
    }
  });

  it('gravidade e impacto sao dimensoes independentes', async () => {
    const { id } = await registrar(
      {
        tipo: 'grafia_divergente',
        fonte: 'monday',
        descricao: 'Nomes divergentes',
        // Gravidade baixa (nao urgente) mas impacto financeiro (altera valor).
        gravidade: 'baixa',
        impacto: 'valor_financeiro',
        impactoValor: 15000,
        empreendimentoId,
      },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .select(['gravidade', 'impacto', 'impacto_valor'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(linha.gravidade).toBe('baixa');
    expect(linha.impacto).toBe('valor_financeiro');
    expect(Number(linha.impacto_valor)).toBe(15000);
  });

  it('gravidade padrao vem do catalogo quando nao informada', async () => {
    const { id } = await registrar(
      { tipo: 'vinculo_ambiguo', fonte: 'consolidacao', descricao: 'Ambiguo' },
      contexto,
    );
    const linha = await db
      .selectFrom('inconsistencias')
      .select('gravidade')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(linha.gravidade).toBe(TIPOS.vinculo_ambiguo.gravidadePadrao);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisitos 9 e 10 — analise, decisao, justificativa e estados', () => {
  it('registra analise sem encerrar o caso', async () => {
    const { id } = await registrar(
      { tipo: 'contrato_ausente', fonte: 'monday', descricao: 'Sem contrato', empreendimentoId },
      contexto,
    );

    await registrarAnalise(
      id,
      { analise: 'Contrato existe no Sienge sob outro numero. Conferido com o financeiro.' },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .select(['analise', 'decisao', 'status_revisao', 'resolvido_em'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(linha.analise).toContain('outro numero');
    // Analisar nao decide: decisao continua vazia e o caso segue aberto.
    expect(linha.decisao).toBeNull();
    expect(paraStatusApi(linha.status_revisao)).toBe('em_revisao');
    expect(linha.resolvido_em).toBeNull();
  });

  it('encerra como resolvida exigindo decisao e justificativa', async () => {
    const { id } = await registrar(
      { tipo: 'contrato_ausente', fonte: 'monday', descricao: 'Sem contrato', empreendimentoId },
      contexto,
    );

    await encerrar(
      id,
      {
        status: 'resolvida',
        decisao: 'Vinculado ao contrato CT-2024-001 do Sienge.',
        justificativa: 'CPF confere e a unidade e a mesma. Confirmado com o financeiro em 04/08.',
      },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .select(['status_revisao', 'decisao', 'justificativa', 'resolvido_em', 'resolvido_por', 'bloqueia_indicador'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(paraStatusApi(linha.status_revisao)).toBe('resolvida');
    expect(linha.decisao).toContain('CT-2024-001');
    expect(linha.justificativa).toContain('CPF confere');
    expect(linha.resolvido_em).not.toBeNull();
    expect(linha.resolvido_por).toBe(usuarioId);
    // Decisao humana desbloqueia o indicador.
    expect(linha.bloqueia_indicador).toBe(false);
  });

  it('encerra como descartada', async () => {
    const { id } = await registrar(
      { tipo: 'grafia_divergente', fonte: 'monday', descricao: 'Grafia', empreendimentoId },
      contexto,
    );

    await encerrar(
      id,
      {
        status: 'descartada',
        decisao: 'Sem acao necessaria.',
        justificativa: 'Sao duas pessoas homonimas distintas, com CPF diferente.',
      },
      contexto,
    );

    const linha = await db
      .selectFrom('inconsistencias')
      .select('status_revisao')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    // O produto fala "descartada"; o schema da skill grava "ignorada".
    expect(linha.status_revisao).toBe('ignorada');
    expect(paraStatusApi(linha.status_revisao)).toBe('descartada');
  });

  it('recusa encerrar sem decisao ou sem justificativa', async () => {
    const { id } = await registrar(
      { tipo: 'contrato_ausente', fonte: 'monday', descricao: 'x', empreendimentoId },
      contexto,
    );

    await expect(
      encerrar(id, { status: 'resolvida', decisao: '  ', justificativa: 'porque' }, contexto),
    ).rejects.toThrow(/decisao/i);

    await expect(
      encerrar(id, { status: 'resolvida', decisao: 'feito', justificativa: '  ' }, contexto),
    ).rejects.toThrow(/justificativa/i);
  });

  it('recusa reescrever o encerramento de um caso ja tratado', async () => {
    const { id } = await registrar(
      { tipo: 'contrato_ausente', fonte: 'monday', descricao: 'x', empreendimentoId },
      contexto,
    );
    await encerrar(
      id,
      { status: 'resolvida', decisao: 'a', justificativa: 'b' },
      contexto,
    );

    // O historico nao se reescreve: reincidencia gera caso novo.
    await expect(
      encerrar(id, { status: 'descartada', decisao: 'c', justificativa: 'd' }, contexto),
    ).rejects.toThrow(/ja foi encerrada/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisito 11 — historico completo e append-only', () => {
  it('registra cada etapa do tratamento em ordem', async () => {
    const { id } = await registrarDivergencia(
      {
        campo: 'saldo_vencido',
        ladoA: LADO_MONDAY,
        ladoB: LADO_SIENGE,
        precedencia: 'financeiro: sienge > monday',
        valorAplicado: 66071.1,
        empreendimentoId,
      },
      contexto,
    );

    await atribuir(id, outroUsuarioId, contexto);
    await registrarAnalise(id, { analise: 'Datas de referencia diferentes.' }, contexto);
    await encerrar(
      id,
      {
        status: 'resolvida',
        decisao: 'Mantido o valor do Sienge.',
        justificativa: 'Posicao mais recente e precedencia financeira do Sienge.',
      },
      contexto,
    );

    const eventos = await historico(id);
    const nomes = eventos.map((e) => e.evento);

    expect(nomes).toEqual(['detectada', 'atribuida', 'analisada', 'resolvida']);

    // O evento de atribuicao guarda de quem para quem.
    const atribuicao = eventos.find((e) => e.evento === 'atribuida')!;
    expect(atribuicao.responsavel_antes).toBeNull();
    expect(atribuicao.responsavel_depois).toBe(outroUsuarioId);

    // O encerramento guarda decisao e justificativa como foram escritas.
    const resolucao = eventos.find((e) => e.evento === 'resolvida')!;
    expect(resolucao.decisao).toBe('Mantido o valor do Sienge.');
    expect(resolucao.justificativa).toContain('precedencia financeira');
    expect(resolucao.usuario_nome).toBe('CRISTIANE');
  });

  it('o historico nao pode ser alterado nem apagado', async () => {
    const { id } = await registrar(
      { tipo: 'duplicidade', fonte: 'monday', descricao: 'x', empreendimentoId },
      contexto,
    );

    await expect(
      db.updateTable('inconsistencias_eventos').set({ evento: 'fraude' }).execute(),
    ).rejects.toThrow(/append-only/i);

    await expect(
      db.deleteFrom('inconsistencias_eventos').where('inconsistencia_id', '=', id).execute(),
    ).rejects.toThrow(/append-only/i);
  });

  it('reincidencia incrementa contador em vez de duplicar a fila', async () => {
    const dados = {
      tipo: 'cpf_cnpj_invalido' as const,
      fonte: 'monday' as const,
      descricao: 'CPF invalido no item 42',
      empreendimentoId,
      chaveExtra: ['item-42'],
    };

    const primeira = await registrar(dados, contexto);
    const segunda = await registrar(dados, contexto);
    const terceira = await registrar(dados, contexto);

    expect(segunda.reincidencia).toBe(true);
    expect(terceira.id).toBe(primeira.id);
    expect(await contar('inconsistencias')).toBe(1);

    const linha = await db
      .selectFrom('inconsistencias')
      .select('ocorrencias')
      .where('id', '=', primeira.id)
      .executeTakeFirstOrThrow();
    expect(linha.ocorrencias).toBe(3);

    // Cada reincidencia fica no historico.
    const eventos = await historico(primeira.id);
    expect(eventos.filter((e) => e.evento === 'reincidencia')).toHaveLength(2);
  });

  it('caso ja encerrado nao e reaberto: reincidencia cria um novo', async () => {
    const dados = {
      tipo: 'cpf_cnpj_invalido' as const,
      fonte: 'monday' as const,
      descricao: 'CPF invalido',
      empreendimentoId,
      chaveExtra: ['item-50'],
    };

    const primeira = await registrar(dados, contexto);
    await encerrar(
      primeira.id,
      { status: 'descartada', decisao: 'a', justificativa: 'b' },
      contexto,
    );

    const nova = await registrar(dados, contexto);

    // Decisao humana nao e revertida por uma nova carga.
    expect(nova.reincidencia).toBe(false);
    expect(nova.id).not.toBe(primeira.id);
    expect(await contar('inconsistencias')).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisito 12 — a resolucao nao altera os valores originais', () => {
  it('o banco recusa alterar valores_em_conflito', async () => {
    const { id } = await registrarDivergencia(
      {
        campo: 'saldo_vencido',
        ladoA: LADO_MONDAY,
        ladoB: LADO_SIENGE,
        precedencia: 'financeiro: sienge > monday',
        valorAplicado: 66071.1,
        empreendimentoId,
      },
      contexto,
    );

    // Tentativa direta no banco, ignorando o servico.
    await expect(
      db
        .updateTable('inconsistencias')
        .set({ valores_em_conflito: JSON.stringify([{ fonte: 'monday', valor: 0 }]) })
        .where('id', '=', id)
        .execute(),
    ).rejects.toThrow(/imutavel/i);
  });

  it('o banco recusa alterar tipo, fonte e data de deteccao', async () => {
    const { id } = await registrar(
      { tipo: 'duplicidade', fonte: 'monday', descricao: 'x', empreendimentoId },
      contexto,
    );

    await expect(
      db.updateTable('inconsistencias').set({ tipo: 'grafia_divergente' }).where('id', '=', id).execute(),
    ).rejects.toThrow(/imutavel/i);

    await expect(
      db.updateTable('inconsistencias').set({ fonte: 'sienge' }).where('id', '=', id).execute(),
    ).rejects.toThrow(/imutavel/i);

    await expect(
      db.updateTable('inconsistencias').set({ detectado_em: new Date() }).where('id', '=', id).execute(),
    ).rejects.toThrow(/imutavel/i);
  });

  it('depois de resolvida, os dois valores continuam identicos ao registrado', async () => {
    const { id } = await registrarDivergencia(
      {
        campo: 'saldo_vencido',
        ladoA: LADO_MONDAY,
        ladoB: LADO_SIENGE,
        precedencia: 'financeiro: sienge > monday',
        valorAplicado: 66071.1,
        empreendimentoId,
      },
      contexto,
    );

    const antes = await db
      .selectFrom('inconsistencias')
      .select('valores_em_conflito')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    await encerrar(
      id,
      { status: 'resolvida', decisao: 'Mantido Sienge.', justificativa: 'Posicao mais recente.' },
      contexto,
    );

    const depois = await db
      .selectFrom('inconsistencias')
      .select('valores_em_conflito')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(depois.valores_em_conflito).toEqual(antes.valores_em_conflito);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisito 13 — filtros', () => {
  beforeEach(async () => {
    const outro = await criarEmpreendimento('AURORA');

    await registrar(
      {
        tipo: 'cpf_cnpj_invalido', fonte: 'monday', descricao: 'A',
        gravidade: 'alta', empreendimentoId, competenciaRef, chaveExtra: ['A'],
      },
      contexto,
    );
    await registrar(
      {
        tipo: 'saldo_duplicado', fonte: 'sienge', descricao: 'B',
        gravidade: 'critica', impacto: 'valor_financeiro', impactoValor: 90000,
        empreendimentoId: outro, chaveExtra: ['B'],
      },
      contexto,
    );
    const c = await registrar(
      {
        tipo: 'grafia_divergente', fonte: 'monday', descricao: 'C',
        gravidade: 'baixa', empreendimentoId, chaveExtra: ['C'],
      },
      contexto,
    );
    await atribuir(c.id, outroUsuarioId, contexto);
  });

  it('filtra por fonte', async () => {
    expect(await listar({ fonte: 'monday', empreendimentosPermitidos: null })).toHaveLength(2);
    expect(await listar({ fonte: 'sienge', empreendimentosPermitidos: null })).toHaveLength(1);
  });

  it('filtra por tipo, gravidade e impacto', async () => {
    expect(await listar({ tipo: 'saldo_duplicado', empreendimentosPermitidos: null })).toHaveLength(1);
    expect(await listar({ gravidade: 'critica', empreendimentosPermitidos: null })).toHaveLength(1);
    expect(await listar({ impacto: 'valor_financeiro', empreendimentosPermitidos: null })).toHaveLength(1);
  });

  it('filtra por status e responsavel', async () => {
    expect(await listar({ status: 'pendente', empreendimentosPermitidos: null })).toHaveLength(2);
    expect(await listar({ status: 'em_revisao', empreendimentosPermitidos: null })).toHaveLength(1);
    expect(
      await listar({ responsavelId: outroUsuarioId, empreendimentosPermitidos: null }),
    ).toHaveLength(1);
  });

  it('filtra por empreendimento e competencia', async () => {
    expect(await listar({ empreendimentoId, empreendimentosPermitidos: null })).toHaveLength(2);
    expect(await listar({ competenciaRef, empreendimentosPermitidos: null })).toHaveLength(1);
  });

  it('filtra por periodo', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    expect(
      await listar({ periodoInicio: hoje, periodoFim: hoje, empreendimentosPermitidos: null }),
    ).toHaveLength(3);
    expect(
      await listar({ periodoInicio: '2020-01-01', periodoFim: '2020-01-02', empreendimentosPermitidos: null }),
    ).toHaveLength(0);
  });

  it('filtra somente bloqueantes', async () => {
    // saldo_duplicado bloqueia indicador; cpf_cnpj_invalido e grafia nao.
    const r = await listar({ somenteBloqueantes: true, empreendimentosPermitidos: null });
    expect(r).toHaveLength(1);
    expect(r[0]!.tipo).toBe('saldo_duplicado');
  });

  it('ordena por gravidade e depois por valor em risco', async () => {
    const r = await listar({ empreendimentosPermitidos: null });
    expect(r[0]!.gravidade).toBe('critica');
    expect(r[r.length - 1]!.gravidade).toBe('baixa');
  });

  it('escopo de empreendimento restringe o que o usuario ve', async () => {
    // Usuario com acesso a apenas um empreendimento nao ve o do outro.
    const permitido = await listar({ empreendimentosPermitidos: [empreendimentoId] });
    expect(permitido).toHaveLength(2);
    expect(permitido.every((i) => i.empreendimento_id === empreendimentoId)).toBe(true);

    // Lista vazia significa nenhum empreendimento permitido — diferente de null.
    expect(await listar({ empreendimentosPermitidos: [] })).toHaveLength(0);
  });

  it('resumo agrupa por gravidade e status', async () => {
    const r = await resumo(null);
    const critica = r.find((x) => x.gravidade === 'critica' && x.status === 'pendente');
    expect(critica?.total).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisito 14 — chegar ao registro original de cada fonte', () => {
  it('recupera os payloads brutos das duas fontes pelos identificadores', async () => {
    const execucaoMonday = await iniciarExecucao({ fonte: 'monday', escopo: 'notificacoes' });
    await gravarBruto(execucaoMonday.id, 'monday', 'notificacoes', [
      { idOrigem: 'item-99887', payload: { id: 'item-99887', name: 'VERANO 1105B', saldo: '64.000,00' } },
    ]);

    const execucaoSienge = await iniciarExecucao({ fonte: 'sienge', escopo: 'receivable-bills' });
    await gravarBruto(execucaoSienge.id, 'sienge', 'receivable-bills', [
      { idOrigem: 'titulo-4471', payload: { billId: 'titulo-4471', overdueBalance: 66071.1 } },
    ]);

    const { id } = await registrarDivergencia(
      {
        campo: 'saldo_vencido',
        ladoA: LADO_MONDAY,
        ladoB: LADO_SIENGE,
        precedencia: 'financeiro: sienge > monday',
        valorAplicado: 66071.1,
        empreendimentoId,
      },
      contexto,
    );

    const registros = await registrosDeOrigem(id);
    expect(registros).toHaveLength(2);

    const monday = registros.find((r) => r.fonte === 'monday')!;
    const sienge = registros.find((r) => r.fonte === 'sienge')!;

    // O payload original do Monday, como veio da API.
    expect((monday.payload as { name: string }).name).toBe('VERANO 1105B');
    // O registro correspondente do Sienge.
    expect((sienge.payload as { overdueBalance: number }).overdueBalance).toBe(66071.1);

    // Funciona sem consultar as APIs de novo — le da area bruta preservada.
    expect(monday.extraido_em).toBeTruthy();
  });

  it('devolve vazio, nao erro, quando nao ha payload bruto para os identificadores', async () => {
    const { id } = await registrarDivergencia(
      {
        campo: 'saldo_vencido',
        ladoA: LADO_MONDAY,
        ladoB: LADO_SIENGE,
        precedencia: 'financeiro: sienge > monday',
        valorAplicado: 66071.1,
        empreendimentoId,
      },
      contexto,
    );

    // Carga anterior a area bruta, ou origem manual.
    expect(await registrosDeOrigem(id)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('requisito 15 — auditoria de visualizacao, alteracao e resolucao', () => {
  it('visualizar gera evento, incrementa contador e entra na trilha', async () => {
    const { id } = await registrar(
      { tipo: 'cpf_cnpj_invalido', fonte: 'monday', descricao: 'x', empreendimentoId },
      contexto,
    );

    await obter(id, contexto);
    await obter(id, contexto);

    const linha = await db
      .selectFrom('inconsistencias')
      .select(['visualizacoes', 'vista_por'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(linha.visualizacoes).toBe(2);
    expect(linha.vista_por).toBe(usuarioId);

    const eventos = await historico(id);
    expect(eventos.filter((e) => e.evento === 'visualizada')).toHaveLength(2);

    // Ver o conflito significa ver dado de cliente: entra na trilha de LGPD.
    const trilha = await db
      .selectFrom('logs_auditoria')
      .select(['acao', 'recurso', 'recurso_id'])
      .where('acao', '=', 'consulta_dado_pessoal')
      .where('recurso_id', '=', id)
      .execute();
    expect(trilha).toHaveLength(2);
  });

  it('atribuicao, analise e encerramento entram na trilha de auditoria', async () => {
    const { id } = await registrar(
      { tipo: 'contrato_ausente', fonte: 'monday', descricao: 'x', empreendimentoId },
      contexto,
    );

    await atribuir(id, outroUsuarioId, contexto);
    await registrarAnalise(id, { analise: 'analise feita' }, contexto);
    await encerrar(id, { status: 'resolvida', decisao: 'd', justificativa: 'j' }, contexto);

    const trilha = await db
      .selectFrom('logs_auditoria')
      .select(['acao', 'detalhe', 'usuario_id'])
      .where('acao', '=', 'inconsistencia_tratada')
      .where('recurso_id', '=', id)
      .orderBy('id')
      .execute();

    expect(trilha).toHaveLength(3);
    const operacoes = trilha.map((t) => (t.detalhe as { operacao: string }).operacao);
    expect(operacoes).toEqual(['atribuicao', 'analise', 'encerramento']);
    expect(trilha.every((t) => t.usuario_id === usuarioId)).toBe(true);
  });

  it('a trilha de auditoria e imutavel', async () => {
    const { id } = await registrar(
      { tipo: 'duplicidade', fonte: 'monday', descricao: 'x', empreendimentoId },
      contexto,
    );
    await obter(id, contexto);

    await expect(
      db.updateTable('logs_auditoria').set({ acao: 'outra' }).execute(),
    ).rejects.toThrow(/append-only/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('traducao da saida atual da skill', () => {
  it('traduz as mensagens livres de analisar_cobrancas.py', async () => {
    expect(traduzirMensagem('cliente sem identificador')).toBe('cliente_sem_identificacao');
    expect(traduzirMensagem('empreendimento vazio em uma notificacao')).toBe('empreendimento_ausente');
    expect(traduzirMensagem('VERANO: ausencia de carteira de referencia')).toBe(
      'ausencia_carteira_referencia',
    );
    expect(
      traduzirMensagem('saldo financeiro deduplicado por contrato (historico de notificacoes)'),
    ).toBe('saldo_duplicado');
  });

  it('mensagem nao reconhecida devolve null para ser preservada como generica', () => {
    // Nunca descartar: o chamador registra como divergencia_valor com o texto
    // original.
    expect(traduzirMensagem('algo totalmente novo que ninguem previu')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('conformidade com o schema da skill', () => {
  it('todo registro tem os cinco campos obrigatorios do schema', async () => {
    // schemas/inconsistencias.schema.json exige tipo, gravidade, fonte,
    // descricao e detectado_em. Os scripts da skill nao produzem os cinco — a
    // Central produz.
    await registrar(
      { tipo: 'duplicidade', fonte: 'monday', descricao: 'x', empreendimentoId },
      contexto,
    );

    const faltando = await sql<{ total: number }>`
      SELECT count(*)::int AS total FROM inconsistencias
      WHERE tipo IS NULL OR gravidade IS NULL OR fonte IS NULL
         OR descricao IS NULL OR detectado_em IS NULL
    `.execute(db);

    expect(faltando.rows[0]!.total).toBe(0);
  });
});
