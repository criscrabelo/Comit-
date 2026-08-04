/**
 * Inversão da fonte da verdade — os catorze testes obrigatórios.
 *
 * Rodam contra PostgreSQL real. As garantias que importam (versão, exclusão
 * lógica, trilha append-only) são do banco; testá-las contra um dublê provaria
 * apenas que o dublê concorda consigo mesmo.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { db, fecharBanco } from '../src/db/pool.js';
import { carregarContexto } from '../src/rbac/autorizacao.js';
import { ErroApi } from '../src/errors.js';
import {
  atualizar,
  cargaInicial,
  criar,
  criarLote,
  excluir,
  exportar,
  listar,
  obter,
  type ContextoDados,
} from '../src/dados/servico.js';
import { ENTIDADES, NOMES_ENTIDADES } from '../src/dados/entidades.js';
import { contar, criarComite, criarEmpreendimento, limparDados } from './ajuda/banco.js';
import type { PerfilUsuario } from '../src/db/schema.js';

let gestora: ContextoDados;
let comiteId: string;
let emprId: string;

async function contextoDe(
  login: string,
  perfil: PerfilUsuario,
  opcoes: { todosEmpreendimentos?: boolean; empreendimentos?: string[] } = {},
): Promise<ContextoDados> {
  const u = await db
    .insertInto('usuarios')
    .values({ usuario: login, nome: login.toUpperCase(), perfil, status: 'ativo' })
    .returning('id')
    .executeTakeFirstOrThrow();

  if (opcoes.todosEmpreendimentos) {
    await db
      .insertInto('escopos_empreendimento')
      .values({ usuario_id: u.id, todos: true })
      .execute();
  }
  for (const id of opcoes.empreendimentos ?? []) {
    await db
      .insertInto('escopos_empreendimento')
      .values({ usuario_id: u.id, empreendimento_id: id, todos: false })
      .execute();
  }

  const autorizacao = await carregarContexto(u.id, perfil, 'juridico');
  return {
    usuarioId: u.id,
    usuarioNome: login.toUpperCase(),
    perfil,
    sessaoId: null,
    enderecoIp: '127.0.0.1',
    autorizacao,
  };
}

/** Erro de API com o código esperado — e não um erro genérico qualquer. */
async function esperarErro(
  execucao: () => Promise<unknown>,
  codigo: string,
): Promise<ErroApi> {
  try {
    await execucao();
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).codigo).toBe(codigo);
    return erro as ErroApi;
  }
  throw new Error(`Esperava erro "${codigo}", mas a operacao foi aceita.`);
}

beforeEach(async () => {
  await limparDados();
  const comite = await criarComite('2026-07');
  comiteId = comite.comiteId;
  emprId = await criarEmpreendimento('VERANO');
  gestora = await contextoDe('gestora.dados', 'gestora', { todosEmpreendimentos: true });
});

