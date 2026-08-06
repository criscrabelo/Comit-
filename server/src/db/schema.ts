/**
 * Tipos das tabelas para o Kysely.
 *
 * Escritos a mao, espelhando migrations/*.sql. Um teste automatizado compara
 * este arquivo com o esquema real do banco, para que os dois nao possam
 * divergir em silencio.
 */
import type { ColumnType, Generated } from 'kysely';

/** Coluna gerada pelo banco: nao se informa no insert, chega preenchida na leitura. */
type Auto<T> = ColumnType<T, T | undefined, T>;
/** Timestamp com default no banco. */
type Instante = ColumnType<Date, Date | string | undefined, Date | string>;
/** Data (sem hora). O driver devolve string no formato YYYY-MM-DD. */
type Dia = ColumnType<string, string | undefined, string>;

export type FonteDado = 'monday' | 'sienge' | 'cvcrm' | 'manual' | 'migracao' | 'consolidacao';

export type RegraVinculo =
  | 'cpf_cnpj'
  | 'contrato'
  | 'empr_unidade'
  | 'id_reserva'
  | 'id_unidade'
  | 'id_notificacao'
  | 'id_relacionado'
  | 'nome'
  | 'sem_vinculo';

export type ConfiancaVinculo = 'alta' | 'media' | 'baixa';

export type PerfilUsuario =
  | 'diretoria'
  | 'gestora'
  | 'lider'
  | 'colaborador'
  | 'administrador'
  | 'convidado';

export type StatusUsuario = 'ativo' | 'pendente' | 'inativo';

export type AreaOrganizacional =
  | 'juridico'
  | 'ti'
  | 'financeiro'
  | 'comercial'
  | 'obras'
  | 'diretoria';

export type ModuloPlataforma =
  | 'visao_geral'
  | 'equipe'
  | 'juridico'
  | 'empreendimentos'
  | 'inteligencia'
  | 'administracao'
  /** Continuidade: backup e restauracao. Separado de `administracao` porque
   *  levar a base inteira num arquivo e outra coisa que administrar a base. */
  | 'sistema';

export type TipoInformacao =
  | 'dado_pessoal'
  | 'valor_financeiro'
  | 'situacao_juridica'
  | 'documento'
  | 'desempenho_individual';

export type AcaoPermissao =
  | 'ler' | 'criar' | 'editar' | 'remover' | 'exportar' | 'executar'
  | 'backup' | 'restaurar';

export type EstadoIntegracao =
  | 'conectada'
  | 'sincronizando'
  | 'concluida'
  | 'parcial'
  | 'desatualizada'
  | 'desconectada'
  | 'erro'
  | 'demonstrativo'
  | 'inconsistente';

export type StatusExecucao = 'em_andamento' | 'sucesso' | 'parcial' | 'erro';

export type TipoInconsistencia =
  | 'cliente_sem_identificacao'
  | 'cpf_cnpj_invalido'
  | 'contrato_ausente'
  | 'unidade_ausente'
  | 'empreendimento_ausente'
  | 'duplicidade'
  | 'vinculo_ambiguo'
  | 'grafia_divergente'
  | 'contrato_divergente'
  | 'saldo_duplicado'
  | 'conflito_datas'
  | 'conflito_monday_cvcrm'
  | 'conflito_cvcrm_sienge'
  | 'ausencia_carteira_referencia'
  | 'ausencia_percentual_perda'
  | 'processo_sem_notificacao'
  | 'acordo_sem_confirmacao'
  | 'conflito_monday_sienge'
  | 'divergencia_valor'
  | 'falha_importacao'
  /** Fontes concluiram judicializacao diferente para o mesmo registro. */
  | 'divergencia_judicializacao';

export type GravidadeInconsistencia = 'baixa' | 'media' | 'alta' | 'critica';
export type StatusRevisao = 'aberta' | 'em_revisao' | 'resolvida' | 'ignorada';
export type TipoIndicador = 'posicao' | 'movimentacao';
export type UnidadeMedida = 'quantidade' | 'percentual' | 'reais';
export type EscopoIndicador = 'geral' | 'empreendimento';
export type StatusFotografia =
  | 'sucesso'
  | 'parcial'
  | 'erro'
  | 'sem_atualizacao'
  | 'recalculado'
  | 'corrigido_manual';
export type TipoCarteira =
  | 'carteira_ativa_exigivel'
  | 'vgv'
  | 'saldo_contratual'
  | 'contas_receber';
