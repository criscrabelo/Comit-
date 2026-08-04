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
  | 'administracao';

export type TipoInformacao =
  | 'dado_pessoal'
  | 'valor_financeiro'
  | 'situacao_juridica'
  | 'documento'
  | 'desempenho_individual';

export type AcaoPermissao = 'ler' | 'criar' | 'editar' | 'remover' | 'exportar' | 'executar';

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
  | 'falha_importacao';

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

export interface TabelaInconsistencias {
  id: Auto<string>;
  tipo: TipoInconsistencia;
  gravidade: GravidadeInconsistencia;
  fonte: FonteDado;
  descricao: string;
  detectado_em: Instante;
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
  vinculos_fontes: TabelaVinculosFontes;

  competencias: TabelaCompetencias;
  comites: TabelaComites;
  notificacoes: TabelaNotificacoes;
  processos_judiciais: TabelaProcessosJudiciais;
  distratos: TabelaDistratos;

  fotografias_diarias: TabelaFotografiasDiarias;
}
