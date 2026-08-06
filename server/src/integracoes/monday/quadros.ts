/**
 * Mapeamento dos quadros da Coevo no Monday.
 *
 * Os IDs vem de configuracao (banco ou variavel de ambiente); os valores abaixo
 * sao apenas o padrao conhecido, extraido do codigo em producao
 * (js/monday-sync.js:13-19) e de references/configuracao-coevo.md.
 *
 * REGRA: as colunas sao resolvidas por TITULO, nunca por ID fixo. IDs de coluna
 * do Monday mudam quando alguem recria a coluna, e o quadro nao avisa. Resolver
 * por titulo e o que a base em producao faz (fetchColumnMap) e sobreviveu a
 * mudancas reais.
 */

export type ChaveQuadro =
  | 'processos'
  | 'notificacoes'
  | 'distratos'
  | 'retomadas'
  | 'honorarios'
  | 'entregas';

export interface DefinicaoQuadro {
  chave: ChaveQuadro;
  /** ID padrao. Sobreposto pela configuracao em integracoes.configuracao. */
  idPadrao: string;
  nome: string;
  destino: string;
  /**
   * Recorte da leitura:
   *   'carteira'   — le tudo, sem filtro de periodo (posicao atual)
   *   'competencia'— filtra pelo mes da competencia
   *   'historico'  — le tudo e mantem o historico completo
   */
  recorte: 'carteira' | 'competencia' | 'historico';
  /**
   * Grupos que nao entram. Decisao do juridico registrada em
   * js/monday-sync.js:258-264. Comparados em maiusculas, sem espaco nas pontas.
   */
  gruposExcluidos?: string[];
  /**
   * Titulos aceitos para cada campo, em ordem de preferencia. O primeiro que
   * existir no quadro e usado. Aceitar variacoes evita quebrar quando alguem
   * renomeia a coluna — a alternativa seria falhar em silencio.
   */
  colunas: Record<string, string[]>;
}

/**
 * Grupos do quadro (JUR) PROCESSOS JUDICIAIS que nao entram no comite.
 * Nao sao processos operacionais do dia a dia.
 */
export const PROCESSOS_GRUPOS_EXCLUIDOS = [
  'CJ (REGRESSO)',
  'TETUS LOCAÇÃO',
  'CREDENTE',
  'LEONICE',
  'GILMAR',
  'DANILO',
  'FGLASS/GRADFIBRA',
];

/**
 * Titulos aceitos para a coluna que liga um distrato/retomada as notificacoes
 * que o precederam.
 *
 * Uma lista so, compartilhada pelos dois quadros: eles gravam na MESMA tabela
 * `distratos`, e duas listas divergindo fariam a ligacao existir em um e nao no
 * outro — com o sintoma aparecendo bem longe da causa, num indicador que soma
 * os dois.
 *
 * O primeiro titulo e o que o quadro de Retomadas usa hoje. `LINK TO ...` cobre
 * o nome que o Monday da automaticamente quando a coluna e criada sem ser
 * renomeada — e o caso mais provavel no dia em que Distratos ganhar a dela.
 */
const TITULOS_LIGACAO_NOTIFICACOES = [
  '(JUR) NOTIFICAÇÕES CLIENTES',
  'NOTIFICAÇÕES CLIENTES',
  'NOTIFICAÇÕES',
  'NOTIFICAÇÃO',
  'LINK TO (JUR) NOTIFICAÇÕES CLIENTES',
];