export type FaixaAtraso = '1-30' | '31-60' | '61-90' | '91-120' | '>120';

/** Colunas de proveniencia presentes em toda tabela de negocio. */
export interface Proveniencia {
  fonte: FonteDado;
  id_origem: string | null;
  valor_original: unknown | null;
  valor_normalizado: unknown | null;
  extraido_em: Instante;
  data_referencia: Dia | null;
  data_fato: Dia | null;
  regra_vinculo: RegraVinculo | null;
  confianca_vinculo: ConfiancaVinculo | null;
  versao_regra: string | null;
  execucao_id: string | null;
  historico: Auto<unknown>;
  ausente_desde: Instante | null;
  demonstrativo: Auto<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
  /**
   * Controle otimista de concorrencia. Incrementada pelo gatilho de trilha
   * apenas quando algum campo muda de fato. Uma edicao que informe versao
   * vencida e recusada com 409 — nunca aplicada por cima.
   */
  versao: Auto<number>;
}

// ── Identidade e acesso ─────────────────────────────────────────────────────

export interface TabelaUsuarios {
  id: Auto<string>;
  usuario: string;
  nome: string;
  email: string | null;
  perfil: PerfilUsuario;
  area: AreaOrganizacional | null;
  status: Auto<StatusUsuario>;
  hash_senha: string | null;
  algoritmo_senha: string | null;
  senha_alterada_em: Instante | null;
  acesso_expira_em: Instante | null;
  ultimo_acesso_em: Instante | null;
  criado_em: Instante;
  atualizado_em: Instante;
  criado_por: string | null;
}

export interface TabelaPermissoesPerfil {
  perfil: PerfilUsuario;
  modulo: ModuloPlataforma;
  acao: AcaoPermissao;
}

export interface TabelaPermissoesUsuario {
  usuario_id: string;
  modulo: ModuloPlataforma;
  acao: AcaoPermissao;
  concedida: boolean;
  concedida_por: string | null;
  concedida_em: Instante;
  motivo: string | null;
}

export interface TabelaEscoposArea {
  usuario_id: string;
  area: AreaOrganizacional;
}

export interface TabelaEscoposEmpreendimento {
  usuario_id: string;
  empreendimento_id: string | null;
  todos: Auto<boolean>;
}

export interface TabelaEscoposTipoInformacao {
  usuario_id: string;
  tipo: TipoInformacao;
  completo: Auto<boolean>;
}

export interface TabelaSessoes {
  id: Auto<string>;
  usuario_id: string;
  hash_token: string;
  criada_em: Instante;
  expira_em: Instante;
  ultima_atividade: Instante;
  endereco_ip: string | null;
  agente_usuario: string | null;
  revogada_em: Instante | null;
  revogada_por: string | null;
  motivo_revogacao: string | null;
}

export interface TabelaTentativasAutenticacao {
  id: Generated<number>;
  usuario: string | null;
  endereco_ip: string | null;
  sucesso: boolean;
  ocorrida_em: Instante;
}

export interface TabelaTokensRecuperacao {
  id: Auto<string>;
  usuario_id: string;
  hash_token: string;
  criado_em: Instante;
  expira_em: Instante;
  usado_em: Instante | null;
}

export interface TabelaLogsAuditoria {
  id: Generated<number>;
  ocorrido_em: Instante;
  usuario_id: string | null;
  usuario_nome: string | null;
  perfil: PerfilUsuario | null;
  sessao_id: string | null;
  acao: string;
  recurso: string | null;
  recurso_id: string | null;
  modulo: ModuloPlataforma | null;
  endereco_ip: string | null;
  agente_usuario: string | null;
  valor_antes: unknown | null;
  valor_depois: unknown | null;
  detalhe: Auto<unknown>;
  resultado: Auto<string>;
}

// ── Cadastro ────────────────────────────────────────────────────────────────

export interface TabelaEmpreendimentos extends Proveniencia {
  id: Auto<string>;
  nome: string;
  nome_normalizado: string;
  empresa: string | null;
  cidade: string | null;
  torres: Auto<string[]>;
  blocos: Auto<string[]>;
  qtd_unidades: number | null;
  /** Classificacao do ativo na tela de cadastro. Distinto de status. */
  tipo: string | null;
  status: Auto<string>;
  ativo_para_importacao: Auto<boolean>;
  data_inicio_historico: Dia | null;
  data_encerramento: Dia | null;
  origem_cadastro: Auto<string>;
}

