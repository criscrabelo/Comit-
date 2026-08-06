/**
 * Mapa entre as entidades da interface e as tabelas do PostgreSQL.
 *
 * A SPA fala em 11 "tabelas". Nem todas sao tabelas: `retomadas` e uma
 * CATEGORIA de `distratos`, e `comites` envolve tambem `competencias`. Esse
 * descasamento e exatamente o motivo de existir uma camada de traducao — sem
 * ela, ou a tela mudaria de vocabulario, ou o banco herdaria o vocabulario da
 * tela.
 *
 * Regra que este arquivo respeita: nenhum campo enviado pela interface e
 * descartado. O que nao tem coluna correspondente permanece em
 * `valor_original`, integro, para conferencia posterior.
 */
import type { AcaoPermissao, ModuloPlataforma } from '../db/schema.js';

/** Nome usado pela interface. */
export type NomeEntidade =
  | 'comites'
  | 'empreendimentos'
  | 'fatos'
  | 'notificacoes'
  | 'distratos'
  | 'retomadas'
  | 'processos'
  | 'unidades'
  | 'riscos'
  | 'regulatorios'
  | 'contratos';

export interface DefinicaoEntidade {
  /** Tabela real no PostgreSQL. */
  tabela: string;
  /** Modulo de autorizacao. A verificacao e sempre no servidor. */
  modulo: ModuloPlataforma;
  /** Acoes permitidas pela API para esta entidade. */
  acoes: AcaoPermissao[];
  /** Campo -> coluna. Campos ausentes daqui nao viram coluna. */
  campos: Record<string, string>;
  /** Colunas de data (aceitam '' como null). */
  datas: string[];
  /** Colunas numericas inteiras. */
  inteiros: string[];
  /** Colunas booleanas. */
  booleanos: string[];
  /** Colunas jsonb. */
  estruturas: string[];
  /**
   * Recorte fixo aplicado sempre, em leitura e escrita. E o que permite que
   * `retomadas` e `distratos` convivam na mesma tabela sem se misturarem.
   */
  recorte?: Record<string, string>;
  /** Ordenacao padrao. */
  ordemPadrao: { coluna: string; direcao: 'asc' | 'desc' };
  /** Colunas aceitas em `?ordenar=`. Lista fechada: nao se ordena por texto livre. */
  ordenaveis: string[];
  /** Entidade tem `comite_id`? Define se `?comite_id=` e aplicavel. */
  temComite: boolean;
  /** Entidade tem `empreendimento_id`? */
  temEmpreendimento: boolean;
  /** Carrega colunas de proveniencia (fonte, id_origem, ausente_desde...)? */
  temProveniencia: boolean;
}

/**
 * `data_solucao` so pode existir com o caso encerrado — `estagio` em
 * `'Resolvida'` ou `'Encerrada'`. E restricao do banco (CHECK
 * notificacao_solucao_coerente), nao invencao desta camada. A API traduz a
 * violacao em mensagem util em vez de deixar estourar como erro 500.
 */