export const QUADROS: Record<ChaveQuadro, DefinicaoQuadro> = {
  processos: {
    chave: 'processos',
    idPadrao: '5959705266',
    nome: '(JUR) PROCESSOS JUDICIAIS',
    destino: 'processos_judiciais',
    recorte: 'carteira',
    gruposExcluidos: PROCESSOS_GRUPOS_EXCLUIDOS,
    colunas: {
      // A situacao vem de MEU TRABALHO, nao de STATUS (para comite).
      // Regra explicita do CLAUDE.md do projeto de redesign.
      situacao: ['MEU TRABALHO'],
      situacao_comite: ['STATUS (PARA COMITÊ)', 'STATUS PARA COMITÊ', 'STATUS COMITÊ'],
      tipo: ['TIPO DE AÇÃO', 'TIPO DE ACAO', 'NATUREZA'],
      // ATUACAO (INTERNO/EXTERNO). NAO e comarca.
      atuacao: ['LOCAL', 'ATUAÇÃO', 'ATUACAO'],
      comarca: ['COMARCA'],
      empreendimento: ['EMPREENDIMENTO', 'OBRA', 'PROJETO'],
      cliente: ['CLIENTE', 'NOME DO CLIENTE', 'NOME'],
      cpf_cnpj: ['CPF/CNPJ', 'CPF-CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO'],
      contrato: ['CONTRATO', 'NÚMERO DO CONTRATO', 'NUMERO DO CONTRATO'],
      unidade: ['UNIDADE', 'APARTAMENTO', 'LOTE'],
      numero: ['NÚMERO DO PROCESSO', 'NUMERO DO PROCESSO', 'PROCESSO', 'Nº PROCESSO'],
      valor_causa: ['VALOR DA CAUSA', 'VALOR CAUSA'],
      data_citacao: ['CITAÇÃO/PROTOCOLO', 'CITACAO/PROTOCOLO', 'CITAÇÃO', 'PROTOCOLO'],
      data_finalizacao: ['DATA DE FINALIZAÇÃO', 'DATA DE FINALIZACAO', 'FINALIZAÇÃO'],
      dias_processo: ['DIAS DO PROCESSO', 'DIAS'],
      honorarios_efetivados: ['HONORÁRIOS EFETIVADOS', 'HONORARIOS EFETIVADOS'],
      motivo: ['MOTIVO', 'OBJETO'],
      posicao: ['POSIÇÃO', 'POSICAO', 'POLO'],
    },
  },

  notificacoes: {
    chave: 'notificacoes',
    idPadrao: '5630368737',
    nome: '(JUR) NOTIFICAÇÕES CLIENTES',
    destino: 'notificacoes',
    recorte: 'competencia',
    colunas: {
      cliente: ['CLIENTE', 'NOME DO CLIENTE', 'NOME'],
      cpf_cnpj: ['CPF/CNPJ', 'CPF-CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO'],
      empreendimento: ['EMPREENDIMENTO', 'OBRA', 'PROJETO'],
      contrato: ['CONTRATO', 'NÚMERO DO CONTRATO', 'NUMERO DO CONTRATO'],
      unidade: ['UNIDADE', 'APARTAMENTO', 'LOTE'],
      torre: ['TORRE'],
      // Rotulo bruto; a normalizacao para Resolvida/Em Andamento e derivada.
      estagio: ['ESTÁGIOS', 'ESTAGIOS', 'ESTÁGIO', 'ESTAGIO', 'ESTÁGIO-SITUAÇÃO'],
      situacao: ['SITUAÇÃO', 'SITUACAO', 'STATUS'],
      // O board real usa o plural. Os valores da coluna sao os modelos em si
      // (PARCELAS REGULARES EM ATRASO, FINANCIAMENTO EM ATRASO, …), o que nao
      // deixa duvida sobre o campo que ela alimenta.
      modelo: ['MODELO', 'MODELOS DE NOTIFICAÇÃO', 'TIPO DE NOTIFICAÇÃO', 'TIPO'],
      resolucao: ['RESOLUÇÃO', 'RESOLUCAO'],
      acordo: ['ACORDO'],
      data_notificacao: ['DATA DA NOTIFICAÇÃO', 'DATA DA NOTIFICACAO', 'DATA'],
      // `RESOLUÇÃO` e a data de solucao do board real. Nao e suposicao: a
      // formula da coluna TOTAL DIAS e `DAYS({RESOLUÇÃO},{DATA DA NOTIFICAÇÃO})`,
      // ou seja, o proprio quadro declara que RESOLUÇÃO fecha o intervalo que
      // comeca na notificacao. Fica DEPOIS dos titulos explicitos: se alguem
      // criar `DATA DA SOLUÇÃO`, ela vence.
      data_solucao: ['DATA DA SOLUÇÃO', 'DATA DA SOLUCAO', 'DATA DE SOLUÇÃO', 'RESOLUÇÃO'],
      total_dias: ['TOTAL DE DIAS', 'TOTAL DIAS', 'DIAS'],
      saldo_vencido: ['SALDO VENCIDO', 'VALOR VENCIDO'],
      saldo_atualizado: ['SALDO ATUALIZADO', 'VALOR ATUALIZADO'],
      dias_atraso: ['DIAS DE ATRASO', 'DIAS EM ATRASO'],
    },
  },

  distratos: {
    chave: 'distratos',
    idPadrao: '18404493605',
    nome: '(JUR) DISTRATOS E DESISTÊNCIAS',
    destino: 'distratos',
    recorte: 'competencia',
    colunas: {
      cliente: ['CLIENTE', 'NOME DO CLIENTE', 'NOME'],
      cpf_cnpj: ['CPF/CNPJ', 'CPF-CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO'],
      empreendimento: ['EMPREENDIMENTO', 'OBRA', 'PROJETO'],
      unidade: ['UNIDADE', 'APARTAMENTO', 'LOTE'],
      contrato: ['CONTRATO', 'NÚMERO DO CONTRATO'],
      motivo: ['MOTIVO', 'MOTIVO DO DISTRATO'],
      equipe: ['EQUIPE', 'RESPONSÁVEL', 'RESPONSAVEL'],
      data_solicitacao: ['DATA DA SOLICITAÇÃO', 'DATA DA SOLICITACAO', 'DATA SOLICITAÇÃO'],
      data_venda: ['DATA DA VENDA', 'DATA VENDA', 'DATA DA REVENDA', 'REVENDA', 'NOVA VENDA'],
      data_conclusao: ['DATA DO DISTRATO', 'DATA DISTRATO', 'DATA DA CONCLUSÃO', 'CONCLUSÃO'],
      tempo_dias: ['TEMPO', 'DIAS', 'TOTAL DE DIAS'],
      // Ligacao para o quadro de notificacoes. NAO existe no board 18404493605
      // hoje — fica mapeada e sera preenchida sozinha no dia em que a coluna
      // for criada. Ate la aparece como campo ausente no relatorio, que e o
      // comportamento correto: declarado, nunca presumido.
      notificacoes: TITULOS_LIGACAO_NOTIFICACOES,
    },
  },

  retomadas: {
    chave: 'retomadas',
    idPadrao: '18413057491',
    nome: '(JUR) RETOMADAS',
    destino: 'distratos',
    recorte: 'competencia',
    colunas: {
      cliente: ['CLIENTE', 'NOME DO CLIENTE', 'NOME'],
      cpf_cnpj: ['CPF/CNPJ', 'CPF-CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO'],
      empreendimento: ['EMPREENDIMENTO', 'OBRA', 'PROJETO'],
      unidade: ['UNIDADE', 'APARTAMENTO', 'LOTE'],
      contrato: ['CONTRATO', 'NÚMERO DO CONTRATO'],
      motivo: ['MOTIVO', 'MOTIVO DA RETOMADA'],
      equipe: ['EQUIPE', 'RESPONSÁVEL', 'RESPONSAVEL'],
      data_solicitacao: ['DATA DA SOLICITAÇÃO', 'DATA SOLICITAÇÃO'],
      data_conclusao: ['DATA DA RETOMADA', 'DATA RETOMADA', 'DATA DA CONCLUSÃO'],
      // A recompra so termina quando a unidade e revendida, e e disso que
      // "quantas recompras estao abertas e ha quanto tempo" precisa.
      //
      // AQUI a lista aceita SO titulos de revenda — de proposito, e ao
      // contrario do quadro de distratos. O board 18413057491 TEM uma coluna
      // `DATA DA VENDA`, e ela e a venda ORIGINAL ao cliente que sai: as datas
      // vao de 2022 a 2025 contra solicitacoes de 2026, e a formula de
      // `PERIODO (DIAS)` e a mesma `DAYS({SOLICITACAO}, {VENDA})` do outro
      // quadro. Aceita-la aqui encheria `data_venda` em quase todo item com a
      // data errada, e o indicador trataria toda retomada como recompra
      // concluida — errando para o lado que parece certo.
      //
      // Nenhum destes titulos existe hoje: `resolverMapa` reporta o campo em
      // `ausentes` e ele fica nulo. E o resultado honesto ate a coluna ser
      // criada na origem. Ver docs/REGRA-SAIDA-DE-CLIENTE.md secao 7.
      data_venda: ['DATA DA REVENDA', 'REVENDA', 'NOVA VENDA'],
      tempo_dias: ['TEMPO', 'DIAS', 'TOTAL DE DIAS'],
      // Este quadro JA tem a ligacao, preenchida em 23 de 23 itens (06/08/2026)
      // — e por isso e ele que valida o caminho de ponta a ponta enquanto o de
      // Distratos nao ganha a coluna.
      notificacoes: TITULOS_LIGACAO_NOTIFICACOES,
    },
  },

  honorarios: {
    chave: 'honorarios',
    idPadrao: '7231876117',
    nome: '(JUR) HONORÁRIOS EXTRAJUDICIAIS',
    destino: 'honorarios',
    recorte: 'historico',
    colunas: {
      cliente: ['CLIENTE', 'NOME DO CLIENTE', 'NOME'],
      cpf_cnpj: ['CPF/CNPJ', 'CPF-CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO'],
      empreendimento: ['EMPREENDIMENTO', 'OBRA'],
      categoria: ['CATEGORIA', 'TIPO'],
      valor_principal: ['VALOR PRINCIPAL', 'PRINCIPAL'],
      valor_honorarios: ['HONORÁRIOS', 'HONORARIOS', 'VALOR DOS HONORÁRIOS'],
      valor_oab: ['OAB', 'VALOR OAB'],
      status: ['STATUS', 'SITUAÇÃO'],
      cliente_novo: ['CLIENTE NOVO', 'NOVO CLIENTE'],
      data_evento: ['DATA', 'DATA DO PAGAMENTO', 'DATA DE PAGAMENTO'],
    },
  },

  entregas: {
    chave: 'entregas',
    idPadrao: '18410779605',
    nome: 'CONTROLE DE ENTREGA CARPE DIEM',
    destino: 'unidades',
    recorte: 'carteira',
    colunas: {
      cliente: ['CLIENTE', 'NOME DO CLIENTE', 'NOME'],
      empreendimento: ['EMPREENDIMENTO', 'OBRA'],
      unidade: ['UNIDADE', 'APARTAMENTO'],
      torre: ['TORRE'],
      bloco: ['BLOCO'],
      situacao: ['SITUAÇÃO', 'SITUACAO', 'STATUS'],
      status_juridico: ['STATUS JURÍDICO', 'STATUS JURIDICO'],
      tipo_financiamento: ['FINANCIAMENTO', 'TIPO DE FINANCIAMENTO'],
      prazo_habite_se: ['HABITE-SE', 'PRAZO HABITE-SE'],
      prazo_180: ['PRAZO 180', 'PRAZO 180 DIAS'],
      previsao_entrega: ['PREVISÃO DE ENTREGA', 'PREVISAO DE ENTREGA', 'ENTREGA'],
    },
  },
};