export interface TabelaEmpreendimentosFontes {
  id: Auto<string>;
  empreendimento_id: string;
  fonte: FonteDado;
  id_externo: string;
  rotulo_externo: string | null;
  vigente_de: Dia;
  vigente_ate: Dia | null;
  criado_em: Instante;
}

export interface TabelaUnidades extends Proveniencia {
  id: Auto<string>;
  empreendimento_id: string;
  torre: string | null;
  bloco: string | null;
  unidade: string;
  situacao: string | null;
  prazo_habite_se: Dia | null;
  prazo_180: Dia | null;
  previsao_entrega: Dia | null;
  status_juridico: string | null;
  tipo_financiamento: string | null;
}

export interface TabelaClientes extends Proveniencia {
  id: Auto<string>;
  nome: string;
  nome_normalizado: string;
  cpf_cnpj: string | null;
  cpf_cnpj_valido: boolean | null;
  tipo_pessoa: string | null;
}

export interface TabelaContratos extends Proveniencia {
  id: Auto<string>;
  cliente_id: string | null;
  empreendimento_id: string | null;
  unidade_id: string | null;
  numero_contrato: string | null;
  numero_normalizado: string | null;
  situacao_reserva: string | null;
  situacao: string | null;
  data_contrato: Dia | null;
  valor_contrato: string | null;
}

// ── Integracao ──────────────────────────────────────────────────────────────