export const ENTIDADES: Record<NomeEntidade, DefinicaoEntidade> = {
  comites: {
    tabela: 'comites',
    modulo: 'juridico',
    acoes: ['ler', 'criar', 'editar'],
    campos: {
      ref: 'competencia_ref',
      label: 'rotulo',
      data_apresentacao: 'data_apresentacao',
      estagio: 'estagio',
      status: 'status',
      distratos_evolucao: 'distratos_evolucao',
      notif_evolucao: 'notif_evolucao',
      notif_evolucao_empr: 'notif_evolucao_empr',
    },
    datas: ['data_apresentacao'],
    inteiros: [],
    booleanos: [],
    estruturas: ['distratos_evolucao', 'notif_evolucao', 'notif_evolucao_empr'],
    ordemPadrao: { coluna: 'competencia_ref', direcao: 'desc' },
    ordenaveis: ['competencia_ref', 'rotulo', 'data_apresentacao', 'criado_em'],
    temComite: false,
    temEmpreendimento: false,
    temProveniencia: false,
  },

  empreendimentos: {
    tabela: 'empreendimentos',
    modulo: 'empreendimentos',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      nome: 'nome',
      tipo: 'tipo',
      cidade: 'cidade',
      empresa: 'empresa',
      status: 'status',
    },
    datas: [],
    inteiros: ['qtd_unidades'],
    booleanos: [],
    estruturas: [],
    ordemPadrao: { coluna: 'nome', direcao: 'asc' },
    ordenaveis: ['nome', 'tipo', 'cidade', 'criado_em'],
    temComite: false,
    temEmpreendimento: false,
    temProveniencia: true,
  },

  fatos: {
    tabela: 'fatos',
    modulo: 'juridico',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      comite_id: 'comite_id',
      empreendimento_id: 'empreendimento_id',
      data: 'data',
      titulo: 'titulo',
      descricao: 'descricao',
    },
    datas: ['data'],
    inteiros: [],
    booleanos: [],
    estruturas: [],
    ordemPadrao: { coluna: 'data', direcao: 'asc' },
    ordenaveis: ['data', 'titulo', 'criado_em'],
    temComite: true,
    temEmpreendimento: true,
    temProveniencia: true,
  },

  notificacoes: {
    tabela: 'notificacoes',
    modulo: 'juridico',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      comite_id: 'comite_id',
      empreendimento_id: 'empreendimento_id',
      cliente: 'cliente_nome',
      torre: 'torre',
      unidade: 'unidade',
      grupo: 'grupo',
      modelo: 'modelo',
      estagio: 'estagio',
      estagio_detalhe: 'estagio_detalhe',
      situacao: 'situacao',
      data_notificacao: 'data_notificacao',
      data_solucao: 'data_solucao',
      total_dias: 'total_dias',
    },
    datas: ['data_notificacao', 'data_solucao'],
    inteiros: ['total_dias'],
    booleanos: [],
    estruturas: [],
    ordemPadrao: { coluna: 'data_notificacao', direcao: 'desc' },
    ordenaveis: ['data_notificacao', 'data_solucao', 'grupo', 'estagio', 'criado_em'],
    temComite: true,
    temEmpreendimento: true,
    temProveniencia: true,
  },

  // Distratos e desistencias. Retomadas ficam na mesma tabela, sob outro
  // recorte — ver a entrada seguinte.
  distratos: {
    tabela: 'distratos',
    modulo: 'juridico',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      comite_id: 'comite_id',
      empreendimento_id: 'empreendimento_id',
      unidade: 'unidade',
      motivo: 'motivo',
      equipe: 'equipe',
      data_solicitacao: 'data_solicitacao',
      data_venda: 'data_venda',
      data_distrato: 'data_conclusao',
      tempo_dias: 'tempo_dias',
    },
    datas: ['data_solicitacao', 'data_venda', 'data_conclusao'],
    inteiros: ['tempo_dias'],
    booleanos: [],
    estruturas: [],
    recorte: { categoria: 'distrato' },
    ordemPadrao: { coluna: 'data_conclusao', direcao: 'desc' },
    ordenaveis: ['data_conclusao', 'data_venda', 'motivo', 'criado_em'],
    temComite: true,
    temEmpreendimento: true,
    temProveniencia: true,
  },

  retomadas: {
    tabela: 'distratos',
    modulo: 'juridico',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      comite_id: 'comite_id',
      empreendimento_id: 'empreendimento_id',
      unidade: 'unidade',
      motivo: 'motivo',
      equipe: 'equipe',
      data_inicio: 'data_solicitacao',
      data_retomada: 'data_conclusao',
      tempo_dias: 'tempo_dias',
    },
    datas: ['data_solicitacao', 'data_conclusao'],
    inteiros: ['tempo_dias'],
    booleanos: [],
    estruturas: [],
    recorte: { categoria: 'retomada' },
    ordemPadrao: { coluna: 'data_conclusao', direcao: 'desc' },
    ordenaveis: ['data_conclusao', 'data_solicitacao', 'motivo', 'equipe', 'criado_em'],
    temComite: true,
    temEmpreendimento: true,
    temProveniencia: true,
  },

  processos: {
    tabela: 'processos_judiciais',
    modulo: 'juridico',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      comite_id: 'comite_id',
      empreendimento_id: 'empreendimento_id',
      numero: 'numero',
      ano: 'ano',
      tipo: 'tipo',
      motivo: 'motivo',
      posicao: 'posicao',
      // A tela chama de "Status"; o banco chama de situacao. O rotulo bruto da
      // origem continua em situacao_comite, sem sobrescrita.
      status: 'situacao',
      // O campo "Local" do formulario manual e a comarca. Nao confundir com
      // `atuacao` (INTERNO/EXTERNO), que vem do Monday.
      local: 'comarca',
      interno: 'interno',
      valor_causa: 'valor_causa',
      data_citacao: 'data_citacao',
      data_finalizacao: 'data_finalizacao',
    },
    datas: ['data_citacao', 'data_finalizacao'],
    inteiros: [],
    booleanos: ['interno'],
    estruturas: [],
    ordemPadrao: { coluna: 'criado_em', direcao: 'desc' },
    ordenaveis: ['ano', 'numero', 'situacao', 'data_citacao', 'criado_em'],
    temComite: true,
    temEmpreendimento: true,
    temProveniencia: true,
  },

  unidades: {
    tabela: 'unidades',
    modulo: 'empreendimentos',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      empreendimento_id: 'empreendimento_id',
      // A tela trata numero como inteiro; a coluna e texto porque unidade
      // "1105B" existe. A conversao e de mao unica: texto guarda tudo.
      numero: 'unidade',
      torre: 'torre',
      bloco: 'bloco',
      situacao: 'situacao',
      prazo_habite_se: 'prazo_habite_se',
      prazo_180: 'prazo_180',
      previsao_entrega: 'previsao_entrega',
    },
    datas: ['prazo_habite_se', 'prazo_180', 'previsao_entrega'],
    inteiros: [],
    booleanos: [],
    estruturas: [],
    ordemPadrao: { coluna: 'unidade', direcao: 'asc' },
    ordenaveis: ['unidade', 'prazo_habite_se', 'previsao_entrega', 'criado_em'],
    temComite: false,
    temEmpreendimento: true,
    temProveniencia: true,
  },

  riscos: {
    tabela: 'riscos',
    modulo: 'juridico',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      comite_id: 'comite_id',
      empreendimento_id: 'empreendimento_id',
      contrato_ref: 'contrato_ref',
      alerta: 'alerta',
      cronograma: 'cronograma',
      riscos_lista: 'riscos_lista',
      renegociacao: 'renegociacao',
      recomendacoes: 'recomendacoes',
    },
    datas: [],
    inteiros: [],
    booleanos: [],
    estruturas: ['cronograma', 'riscos_lista', 'renegociacao', 'recomendacoes'],
    ordemPadrao: { coluna: 'criado_em', direcao: 'desc' },
    ordenaveis: ['contrato_ref', 'criado_em'],
    temComite: true,
    temEmpreendimento: true,
    temProveniencia: true,
  },

  regulatorios: {
    tabela: 'regulatorios',
    modulo: 'juridico',
    acoes: ['ler', 'criar', 'editar', 'remover'],
    campos: {
      comite_id: 'comite_id',
      titulo: 'titulo',
      descricao: 'descricao',
      data_vigencia: 'data_vigencia',
      destaque: 'destaque',
      checklist: 'checklist',
    },
    datas: ['data_vigencia'],
    inteiros: [],
    booleanos: [],
    estruturas: ['checklist'],
    ordemPadrao: { coluna: 'data_vigencia', direcao: 'asc' },
    ordenaveis: ['data_vigencia', 'titulo', 'criado_em'],
    temComite: true,
    temEmpreendimento: false,
    temProveniencia: true,
  },

  // Declarada em js/db.js mas sem nenhuma tela que escreva nela. Exposta
  // somente para leitura: criar rota de escrita para o que ninguem usa seria
  // superficie de ataque sem contrapartida.
  contratos: {
    tabela: 'contratos',
    modulo: 'juridico',
    acoes: ['ler'],
    campos: {
      empreendimento_id: 'empreendimento_id',
      numero: 'numero_contrato',
      situacao: 'situacao',
      data_contrato: 'data_contrato',
      valor_contrato: 'valor_contrato',
    },
    datas: ['data_contrato'],
    inteiros: [],
    booleanos: [],
    estruturas: [],
    ordemPadrao: { coluna: 'criado_em', direcao: 'desc' },
    ordenaveis: ['numero_contrato', 'data_contrato', 'criado_em'],
    temComite: false,
    temEmpreendimento: true,
    temProveniencia: true,
  },
};

export const NOMES_ENTIDADES = Object.keys(ENTIDADES) as NomeEntidade[];

export function ehEntidade(nome: string): nome is NomeEntidade {
  return Object.prototype.hasOwnProperty.call(ENTIDADES, nome);
}

/** Coluna -> campo, para traduzir a linha do banco de volta ao vocabulario da tela. */
export function inverso(def: DefinicaoEntidade): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const [campo, coluna] of Object.entries(def.campos)) {
    // Com dois campos para a mesma coluna, o primeiro declarado vence. Hoje
    // isso nao acontece; a nota existe para quando acontecer.
    if (!(coluna in mapa)) mapa[coluna] = campo;
  }
  return mapa;
}