/** Titulo em maiusculas, sem espaco nas pontas. Forma canonica de comparacao. */
function chaveTitulo(titulo: string): string {
  return (titulo || '').toUpperCase().trim();
}

/**
 * Remove aspas e apostrofos que envolvam o titulo inteiro.
 *
 * O quadro real de processos tem uma coluna chamada `'MEU TRABALHO'` — com os
 * apostrofos dentro do titulo, digitados por quem criou a coluna. A comparacao
 * exata nao a encontrava, `situacao` ficava nula em TODOS os registros e, por
 * consequencia, 100% dos processos caiam em `revisao_necessaria`: a taxa de
 * judicializacao ficava indisponivel sem nenhum erro aparente. Descoberto na
 * homologacao do board 5959705266 (B16.3).
 *
 * Aspas em volta de um titulo sao decoracao de quem digitou, nao identidade da
 * coluna. Retorna string vazia quando nada sobra depois de remover.
 */
function chaveSemAspas(titulo: string): string {
  return chaveTitulo(titulo).replace(/^['"«”“]+|['"»”“]+$/g, '').trim();
}

/**
 * Forma canonica para comparar titulo de coluna: maiusculas, sem espaco nas
 * pontas e sem aspas em volta.
 *
 * Existe para que quem compara titulo fora deste modulo — o relatorio de
 * homologacao, por exemplo — nao volte a usar `===` cru. Foi assim que
 * `'MEU TRABALHO'` e `STATUS (para comitê)` deixaram de ser reconhecidos.
 */
export function chaveDeColuna(titulo: string): string {
  return chaveSemAspas(titulo);
}

/** Dois titulos designam a mesma coluna, ignorando caixa e aspas em volta. */
export function mesmoTitulo(a: string, b: string): boolean {
  return chaveDeColuna(a) === chaveDeColuna(b);
}

/**
 * Resolve o mapa titulo -> id de coluna.
 *
 * Quando duas colunas tem o mesmo titulo (acontece com EMPREENDIMENTO: uma
 * coluna de status e uma espelhada), prefere a que NAO e mirror — a espelhada
 * costuma vir vazia em `text`, e so traz valor em `display_value`.
 * Regra herdada de js/monday-sync.js:106-112, onde foi descoberta na pratica.
 *
 * O titulo sem aspas entra como ALIAS, e so quando ninguem ocupa a chave. Uma
 * coluna com titulo exato sempre vence a que so casa depois de remover aspas —
 * do contrario, criar `'STATUS'` ao lado de `STATUS` mudaria silenciosamente
 * qual das duas alimenta o campo.
 */
export function montarMapaColunas(
  colunas: Array<{ id: string; title: string; type: string }>,
): Map<string, { id: string; type: string }> {
  const mapa = new Map<string, { id: string; type: string }>();
  const exatos = new Set<string>();

  for (const coluna of colunas) {
    const chave = chaveTitulo(coluna.title);
    if (!chave) continue;

    exatos.add(chave);
    const anterior = mapa.get(chave);
    if (!anterior || anterior.type === 'mirror') {
      mapa.set(chave, { id: coluna.id, type: coluna.type });
    }
  }

  for (const coluna of colunas) {
    const alias = chaveSemAspas(coluna.title);
    if (!alias || exatos.has(alias)) continue;

    const anterior = mapa.get(alias);
    if (!anterior || anterior.type === 'mirror') {
      mapa.set(alias, { id: coluna.id, type: coluna.type });
    }
  }

  return mapa;
}

/** Primeiro titulo que existir no quadro. `null` quando nenhum existe. */
export function resolverColuna(
  mapa: Map<string, { id: string; type: string }>,
  titulos: string[],
): { id: string; type: string } | null {
  for (const titulo of titulos) {
    const achado = mapa.get(chaveTitulo(titulo)) ?? mapa.get(chaveSemAspas(titulo));
    if (achado) return achado;
  }
  return null;
}

export interface MapaResolvido {
  /** campo do dominio -> id da coluna no Monday */
  porCampo: Map<string, string>;
  /** campos que o quadro nao tem — reportados, nunca preenchidos por suposicao */
  ausentes: string[];
  /** titulos que aparecem em mais de uma coluna do quadro — ver `titulosAmbiguos` */
  ambiguos: TituloAmbiguo[];
}

export interface TituloAmbiguo {
  titulo: string;
  colunas: Array<{ id: string; tipo: string }>;
  /** Coluna que a resolucao por titulo escolhe hoje. */
  vencedora: string;
}

/**
 * Titulos que designam mais de uma coluna no mesmo quadro.
 *
 * A resolucao por titulo pressupoe que o titulo identifique a coluna. Quando
 * duas colunas tem o mesmo titulo, a regra de desempate — a primeira que nao
 * for `mirror` — decide em silencio, e o silencio e o problema: nada no
 * relatorio diria que houve escolha.
 *
 * O board de notificacoes tem exatamente isso: DUAS colunas chamadas
 * `'MEU TRABALHO'`, uma `date` (quase toda vazia) e uma `status`
 * (ACOMPANHANDO/FEITO). Em processos, `'MEU TRABALHO'` e a coluna que alimenta
 * `situacao`. Se aquele quadro ganhar uma segunda coluna com o mesmo titulo, a
 * situacao de 250 processos muda de coluna sem nenhum aviso — e a taxa de
 * judicializacao muda junto. Descoberto na homologacao do board 5630368737
 * (B17.2).
 *
 * Isto nao decide nada: apenas declara a ambiguidade, para que ela apareca no
 * relatorio e seja resolvida por quem conhece o quadro.
 */
export function titulosAmbiguos(
  colunas: Array<{ id: string; title: string; type: string }>,
): TituloAmbiguo[] {
  const porChave = new Map<string, Array<{ id: string; title: string; type: string }>>();
  for (const coluna of colunas) {
    const chave = chaveDeColuna(coluna.title);
    if (!chave) continue;
    const lista = porChave.get(chave) ?? [];
    lista.push(coluna);
    porChave.set(chave, lista);
  }

  const mapa = montarMapaColunas(colunas);
  const ambiguos: TituloAmbiguo[] = [];

  for (const [chave, lista] of porChave) {
    if (lista.length < 2) continue;
    ambiguos.push({
      titulo: lista[0]!.title,
      colunas: lista.map((c) => ({ id: c.id, tipo: c.type })),
      vencedora: mapa.get(chave)?.id ?? lista[0]!.id,
    });
  }

  return ambiguos;
}

/**
 * Resolve todos os campos da definicao contra as colunas reais do quadro.
 *
 * Campo ausente e REPORTADO, nao inventado. mapeamento-colunas.md e explicito:
 * "coluna nao identificada com seguranca => informar e sinalizar".
 */
export function resolverMapa(
  definicao: DefinicaoQuadro,
  colunas: Array<{ id: string; title: string; type: string }>,
): MapaResolvido {
  const mapa = montarMapaColunas(colunas);
  const porCampo = new Map<string, string>();
  const ausentes: string[] = [];

  for (const [campo, titulos] of Object.entries(definicao.colunas)) {
    const coluna = resolverColuna(mapa, titulos);
    if (coluna) porCampo.set(campo, coluna.id);
    else ausentes.push(campo);
  }

  return { porCampo, ausentes, ambiguos: titulosAmbiguos(colunas) };
}
