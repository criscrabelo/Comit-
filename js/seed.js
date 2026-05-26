/* ===== SEED DATA — Abril 2026 ===== */
function seedIfEmpty() {
  if (DB.getAll('comites').length > 0) return; // já tem dados

  // ---- Empreendimentos ----
  const emprs = [
    { id: 'e_alencar',   nome: 'Alencar Mazzeo',         tipo: 'Vertical' },
    { id: 'e_coevo',     nome: 'Coevo & Coneleste',       tipo: 'Horizontal' },
    { id: 'e_ipe2',      nome: 'IPÊ 2',                   tipo: 'Loteamento' },
    { id: 'e_jp',        nome: 'Jardim Paulista',          tipo: 'Vertical' },
    { id: 'e_js',        nome: 'JS',                      tipo: 'Loteamento' },
    { id: 'e_pe',        nome: 'Padre Eugênio',            tipo: 'Vertical' },
    { id: 'e_tetus',     nome: 'Tetus',                   tipo: 'Imobiliária' },
    { id: 'e_moratta',   nome: 'Moratta',                  tipo: 'Vertical' },
    { id: 'e_carpe',     nome: 'Carpe Diem',               tipo: 'Vertical' },
    { id: 'e_vsra2',     nome: 'VSRA2',                   tipo: 'Em constituição' },
  ];
  emprs.forEach(e => DB.insert('empreendimentos', e));

  // ---- Comitê Abril 2026 ----
  const comite = DB.insert('comites', {
    id: 'comite_abr26',
    ref: '2026-04',
    label: 'Abril 2026',
    data_apresentacao: '2026-04-30',
    status: 'publicado'
  });
  DB.setActiveComite(comite.id);
  const cid = comite.id;

  // ---- Fatos Relevantes ----
  const fatos = [
    { comite_id: cid, empreendimento_id: 'e_alencar', data: '2026-04-21',
      titulo: 'Contrarrazões Recurso Especial ITBI',
      descricao: 'Prefeitura protocolou Recurso Especial ao STJ em face do acórdão de 2ª instância que manteve a legalidade da cobrança de ITBI sobre a fração ideal.' },
    { comite_id: cid, empreendimento_id: 'e_alencar', data: '2026-04-22',
      titulo: 'Comunicado Enplanema — Processo Trabalhista',
      descricao: 'Processo trabalhista contra prestador do Moratta que nos incluiu no polo passivo. Em contato com a advogada da Enplanema. Realizando retenção do caução previsto para superar o valor da causa. Audiência no final do ano.' },
    { comite_id: cid, empreendimento_id: 'e_coevo', data: '2026-04-01',
      titulo: 'Termo de Acordo — Despejo de Terra',
      descricao: 'Termo de Acordo com vizinho para despejo de terra finalizado e assinado.' },
    { comite_id: cid, empreendimento_id: 'e_coevo', data: '2026-04-14',
      titulo: 'Protocolo de Recurso Inominado',
      descricao: 'Juiz de 1ª instância permitiu devolução integral dos valores do distrato (R$ 4.050,00 + R$ 2.000,00 de danos morais). Recurso inominado interposto — Juizado Especial entendeu que houve falha na prestação de serviço.' },
    { comite_id: cid, empreendimento_id: 'e_ipe2', data: '2026-04-23',
      titulo: 'Recurso Especial IPÊ 2 × UNAM × MP',
      descricao: 'Recurso protocolado para tentar atrasar cumprimento ou firmamento de novo TAC. Resta apenas 1 recurso adicional (Agravo em Recurso Especial). Necessário preparar para realização do TAC e eventuais custos, sem prejuízo de cobrança posterior da UNAM.' },
    { comite_id: cid, empreendimento_id: 'e_jp', data: '2026-04-17',
      titulo: 'Análise Contratos Banco ABC — Habite-se',
      descricao: 'Identificadas cláusulas comprometedoras nos contratos assinados com o Banco ABC que exigem atenção especial em relação ao Habite-se e entrega do empreendimento.' },
    { comite_id: cid, empreendimento_id: 'e_js', data: '2026-04-07',
      titulo: 'Requerimento SAAE — Lotes Caucionados',
      descricao: 'Requerimento administrativo para SAAE liberar 02 lotes caucionados pela Prefeitura. Alessandro realizou reunião com o SAAE; aguardando confirmação se visita técnica foi feita e liberação dos lotes autorizada.' },
    { comite_id: cid, empreendimento_id: 'e_js', data: '2026-04-10',
      titulo: 'Contranotificação Talus Ambiental',
      descricao: 'Resposta à notificação realizada. Aguardando laudo do perito para resposta definitiva.' },
    { comite_id: cid, empreendimento_id: 'e_pe', data: '2026-04-01',
      titulo: 'Termo de Ligação de Energia — Unidades 102B e 101B',
      descricao: 'Unidade 101B assinou termo reconhecendo que a unidade 102B se beneficiou ilicitamente do gasto de energia, com cobrança a ser procedida em face da 102B.' },
    { comite_id: cid, empreendimento_id: 'e_tetus', data: '2026-04-09',
      titulo: 'Contrato Social Imobiliária Tetus',
      descricao: 'Documento finalizado; aguardando saída da empresa de participação do Fernando para protocolar na JUCESP.' },
    { comite_id: cid, empreendimento_id: 'e_tetus', data: '2026-04-15',
      titulo: 'Pesquisa — Correção Saldo Devedor',
      descricao: 'Pesquisa de jurisprudências sobre possibilidade de correção do saldo devedor em financiamento de cliente.' },
    { comite_id: cid, empreendimento_id: 'e_tetus', data: '2026-04-28',
      titulo: 'Distrato Appura',
      descricao: 'Documento finalizado; aguardando finalização dos serviços para envio.' },
    { comite_id: cid, empreendimento_id: 'e_vsra2', data: '2026-04-01',
      titulo: 'Empresa em Constituição',
      descricao: 'VSRA2 em processo de constituição. Sem movimentação jurídica neste período.' },
  ];
  fatos.forEach(f => DB.insert('fatos', f));

  // ---- Notificações ----
  const notifs = [
    { comite_id: cid, empreendimento_id: 'e_jp',    grupo: 'Obra',        modelo: 'Extrajudicial', estagio: 'Em Andamento', data_notificacao: '2026-04-05', data_solucao: '' },
    { comite_id: cid, empreendimento_id: 'e_alencar',grupo: 'Cobrança',   modelo: 'E-mail',        estagio: 'Resolvida',    data_notificacao: '2026-04-08', data_solucao: '2026-04-20' },
    { comite_id: cid, empreendimento_id: 'e_js',    grupo: 'Inadimplência',modelo: 'Carta',         estagio: 'Em Andamento', data_notificacao: '2026-04-10', data_solucao: '' },
    { comite_id: cid, empreendimento_id: 'e_coevo', grupo: 'Entrega',     modelo: 'WhatsApp',      estagio: 'Resolvida',    data_notificacao: '2026-04-02', data_solucao: '2026-04-04' },
    { comite_id: cid, empreendimento_id: 'e_pe',    grupo: 'Obra',        modelo: 'Extrajudicial', estagio: 'Em Andamento', data_notificacao: '2026-04-01', data_solucao: '' },
    { comite_id: cid, empreendimento_id: 'e_ipe2',  grupo: 'Cobrança',    modelo: 'E-mail',        estagio: 'Em Andamento', data_notificacao: '2026-04-14', data_solucao: '' },
    { comite_id: cid, empreendimento_id: 'e_carpe', grupo: 'Entrega',     modelo: 'Carta',         estagio: 'Resolvida',    data_notificacao: '2026-04-18', data_solucao: '2026-04-25' },
    { comite_id: cid, empreendimento_id: 'e_jp',    grupo: 'Inadimplência',modelo: 'WhatsApp',     estagio: 'Em Andamento', data_notificacao: '2026-04-22', data_solucao: '' },
  ];
  notifs.forEach(n => DB.insert('notificacoes', n));

  // ---- Contratos ----
  const contratos = [
    { comite_id: cid, empreendimento_id: 'e_jp',    tipo: 'Compra e Venda', data_solicitacao: '2026-04-05', status: 'Assinado' },
    { comite_id: cid, empreendimento_id: 'e_jp',    tipo: 'Financiamento',  data_solicitacao: '2026-04-17', status: 'Em análise' },
    { comite_id: cid, empreendimento_id: 'e_alencar',tipo: 'Compra e Venda',data_solicitacao: '2026-04-08', status: 'Assinado' },
    { comite_id: cid, empreendimento_id: 'e_coevo', tipo: 'Permuta',        data_solicitacao: '2026-04-10', status: 'Assinado' },
    { comite_id: cid, empreendimento_id: 'e_js',    tipo: 'Compra e Venda', data_solicitacao: '2026-04-12', status: 'Assinado' },
    { comite_id: cid, empreendimento_id: 'e_tetus', tipo: 'Locação',        data_solicitacao: '2026-04-20', status: 'Em análise' },
    { comite_id: cid, empreendimento_id: 'e_carpe', tipo: 'Compra e Venda', data_solicitacao: '2026-04-03', status: 'Assinado' },
  ];
  contratos.forEach(c => DB.insert('contratos', c));

  // ---- Retomadas ----
  const retomadas = [
    { comite_id: cid, empreendimento_id: 'e_jp',    motivo: 'Inadimplência', equipe: 'Equipe A', data_inicio: '2026-03-10', data_retomada: '2026-04-15', tempo_dias: 36 },
    { comite_id: cid, empreendimento_id: 'e_alencar',motivo: 'Distrato',     equipe: 'Equipe B', data_inicio: '2026-03-20', data_retomada: '2026-04-22', tempo_dias: 33 },
    { comite_id: cid, empreendimento_id: 'e_js',    motivo: 'Desistência',   equipe: 'Equipe A', data_inicio: '2026-04-02', data_retomada: '2026-04-28', tempo_dias: 26 },
  ];
  retomadas.forEach(r => DB.insert('retomadas', r));

  // ---- Distratos ----
  const distratos = [
    { comite_id: cid, empreendimento_id: 'e_coevo', motivo: 'Falha de Serviço',      data_venda: '2025-11-10', data_distrato: '2026-04-14', tempo_dias: 155 },
    { comite_id: cid, empreendimento_id: 'e_tetus', motivo: 'Dificuldade Financeira', data_venda: '2025-10-05', data_distrato: '2026-04-28', tempo_dias: 205 },
    { comite_id: cid, empreendimento_id: 'e_jp',    motivo: 'Insatisfação',           data_venda: '2025-12-01', data_distrato: '2026-04-20', tempo_dias: 140 },
  ];
  distratos.forEach(d => DB.insert('distratos', d));

  // ---- Processos Judiciais ----
  const processos = [
    { comite_id: cid, empreendimento_id: 'e_alencar', motivo: 'Cível',      posicao: 'Réu',   status: 'Acompanhando',        local: 'SP', ano: '2024', interno: false },
    { comite_id: cid, empreendimento_id: 'e_alencar', motivo: 'Trabalhista',posicao: 'Réu',   status: 'Acompanhando',        local: 'SP', ano: '2025', interno: false },
    { comite_id: cid, empreendimento_id: 'e_ipe2',    motivo: 'Ambiental',  posicao: 'Réu',   status: 'Acompanhando',        local: 'SP', ano: '2023', interno: false },
    { comite_id: cid, empreendimento_id: 'e_js',      motivo: 'Cível',      posicao: 'Autor', status: 'Em Acordo',           local: 'SP', ano: '2025', interno: false },
    { comite_id: cid, empreendimento_id: 'e_coevo',   motivo: 'Consumidor', posicao: 'Réu',   status: 'Finalizado',          local: 'SP', ano: '2024', interno: false },
    { comite_id: cid, empreendimento_id: 'e_pe',      motivo: 'Cível',      posicao: 'Réu',   status: 'Acompanhando',        local: 'SP', ano: '2026', interno: false },
    { comite_id: cid, empreendimento_id: 'e_jp',      motivo: 'Cível',      posicao: 'Réu',   status: 'Acompanhando',        local: 'SP', ano: '2026', interno: false },
    { comite_id: cid, empreendimento_id: 'e_alencar', motivo: 'Cível',      posicao: 'Réu',   status: 'Baixa Definitiva',    local: 'SP', ano: '2022', interno: false },
    { comite_id: cid, empreendimento_id: 'e_ipe2',    motivo: 'Ambiental',  posicao: 'Réu',   status: 'Arq. Provisório',     local: 'SP', ano: '2023', interno: false },
    // Processos internos
    { comite_id: cid, empreendimento_id: 'e_alencar', motivo: 'Trabalhista',posicao: 'Réu',   status: 'Acompanhando',        local: 'SP', ano: '2025', interno: true  },
    { comite_id: cid, empreendimento_id: 'e_ipe2',    motivo: 'Ambiental',  posicao: 'Réu',   status: 'Acompanhando',        local: 'SP', ano: '2024', interno: true  },
    { comite_id: cid, empreendimento_id: 'e_js',      motivo: 'Cível',      posicao: 'Autor', status: 'Finalizado',          local: 'SP', ano: '2025', interno: true  },
    { comite_id: cid, empreendimento_id: 'e_coevo',   motivo: 'Consumidor', posicao: 'Réu',   status: 'Em Acordo',           local: 'SP', ano: '2026', interno: true  },
  ];
  processos.forEach(p => DB.insert('processos', p));

  // ---- Unidades Carpe Diem ----
  const unidades_g1 = [11,14,16,22,26,27,28,31,36,37,38,46,48,52,54,56,57,58,61,62,66,67,68,75,77,78,81,82,83,84,85,86,87,91,93,95,98,104,106,107,108,114,116,117,118,124,125,126,134,137];
  const unidades_g2 = [13,15,17,18,21,24,25,33,34,35,41,42,43,44,45,47,51,53,55,63,64,73,74,76,94,96,102,111,123,131,132,133,135,136,138];
  unidades_g1.forEach(u => DB.insert('unidades', {
    empreendimento_id: 'e_carpe', numero: u,
    prazo_habite_se: '2025-12-31', prazo_180: '2026-06-29',
    previsao_entrega: '2026-08-31'
  }));
  unidades_g2.forEach(u => DB.insert('unidades', {
    empreendimento_id: 'e_carpe', numero: u,
    prazo_habite_se: '2026-06-30', prazo_180: '2026-12-27',
    previsao_entrega: '2026-08-31'
  }));

  // ---- Análise de Risco — Jardim Paulista / Banco ABC ----
  DB.insert('riscos', {
    id: 'risco_jp_abc',
    comite_id: cid,
    empreendimento_id: 'e_jp',
    contrato_ref: 'CCB nº 14678323 – Banco ABC Brasil',
    cronograma: [
      { marco: 'Conclusão da Obra', prazo: '28/02/2026', base: 'Item IX, alínea D', pagina: 'Pág. 2' },
      { marco: 'Prazo Máx. Habite-se', prazo: '+ 180 dias', base: 'Cláusula 11(xiv)', pagina: 'Pág. 8' },
      { marco: 'Limite para Aditivo', prazo: '+ 6 meses', base: 'Cláusulas 2.8 e 2.8.2.1', pagina: 'Pág. 4' },
      { marco: 'Vencimento Antecipado', prazo: 'Após 90 dias atraso', base: 'Cláusulas 4.4 e 11(xiv)', pagina: 'Págs. 6 e 8' },
    ],
    alerta: 'A obra já ultrapassou a data contratual de conclusão (28/02/2026). A análise do atraso acumulado é urgente para avaliar os riscos e iniciar negociação preventiva com o Banco ABC antes de atingir 90 dias de atraso.',
    riscos_lista: [
      { num: 1, titulo: 'Vencimento Antecipado', descricao: 'Atraso > 90 dias, paralisação ou ausência de Habite-se no prazo pode levar o banco a declarar toda a dívida vencida imediatamente.', base: 'Cláusulas 4.4 e 11(xiv)(xv)', pagina: 'Págs. 6 e 8' },
      { num: 2, titulo: 'Suspensão das Liberações', descricao: 'Liberações dependem da evolução física da obra e vistoria mensal. Banco pode reduzir ou interromper parcelas.', base: 'Cláusulas 2.7.2, 3.3(b) e 4.1', pagina: 'Págs. 4, 5 e 6' },
      { num: 3, titulo: 'Execução das Garantias', descricao: 'Cessão fiduciária dos recebíveis e hipoteca das unidades + fração ideal do terreno. Em inadimplemento, banco poderá executar garantias.', base: 'Item XIII', pagina: 'Pág. 3' },
      { num: 4, titulo: 'Substituição da Construtora', descricao: 'Persistindo o atraso, banco pode exigir substituição do responsável. Nova construtora deverá ser aprovada pelo banco.', base: 'Cláusula 4.4.1(a)', pagina: 'Pág. 6' },
      { num: 5, titulo: 'Comunicação aos Compradores', descricao: 'SPE deve informar adquirentes sobre atrasos. Se não o fizer, banco comunica diretamente. Risco de distratos em massa.', base: 'Cláusulas 4.4.1(b) e 4.4.1.1', pagina: 'Pág. 6' },
      { num: 6, titulo: 'Avalistas e Responsabilidade Solidária', descricao: 'Avalistas e coobrigados respondem solidariamente. Banco pode cobrar diretamente os garantidores.', base: 'Cláusulas 13 e 13.1', pagina: 'Pág. 9' },
    ],
    renegociacao: {
      possibilidade: 'O contrato permite alteração do cronograma mediante celebração de aditivo formal.',
      limitacao: 'Prorrogação automática não pode ultrapassar 6 meses sem aceitação expressa do banco.',
      janela: 'Negociar antes do atraso atingir 90 dias.',
      documentos: 'Justificativa técnica + novo cronograma físico-financeiro + aprovação formal.',
    },
    recomendacoes: [
      { num: '01', texto: 'Atualizar o cronograma físico-financeiro' },
      { num: '02', texto: 'Formalizar justificativas técnicas do atraso' },
      { num: '03', texto: 'Negociar aditivo antes do default contratual' },
      { num: '04', texto: 'Preservar o fluxo de vendas e relacionamento' },
      { num: '05', texto: 'Evitar paralisação completa da obra' },
    ]
  });

  // ---- Tema Regulatório — NR-1 ----
  DB.insert('regulatorios', {
    comite_id: cid,
    titulo: 'NR-1 / SST / DDS — Saúde e Segurança do Trabalho',
    descricao: 'Adequação obrigatória à NR-1 atualizada, com identificação de riscos psicossociais.',
    data_vigencia: '2026-05-26',
    destaque: 'PRAZO LEGAL DE ADEQUAÇÃO — VIGÊNCIA OBRIGATÓRIA: 26 DE MAIO DE 2026',
    checklist: [
      { item: 'Identificar Riscos Psicossociais', descricao: 'Mapeamento completo dos fatores de risco psicossocial no ambiente de trabalho conforme exigência da NR-1 atualizada.' },
      { item: 'Atualizar PGR / GRO', descricao: 'Revisão e atualização do Programa de Gerenciamento de Riscos (PGR) e do Gerenciamento de Riscos Ocupacionais (GRO).' },
      { item: 'Implementar Medidas Preventivas', descricao: 'Execução das ações preventivas e corretivas identificadas no mapeamento de riscos.' },
      { item: 'Monitorar Indicadores', descricao: 'Definição e acompanhamento de indicadores de saúde e segurança com periodicidade mínima mensal.' },
      { item: 'Manter Evidências Documentais', descricao: 'Arquivamento físico e/ou digital de todos os documentos exigidos pela norma para fins de fiscalização.' },
    ]
  });

  console.log('[Seed] Dados de Abril 2026 carregados com sucesso.');
}
