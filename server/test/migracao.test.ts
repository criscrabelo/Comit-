/**
 * Migração do localStorage — os doze testes obrigatórios.
 *
 * Rodam contra PostgreSQL real. As garantias centrais (snapshot imutável,
 * remoção só após confirmação) são impostas por gatilho e CHECK no banco.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, fecharBanco } from '../src/db/pool.js';
import {
  confirmarRemocao,
  inspecionar,
  migrar,
  relatorio,
  type ContextoMigracao,
  type DumpNavegador,
} from '../src/migracao/servico.js';
import {
  classificar,
  ehDemonstrativo,
  PREFERENCIAS_PERMITIDAS,
  PREFIXO_PREFERENCIA,
} from '../src/migracao/inventario.js';
import { contar, limparDados } from './ajuda/banco.js';

let contexto: ContextoMigracao;
let outroContexto: ContextoMigracao;

async function criarUsuario(login: string, perfil: 'gestora' | 'colaborador' = 'gestora') {
  const l = await db
    .insertInto('usuarios')
    .values({ usuario: login, nome: login.toUpperCase(), perfil, status: 'ativo' })
    .returning('id')
    .executeTakeFirstOrThrow();
  return l.id;
}

const dump = (chaves: Record<string, unknown>): DumpNavegador => ({
  chaves: Object.fromEntries(
    Object.entries(chaves).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
  ),
  versao: '1.0',
  navegador: 'teste',
});

const DUMP_VALIDO = () =>
  dump({
    jur_comite_comites: [{ id: 'c1', ref: '2026-07', label: 'Julho 2026' }],
    jur_comite_empreendimentos: [
      { id: 'emp1', nome: 'VERANO', cidade: 'Taubaté', status: 'Ativo' },
      { id: 'e_moratta', nome: 'MORATTA', cidade: 'Taubaté', status: 'Ativo' },
    ],
    jur_comite_notificacoes: [
      { id: 'n1', cliente: 'Maria Aparecida Silva', unidade: '1105B', estagio: 'Resolvida', data: '2026-07-15' },
      { id: 'n2', cliente: 'Joao Pedro Alencar', unidade: '302A', estagio: 'Em Andamento', data: '2026-07-20' },
    ],
    jur_comite_active_comite: 'c1',
  });

beforeEach(async () => {
  await limparDados();
  const id = await criarUsuario('cristiane');
  const outro = await criarUsuario('joao.outro', 'colaborador');
  contexto = { usuarioId: id, usuarioNome: 'CRISTIANE', enderecoIp: '10.0.0.1' };
  outroContexto = { usuarioId: outro, usuarioNome: 'JOAO', enderecoIp: '10.0.0.2' };
});

afterAll(async () => {
  await fecharBanco();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('1. navegador sem dados locais', () => {
  it('inspecao devolve vazio, sem erro', async () => {
    const r = await inspecionar(dump({}), contexto.usuarioId);
    expect(r.chaves).toEqual([]);
    expect(r.totais.registros).toBe(0);
    expect(r.migracaoExistente).toBeNull();
  });

  it('migrar um dump vazio nao cria lixo nem falha', async () => {
    const r = await migrar(dump({}), contexto);
    expect(r.lidos).toBe(0);
    expect(r.incluidos).toBe(0);
    // Sem nada para migrar, nao ha o que confirmar.
    expect(r.persistencia_confirmada).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('2. dados validos', () => {
  it('inspeciona sem gravar nada de negocio', async () => {
    const r = await inspecionar(DUMP_VALIDO(), contexto.usuarioId);

    expect(r.totais.a_migrar).toBe(3);
    expect(r.totais.preferencias).toBe(1);
    expect(r.totais.registros).toBe(5);

    // A inspecao NAO grava.
    expect(await contar('notificacoes')).toBe(0);
    expect(await contar('empreendimentos')).toBe(0);
  });

  it('a previa mascara nome de cliente', async () => {
    const r = await inspecionar(DUMP_VALIDO(), contexto.usuarioId);
    const notificacoes = r.chaves.find((c) => c.chave === 'jur_comite_notificacoes')!;
    const amostra = notificacoes.amostra[0] as Record<string, unknown>;

    // "Maria Aparecida Silva" vira "Maria A." — reconhecivel, nao identificavel.
    expect(amostra.cliente).toBe('Maria A.');
    expect(String(amostra.cliente)).not.toContain('Silva');
  });

  it('importa e grava com proveniencia de migracao', async () => {
    const r = await migrar(DUMP_VALIDO(), contexto);

    expect(r.status).toBe('concluida');
    expect(r.incluidos).toBeGreaterThan(0);
    expect(r.persistencia_confirmada).toBe(true);

    const notificacao = await db
      .selectFrom('notificacoes')
      .select(['fonte', 'id_origem', 'cliente_nome', 'valor_original', 'versao_regra'])
      .where('cliente_nome', '=', 'Maria Aparecida Silva')
      .executeTakeFirstOrThrow();

    expect(notificacao.fonte).toBe('migracao');
    expect(notificacao.id_origem).toBe('localstorage:jur_comite_notificacoes:n1');
    expect(notificacao.versao_regra).toBe('migracao-1.0.0');
    // O registro original do navegador fica preservado.
    expect((notificacao.valor_original as { id: string }).id).toBe('n1');
  });

  it('grava o snapshot ANTES de interpretar, e ele e imutavel', async () => {
    const r = await migrar(DUMP_VALIDO(), contexto);

    const m = await db
      .selectFrom('migracoes_localstorage')
      .select(['snapshot', 'snapshot_bytes', 'snapshot_hash'])
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();

    expect(m.snapshot_bytes).toBeGreaterThan(0);
    expect((m.snapshot as Record<string, string>).jur_comite_notificacoes).toBeTruthy();

    // O snapshot e a prova do que existia: nao se reescreve.
    await expect(
      db
        .updateTable('migracoes_localstorage')
        .set({ snapshot: JSON.stringify({ adulterado: true }) })
        .where('id', '=', r.id)
        .execute(),
    ).rejects.toThrow(/imutavel/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('3. dados corrompidos', () => {
  it('JSON invalido nao derruba as outras chaves', async () => {
    const d = dump({
      jur_comite_empreendimentos: [{ id: 'emp1', nome: 'VERANO' }],
    });
    d.chaves.jur_comite_notificacoes = '{isso nao e json valido';

    const r = await migrar(d, contexto);

    // A chave boa entrou.
    expect(await contar('empreendimentos')).toBe(1);
    // A ruim foi registrada com o erro, sem interromper.
    const chaveRuim = r.chaves.find((c) => c.chave === 'jur_comite_notificacoes')!;
    expect(chaveRuim.concluida).toBe(false);
    expect(chaveRuim.erro).toMatch(/nao e JSON valido/i);
    expect(r.status).toBe('parcial');
  });

  it('conteudo com estrutura errada e reportado, nao importado', async () => {
    const d = dump({ jur_comite_notificacoes: { nao: 'e uma lista' } });
    const r = await inspecionar(d, contexto.usuarioId);

    const chave = r.chaves.find((c) => c.chave === 'jur_comite_notificacoes')!;
    expect(chave.erroFormato).toMatch(/esperava uma lista/i);
    expect(r.totais.corrompidas).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('4. versao antiga e chave desconhecida', () => {
  it('chave nao catalogada vai para revisao, nem migrada nem apagada', () => {
    const d = classificar('chave_de_versao_muito_antiga');
    expect(d.classe).toBe('revisao');
    // Presume o pior ate alguem olhar.
    expect(d.contemDadoPessoal).toBe(true);
    expect(d.motivo).toMatch(/decis[ãa]o humana/i);
  });

  it('chave desconhecida nao entra no banco', async () => {
    const r = await migrar(dump({ chave_estranha_v0: [{ id: 'x', dado: 'y' }] }), contexto);

    const chave = r.chaves.find((c) => c.chave === 'chave_estranha_v0')!;
    expect(chave.classe).toBe('revisao');
    expect(chave.incluidos).toBe(0);
    expect(r.incluidos).toBe(0);
  });

  it('a versao do formato fica registrada', async () => {
    const d = DUMP_VALIDO();
    d.versao = '0.9-antiga';
    const r = await migrar(d, contexto);

    const m = await db
      .selectFrom('migracoes_localstorage')
      .select('versao_formato')
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();
    expect(m.versao_formato).toBe('0.9-antiga');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('5 e 6. execucao interrompida e repetida', () => {
  it('repetir a migracao NAO duplica registros', async () => {
    const primeira = await migrar(DUMP_VALIDO(), contexto);
    const notificacoesApos1 = await contar('notificacoes');
    const empreendimentosApos1 = await contar('empreendimentos');

    const segunda = await migrar(DUMP_VALIDO(), contexto);

    // Mesmo dump: devolve a MESMA migracao, nao cria outra.
    expect(segunda.id).toBe(primeira.id);
    expect(await contar('notificacoes')).toBe(notificacoesApos1);
    expect(await contar('empreendimentos')).toBe(empreendimentosApos1);
    expect(await contar('migracoes_localstorage')).toBe(1);
  });

  it('retomada continua de onde parou, sem reimportar o que ja entrou', async () => {
    const d = DUMP_VALIDO();
    await migrar(d, contexto);

    const antes = await db
      .selectFrom('migracoes_chaves')
      .select(['chave', 'incluidos'])
      .where('concluida', '=', true)
      .execute();
    expect(antes.length).toBeGreaterThan(0);

    // Segunda passada: as chaves ja concluidas sao PULADAS.
    const r = await migrar(d, contexto);
    expect(r.incluidos).toBe(0);
    expect(r.atualizados).toBe(0);
    expect(r.chaves_migradas).toBeGreaterThan(0);
  });

  it('dump diferente cria uma migracao nova', async () => {
    await migrar(DUMP_VALIDO(), contexto);
    const outro = dump({ jur_comite_empreendimentos: [{ id: 'z', nome: 'AURORA' }] });
    await migrar(outro, contexto);
    expect(await contar('migracoes_localstorage')).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('7. conflito com registro ja existente', () => {
  it('empreendimento vindo de outra fonte gera conflito, nao sobrescreve', async () => {
    // Empreendimento ja existe, vindo do Monday.
    await db
      .insertInto('empreendimentos')
      .values({
        nome: 'VERANO',
        nome_normalizado: 'VERANO',
        fonte: 'monday',
        id_origem: 'monday:empr:VERANO',
        cidade: 'Cidade do Monday',
      })
      .execute();

    const r = await migrar(dump({ jur_comite_empreendimentos: [{ id: 'e1', nome: 'VERANO', cidade: 'Outra' }] }), contexto);

    expect(r.conflitantes).toBe(1);

    // O registro do Monday permanece intacto.
    const empreendimento = await db
      .selectFrom('empreendimentos')
      .select(['fonte', 'cidade'])
      .where('nome_normalizado', '=', 'VERANO')
      .executeTakeFirstOrThrow();
    expect(empreendimento.fonte).toBe('monday');
    expect(empreendimento.cidade).toBe('Cidade do Monday');

    // E o conflito virou inconsistencia para revisao humana.
    expect(await contar('inconsistencias', "tipo = 'duplicidade'")).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('8. dados demonstrativos', () => {
  it('reconhece os IDs do seed', () => {
    expect(ehDemonstrativo({ id: 'e_moratta' })).toBe(true);
    expect(ehDemonstrativo({ id: 'risco_jp_abc' })).toBe(true);
    expect(ehDemonstrativo({ id: 'n1' })).toBe(false);
  });

  it('dado de exemplo entra MARCADO, nunca como real', async () => {
    await migrar(DUMP_VALIDO(), contexto);

    const demonstrativo = await db
      .selectFrom('empreendimentos')
      .select(['nome', 'demonstrativo'])
      .where('nome', '=', 'MORATTA')
      .executeTakeFirstOrThrow();
    expect(demonstrativo.demonstrativo).toBe(true);

    const real = await db
      .selectFrom('empreendimentos')
      .select(['nome', 'demonstrativo'])
      .where('nome', '=', 'VERANO')
      .executeTakeFirstOrThrow();
    expect(real.demonstrativo).toBe(false);
  });

  it('o relatorio informa quantos eram demonstrativos', async () => {
    const r = await migrar(DUMP_VALIDO(), contexto);
    expect(r.demonstrativos).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('9 e 10. permissao e dados de outro usuario', () => {
  it('nao le o relatorio de migracao de outra pessoa', async () => {
    const minha = await migrar(DUMP_VALIDO(), contexto);

    await expect(relatorio(minha.id, outroContexto.usuarioId)).rejects.toThrow(
      /outro usu[áa]rio/i,
    );
  });

  it('nao confirma remocao da migracao de outra pessoa', async () => {
    const minha = await migrar(DUMP_VALIDO(), contexto);

    await expect(confirmarRemocao(minha.id, outroContexto)).rejects.toThrow(
      /outro usu[áa]rio/i,
    );
  });

  it('migracoes de usuarios diferentes com o mesmo dump nao colidem', async () => {
    const a = await migrar(DUMP_VALIDO(), contexto);
    const b = await migrar(DUMP_VALIDO(), outroContexto);

    // Mesmo conteudo, migracoes distintas: o indice unico e por usuario.
    expect(a.id).not.toBe(b.id);
    expect(await contar('migracoes_localstorage')).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('11. falha parcial', () => {
  it('o que migrou corretamente permanece', async () => {
    const d = dump({
      jur_comite_empreendimentos: [{ id: 'emp1', nome: 'VERANO' }],
      jur_comite_comites: [{ id: 'c1', ref: '2026-07', label: 'Julho' }],
    });
    d.chaves.jur_comite_notificacoes = 'quebrado{';

    const r = await migrar(d, contexto);

    expect(r.status).toBe('parcial');
    // As duas chaves boas entraram e permanecem.
    expect(await contar('empreendimentos')).toBe(1);
    expect(await contar('comites')).toBe(1);
    // A migracao registra a falha sem apagar o que deu certo.
    expect(r.incluidos).toBeGreaterThan(0);
  });

  it('falha parcial NAO autoriza remover as chaves', async () => {
    const d = dump({ jur_comite_empreendimentos: [{ id: 'e1', nome: 'VERANO' }] });
    d.chaves.jur_comite_notificacoes = 'quebrado{';

    const r = await migrar(d, contexto);
    expect(r.persistencia_confirmada).toBe(false);

    const remocao = await confirmarRemocao(r.id, contexto);
    expect(remocao.pode_remover).toEqual([]);
    expect(remocao.motivo).toMatch(/n[ãa]o foi confirmada/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('12. remocao segura da chave apos sucesso', () => {
  it('so autoriza remover depois de confirmar a persistencia', async () => {
    const r = await migrar(DUMP_VALIDO(), contexto);
    expect(r.persistencia_confirmada).toBe(true);

    const remocao = await confirmarRemocao(r.id, contexto);

    expect(remocao.pode_remover).toContain('jur_comite_notificacoes');
    expect(remocao.pode_remover).toContain('jur_comite_empreendimentos');
    expect(remocao.pode_remover.length).toBeGreaterThan(0);
  });

  it('chave em revisao NUNCA e autorizada para remocao', async () => {
    const d = DUMP_VALIDO();
    d.chaves.chave_desconhecida = JSON.stringify([{ id: 'x' }]);

    const r = await migrar(d, contexto);
    const remocao = await confirmarRemocao(r.id, contexto);

    expect(remocao.nao_remover).toContain('chave_desconhecida');
    expect(remocao.pode_remover).not.toContain('chave_desconhecida');
    expect(remocao.motivo).toMatch(/revis[ãa]o/i);
  });

  it('o banco recusa marcar remocao sem persistencia confirmada', async () => {
    const d = dump({ jur_comite_empreendimentos: [{ id: 'e1', nome: 'X' }] });
    // Precisa ser uma chave DE NEGOCIO quebrada: chave desconhecida vai para
    // revisao e nao conta como erro, entao a persistencia seria confirmada.
    d.chaves.jur_comite_notificacoes = 'nao{json';
    const r = await migrar(d, contexto);
    expect(r.persistencia_confirmada).toBe(false);

    // A garantia nao depende do codigo do servico: o CHECK do banco recusa.
    await expect(
      db
        .updateTable('migracoes_localstorage')
        .set({ chaves_removidas_em: new Date() })
        .where('id', '=', r.id)
        .execute(),
    ).rejects.toThrow(/remocao_exige_confirmacao|check constraint/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('preferencias que continuam no navegador', () => {
  it('todas usam o prefixo versionado', () => {
    for (const chave of PREFERENCIAS_PERMITIDAS) {
      expect(chave.startsWith(PREFIXO_PREFERENCIA)).toBe(true);
    }
  });

  it('nenhuma preferencia menciona dado sensivel', () => {
    const proibido = /cpf|cnpj|documento|cliente|token|senha|contrato|valor|saldo|processo/i;
    for (const chave of PREFERENCIAS_PERMITIDAS) {
      expect(chave, `${chave} nao pode ser preferencia`).not.toMatch(proibido);
    }
  });

  it('preferencias sao ignoradas pela migracao', async () => {
    const d = dump({
      'patrono.pref.v1.tema': 'escuro',
      'patrono.pref.v1.menu_recolhido': 'true',
      jur_comite_empreendimentos: [{ id: 'e1', nome: 'VERANO' }],
    });

    const inspecao = await inspecionar(d, contexto.usuarioId);
    // Preferencias no formato novo nem aparecem na lista.
    expect(inspecao.chaves.map((c) => c.chave)).not.toContain('patrono.pref.v1.tema');
    expect(inspecao.chaves).toHaveLength(1);
  });

  it('o catalogo do banco tem as seis preferencias permitidas', async () => {
    const linhas = await db.selectFrom('preferencias_permitidas').select('chave').execute();
    expect(linhas.map((l) => l.chave).sort()).toEqual([...PREFERENCIAS_PERMITIDAS].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('classificacao das chaves', () => {
  it('as onze chaves de negocio sao classificadas como migrar', () => {
    const negocio = [
      'comites', 'empreendimentos', 'unidades', 'contratos', 'notificacoes',
      'processos', 'distratos', 'retomadas', 'fatos', 'riscos', 'regulatorios',
    ];
    for (const nome of negocio) {
      expect(classificar(`jur_comite_${nome}`).classe, nome).toBe('migrar');
    }
  });

  it('o comite ativo e preferencia, nao dado de negocio', () => {
    expect(classificar('jur_comite_active_comite').classe).toBe('preferencia');
  });

  it('o token do Monday e classificado para exclusao', () => {
    expect(classificar('jur_monday_token').classe).toBe('excluir');
    expect(classificar('monday_token').classe).toBe('excluir');
  });

  it('as chaves de prototipo ficam em revisao, nao sao migradas', () => {
    for (const chave of ['patrono_diarios_v1', 'patrono_feedbacks_v1', 'patrono_usuarios_v1']) {
      const d = classificar(chave);
      expect(d.classe, chave).toBe('revisao');
      expect(d.motivo).toMatch(/n[ãa]o implantado/i);
    }
  });
});
