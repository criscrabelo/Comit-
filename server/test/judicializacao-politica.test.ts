/**
 * Politica de judicializacao: fonte, vigencia, aprovacao e transicao.
 *
 * O que estes testes protegem, em ordem de importancia:
 *
 *   1. **Politica proposta nao classifica.** Sem politica aprovada, o registro
 *      fica em revisao — nunca vira `false` por omissao. Foi a instrucao
 *      explicita: "nao aplicar classificacao definitiva sem minha aprovacao".
 *   2. **Divergencia entre fontes preserva os dois lados.** A precedencia
 *      escolhe o que exibir, nao o que apagar.
 *   3. **Trocar de fonte e cadastrar politica, nao reescrever codigo.** O teste
 *      da transicao Monday → Sienge roda sem que nada em `avaliar` mude.
 *   4. **O passado nao e reescrito.** Politica aprovada e imutavel no criterio;
 *      reapurar competencia antiga usa a regra da epoca.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db, fecharBanco } from '../src/db/pool.js';
import {
  ENTIDADE_PROCESSOS,
  ErroPolitica,
  apurar,
  aprovar,
  avaliar,
  consolidar,
  gravarApuracoes,
  apuracoesDe,
  politicasVigentes,
  type Apuracao,
  type Politica,
} from '../src/juridico/judicializacao.js';
import { limparDados } from './ajuda/banco.js';

const HOJE = '2026-08-05';

async function criarUsuario(login: string): Promise<string> {
  const existente = await db
    .selectFrom('usuarios')
    .select('id')
    .where('usuario', '=', login)
    .executeTakeFirst();
  if (existente) return existente.id;

  const u = await db
    .insertInto('usuarios')
    .values({
      usuario: login,
      nome: 'Aprovador de Teste',
      perfil: 'administrador',
      area: 'juridico',
      status: 'ativo',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return u.id;
}

async function criarPolitica(dados: {
  versao: string;
  fonte: 'monday' | 'sienge';
  escopo?: string;
  tipo?: 'premissa_de_escopo' | 'por_rotulo' | 'por_termos';
  configuracao?: Record<string, unknown>;
  precedencia?: number;
  vigenteDe?: string;
  situacao?: 'proposta' | 'aprovada';
  aprovadaPor?: string | null;
}): Promise<Politica> {
  // Aprovacao sem autor e recusada pelo banco, de proposito. O helper cria um
  // aprovador quando o teste nao se importa com quem aprovou — a alternativa
  // seria afrouxar a restricao, que e justamente o que ela existe para impedir.
  const aprovada =
    dados.situacao === 'aprovada'
      ? {
          aprovada_por: dados.aprovadaPor ?? (await criarUsuario('aprovador-padrao')),
          aprovada_em: sql<Date>`now()`,
        }
      : {};

  const linha = await db
    .insertInto('politicas_judicializacao')
    .values({
      versao: dados.versao,
      fonte: dados.fonte,
      escopo: dados.escopo ?? 'processos',
      tipo: dados.tipo ?? 'premissa_de_escopo',
      configuracao: dados.configuracao ?? { judicializado: true },
      precedencia: dados.precedencia ?? 100,
      vigente_de: dados.vigenteDe ?? '2026-01-01',
      situacao: dados.situacao ?? 'proposta',
      justificativa: `teste ${dados.versao}`,
      ...aprovada,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return linha as unknown as Politica;
}

beforeEach(async () => {
  await limparDados();
  // A migracao 018 semeia a proposta do Monday. `limparDados` a remove junto
  // com o resto; cada teste monta o cenario de que precisa.
  await db.deleteFrom('politicas_judicializacao').execute();
});

afterAll(async () => {
  await fecharBanco();
});

describe('politica proposta nao produz efeito', () => {
  it('sem politica aprovada, o registro fica em revisao — nao vira false', async () => {
    await criarPolitica({ versao: '1.0.0', fonte: 'monday', situacao: 'proposta' });

    const c = await apurar('processos', HOJE, { monday: { situacao: 'ACOMPANHANDO' } });

    expect(c.judicializado).toBe(false);
    expect(c.revisaoNecessaria).toBe(true);
    expect(c.fonte).toBeNull();
    expect(c.apuracoes).toEqual([]);
    expect(c.motivo).toMatch(/nenhuma politica.*aprovada/i);
  });

  it('politicasVigentes ignora proposta e revogada', async () => {
    await criarPolitica({ versao: '1.0.0', fonte: 'monday', situacao: 'proposta' });
    await criarPolitica({ versao: '2.0.0', fonte: 'sienge', situacao: 'proposta' });

    expect(await politicasVigentes('processos', HOJE)).toEqual([]);
  });
});

describe('premissa de escopo', () => {
  it('classifica pelo escopo, sem olhar o rotulo', async () => {
    const p = await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      configuracao: { judicializado: true, board: '5959705266' },
    });

    // Os seis rotulos reais do board. Nenhum deles casa com lista de termos
    // nenhuma — e justamente por isso a premissa de escopo existe.
    for (const situacao of [
      'ACOMPANHANDO',
      'FINALIZADO',
      'ACORDO',
      'BAIXA DEFINITIVA',
      'RECOMPRA/ACORDO',
      'ARQUIVADO PROVISORIAMENTE',
      '',
    ]) {
      const a = avaliar(p, { situacao });
      expect(a.judicializado, situacao).toBe(true);
      expect(a.revisaoNecessaria, situacao).toBe(false);
    }
  });

  it('escopo pode significar o contrario, se a configuracao disser', async () => {
    // Um quadro de cobranca extrajudicial: estar nele significa NAO judicializado.
    const p = await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      configuracao: { judicializado: false },
    });

    const a = avaliar(p, { situacao: 'QUALQUER COISA' });
    expect(a.judicializado).toBe(false);
    expect(a.revisaoNecessaria).toBe(false);
  });
});

describe('por rotulo', () => {
  it('mapeia o rotulo ignorando acento e caixa', async () => {
    const p = await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      tipo: 'por_rotulo',
      situacao: 'aprovada',
      configuracao: { rotulos: { 'AÇÃO AJUIZADA': true, 'COBRANÇA EXTRAJUDICIAL': false } },
    });

    // O mapa foi digitado por uma pessoa; o Monday traz outra grafia. Exigir
    // igualdade byte a byte transformaria acento em registro sem classificacao.
    expect(avaliar(p, { situacao: 'acao ajuizada' }).judicializado).toBe(true);
    expect(avaliar(p, { situacao: 'Cobranca Extrajudicial' }).judicializado).toBe(false);
  });

  it('rotulo fora do mapa NAO e presumido: fica em revisao', async () => {
    const p = await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      tipo: 'por_rotulo',
      situacao: 'aprovada',
      configuracao: { rotulos: { ACOMPANHANDO: true } },
    });

    const a = avaliar(p, { situacao: 'RÓTULO NOVO QUE NINGUÉM PREVIU' });
    expect(a.judicializado).toBeNull();
    expect(a.revisaoNecessaria).toBe(true);
    expect(a.motivo).toMatch(/nao consta no mapa/i);
  });
});

describe('divergencia entre fontes', () => {
  const apuracao = (fonte: 'monday' | 'sienge', judicializado: boolean | null): Apuracao => ({
    fonte,
    politicaId: `id-${fonte}`,
    politicaVersao: '1.0.0',
    judicializado,
    revisaoNecessaria: false,
    motivo: `${fonte} concluiu`,
    valorObservado: 'ACOMPANHANDO',
  });

  it('quando as fontes concordam, nao ha divergencia', () => {
    const c = consolidar([apuracao('sienge', true), apuracao('monday', true)]);

    expect(c.judicializado).toBe(true);
    expect(c.divergente).toBe(false);
    expect(c.revisaoNecessaria).toBe(false);
    expect(c.fonte).toBe('sienge');
  });

  it('quando divergem, a precedencia decide o exibido e AMBAS ficam preservadas', () => {
    // A ordem de entrada ja e a de precedencia: sienge primeiro.
    const c = consolidar([apuracao('sienge', false), apuracao('monday', true)]);

    expect(c.judicializado).toBe(false);
    expect(c.fonte).toBe('sienge');
    expect(c.divergente).toBe(true);
    // Divergencia e exatamente o caso que precisa de olho humano.
    expect(c.revisaoNecessaria).toBe(true);
    // Nenhum lado descartado.
    expect(c.apuracoes).toHaveLength(2);
    expect(c.apuracoes.map((a) => a.fonte).sort()).toEqual(['monday', 'sienge']);
    expect(c.motivo).toMatch(/preservadas/i);
  });

  it('fonte que nao concluiu nao conta como divergencia', () => {
    const c = consolidar([apuracao('sienge', null), apuracao('monday', true)]);

    expect(c.judicializado).toBe(true);
    expect(c.fonte).toBe('monday');
    expect(c.divergente).toBe(false);
  });

  it('nenhuma fonte concluiu: revisao, com o motivo de cada uma', () => {
    const c = consolidar([apuracao('sienge', null), apuracao('monday', null)]);

    expect(c.revisaoNecessaria).toBe(true);
    expect(c.fonte).toBeNull();
    expect(c.motivo).toContain('[sienge]');
    expect(c.motivo).toContain('[monday]');
  });
});

describe('transicao de fonte', () => {
  it('Sienge assume a fonte principal sem que a logica mude', async () => {
    // Fase 1 — so o Monday.
    await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      precedencia: 10,
      configuracao: { judicializado: true },
    });

    const fase1 = await apurar('processos', HOJE, { monday: { situacao: 'ACOMPANHANDO' } });
    expect(fase1.fonte).toBe('monday');
    expect(fase1.judicializado).toBe(true);

    // Fase 2 — o Sienge entra com precedencia MENOR, ou seja, maior prioridade.
    // Nenhuma linha de codigo mudou: so foi cadastrada uma politica.
    await criarPolitica({
      versao: '1.0.0',
      fonte: 'sienge',
      situacao: 'aprovada',
      precedencia: 5,
      tipo: 'por_rotulo',
      configuracao: { rotulos: { 'EM CURSO': true, ENCERRADO: false } },
    });

    const fase2 = await apurar('processos', HOJE, {
      monday: { situacao: 'ACOMPANHANDO' },
      sienge: { situacao: 'ENCERRADO' },
    });

    // O Sienge decide, o Monday continua registrado, e a divergencia aparece.
    expect(fase2.fonte).toBe('sienge');
    expect(fase2.judicializado).toBe(false);
    expect(fase2.divergente).toBe(true);
    expect(fase2.apuracoes).toHaveLength(2);
  });

  it('politica de fonte que nao trouxe dado nao produz apuracao', async () => {
    await criarPolitica({ versao: '1.0.0', fonte: 'monday', situacao: 'aprovada', precedencia: 10 });
    await criarPolitica({ versao: '1.0.0', fonte: 'sienge', situacao: 'aprovada', precedencia: 5 });

    // Sienge tem politica, mas nao trouxe dado para este registro.
    const c = await apurar('processos', HOJE, { monday: { situacao: 'ACOMPANHANDO' } });

    expect(c.apuracoes).toHaveLength(1);
    expect(c.apuracoes[0]!.fonte).toBe('monday');
    expect(c.divergente).toBe(false);
  });
});

describe('vigencia', () => {
  it('reapurar o passado usa a politica da epoca, nao a atual', async () => {
    await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      vigenteDe: '2026-01-01',
      configuracao: { judicializado: true },
    });
    await db
      .updateTable('politicas_judicializacao')
      .set({ vigente_ate: '2026-06-30' })
      .where('versao', '=', '1.0.0')
      .execute();

    await criarPolitica({
      versao: '2.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      vigenteDe: '2026-07-01',
      configuracao: { judicializado: false },
    });

    const marco = await apurar('processos', '2026-03-15', { monday: { situacao: 'X' } });
    const agosto = await apurar('processos', '2026-08-05', { monday: { situacao: 'X' } });

    // O numero do comite de marco nao muda porque a regra foi trocada em julho.
    expect(marco.judicializado).toBe(true);
    expect(agosto.judicializado).toBe(false);
  });

  it('escopo especifico ganha de "*" quando a precedencia empata', async () => {
    await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      escopo: '*',
      situacao: 'aprovada',
      configuracao: { judicializado: false },
    });
    await criarPolitica({
      versao: '2.0.0',
      fonte: 'monday',
      escopo: 'processos',
      situacao: 'aprovada',
      configuracao: { judicializado: true },
    });

    const politicas = await politicasVigentes('processos', HOJE);
    expect(politicas[0]!.escopo).toBe('processos');
  });
});

describe('ciclo de vida', () => {
  it('aprovar encerra a vigencia da anterior automaticamente', async () => {
    const usuario = await criarUsuario('aprovador');

    const antiga = await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      vigenteDe: '2026-01-01',
      aprovadaPor: usuario,
    });
    const nova = await criarPolitica({
      versao: '2.0.0',
      fonte: 'monday',
      situacao: 'proposta',
      vigenteDe: '2026-08-01',
    });

    await aprovar(nova.id, usuario);

    const depois = await db
      .selectFrom('politicas_judicializacao')
      .select(['versao', 'vigente_ate', 'situacao'])
      .orderBy('versao')
      .execute();

    expect(depois[0]).toMatchObject({ versao: '1.0.0', vigente_ate: '2026-07-31' });
    expect(depois[1]).toMatchObject({ versao: '2.0.0', situacao: 'aprovada' });
    expect(antiga.id).not.toBe(nova.id);
  });

  it('duas politicas aprovadas nao podem valer ao mesmo tempo', async () => {
    const usuario = await criarUsuario('aprovador');
    await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      vigenteDe: '2026-01-01',
      aprovadaPor: usuario,
    });

    await expect(
      criarPolitica({
        versao: '2.0.0',
        fonte: 'monday',
        situacao: 'aprovada',
        vigenteDe: '2026-03-01',
        aprovadaPor: usuario,
      }),
    ).rejects.toThrow(/sobrepoe/i);
  });

  it('politica aprovada e imutavel no criterio: mudanca exige versao nova', async () => {
    const usuario = await criarUsuario('aprovador');
    const p = await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      aprovadaPor: usuario,
    });

    // Reescrever o criterio faria o indicador de marco passar a ser explicado
    // por uma regra que nao existia em marco.
    await expect(
      db
        .updateTable('politicas_judicializacao')
        .set({ configuracao: { judicializado: false } })
        .where('id', '=', p.id)
        .execute(),
    ).rejects.toThrow(/imutaveis|versao nova/i);
  });

  it('encerrar vigencia de politica aprovada continua permitido', async () => {
    const usuario = await criarUsuario('aprovador');
    const p = await criarPolitica({
      versao: '1.0.0',
      fonte: 'monday',
      situacao: 'aprovada',
      aprovadaPor: usuario,
    });

    await db
      .updateTable('politicas_judicializacao')
      .set({ vigente_ate: '2026-12-31' })
      .where('id', '=', p.id)
      .execute();

    const depois = await db
      .selectFrom('politicas_judicializacao')
      .select('vigente_ate')
      .where('id', '=', p.id)
      .executeTakeFirstOrThrow();

    expect(depois.vigente_ate).toBe('2026-12-31');
  });

  it('aprovar politica ja revogada e recusado', async () => {
    const usuario = await criarUsuario('aprovador');
    const p = await criarPolitica({ versao: '1.0.0', fonte: 'monday', situacao: 'proposta' });

    await db
      .updateTable('politicas_judicializacao')
      .set({
        situacao: 'revogada',
        revogada_em: sql<Date>`now()`,
        revogada_motivo: 'criterio errado',
      })
      .where('id', '=', p.id)
      .execute();

    await expect(aprovar(p.id, usuario)).rejects.toThrow(ErroPolitica);
  });

  it('aprovacao sem autor e recusada pelo banco', async () => {
    await expect(
      db
        .insertInto('politicas_judicializacao')
        .values({
          versao: '9.9.9',
          fonte: 'monday',
          escopo: 'processos',
          tipo: 'premissa_de_escopo',
          vigente_de: '2026-01-01',
          situacao: 'aprovada',
          justificativa: 'sem autor',
        })
        .execute(),
    ).rejects.toThrow(/politica_aprovacao_completa/i);
  });
});

describe('persistencia das apuracoes', () => {
  it('grava uma linha por fonte e atualiza no lugar', async () => {
    const registroId = (await db
      .insertInto('processos_judiciais')
      .values({ fonte: 'monday', id_origem: 'p-1', numero: '123' })
      .returning('id')
      .executeTakeFirstOrThrow()).id;

    const pMonday = await criarPolitica({ versao: '1.0.0', fonte: 'monday', situacao: 'aprovada' });
    const pSienge = await criarPolitica({ versao: '1.0.0', fonte: 'sienge', situacao: 'aprovada', precedencia: 5 });

    await gravarApuracoes(ENTIDADE_PROCESSOS, registroId, [
      { fonte: 'monday', politicaId: pMonday.id, politicaVersao: '1.0.0', judicializado: true, revisaoNecessaria: false, motivo: 'm1', valorObservado: 'A' },
      { fonte: 'sienge', politicaId: pSienge.id, politicaVersao: '1.0.0', judicializado: false, revisaoNecessaria: false, motivo: 's1', valorObservado: 'B' },
    ]);

    // Reapurar sobrescreve a linha da fonte, nao acumula duplicatas.
    await gravarApuracoes(ENTIDADE_PROCESSOS, registroId, [
      { fonte: 'monday', politicaId: pMonday.id, politicaVersao: '1.0.0', judicializado: false, revisaoNecessaria: false, motivo: 'm2', valorObservado: 'C' },
    ]);

    const lidas = await apuracoesDe(ENTIDADE_PROCESSOS, registroId);

    expect(lidas).toHaveLength(2);
    // Ordenadas por precedencia da politica: sienge (5) antes de monday (100).
    expect(lidas[0]!.fonte).toBe('sienge');
    expect(lidas.find((a) => a.fonte === 'monday')!.motivo).toBe('m2');
    expect(lidas.find((a) => a.fonte === 'monday')!.judicializado).toBe(false);
  });
});
