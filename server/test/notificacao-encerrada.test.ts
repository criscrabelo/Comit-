/**
 * Notificação encerrada sem resolução.
 *
 * Decisão da Coevo em 06/08/2026, sobre os 7 registros que a homologação do
 * board 5630368737 apontou: 6 `Distratado` e 1 `A Retomar` tinham data de
 * resolução na origem e a perdiam, porque o modelo só admitia data de solução
 * com `estagio = 'Resolvida'`.
 *
 * O que estes testes protegem:
 *
 *   1. **Encerrada NÃO é Resolvida.** O caso acabou sem o desfecho que se
 *      queria. Contar como resolução inflaria a taxa de resolução, que é
 *      indicador de comitê.
 *   2. **Encerrada registra a data.** É o ponto da correção: o tempo em que o
 *      caso ficou aberto passa a ser mensurável.
 *   3. **`Em Andamento` continua sem data**, e o banco recusa — a regra vive
 *      no CHECK, não na convenção.
 *   4. **`Recompra` NÃO foi alterada.** A pergunta não foi feita sobre ela.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, fecharBanco } from '../src/db/pool.js';
import {
  estagioEncerra,
  normalizarEstagio,
} from '../src/integracoes/monday/transformacao.js';
import { limparDados } from './ajuda/banco.js';

beforeEach(async () => {
  await limparDados();
});

afterAll(async () => {
  await fecharBanco();
});

describe('normalizarEstagio — os três estados', () => {
  it('rótulos de resolução continuam Resolvida', () => {
    // `Unidade retomada` esta no passado: a retomada se concretizou.
    for (const bruto of ['Resolvido', 'RESOLVIDA', 'Unidade retomada']) {
      expect(normalizarEstagio(bruto), bruto).toBe('Resolvida');
    }
  });

  it('os dois rótulos decididos viram Encerrada', () => {
    for (const bruto of ['Distratado', 'DISTRATADO', 'A Retomar', 'a retomar']) {
      expect(normalizarEstagio(bruto), bruto).toBe('Encerrada');
    }
  });

  it('`Recompra` NÃO foi alterada — a pergunta não foi feita sobre ela', () => {
    // Da mesma familia de `Distratado`, mas mexer numa regra de indicador sem
    // a decisao ter sido tomada e exatamente o que nao se faz aqui.
    expect(normalizarEstagio('Recompra')).toBe('Em Andamento');
    expect(normalizarEstagio('RE-COMPRA')).toBe('Em Andamento');
  });

  it('os demais rótulos reais do quadro seguem Em Andamento', () => {
    for (const bruto of [
      'Processo Judicial Dra. Michele',
      'Enviado para Protesto',
      'Aguardando prazo',
      'Enviar Notificação',
      'Aguardando pagamento',
      'Sem retorno do cliente até o momento',
      'Em tratativa com o cliente',
      '',
      null,
    ]) {
      expect(normalizarEstagio(bruto), String(bruto)).toBe('Em Andamento');
    }
  });

  it('`A Retomar` e `Unidade retomada` são estados diferentes', () => {
    // Futuro x passado. Colapsar os dois faria caso encaminhado contar como
    // retomada concluida.
    expect(normalizarEstagio('A Retomar')).toBe('Encerrada');
    expect(normalizarEstagio('Unidade retomada')).toBe('Resolvida');
  });
});

describe('estagioEncerra', () => {
  it('encerra quando resolvido OU encerrado sem resolução', () => {
    expect(estagioEncerra('Resolvida')).toBe(true);
    expect(estagioEncerra('Encerrada')).toBe(true);
    expect(estagioEncerra('Em Andamento')).toBe(false);
  });
});

describe('restrição do banco', () => {
  async function gravar(estagio: string, dataSolucao: string | null) {
    return db
      .insertInto('notificacoes')
      .values({
        fonte: 'monday',
        id_origem: `n-${estagio}-${dataSolucao ?? 'sem'}`,
        estagio,
        data_notificacao: '2026-07-01',
        data_solucao: dataSolucao,
      })
      .returning(['estagio', 'data_solucao'])
      .executeTakeFirstOrThrow();
  }

  it('aceita data de solução em Encerrada — é o ponto da correção', async () => {
    const linha = await gravar('Encerrada', '2026-07-20');
    expect(linha.estagio).toBe('Encerrada');
    expect(linha.data_solucao).toBe('2026-07-20');
  });

  it('continua aceitando em Resolvida', async () => {
    const linha = await gravar('Resolvida', '2026-07-20');
    expect(linha.data_solucao).toBe('2026-07-20');
  });

  it('recusa data de solução em caso ainda aberto', async () => {
    // Calcular tempo de solucao de caso aberto produziria numero sem sentido.
    await expect(gravar('Em Andamento', '2026-07-20')).rejects.toThrow(
      /notificacao_solucao_coerente/,
    );
  });

  it('caso aberto sem data continua válido', async () => {
    const linha = await gravar('Em Andamento', null);
    expect(linha.data_solucao).toBeNull();
  });
});
