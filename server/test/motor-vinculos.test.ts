/**
 * Motor de relacionamento Monday × Sienge.
 *
 * Cobre os cinco níveis de chave, os quatro níveis de confiança, os onze
 * bloqueios automáticos e a regra que impede concluir divergência financeira
 * apenas porque os valores diferem.
 *
 * Os oito exemplos sintéticos exigidos na entrega estão na última seção,
 * nomeados um a um.
 */
import { describe, expect, it } from 'vitest';
import {
  apurarCriterios,
  compararFinanceiro,
  relacionar,
} from '../src/vinculos/motor.js';
import {
  avaliarConfianca,
  documentarCriterios,
  LIMIARES,
  PESOS,
} from '../src/vinculos/criterios.js';
import {
  bloqueiosDoPar,
  bloqueiosFinanceiros,
  documentarBloqueios,
  type LadoRegistro,
} from '../src/vinculos/bloqueios.js';

// Documentos válidos, conferidos pelos testes de dominio/documento.
const CPF_A = '52998224725';
const CPF_B = '11144477735';
const CNPJ = '11222333000181';

const monday = (extra: Partial<LadoRegistro> = {}): LadoRegistro => ({
  fonte: 'monday',
  idOrigem: 'item-1',
  ...extra,
});

const sienge = (extra: Partial<LadoRegistro> = {}): LadoRegistro => ({
  fonte: 'sienge',
  idOrigem: 'titulo-1',
  ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ordem de prioridade das chaves', () => {
  it('documento validado sozinho alcanca confianca alta', () => {
    const r = relacionar(
      monday({ cpfCnpj: '529.982.247-25', nome: 'Maria Silva' }),
      [sienge({ cpfCnpj: CPF_A, nome: 'Maria Silva Souza' })],
    );

    expect(r.situacao).toBe('automatico');
    expect(r.avaliacao.confianca).toBe('alta');
    expect(r.avaliacao.regra).toBe('cpf_cnpj');
    expect(r.avaliacao.score).toBeGreaterThanOrEqual(LIMIARES.alta);
  });

  it('contrato sozinho fica em confianca media: sugere, nao vincula', () => {
    const r = relacionar(
      monday({ contrato: 'CT-2024/001' }),
      [sienge({ contrato: 'CT2024001' })],
    );

    expect(r.situacao).toBe('sugerido');
    expect(r.avaliacao.confianca).toBe('media');
    expect(r.avaliacao.regra).toBe('contrato');
  });

  it('empreendimento + unidade fica em media', () => {
    const r = relacionar(
      monday({ empreendimentoId: 'e-1', empreendimentoNome: 'VERANO', unidade: '1105B' }),
      [sienge({ empreendimentoId: 'e-1', empreendimentoNome: 'VERANO', unidade: '1105b' })],
    );

    expect(r.avaliacao.confianca).toBe('media');
    expect(r.avaliacao.regra).toBe('empr_unidade');
    expect(r.avaliacao.score).toBe(PESOS.empreendimento + PESOS.unidade);
  });

  it('identificador relacionado pontua uma vez, nao por cada id', () => {
    const r = relacionar(
      monday({ idsRelacionados: { id_reserva: 'R-77', id_unidade: 'U-9' } }),
      [sienge({ idsRelacionados: { id_reserva: 'R-77', id_unidade: 'U-9' } })],
    );

    const idsAtendidos = r.avaliacao.atendidos.filter((c) => c.nome === 'id_relacionado');
    expect(idsAtendidos).toHaveLength(1);
    expect(r.avaliacao.score).toBe(PESOS.id_relacionado);
  });

  it('nome completo e o ULTIMO recurso e nunca sobe de baixa', () => {
    const r = relacionar(
      monday({ nome: 'Maria Aparecida Silva' }),
      [sienge({ nome: 'MARIA APARECIDA SILVA' })],
    );

    expect(r.avaliacao.atendidos.some((c) => c.nome === 'nome_completo')).toBe(true);
    expect(r.avaliacao.confianca).toBe('baixa');
    // Sem nenhum identificador minimo, o bloqueio vem ANTES da confianca: a
    // situacao e 'bloqueado', que e mais forte que 'recusado'. O que importa e
    // que nao vinculou.
    expect(['recusado', 'bloqueado']).toContain(r.situacao);
    expect(r.escolhido).toBeNull();
  });

  it('nome completo com data compativel continua em baixa', () => {
    // Somar reforcos nao promove um vinculo sustentado apenas por nome.
    const r = relacionar(
      monday({ nome: 'Maria Aparecida Silva', dataReferencia: '2026-05-28' }),
      [sienge({ nome: 'Maria Aparecida Silva', dataReferencia: '2026-05-28' })],
    );

    expect(r.avaliacao.confianca).toBe('baixa');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('primeiro nome NUNCA vincula', () => {
  it('um unico termo e tratado como conflito, nao como criterio', () => {
    const { atendidos, conflitantes } = apurarCriterios(
      monday({ nome: 'Maria' }),
      sienge({ nome: 'Maria' }),
    );

    expect(atendidos.some((c) => c.nome === 'nome_completo')).toBe(false);
    const conflito = conflitantes.find((c) => c.nome === 'nome_completo');
    expect(conflito?.observacao).toMatch(/primeiro nome n[ãa]o vincula/i);
  });

  it('relacionar por primeiro nome resulta em recusa', () => {
    const r = relacionar(monday({ nome: 'Joao' }), [sienge({ nome: 'Joao' })]);
    expect(r.situacao).not.toBe('automatico');
    expect(r.situacao).not.toBe('sugerido');
    expect(r.avaliacao.confianca).toBe('baixa');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('os onze bloqueios automaticos', () => {
  it('catalogo tem os onze bloqueios documentados', () => {
    expect(documentarBloqueios()).toHaveLength(11);
  });

  it('1. documentos validos e diferentes', () => {
    const b = bloqueiosDoPar(monday({ cpfCnpj: CPF_A }), sienge({ cpfCnpj: CPF_B }));
    expect(b.map((x) => x.codigo)).toContain('cpf_cnpj_diferentes');
    // O documento nunca aparece em claro na trilha.
    const criterio = b.find((x) => x.codigo === 'cpf_cnpj_diferentes')?.criterio;
    expect(String(criterio?.valor_a)).not.toContain(CPF_A);
  });

  it('2. documento invalido', () => {
    const b = bloqueiosDoPar(monday({ cpfCnpj: '529.982.247-26' }), sienge({ cpfCnpj: CPF_A }));
    expect(b.map((x) => x.codigo)).toContain('cpf_cnpj_invalido');
  });

  it('3. mais de um contrato candidato', () => {
    const r = relacionar(
      monday({ cpfCnpj: CPF_A, contrato: 'CT-1' }),
      [sienge({ cpfCnpj: CPF_A, contrato: 'CT-1' })],
      { contratosCandidatos: 3 },
    );
    expect(r.situacao).toBe('bloqueado');
    expect(r.bloqueios.map((x) => x.codigo)).toContain('multiplos_contratos_candidatos');
  });

  it('4. contrato associado a clientes diferentes', () => {
    const r = relacionar(
      monday({ cpfCnpj: CPF_A, contrato: 'CT-1' }),
      [sienge({ cpfCnpj: CPF_A, contrato: 'CT-1' })],
      { clientesPorContrato: 2 },
    );
    expect(r.situacao).toBe('bloqueado');
    expect(r.bloqueios.map((x) => x.codigo)).toContain('contrato_de_clientes_diferentes');
    expect(r.exigeInconsistencia).toBe(true);
  });

  it('5. empreendimento ambiguo', () => {
    const b = bloqueiosDoPar(
      monday({ cpfCnpj: CPF_A, empreendimentoId: 'e-1', empreendimentoNome: 'VERANO' }),
      sienge({ cpfCnpj: CPF_A, empreendimentoId: 'e-2', empreendimentoNome: 'AURORA' }),
    );
    expect(b.map((x) => x.codigo)).toContain('empreendimento_ambiguo');
  });

  it('6. unidade ambigua no mesmo empreendimento', () => {
    const b = bloqueiosDoPar(
      monday({ cpfCnpj: CPF_A, empreendimentoId: 'e-1', unidade: '1105B' }),
      sienge({ cpfCnpj: CPF_A, empreendimentoId: 'e-1', unidade: '1106A' }),
    );
    expect(b.map((x) => x.codigo)).toContain('unidade_ambigua');
  });

  it('7. mesmo nome com documentos diferentes (homonimos)', () => {
    const b = bloqueiosDoPar(
      monday({ nome: 'Maria Aparecida Silva', cpfCnpj: CPF_A }),
      sienge({ nome: 'Maria Aparecida Silva', cpfCnpj: CPF_B }),
    );
    expect(b.map((x) => x.codigo)).toContain('mesmo_nome_documentos_diferentes');
  });

  it('8. ausencia dos identificadores minimos', () => {
    const b = bloqueiosDoPar(monday({ nome: 'Maria Silva' }), sienge({ nome: 'Maria Silva' }));
    expect(b.map((x) => x.codigo)).toContain('identificadores_minimos_ausentes');
  });

  it('9. mais de uma correspondencia possivel', () => {
    const r = relacionar(monday({ cpfCnpj: CPF_A }), [
      sienge({ idOrigem: 'titulo-1', cpfCnpj: CPF_A }),
      sienge({ idOrigem: 'titulo-2', cpfCnpj: CPF_A }),
    ]);
    expect(r.situacao).toBe('ambiguo');
    expect(r.bloqueios.map((x) => x.codigo)).toContain('multiplas_correspondencias');
  });

  it('10. datas de referencia incompativeis', () => {
    const b = bloqueiosFinanceiros(
      monday({ dataReferencia: '2026-03-04', valor: 64000, naturezaValor: 'saldo_vencido' }),
      sienge({ dataReferencia: '2026-05-28', valor: 66071.1, naturezaValor: 'saldo_vencido' }),
    );
    expect(b.map((x) => x.codigo)).toContain('datas_referencia_incompativeis');
  });

  it('11. naturezas de valor diferentes', () => {
    const b = bloqueiosFinanceiros(
      monday({ dataReferencia: '2026-05-28', valor: 1000, naturezaValor: 'saldo_vencido' }),
      sienge({ dataReferencia: '2026-05-28', valor: 1000, naturezaValor: 'saldo_atualizado' }),
    );
    expect(b.map((x) => x.codigo)).toContain('naturezas_valor_diferentes');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('conflito rebaixa a confianca, mesmo com score alto', () => {
  it('documento igual mas contrato divergente nao vira vinculo automatico', () => {
    // Score somaria 60 do documento, mas o contrato divergente indica que a
    // hipotese esta errada, nao apenas fraca.
    const r = relacionar(
      monday({ cpfCnpj: CPF_A, contrato: 'CT-1' }),
      [sienge({ cpfCnpj: CPF_A, contrato: 'CT-999' })],
    );

    expect(r.avaliacao.score).toBeGreaterThanOrEqual(LIMIARES.alta);
    expect(r.avaliacao.temConflito).toBe(true);
    expect(r.avaliacao.confianca).toBe('baixa');
    expect(r.situacao).toBe('recusado');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ambiguidade nunca e resolvida sozinha', () => {
  it('preserva todos os candidatos e nao elege nenhum', () => {
    const r = relacionar(monday({ cpfCnpj: CPF_A, contrato: 'CT-1' }), [
      sienge({ idOrigem: 'a', cpfCnpj: CPF_A, contrato: 'CT-1' }),
      sienge({ idOrigem: 'b', cpfCnpj: CPF_A, contrato: 'CT-1' }),
      sienge({ idOrigem: 'c', cpfCnpj: CPF_A }),
    ]);

    expect(r.situacao).toBe('ambiguo');
    expect(r.candidatos).toHaveLength(3);
    expect(r.escolhido).toBeNull();
    expect(r.chaveUsada).toBeNull();
    // Confianca rebaixada mesmo quando o melhor candidato pontuaria alto.
    expect(r.avaliacao.confianca).toBe('baixa');
    // Inconsistencia e OBRIGATORIA.
    expect(r.exigeInconsistencia).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('criterios sao auditaveis', () => {
  it('cada criterio registra nome, peso e os dois valores comparados', () => {
    const r = relacionar(
      monday({ cpfCnpj: CPF_A, contrato: 'CT-1', empreendimentoId: 'e-1', unidade: '101' }),
      [sienge({ cpfCnpj: CPF_A, contrato: 'CT-1', empreendimentoId: 'e-1', unidade: '101' })],
    );

    for (const c of r.avaliacao.atendidos) {
      expect(c.nome).toBeTruthy();
      expect(typeof c.peso).toBe('number');
      expect(c).toHaveProperty('valor_a');
      expect(c).toHaveProperty('valor_b');
      expect(c.observacao).toBeTruthy();
    }
    expect(r.avaliacao.versaoRegra).toBe('vinculo-1.0.0');
  });

  it('score e soma dos pesos, limitado a 100', () => {
    const avaliacao = avaliarConfianca(
      [
        { nome: 'cpf_cnpj', peso: 60, valor_a: 'x', valor_b: 'x' },
        { nome: 'contrato', peso: 30, valor_a: 'y', valor_b: 'y' },
        { nome: 'empreendimento', peso: 12, valor_a: 'z', valor_b: 'z' },
        { nome: 'unidade', peso: 12, valor_a: 'w', valor_b: 'w' },
      ],
      [],
    );
    expect(avaliacao.score).toBe(100);
  });

  it('os criterios estao documentados com limiares e comportamento', () => {
    const doc = documentarCriterios();
    expect(doc.limiares.alta).toContain('60');
    expect(doc.comportamento.alta).toBe('vínculo automático permitido');
    expect(doc.comportamento.ambiguo).toContain('sem escolher');
    expect(doc.observacoes.some((o) => /primeiro nome nunca vincula/i.test(o))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('comparacao financeira: valores diferentes NAO sao divergencia', () => {
  const comparaveis = {
    contratoConfirmado: true,
    parcelaConfirmada: true,
    naturezaConfirmada: true,
    dataConfirmada: true,
    pagamentosApurados: true,
    encargosApurados: true,
    eventosContratuaisApurados: true,
  };

  it('datas diferentes → data_referencia_incompativel, nao divergencia', () => {
    const r = compararFinanceiro(
      monday({ dataReferencia: '2026-03-04', valor: 64000, naturezaValor: 'saldo_vencido' }),
      sienge({ dataReferencia: '2026-05-28', valor: 66071.1, naturezaValor: 'saldo_vencido' }),
      comparaveis,
    );

    expect(r.classificacao).toBe('data_referencia_incompativel');
    expect(r.explicacao).toMatch(/defasagem de leitura/i);
    expect(r.explicacao).toMatch(/Nao classificada como divergencia|não classificada como divergência/i);
    // Aponta o que falta apurar.
    expect(r.pendencias).toContain('apurar pagamentos ocorridos entre as duas datas');
  });

  it('naturezas diferentes → natureza_valor_incompativel', () => {
    const r = compararFinanceiro(
      monday({ dataReferencia: '2026-05-28', valor: 1000, naturezaValor: 'saldo_vencido' }),
      sienge({ dataReferencia: '2026-05-28', valor: 5000, naturezaValor: 'saldo_contratual' }),
      comparaveis,
    );
    expect(r.classificacao).toBe('natureza_valor_incompativel');
    expect(r.diferenca).toBeNull();
  });

  it('mesma data, valores diferentes, elementos NAO apurados → a validar', () => {
    const r = compararFinanceiro(
      monday({ dataReferencia: '2026-05-28', valor: 64000, naturezaValor: 'saldo_vencido' }),
      sienge({ dataReferencia: '2026-05-28', valor: 66071.1, naturezaValor: 'saldo_vencido' }),
      // Nada apurado.
      {},
    );

    expect(r.classificacao).toBe('divergencia_valor_a_validar');
    expect(r.pendencias.length).toBeGreaterThan(0);
    expect(r.explicacao).toMatch(/A VALIDAR/i);
  });

  it('so classifica divergencia confirmada com TODOS os elementos apurados', () => {
    const r = compararFinanceiro(
      monday({ dataReferencia: '2026-05-28', valor: 64000, naturezaValor: 'saldo_vencido' }),
      sienge({ dataReferencia: '2026-05-28', valor: 66071.1, naturezaValor: 'saldo_vencido' }),
      comparaveis,
    );

    expect(r.classificacao).toBe('divergencia_confirmada');
    expect(r.diferenca).toBeCloseTo(2071.1, 2);
    expect(r.pendencias).toEqual([]);
  });

  it('falta um unico elemento e ja nao confirma', () => {
    for (const chave of Object.keys(comparaveis) as Array<keyof typeof comparaveis>) {
      const parcial = { ...comparaveis, [chave]: false };
      const r = compararFinanceiro(
        monday({ dataReferencia: '2026-05-28', valor: 100, naturezaValor: 'saldo_vencido' }),
        sienge({ dataReferencia: '2026-05-28', valor: 200, naturezaValor: 'saldo_vencido' }),
        parcial,
      );
      expect(r.classificacao, `faltando ${chave}`).toBe('divergencia_valor_a_validar');
    }
  });

  it('valores iguais na mesma data nao geram nada', () => {
    const r = compararFinanceiro(
      monday({ dataReferencia: '2026-05-28', valor: 66071.1, naturezaValor: 'saldo_vencido' }),
      sienge({ dataReferencia: '2026-05-28', valor: 66071.1, naturezaValor: 'saldo_vencido' }),
      comparaveis,
    );
    expect(r.classificacao).toBe('valores_iguais');
    expect(r.diferenca).toBe(0);
  });

  it('ausencia de data de referencia impede concluir', () => {
    const r = compararFinanceiro(
      monday({ valor: 100, naturezaValor: 'saldo_vencido' }),
      sienge({ dataReferencia: '2026-05-28', valor: 200, naturezaValor: 'saldo_vencido' }),
      comparaveis,
    );
    expect(r.classificacao).toBe('data_referencia_incompativel');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Os oito exemplos sinteticos exigidos na entrega
// ═══════════════════════════════════════════════════════════════════════════
describe('exemplos sinteticos da entrega', () => {
  it('1. VINCULO AUTOMATICO CORRETO — documento validado igual', () => {
    const r = relacionar(
      monday({
        idOrigem: 'item-5001',
        cpfCnpj: '529.982.247-25',
        nome: 'Maria Aparecida Silva',
        contrato: 'CT-2024/001',
        empreendimentoId: 'e-verano',
        empreendimentoNome: 'VERANO',
        unidade: '1105B',
      }),
      [
        sienge({
          idOrigem: 'titulo-4471',
          cpfCnpj: CPF_A,
          nome: 'MARIA APARECIDA SILVA',
          contrato: 'CT2024001',
          empreendimentoId: 'e-verano',
          empreendimentoNome: 'VERANO',
          unidade: '1105b',
        }),
      ],
    );

    expect(r.situacao).toBe('automatico');
    expect(r.avaliacao.confianca).toBe('alta');
    expect(r.avaliacao.score).toBe(100);
    expect(r.avaliacao.regra).toBe('cpf_cnpj');
    expect(r.escolhido?.idOrigem).toBe('titulo-4471');
    expect(r.exigeInconsistencia).toBe(false);
  });

  it('2. VINCULO SUGERIDO — contrato coincide, sem documento', () => {
    const r = relacionar(
      monday({ idOrigem: 'item-5002', contrato: 'CT-2024/018', nome: 'Joao Pedro Alencar' }),
      [sienge({ idOrigem: 'titulo-4490', contrato: 'CT2024018', nome: 'Joao P. Alencar' })],
    );

    expect(r.situacao).toBe('sugerido');
    expect(r.avaliacao.confianca).toBe('media');
    expect(r.avaliacao.regra).toBe('contrato');
    // Registra o candidato, mas aguarda revisao: nao e vinculo consumado.
    expect(r.escolhido?.idOrigem).toBe('titulo-4490');
  });

  it('3. VINCULO RECUSADO — sustentado apenas por nome completo', () => {
    const r = relacionar(
      monday({ idOrigem: 'item-5003', nome: 'Ana Paula Souza', empreendimentoId: 'e-1' }),
      [sienge({ idOrigem: 'titulo-4501', nome: 'Ana Paula Souza', empreendimentoId: 'e-1' })],
    );

    expect(r.situacao).toBe('bloqueado');
    expect(r.bloqueios.map((b) => b.codigo)).toContain('identificadores_minimos_ausentes');
    expect(r.escolhido).toBeNull();
  });

  it('4. VINCULO AMBIGUO — tres candidatos, nenhum escolhido', () => {
    const r = relacionar(
      monday({ idOrigem: 'item-5004', cpfCnpj: CNPJ, nome: 'Construtora Exemplo Ltda' }),
      [
        sienge({ idOrigem: 'titulo-4510', cpfCnpj: CNPJ, contrato: 'CT-A' }),
        sienge({ idOrigem: 'titulo-4511', cpfCnpj: CNPJ, contrato: 'CT-B' }),
        sienge({ idOrigem: 'titulo-4512', cpfCnpj: CNPJ, contrato: 'CT-C' }),
      ],
    );

    expect(r.situacao).toBe('ambiguo');
    expect(r.candidatos).toHaveLength(3);
    expect(r.escolhido).toBeNull();
    expect(r.exigeInconsistencia).toBe(true);
    // Um CNPJ com tres contratos e legitimo: a pessoa juridica tem varias
    // unidades. O motor nao decide qual, encaminha para validacao.
    expect(r.bloqueios[0]?.motivo).toMatch(/3 correspondencias|3 correspondências/);
  });

  it('5. CPF CONFLITANTE — documentos validos e distintos', () => {
    const r = relacionar(
      monday({
        idOrigem: 'item-5005',
        cpfCnpj: CPF_A,
        nome: 'Maria Aparecida Silva',
        contrato: 'CT-2024/033',
      }),
      [
        sienge({
          idOrigem: 'titulo-4520',
          cpfCnpj: CPF_B,
          nome: 'Maria Aparecida Silva',
          contrato: 'CT-2024/033',
        }),
      ],
    );

    expect(r.situacao).toBe('bloqueado');
    const codigos = r.bloqueios.map((b) => b.codigo);
    expect(codigos).toContain('cpf_cnpj_diferentes');
    // Homonimos: o mesmo nome com documentos distintos tambem e bloqueio.
    expect(codigos).toContain('mesmo_nome_documentos_diferentes');
    expect(r.exigeInconsistencia).toBe(true);
    // Contrato igual NAO sobrepoe documento diferente.
    expect(r.escolhido).toBeNull();
  });

  it('6. CONTRATO DUPLICADO — mesmo contrato, dois clientes', () => {
    const r = relacionar(
      monday({ idOrigem: 'item-5006', contrato: 'CT-2024/077', cpfCnpj: CPF_A }),
      [sienge({ idOrigem: 'titulo-4530', contrato: 'CT-2024/077', cpfCnpj: CPF_A })],
      { clientesPorContrato: 2, contratosCandidatos: 1 },
    );

    expect(r.situacao).toBe('bloqueado');
    expect(r.bloqueios.map((b) => b.codigo)).toContain('contrato_de_clientes_diferentes');
    expect(r.bloqueios.find((b) => b.codigo === 'contrato_de_clientes_diferentes')?.motivo)
      .toMatch(/Corrigir na origem/i);
  });

  it('7. DIFERENCA FINANCEIRA VERDADEIRA — mesma data, tudo apurado', () => {
    const r = compararFinanceiro(
      monday({
        idOrigem: 'item-5007',
        dataReferencia: '2026-05-28',
        valor: 64000,
        naturezaValor: 'saldo_vencido',
        contrato: 'CT-1042',
      }),
      sienge({
        idOrigem: 'titulo-4471',
        dataReferencia: '2026-05-28',
        valor: 66071.1,
        naturezaValor: 'saldo_vencido',
        contrato: 'CT-1042',
      }),
      {
        contratoConfirmado: true,
        parcelaConfirmada: true,
        naturezaConfirmada: true,
        dataConfirmada: true,
        pagamentosApurados: true,
        encargosApurados: true,
        eventosContratuaisApurados: true,
      },
    );

    expect(r.classificacao).toBe('divergencia_confirmada');
    expect(r.diferenca).toBeCloseTo(2071.1, 2);
    expect(r.explicacao).toMatch(/foram verificados/i);
  });

  it('8. DIFERENCA CAUSADA APENAS POR DATAS DISTINTAS — nao e divergencia', () => {
    // O caso real do contrato C-1042: Monday com posicao de marco, Sienge com
    // posicao de maio. Os valores diferem porque as datas diferem.
    const r = compararFinanceiro(
      monday({
        idOrigem: 'item-99887',
        dataReferencia: '2026-03-04',
        valor: 64000,
        naturezaValor: 'saldo_vencido',
        contrato: 'CT-1042',
      }),
      sienge({
        idOrigem: 'titulo-4471',
        dataReferencia: '2026-05-28',
        valor: 66071.1,
        naturezaValor: 'saldo_vencido',
        contrato: 'CT-1042',
      }),
      {
        contratoConfirmado: true,
        parcelaConfirmada: true,
        naturezaConfirmada: true,
        // A data NAO esta confirmada: sao datas diferentes.
        dataConfirmada: false,
        pagamentosApurados: false,
        encargosApurados: false,
        eventosContratuaisApurados: false,
      },
    );

    expect(r.classificacao).toBe('data_referencia_incompativel');
    // A diferenca e calculada e informada, mas NAO chamada de divergencia.
    expect(r.diferenca).toBeCloseTo(2071.1, 2);
    expect(r.classificacao).not.toBe('divergencia_confirmada');
    expect(r.pendencias).toHaveLength(3);
    expect(r.explicacao).toMatch(/85 dia|dia\(s\) de diferenca|datas diferentes/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CORREÇÃO: escopo do CPF/CNPJ
//
// Documento validado identifica a PESSOA. Não identifica sozinho a exposição
// contratual, a unidade, a parcela, o processo nem o saldo — a mesma pessoa
// costuma ter vários.
// ═══════════════════════════════════════════════════════════════════════════
describe('escopo do CPF/CNPJ: identifica a pessoa, nao a exposicao', () => {
  it('para CLIENTE, documento validado gera vinculo automatico', () => {
    const r = relacionar(
      monday({ cpfCnpj: CPF_A, nome: 'Maria Aparecida Silva' }),
      [sienge({ cpfCnpj: CPF_A, nome: 'MARIA APARECIDA SILVA' })],
      { tipoEntidade: 'cliente' },
    );

    expect(r.situacao).toBe('automatico');
    expect(r.avaliacao.confianca).toBe('alta');
    expect(r.categoria).toBe('identidade_cliente');
    expect(r.avaliacao.limitadoPorEscopo).toBe(false);
  });

  it('para CONTRATO, documento sozinho NAO gera vinculo automatico', () => {
    const r = relacionar(
      monday({ cpfCnpj: CPF_A, nome: 'Maria Aparecida Silva' }),
      [sienge({ cpfCnpj: CPF_A, nome: 'MARIA APARECIDA SILVA' })],
      { tipoEntidade: 'contrato' },
    );

    // O score continua alto, mas a confianca e limitada por escopo.
    expect(r.avaliacao.score).toBeGreaterThanOrEqual(60);
    expect(r.avaliacao.confianca).toBe('media');
    expect(r.situacao).toBe('sugerido');
    expect(r.avaliacao.limitadoPorEscopo).toBe(true);
    expect(r.categoria).toBe('exposicao_contrato');
  });

  it('para PARCELA, TITULO, SALDO, PROCESSO e NOTIFICACAO tambem nao basta', () => {
    for (const tipo of ['parcela', 'titulo', 'saldo', 'processo', 'notificacao'] as const) {
      const r = relacionar(
        monday({ cpfCnpj: CPF_A }),
        [sienge({ cpfCnpj: CPF_A })],
        { tipoEntidade: tipo },
      );
      expect(r.situacao, tipo).toBe('sugerido');
      expect(r.avaliacao.limitadoPorEscopo, tipo).toBe(true);
    }
  });

  it('documento MAIS contrato volta a permitir vinculo automatico de exposicao', () => {
    const r = relacionar(
      monday({ cpfCnpj: CPF_A, contrato: 'CT-2024/001' }),
      [sienge({ cpfCnpj: CPF_A, contrato: 'CT2024001' })],
      { tipoEntidade: 'contrato' },
    );

    expect(r.situacao).toBe('automatico');
    expect(r.avaliacao.confianca).toBe('alta');
    expect(r.avaliacao.limitadoPorEscopo).toBe(false);
  });

  it('documento MAIS empreendimento e unidade tambem basta', () => {
    const r = relacionar(
      monday({ cpfCnpj: CPF_A, empreendimentoId: 'e-1', unidade: '1105B' }),
      [sienge({ cpfCnpj: CPF_A, empreendimentoId: 'e-1', unidade: '1105b' })],
      { tipoEntidade: 'unidade' },
    );

    expect(r.situacao).toBe('automatico');
    expect(r.avaliacao.limitadoPorEscopo).toBe(false);
  });

  it('as quatro categorias sao preservadas separadamente', () => {
    const categorias = (['cliente', 'contrato', 'processo', 'saldo'] as const).map(
      (tipo) =>
        relacionar(monday({ cpfCnpj: CPF_A }), [sienge({ cpfCnpj: CPF_A })], {
          tipoEntidade: tipo,
        }).categoria,
    );

    expect(categorias).toEqual([
      'identidade_cliente',
      'exposicao_contrato',
      'evento_juridico',
      'posicao_financeira',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Os seis casos exigidos na correcao
// ═══════════════════════════════════════════════════════════════════════════
describe('casos exigidos na correcao de escopo', () => {
  it('1. um CPF com DOIS CONTRATOS → ambiguo, nao automatico', () => {
    const r = relacionar(
      monday({ idOrigem: 'item-7001', cpfCnpj: CPF_A, nome: 'Maria Aparecida Silva' }),
      [sienge({ idOrigem: 'contrato-A', cpfCnpj: CPF_A })],
      { tipoEntidade: 'contrato', contratosDoDocumento: 2 },
    );

    expect(r.situacao).toBe('ambiguo');
    expect(r.escolhido).toBeNull();
    expect(r.exigeInconsistencia).toBe(true);
    expect(r.bloqueios.some((b) => /2 contratos/.test(b.motivo))).toBe(true);
  });

  it('2. um CPF com DUAS UNIDADES no mesmo empreendimento → ambiguo', () => {
    const r = relacionar(
      monday({ idOrigem: 'item-7002', cpfCnpj: CPF_A, empreendimentoId: 'e-verano' }),
      [sienge({ idOrigem: 'unidade-1105B', cpfCnpj: CPF_A, empreendimentoId: 'e-verano' })],
      { tipoEntidade: 'unidade', unidadesDoDocumento: 2 },
    );

    expect(r.situacao).toBe('ambiguo');
    expect(r.escolhido).toBeNull();
    expect(r.bloqueios.some((b) => /2 unidades/.test(b.motivo))).toBe(true);
  });

  it('3. um CPF com unidades em EMPREENDIMENTOS DIFERENTES → ambiguo', () => {
    const r = relacionar(
      monday({ idOrigem: 'item-7003', cpfCnpj: CPF_A }),
      [
        sienge({ idOrigem: 'un-verano', cpfCnpj: CPF_A, empreendimentoId: 'e-verano', unidade: '1105B' }),
        sienge({ idOrigem: 'un-aurora', cpfCnpj: CPF_A, empreendimentoId: 'e-aurora', unidade: '302A' }),
      ],
      { tipoEntidade: 'unidade' },
    );

    expect(r.situacao).toBe('ambiguo');
    expect(r.candidatos).toHaveLength(2);
    expect(r.escolhido).toBeNull();
    expect(r.exigeInconsistencia).toBe(true);
  });

  it('4. CPF IGUAL mas CONTRATO DIVERGENTE → nao vincula', () => {
    const r = relacionar(
      monday({ idOrigem: 'item-7004', cpfCnpj: CPF_A, contrato: 'CT-2024/001' }),
      [sienge({ idOrigem: 'titulo-9', cpfCnpj: CPF_A, contrato: 'CT-2024/999' })],
      { tipoEntidade: 'contrato' },
    );

    expect(r.avaliacao.temConflito).toBe(true);
    expect(r.avaliacao.confianca).toBe('baixa');
    expect(r.situacao).toBe('recusado');
    expect(r.escolhido).toBeNull();
  });

  it('5. cliente vinculado corretamente SEM vinculo automatico da exposicao', () => {
    const registro = monday({ idOrigem: 'item-7005', cpfCnpj: CPF_A, nome: 'Maria Aparecida Silva' });
    const candidato = sienge({ idOrigem: 'cli-77', cpfCnpj: CPF_A, nome: 'MARIA APARECIDA SILVA' });

    // A identidade do cliente e estabelecida com confianca alta.
    const identidade = relacionar(registro, [candidato], { tipoEntidade: 'cliente' });
    expect(identidade.situacao).toBe('automatico');
    expect(identidade.categoria).toBe('identidade_cliente');

    // A exposicao contratual, com os MESMOS dados, nao e.
    const exposicao = relacionar(registro, [candidato], { tipoEntidade: 'contrato' });
    expect(exposicao.situacao).toBe('sugerido');
    expect(exposicao.categoria).toBe('exposicao_contrato');
    expect(exposicao.avaliacao.limitadoPorEscopo).toBe(true);

    // Sao fatos independentes: um vinculado, outro pendente de revisao.
    expect(identidade.categoria).not.toBe(exposicao.categoria);
  });

  it('6. selecao humana de um contrato entre varios candidatos', () => {
    const candidatos = [
      sienge({ idOrigem: 'contrato-A', cpfCnpj: CPF_A, contrato: 'CT-A', unidade: '1105B' }),
      sienge({ idOrigem: 'contrato-B', cpfCnpj: CPF_A, contrato: 'CT-B', unidade: '1106A' }),
      sienge({ idOrigem: 'contrato-C', cpfCnpj: CPF_A, contrato: 'CT-C', unidade: '2201C' }),
    ];

    const r = relacionar(
      monday({ idOrigem: 'item-7006', cpfCnpj: CPF_A }),
      candidatos,
      { tipoEntidade: 'contrato' },
    );

    // O motor nao escolhe.
    expect(r.situacao).toBe('ambiguo');
    expect(r.escolhido).toBeNull();
    expect(r.exigeInconsistencia).toBe(true);

    // Mas preserva TODOS os candidatos, com o identificador de origem de cada
    // um, para que a pessoa possa escolher com base no material completo.
    expect(r.candidatos.map((c) => c.idOrigem)).toEqual([
      'contrato-A',
      'contrato-B',
      'contrato-C',
    ]);
    expect(r.candidatos.map((c) => c.contrato)).toEqual(['CT-A', 'CT-B', 'CT-C']);
  });
});