afterAll(async () => {
  await fecharBanco();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Criar pela interface grava no PostgreSQL, não no navegador
// ═══════════════════════════════════════════════════════════════════════════
describe('1. gravação vai para o banco', () => {
  it('cria um fato e o encontra no PostgreSQL', async () => {
    const criado = await criar(
      'fatos',
      {
        comite_id: comiteId,
        empreendimento_id: emprId,
        data: '2026-07-15',
        titulo: 'Recurso protocolado',
        descricao: 'Contrarrazoes protocoladas no prazo.',
      },
      gestora,
    );

    expect(criado.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(criado.versao).toBe(1);

    const noBanco = await db
      .selectFrom('fatos')
      .selectAll()
      .where('id', '=', criado.id)
      .executeTakeFirstOrThrow();

    expect(noBanco.titulo).toBe('Recurso protocolado');
    // Proveniência obrigatória: sem ela ninguém sabe de onde o registro veio.
    expect(noBanco.fonte).toBe('manual');
    expect(noBanco.demonstrativo).toBe(false);
    expect(noBanco.valor_original).toMatchObject({ titulo: 'Recurso protocolado' });
  });

  it('o id devolvido pelo servidor substitui qualquer id enviado pelo cliente', async () => {
    const criado = await criar(
      'regulatorios',
      { comite_id: comiteId, id: 'inventado-pela-tela', titulo: 'NR-1' },
      gestora,
    );
    expect(criado.id).not.toBe('inventado-pela-tela');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Leitura vem do banco, com filtro por comitê
// ═══════════════════════════════════════════════════════════════════════════
describe('2. leitura por comitê', () => {
  it('separa registros de comitês diferentes', async () => {
    const outro = await criarComite('2026-08');

    await criar(
      'fatos',
      { comite_id: comiteId, empreendimento_id: emprId, descricao: 'julho' },
      gestora,
    );
    await criar(
      'fatos',
      { comite_id: outro.comiteId, empreendimento_id: emprId, descricao: 'agosto' },
      gestora,
    );

    const julho = await listar('fatos', { comiteId }, gestora);
    expect(julho.total).toBe(1);
    expect(julho.itens[0]!.descricao).toBe('julho');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Atualizar exige versão e recusa sobrescrita silenciosa
// ═══════════════════════════════════════════════════════════════════════════
describe('3. controle de concorrência', () => {
  it('atualiza com a versão correta e incrementa a versão', async () => {
    const criado = await criar(
      'fatos',
      { comite_id: comiteId, empreendimento_id: emprId, descricao: 'original' },
      gestora,
    );

    const alterado = await atualizar(
      'fatos',
      criado.id,
      { descricao: 'corrigido' },
      criado.versao,
      gestora,
    );

    expect(alterado.descricao).toBe('corrigido');
    expect(alterado.versao).toBe(criado.versao + 1);
  });

  it('recusa edição sobre versão vencida e devolve o registro atual', async () => {
    const criado = await criar(
      'fatos',
      { comite_id: comiteId, empreendimento_id: emprId, descricao: 'original' },
      gestora,
    );

    // Duas pessoas leram a mesma versão.
    const versaoLidaPorAmbas = criado.versao;
    await atualizar('fatos', criado.id, { descricao: 'da primeira' }, versaoLidaPorAmbas, gestora);

    const erro = await esperarErro(
      () => atualizar('fatos', criado.id, { descricao: 'da segunda' }, versaoLidaPorAmbas, gestora),
      'conflito',
    );

    // A segunda pessoa precisa poder comparar: o registro atual vem no erro.
    expect((erro.detalhe.registro as { descricao: string }).descricao).toBe('da primeira');

    // E o valor da primeira NÃO foi sobrescrito.
    const noBanco = await db
      .selectFrom('fatos')
      .select('descricao')
      .where('id', '=', criado.id)
      .executeTakeFirstOrThrow();
    expect(noBanco.descricao).toBe('da primeira');
  });

  it('recusa edição sem versão informada', async () => {
    const criado = await criar(
      'fatos',
      { comite_id: comiteId, empreendimento_id: emprId, descricao: 'x' },
      gestora,
    );
    await esperarErro(
      () => atualizar('fatos', criado.id, { descricao: 'y' }, null, gestora),
      'conflito',
    );
  });

  it('reenviar o mesmo valor não consome versão', async () => {
    const criado = await criar(
      'fatos',
      { comite_id: comiteId, empreendimento_id: emprId, descricao: 'igual' },
      gestora,
    );
    const r = await atualizar('fatos', criado.id, { descricao: 'igual' }, criado.versao, gestora);
    expect(r.versao).toBe(criado.versao);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Exclusão é lógica: some da tela, permanece no banco
// ═══════════════════════════════════════════════════════════════════════════
describe('4. exclusão lógica', () => {
  it('remove da listagem sem apagar a linha', async () => {
    const criado = await criar(
      'fatos',
      { comite_id: comiteId, empreendimento_id: emprId, descricao: 'a excluir' },
      gestora,
    );

    await excluir('fatos', [criado.id], gestora);

    const visivel = await listar('fatos', { comiteId }, gestora);
    expect(visivel.total).toBe(0);

    // A linha continua lá, com a data da ausência.
    expect(await contar('fatos')).toBe(1);
    const comAusentes = await listar('fatos', { comiteId, incluirAusentes: true }, gestora);
    expect(comAusentes.total).toBe(1);
    expect(comAusentes.itens[0]!._ausente_desde).not.toBeNull();
  });

  it('exclui entidades sem coluna de empreendimento', async () => {
    // `empreendimentos` e `regulatorios` nao tem `empreendimento_id`. Selecionar
    // essa coluna sem verificar quebrava a exclusao — encontrado na verificacao
    // no navegador, nao aqui, e por isso passou a ter teste proprio.
    const empr = await criar('empreendimentos', { nome: 'A EXCLUIR', tipo: 'Vertical' }, gestora);
    const reg = await criar('regulatorios', { comite_id: comiteId, titulo: 'NR-1' }, gestora);

    expect((await excluir('empreendimentos', [empr.id], gestora)).excluidos).toBe(1);
    expect((await excluir('regulatorios', [reg.id], gestora)).excluidos).toBe(1);

    expect((await listar('empreendimentos', {}, gestora)).total).toBe(1); // so o VERANO
    expect((await listar('regulatorios', { comiteId }, gestora)).total).toBe(0);
  });

  it('excluir em lote não derruba os que não existem', async () => {
    const a = await criar('fatos', { comite_id: comiteId, descricao: 'a' }, gestora);
    const r = await excluir(
      'fatos',
      [a.id, '00000000-0000-0000-0000-000000000000'],
      gestora,
    );
    expect(r.excluidos).toBe(1);
    expect(r.nao_encontrados).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Autorização é do servidor
// ═══════════════════════════════════════════════════════════════════════════
describe('5. autorização', () => {
  it('perfil sem permissão de escrita no módulo é recusado', async () => {
    const diretoria = await contextoDe('diretoria.dados', 'diretoria', {
      todosEmpreendimentos: true,
    });
    // Diretoria lê e exporta; não opera cadastro.
    await esperarErro(
      () => criar('fatos', { comite_id: comiteId, descricao: 'x' }, diretoria),
      'nao_autorizado',
    );

    const leitura = await listar('fatos', { comiteId }, diretoria);
    expect(leitura.total).toBe(0);
  });

  it('convidado não enxerga o módulo jurídico', async () => {
    const convidado = await contextoDe('convidado.dados', 'convidado');
    await esperarErro(() => listar('fatos', {}, convidado), 'nao_autorizado');
  });

  it('escopo de empreendimento recorta a listagem', async () => {
    const outroEmpr = await criarEmpreendimento('MORATTA');
    await criar('fatos', { comite_id: comiteId, empreendimento_id: emprId, descricao: 'verano' }, gestora);
    await criar('fatos', { comite_id: comiteId, empreendimento_id: outroEmpr, descricao: 'moratta' }, gestora);

    const restrita = await contextoDe('lider.dados', 'lider', { empreendimentos: [emprId] });
    const vista = await listar('fatos', { comiteId }, restrita);

    expect(vista.itens.map((i) => i.descricao)).toEqual(['verano']);
  });

  it('registro fora do escopo não pode ser lido por id', async () => {
    const outroEmpr = await criarEmpreendimento('MORATTA');
    const alheio = await criar(
      'fatos',
      { comite_id: comiteId, empreendimento_id: outroEmpr, descricao: 'alheio' },
      gestora,
    );

    const restrita = await contextoDe('lider2.dados', 'lider', { empreendimentos: [emprId] });
    await esperarErro(() => obter('fatos', alheio.id, restrita), 'nao_autorizado');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Registro inexistente responde 404, não 500 nem lista vazia
// ═══════════════════════════════════════════════════════════════════════════
describe('6. registro inexistente', () => {
  it('consultar id que não existe devolve nao_encontrado', async () => {
    await esperarErro(
      () => obter('fatos', '00000000-0000-0000-0000-000000000000', gestora),
      'nao_encontrado',
    );
  });

  it('atualizar id que não existe devolve nao_encontrado', async () => {
    await esperarErro(
      () => atualizar('fatos', '00000000-0000-0000-0000-000000000000', { descricao: 'x' }, 1, gestora),
      'nao_encontrado',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Paginação e ordenação
// ═══════════════════════════════════════════════════════════════════════════
describe('7. paginação e ordenação', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 7; i++) {
      await criar(
        'fatos',
        {
          comite_id: comiteId,
          empreendimento_id: emprId,
          data: `2026-07-0${i}`,
          descricao: `fato ${i}`,
        },
        gestora,
      );
    }
  });

  it('pagina sem repetir nem perder registro', async () => {
    const p1 = await listar('fatos', { comiteId, tamanho: 3, pagina: 1 }, gestora);
    const p2 = await listar('fatos', { comiteId, tamanho: 3, pagina: 2 }, gestora);
    const p3 = await listar('fatos', { comiteId, tamanho: 3, pagina: 3 }, gestora);

    expect(p1.total).toBe(7);
    expect(p1.paginas).toBe(3);

    const ids = [...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.id);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
  });

  it('ordena pela coluna pedida', async () => {
    const desc = await listar('fatos', { comiteId, ordenar: 'data', direcao: 'desc' }, gestora);
    expect(desc.itens[0]!.data).toBe('2026-07-07');
  });

  it('recusa ordenação por coluna fora da lista', async () => {
    await esperarErro(
      () => listar('fatos', { comiteId, ordenar: 'descricao; DROP TABLE fatos' }, gestora),
      'entrada_invalida',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Retomada e distrato convivem sem se misturar
// ═══════════════════════════════════════════════════════════════════════════
describe('8. recorte por categoria', () => {
  it('distratos e retomadas usam a mesma tabela sem vazar entre si', async () => {
    await criar(
      'distratos',
      { comite_id: comiteId, empreendimento_id: emprId, motivo: 'Insatisfacao', data_distrato: '2026-07-10' },
      gestora,
    );
    await criar(
      'retomadas',
      { comite_id: comiteId, empreendimento_id: emprId, motivo: 'Inadimplencia', data_retomada: '2026-07-12' },
      gestora,
    );

    const d = await listar('distratos', { comiteId }, gestora);
    const r = await listar('retomadas', { comiteId }, gestora);

    expect(d.total).toBe(1);
    expect(r.total).toBe(1);
    expect(d.itens[0]!.motivo).toBe('Insatisfacao');
    expect(r.itens[0]!.motivo).toBe('Inadimplencia');
    // Datas com nomes diferentes na tela, mesma coluna no banco.
    expect(d.itens[0]!.data_distrato).toBe('2026-07-10');
    expect(r.itens[0]!.data_retomada).toBe('2026-07-12');
  });

  it('uma retomada não vira distrato por edição', async () => {
    const ret = await criar(
      'retomadas',
      { comite_id: comiteId, empreendimento_id: emprId, motivo: 'Inadimplencia' },
      gestora,
    );
    await atualizar('retomadas', ret.id, { categoria: 'distrato', motivo: 'Outro' }, ret.versao, gestora);

    const d = await listar('distratos', { comiteId }, gestora);
    expect(d.total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Regra do banco vira mensagem útil, não erro 500
// ═══════════════════════════════════════════════════════════════════════════
describe('9. regras do banco', () => {
  it('data de solução exige estágio Resolvida', async () => {
    const erro = await esperarErro(
      () =>
        criar(
          'notificacoes',
          {
            comite_id: comiteId,
            empreendimento_id: emprId,
            estagio: 'Em Andamento',
            data_notificacao: '2026-07-01',
            data_solucao: '2026-07-05',
          },
          gestora,
        ),
      'entrada_invalida',
    );
    expect(erro.message).toContain('Resolvida');
  });

  it('empreendimento duplicado responde conflito, não erro interno', async () => {
    await criar('empreendimentos', { nome: 'Alencar Mazzeo', tipo: 'Vertical' }, gestora);
    await esperarErro(
      () => criar('empreendimentos', { nome: 'ALENCAR  MAZZEO', tipo: 'Vertical' }, gestora),
      'conflito',
    );
  });

  it('data em formato inválido é recusada antes de chegar ao banco', async () => {
    await esperarErro(
      () => criar('fatos', { comite_id: comiteId, descricao: 'x', data: '15/07/2026' }, gestora),
      'entrada_invalida',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Toda alteração é auditável
// ═══════════════════════════════════════════════════════════════════════════
describe('10. auditoria e trilha', () => {
  it('criar, alterar e excluir deixam rastro na trilha de auditoria', async () => {
    const criado = await criar('fatos', { comite_id: comiteId, descricao: 'a' }, gestora);
    await atualizar('fatos', criado.id, { descricao: 'b' }, criado.versao, gestora);
    await excluir('fatos', [criado.id], gestora);

    const trilha = await db
      .selectFrom('logs_auditoria')
      .select(['acao', 'recurso', 'usuario_id'])
      .where('recurso', '=', 'fatos')
      .orderBy('ocorrido_em', 'asc')
      .execute();

    expect(trilha.map((t) => t.acao)).toEqual([
      'registro_criado',
      'registro_alterado',
      'registro_removido',
    ]);
    expect(trilha.every((t) => t.usuario_id === gestora.usuarioId)).toBe(true);
  });

  it('o histórico do próprio registro guarda o valor anterior', async () => {
    const criado = await criar('fatos', { comite_id: comiteId, descricao: 'antes' }, gestora);
    await atualizar('fatos', criado.id, { descricao: 'depois' }, criado.versao, gestora);

    const linha = await db
      .selectFrom('fatos')
      .select('historico')
      .where('id', '=', criado.id)
      .executeTakeFirstOrThrow();

    const historico = linha.historico as Array<{ campos: Record<string, { de: unknown; para: unknown }> }>;
    expect(historico).toHaveLength(1);
    expect(historico[0]!.campos.descricao).toEqual({ de: 'antes', para: 'depois' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Carga inicial entrega a SPA inteira e avisa quando trunca
// ═══════════════════════════════════════════════════════════════════════════
describe('11. carga inicial', () => {
  it('devolve todas as entidades conhecidas pela interface', async () => {
    await criar('fatos', { comite_id: comiteId, descricao: 'a' }, gestora);

    const carga = await cargaInicial(comiteId, gestora);

    for (const nome of NOMES_ENTIDADES) {
      expect(Array.isArray(carga.entidades[nome])).toBe(true);
    }
    expect(carga.entidades.fatos).toHaveLength(1);
    expect(carga.entidades.empreendimentos).toHaveLength(1);
    expect(carga.truncadas).toEqual([]);
  });

  it('não entrega entidade de módulo que o perfil não pode ler', async () => {
    const colaborador = await contextoDe('colab.dados', 'colaborador');
    const carga = await cargaInicial(comiteId, colaborador);
    // Colaborador não tem 'juridico:ler' nem 'empreendimentos:ler'.
    expect(carga.entidades.fatos).toEqual([]);
    expect(carga.entidades.empreendimentos).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Lote é atômico
// ═══════════════════════════════════════════════════════════════════════════
describe('12. criação em lote', () => {
  it('grava todos os registros do lote', async () => {
    const criados = await criarLote(
      'unidades',
      [
        { empreendimento_id: emprId, numero: 101, prazo_habite_se: '2026-12-31' },
        { empreendimento_id: emprId, numero: 102, prazo_habite_se: '2026-12-31' },
      ],
      gestora,
    );
    expect(criados).toHaveLength(2);
    expect(await contar('unidades')).toBe(2);
  });

  it('lote com um registro inválido não grava nenhum', async () => {
    await esperarErro(
      () =>
        criarLote(
          'unidades',
          [
            { empreendimento_id: emprId, numero: 201 },
            // Mesma unidade duas vezes: viola o índice único do banco.
            { empreendimento_id: emprId, numero: 201 },
          ],
          gestora,
        ),
      'conflito',
    );
    expect(await contar('unidades')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. Exportação é completa e auditada
// ═══════════════════════════════════════════════════════════════════════════
describe('13. exportação', () => {
  it('exporta todas as páginas e registra na trilha', async () => {
    for (let i = 0; i < 5; i++) {
      await criar('fatos', { comite_id: comiteId, descricao: `f${i}` }, gestora);
    }

    const dump = await exportar(gestora);
    expect((dump.fatos as unknown[]).length).toBe(5);
    expect(dump._origem).toBe('postgresql');

    const trilha = await db
      .selectFrom('logs_auditoria')
      .select('detalhe')
      .where('acao', '=', 'exportacao')
      .executeTakeFirstOrThrow();
    // 5 fatos + 1 empreendimento + 1 comite.
    expect((trilha.detalhe as { quantidadeRegistros: number }).quantidadeRegistros).toBe(7);
  });

  it('perfil sem permissão de exportar recebe a entidade vazia', async () => {
    await criar('fatos', { comite_id: comiteId, descricao: 'x' }, gestora);
    const lider = await contextoDe('lider3.dados', 'lider', { todosEmpreendimentos: true });
    // Líder exporta jurídico, mas não tem 'empreendimentos:exportar'... tem.
    // O caso real é o colaborador, que não exporta nada.
    const colaborador = await contextoDe('colab2.dados', 'colaborador');
    const dump = await exportar(colaborador);
    expect(dump.fatos).toEqual([]);
    expect(lider).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. Antirregressão (fase D): nenhum dado de negócio volta ao navegador
// ═══════════════════════════════════════════════════════════════════════════
describe('14. antirregressão do navegador', () => {
  const RAIZ = new URL('../../js/', import.meta.url).pathname;

  /**
   * Único arquivo autorizado a tocar em localStorage.
   *
   * `migracao.js` é o portão: grava preferências pelo catálogo, lê o legado
   * para detectar migração pendente e apaga chaves antigas depois da
   * confirmação do servidor. Qualquer outro arquivo que use armazenamento do
   * navegador está reintroduzindo a fonte de verdade que se acabou de remover.
   */
  const PORTAO = 'migracao.js';

  /** `monday-sync.js` apaga credencial legada — remoção, nunca gravação. */
  const REMOCAO_DE_CREDENCIAL = 'monday-sync.js';

  const arquivos = readdirSync(RAIZ).filter((f) => f.endsWith('.js'));

  /**
   * Remove comentários antes de procurar.
   *
   * A verificação é sobre o que o navegador EXECUTA. Sem isto, explicar num
   * comentário por que não se usa mais armazenamento local faria o próprio
   * comentário reprovar no teste — e a saída seria parar de explicar, que é o
   * contrário do que se quer.
   */
  const codigoDe = (arquivo: string): string[] => {
    const bruto = readFileSync(RAIZ + arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return bruto.split('\n').map((l) => l.replace(/\/\/.*$/, ''));
  };

  it('nenhum arquivo de negócio grava no localStorage ou sessionStorage', () => {
    const infratores: string[] = [];

    for (const arquivo of arquivos) {
      if (arquivo === PORTAO) continue;
      codigoDe(arquivo).forEach((linha, i) => {
        if (!/\b(localStorage|sessionStorage)\s*\.\s*setItem/.test(linha)) return;
        infratores.push(`${arquivo}:${i + 1}: ${linha.trim()}`);
      });
    }

    expect(infratores).toEqual([]);
  });

  it('nenhum arquivo de negócio lê dado do localStorage', () => {
    const infratores: string[] = [];

    for (const arquivo of arquivos) {
      if (arquivo === PORTAO) continue;
      // Remoção de credencial legada é o oposto de guardar dado.
      if (arquivo === REMOCAO_DE_CREDENCIAL) continue;
      codigoDe(arquivo).forEach((linha, i) => {
        if (!/\b(localStorage|sessionStorage)\s*\.\s*(getItem|key)\b/.test(linha)) return;
        infratores.push(`${arquivo}:${i + 1}: ${linha.trim()}`);
      });
    }

    expect(infratores).toEqual([]);
  });

  it('o código de db.js não toca em armazenamento do navegador', () => {
    const codigo = codigoDe('db.js').join('\n');
    expect(codigo).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('db.js aponta para a API e não para o dump antigo', () => {
    const codigo = codigoDe('db.js').join('\n');
    expect(codigo).toContain("'/api/dados'");
    // A rota do dump inteiro era o que permitia última-gravação-vence.
    expect(codigo).not.toContain('/api/db');
  });

  it('a interface pública de db.js foi preservada', () => {
    const conteudo = readFileSync(RAIZ + 'db.js', 'utf8');
    const ANTIGOS = [
      'ready', 'uid', 'getAll', 'getById', 'insert', 'update', 'remove', 'where',
      'forComite', 'getComites', 'getActiveComite', 'setActiveComite', 'comiteRef',
      'getEmpreendimentos', 'exportAll', 'importAll', 'storageSize',
    ];
    for (const metodo of ANTIGOS) {
      expect(conteudo).toMatch(new RegExp(`\\b${metodo}\\b`));
    }
  });

  it('não sobrou nenhum arquivo semeando dado demonstrativo', () => {
    expect(arquivos).not.toContain('seed.js');
  });

  it('toda entidade da interface tem destino declarado no servidor', () => {
    const doAdaptador = readFileSync(RAIZ + 'db.js', 'utf8');
    for (const nome of NOMES_ENTIDADES) {
      expect(doAdaptador).toContain(`'${nome}'`);
      expect(ENTIDADES[nome].tabela).toBeTruthy();
    }
  });
});