export interface TabelaIntegracoes {
  id: Auto<string>;
  sistema: FonteDado;
  modo: Auto<string>;
  estado: Auto<EstadoIntegracao>;
  habilitada: Auto<boolean>;
  ambiente_verificado_em: Instante | null;
  ambiente_verificado_por: string | null;
  relatorio_verificacao: unknown | null;
  configuracao: Auto<unknown>;
  ultima_carga_em: Instante | null;
  ultima_carga_valida_em: Instante | null;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface TabelaExecucoesImportacao {
  id: Auto<string>;
  fonte: FonteDado;
  escopo: string | null;
  destino: string | null;
  competencia: string | null;
  comite_id: string | null;
  iniciada_em: Instante;
  finalizada_em: Instante | null;
  status: Auto<StatusExecucao>;
  lidos: Auto<number>;
  incluidos: Auto<number>;
  atualizados: Auto<number>;
  inalterados: Auto<number>;
  ignorados: Auto<number>;
  duplicados: Auto<number>;
  com_erro: Auto<number>;
  detalhe_ignorados: Auto<unknown>;
  mensagem: string | null;
  erros: Auto<unknown>;
  parcial: Auto<boolean>;
  fontes_com_falha: Auto<string[]>;
  usuario_id: string | null;
  versao_regra: string | null;
  /** Metricas da homologacao controlada (migracao 016). */
  paginas: number | null;
  ultimo_cursor: string | null;
  normalizados: number | null;
  data_referencia: Dia | null;
  id_origem_escopo: string | null;
  ultimo_dado_valido_em: Instante | null;
}

export interface TabelaRegistrosBrutos {
  id: Generated<number>;
  execucao_id: string;
  fonte: FonteDado;
  escopo: string | null;
  id_origem: string | null;
  payload: unknown;
  extraido_em: Instante;
}

export type ImpactoInconsistencia =
  | 'nenhum'
  | 'cadastro'
  | 'indicador'
  | 'valor_financeiro'
  | 'situacao_juridica'
  | 'multiplo';

export interface TabelaInconsistencias {
  id: Auto<string>;
  tipo: TipoInconsistencia;
  gravidade: GravidadeInconsistencia;
  fonte: FonteDado;
  descricao: string;
  detectado_em: Instante;
  // ── Extensao da migracao 008 (Central de Inconsistencias) ──
  impacto: Auto<ImpactoInconsistencia>;
  impacto_valor: string | null;
  regra_vinculo: RegraVinculo | null;
  confianca_vinculo: ConfiancaVinculo | null;
  vinculo_id: string | null;
  analise: string | null;
  decisao: string | null;
  justificativa: string | null;
  bloqueia_indicador: Auto<boolean>;
  competencia_ref: string | null;
  data_referencia: Dia | null;
  visualizacoes: Auto<number>;
  vista_por: string | null;
  atualizado_em: Instante;
  // ── Migracao 009: deliberacao da Diretoria, separada do encerramento ──
  aprovado_por: string | null;
  aprovado_em: Instante | null;
  aprovacao_decisao: string | null;
  aprovacao_justificativa: string | null;
  requer_aprovacao: Auto<boolean>;
  cliente: string | null;
  contrato: string | null;
  empreendimento: string | null;
  cliente_id: string | null;
  contrato_id: string | null;
  empreendimento_id: string | null;
  valores_em_conflito: Auto<unknown>;
  precedencia_aplicada: string | null;
  valor_aplicado: unknown | null;
  hipotese: string | null;
  status_revisao: Auto<StatusRevisao>;
  responsavel_id: string | null;
  responsavel_area: AreaOrganizacional | null;
  observacao: string | null;
  resolvido_em: Instante | null;
  resolvido_por: string | null;
  execucao_id: string | null;
  chave_deduplicacao: string;
  ocorrencias: Auto<number>;
  vista_por_ultimo_em: Instante;
}

export interface TabelaInconsistenciasEventos {
  id: Generated<number>;
  inconsistencia_id: string;
  ocorrido_em: Instante;
  evento: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  status_antes: StatusRevisao | null;
  status_depois: StatusRevisao | null;
  responsavel_antes: string | null;
  responsavel_depois: string | null;
  analise: string | null;
  decisao: string | null;
  justificativa: string | null;
  observacao: string | null;
  detalhe: Auto<unknown>;
}

export interface TabelaVinculosFontes {
  id: Auto<string>;
  entidade: string;
  entidade_id: string | null;
  fonte_a: FonteDado;
  id_origem_a: string;
  fonte_b: FonteDado;
  id_origem_b: string;
  regra: RegraVinculo;
  confianca: ConfiancaVinculo;
  chave_usada: string | null;
  candidatos: Auto<unknown>;
  ambiguo: Auto<boolean>;
  inconsistencia_id: string | null;
  versao_regra: string | null;
  execucao_id: string | null;
  criado_em: Instante;
  confirmado_em: Instante | null;
  confirmado_por: string | null;
}

// ── Comite e juridico ───────────────────────────────────────────────────────

export interface TabelaCompetencias {
  ref: string;
  rotulo: string;
  inicio: Dia;
  fim: Dia;
  fechada_em: Instante | null;
  criado_em: Instante;
}

export interface TabelaComites {
  id: Auto<string>;
  competencia_ref: string;
  rotulo: string;
  data_apresentacao: Dia | null;
  estagio: Auto<string>;
  status: Auto<string>;
  ata_aprovada_em: Instante | null;
  ata_aprovada_por: string | null;
  criado_em: Instante;
  atualizado_em: Instante;
  versao: Auto<number>;
  /** Movimentacao mensal (AAAA-MM -> quantidade). Nao e posicao. */
  distratos_evolucao: Auto<Record<string, number>>;
  notif_evolucao: Auto<Record<string, number>>;
  notif_evolucao_empr: Auto<Record<string, Record<string, number>>>;
}

export interface TabelaNotificacoes extends Proveniencia {
  id: Auto<string>;
  comite_id: string | null;
  competencia_ref: string | null;
  cliente_id: string | null;
  contrato_id: string | null;
  empreendimento_id: string | null;
  unidade_id: string | null;
  cliente_nome: string | null;
  torre: string | null;
  unidade: string | null;
  grupo: string | null;
  modelo: string | null;
  estagio: string | null;
  estagio_detalhe: string | null;
  situacao: string | null;
  data_notificacao: Dia | null;
  data_solucao: Dia | null;
  total_dias: number | null;
}

export interface TabelaProcessosJudiciais extends Proveniencia {
  id: Auto<string>;
  comite_id: string | null;
  competencia_ref: string | null;
  cliente_id: string | null;
  contrato_id: string | null;
  empreendimento_id: string | null;
  numero: string | null;
  ano: string | null;
  tipo: string | null;
  motivo: string | null;
  posicao: string | null;
  situacao: string | null;
  situacao_comite: string | null;
  atuacao: string | null;
  interno: boolean | null;
  comarca: string | null;
  valor_causa: string | null;
  data_citacao: Dia | null;
  data_ciencia: Dia | null;
  data_audiencia: Dia | null;
  data_finalizacao: Dia | null;
  judicializado: Auto<boolean>;
  revisao_necessaria: Auto<boolean>;
  honorarios_efetivados: string | null;
  /** Fonte cuja conclusao prevaleceu. NULL enquanto nenhuma politica aprovada alcanca o registro. */
  judicializacao_fonte: FonteDado | null;
  judicializacao_politica: string | null;
  judicializacao_divergente: Auto<boolean>;
}

/** Como a politica conclui: o escopo decide, um mapa de rotulos decide, ou listas de termos. */
export type TipoPoliticaJudicializacao = 'premissa_de_escopo' | 'por_rotulo' | 'por_termos';

/** So `aprovada` classifica. `proposta` e simulavel e nao produz efeito nenhum. */
export type SituacaoPolitica = 'proposta' | 'aprovada' | 'revogada';

export interface TabelaPoliticasJudicializacao {
  id: Auto<string>;
  versao: string;
  fonte: FonteDado;
  escopo: string;
  tipo: TipoPoliticaJudicializacao;
  configuracao: Auto<Record<string, unknown>>;
  precedencia: Auto<number>;
  vigente_de: Dia;
  vigente_ate: Dia | null;
  situacao: Auto<SituacaoPolitica>;
  justificativa: string;
  proposta_por: string | null;
  proposta_em: Instante;
  aprovada_por: string | null;
  aprovada_em: Instante | null;
  revogada_por: string | null;
  revogada_em: Instante | null;
  revogada_motivo: string | null;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface TabelaJudicializacaoApuracoes {
  id: Auto<number>;
  entidade: string;
  registro_id: string;
  fonte: FonteDado;
  politica_id: string | null;
  /** NULL = a politica olhou e nao concluiu. Distinto de `false`, que e conclusao. */
  judicializado: boolean | null;
  revisao_necessaria: Auto<boolean>;
  motivo: string;
  valor_observado: string | null;
  apurado_em: Instante;
  execucao_id: string | null;
}

export interface TabelaDistratos extends Proveniencia {
  id: Auto<string>;
  comite_id: string | null;
  competencia_ref: string | null;
  cliente_id: string | null;
  contrato_id: string | null;
  empreendimento_id: string | null;
  unidade: string | null;
  categoria: string;
  motivo: string | null;
  equipe: string | null;
  data_solicitacao: Dia | null;
  data_venda: Dia | null;
  data_conclusao: Dia | null;
  tempo_dias: number | null;
  /** `id_origem` das notificacoes ligadas na origem. Ver migracao 020. */
  notificacoes_origem: Auto<string[]>;
}

/** Cadastro manual do comite: fatos relevantes do mes. */
export interface TabelaFatos extends Proveniencia {
  id: Auto<string>;
  comite_id: string | null;
  empreendimento_id: string | null;
  data: Dia | null;
  titulo: string | null;
  descricao: string;
}

export interface TabelaRiscos extends Proveniencia {
  id: Auto<string>;
  comite_id: string | null;
  empreendimento_id: string | null;
  contrato_ref: string | null;
  alerta: string | null;
  cronograma: Auto<unknown>;
  riscos_lista: Auto<unknown>;
  renegociacao: unknown | null;
  recomendacoes: Auto<unknown>;
}

export interface TabelaRegulatorios extends Proveniencia {
  id: Auto<string>;
  comite_id: string | null;
  titulo: string;
  descricao: string | null;
  data_vigencia: Dia | null;
  destaque: string | null;
  checklist: Auto<unknown>;
}

// ── Historico ───────────────────────────────────────────────────────────────

export interface TabelaFotografiasDiarias {
  id: Auto<string>;
  data_referencia: Dia;
  modulo: Auto<ModuloPlataforma>;
  escopo: Auto<EscopoIndicador>;
  empreendimento_id: string | null;
  indicador: string;
  tipo_indicador: TipoIndicador;
  valor_numerico: string | null;
  valor_monetario: string | null;
  numerador: string | null;
  denominador: string | null;
  unidade_medida: UnidadeMedida | null;
  versao_regra: string;
  versao_fotografia: Auto<number>;
  vigente: Auto<boolean>;
  motivo_reprocessamento: string | null;
  reprocessado_por: string | null;
  status_fotografia: StatusFotografia;
  fontes: Auto<string[]>;
  data_extracao_monday: Instante | null;
  data_extracao_sienge: Instante | null;
  data_extracao_cvcrm: Instante | null;
  data_processamento: Instante;
  quantidade_registros: number | null;
  quantidade_excluidos: number | null;
  motivo_exclusoes: string | null;
  meta_vigente: string | null;
  memoria_id: string | null;
  execucao_id: string | null;
  criado_em: Instante;
}

export type StatusMigracao =
  | 'iniciada' | 'em_andamento' | 'concluida' | 'parcial' | 'erro' | 'cancelada';
export type ClasseChave = 'migrar' | 'preferencia' | 'excluir' | 'cache' | 'revisao';

export interface TabelaMigracoesLocalstorage {
  id: Auto<string>;
  usuario_id: string;
  usuario_nome: string;
  iniciada_em: Instante;
  finalizada_em: Instante | null;
  status: Auto<StatusMigracao>;
  origem_navegador: string | null;
  endereco_ip: string | null;
  snapshot: unknown;
  snapshot_bytes: number;
  snapshot_hash: string;
  versao_formato: string | null;
  chaves_encontradas: Auto<number>;
  chaves_migradas: Auto<number>;
  lidos: Auto<number>;
  incluidos: Auto<number>;
  atualizados: Auto<number>;
  ignorados: Auto<number>;
  conflitantes: Auto<number>;
  com_erro: Auto<number>;
  demonstrativos: Auto<number>;
  persistencia_confirmada: Auto<boolean>;
  chaves_removidas_em: Instante | null;
  mensagem: string | null;
  erros: Auto<unknown>;
}

export interface TabelaMigracoesChaves {
  id: Auto<string>;
  migracao_id: string;
  chave: string;
  classe: ClasseChave;
  destino: string | null;
  registros_lidos: Auto<number>;
  incluidos: Auto<number>;
  atualizados: Auto<number>;
  ignorados: Auto<number>;
  conflitantes: Auto<number>;
  com_erro: Auto<number>;
  demonstrativos: Auto<number>;
  concluida: Auto<boolean>;
  concluida_em: Instante | null;
  removida_do_navegador: Auto<boolean>;
  erro: string | null;
  detalhe: Auto<unknown>;
}

export interface TabelaPreferenciasPermitidas {
  chave: string;
  descricao: string;
  criado_em: Instante;
}

// ── Backup e restauracao ────────────────────────────────────────────────────

export type TipoBackup = 'completo' | 'preventivo' | 'pre_migracao' | 'agendado';
export type StatusBackup = 'em_andamento' | 'concluido' | 'erro' | 'corrompido' | 'expurgado';
export type ClasseRetencao = 'diario' | 'semanal' | 'mensal' | 'permanente';
export type DestinoRestauracao = 'isolado' | 'producao';
export type StatusRestauracao =
  | 'em_andamento' | 'concluida' | 'concluida_com_ressalvas'
  | 'recusada' | 'erro' | 'interrompida';

export interface TabelaMigracoesAplicadas {
  nome: string;
  checksum: string;
  aplicada_em: Instante;
}

export interface TabelaBackups {
  id: Auto<string>;
  rotulo: string;
  ambiente: string;
  tipo: TipoBackup;
  status: Auto<StatusBackup>;
  iniciado_em: Instante;
  concluido_em: Instante | null;
  duracao_ms: number | null;
  versao_aplicacao: string;
  versao_banco: string;
  versao_esquema: string;
  migracoes: Auto<unknown>;
  arquivo: string | null;
  local_armazenamento: string | null;
  copia_redundante: string | null;
  tamanho_bytes: ColumnType<number, bigint | number | undefined, bigint | number>  | null;
  tamanho_claro_bytes: ColumnType<number, bigint | number | undefined, bigint | number> | null;
  checksum: string | null;
  checksum_claro: string | null;
  algoritmo_cifra: Auto<string>;
  contagens: Auto<Record<string, number>>;
  total_registros: ColumnType<number, bigint | number | undefined, bigint | number> | null;
  iniciado_por: string | null;
  iniciado_por_nome: string;
  origem: string;
  classe_retencao: Auto<ClasseRetencao>;
  reter_ate: Instante | null;
  protegido: Auto<boolean>;
  expurgado_em: Instante | null;
  expurgado_por: string | null;
  verificado_em: Instante | null;
  restauracao_testada_em: Instante | null;
  erro: string | null;
  detalhe: Auto<unknown>;
}

export interface TabelaRestauracoes {
  id: Auto<string>;
  backup_id: string;
  destino: DestinoRestauracao;
  banco_destino: string;
  ambiente_destino: string;
  ambiente_origem: string;
  status: Auto<StatusRestauracao>;
  iniciada_em: Instante;
  concluida_em: Instante | null;
  duracao_ms: number | null;
  solicitada_por: string | null;
  solicitada_por_nome: string;
  confirmacao: string | null;
  justificativa: string | null;
  backup_preventivo_id: string | null;
  /** Restauracao isolada validada do mesmo backup. Requisito B15.1. */
  ensaio_id: string | null;
  plano_corte: string | null;
  /** Schema com o estado anterior, preservado para rollback. Requisito B15.2. */
  schema_preservado: string | null;
  schema_descartado_em: Instante | null;
  checksum_conferido: Auto<boolean>;
  versao_conferida: Auto<boolean>;
  migracoes_conferidas: Auto<boolean>;
  ambiente_conferido: Auto<boolean>;
  integridade: Auto<unknown>;
  divergencias: Auto<unknown>;
  erro: string | null;
  detalhe: Auto<unknown>;
}

export interface TabelaVerificacoesBackup {
  id: Auto<string>;
  executada_em: Instante;
  origem: string;
  tipo: 'checksum' | 'ensaio_restauracao';
  backups_avaliados: Auto<number>;
  integros: Auto<number>;
  corrompidos: Auto<number>;
  ausentes: Auto<number>;
  backup_id: string | null;
  restauracao_id: string | null;
  duracao_ms: number | null;
  detalhe: Auto<unknown>;
  erro: string | null;
}

export interface TabelaJanelasBackup {
  dia: Dia;
  ambiente: string;
  esperada_para: Instante;
  aberta_em: Instante;
  concluida_em: Instante | null;
  backup_id: string | null;
  tentativas: Auto<number>;
  ultimo_erro: string | null;
}

export interface TabelaPoliticaRetencao {
  id: Auto<number>;
  diarios_manter: Auto<number>;
  semanais_manter: Auto<number>;
  mensais_manter: Auto<number>;
  retencao_minima_dias: Auto<number>;
  minimo_recuperaveis: Auto<number>;
  atualizada_em: Instante;
  atualizada_por: string | null;
}

export interface Database {
  usuarios: TabelaUsuarios;
  permissoes_perfil: TabelaPermissoesPerfil;
  permissoes_usuario: TabelaPermissoesUsuario;
  escopos_area: TabelaEscoposArea;
  escopos_empreendimento: TabelaEscoposEmpreendimento;
  escopos_tipo_informacao: TabelaEscoposTipoInformacao;
  sessoes: TabelaSessoes;
  tentativas_autenticacao: TabelaTentativasAutenticacao;
  tokens_recuperacao: TabelaTokensRecuperacao;
  logs_auditoria: TabelaLogsAuditoria;

  empreendimentos: TabelaEmpreendimentos;
  empreendimentos_fontes: TabelaEmpreendimentosFontes;
  unidades: TabelaUnidades;
  clientes: TabelaClientes;
  contratos: TabelaContratos;

  integracoes: TabelaIntegracoes;
  execucoes_importacao: TabelaExecucoesImportacao;
  registros_brutos: TabelaRegistrosBrutos;
  inconsistencias: TabelaInconsistencias;
  inconsistencias_eventos: TabelaInconsistenciasEventos;
  vinculos_fontes: TabelaVinculosFontes;

  competencias: TabelaCompetencias;
  comites: TabelaComites;
  notificacoes: TabelaNotificacoes;
  processos_judiciais: TabelaProcessosJudiciais;
  distratos: TabelaDistratos;
  fatos: TabelaFatos;
  riscos: TabelaRiscos;
  regulatorios: TabelaRegulatorios;

  fotografias_diarias: TabelaFotografiasDiarias;

  migracoes_aplicadas: TabelaMigracoesAplicadas;
  backups: TabelaBackups;
  restauracoes: TabelaRestauracoes;
  politica_retencao: TabelaPoliticaRetencao;
  verificacoes_backup: TabelaVerificacoesBackup;
  janelas_backup: TabelaJanelasBackup;

  migracoes_localstorage: TabelaMigracoesLocalstorage;
  migracoes_chaves: TabelaMigracoesChaves;
  preferencias_permitidas: TabelaPreferenciasPermitidas;

  politicas_judicializacao: TabelaPoliticasJudicializacao;
  judicializacao_apuracoes: TabelaJudicializacaoApuracoes;
}
