/**
 * Classificação das chaves do localStorage.
 *
 * O catálogo vive aqui, não em documentação solta, para que o comportamento e a
 * documentação não possam divergir. `docs/INVENTARIO-LOCALSTORAGE.md` explica o
 * porquê de cada decisão; este arquivo é o que o código executa.
 */

export type ClasseChave = 'migrar' | 'preferencia' | 'excluir' | 'cache' | 'revisao';

/** Tabelas de destino aceitas pela migração. */
export type DestinoMigracao =
  | 'competencias_comites'
  | 'empreendimentos'
  | 'unidades'
  | 'contratos'
  | 'notificacoes'
  | 'processos_judiciais'
  | 'distratos'
  | 'fatos'
  | 'riscos'
  | 'regulatorios';

export interface DefinicaoChave {
  chave: string;
  classe: ClasseChave;
  modulo: string;
  destino?: DestinoMigracao;
  /** Contém nome, documento, contrato ou texto jurídico. */
  contemDadoPessoal: boolean;
  descricao: string;
  /** Por que não migra, quando for o caso. */
  motivo?: string;
}

const PREFIXO_LEGADO = 'jur_comite_';

/** Chaves de negócio do frontend em produção. */
export const CATALOGO: DefinicaoChave[] = [
  {
    chave: `${PREFIXO_LEGADO}comites`,
    classe: 'migrar',
    modulo: 'Comitê',
    destino: 'competencias_comites',
    contemDadoPessoal: false,
    descricao: 'Competências e comitês mensais',
  },
  {
    chave: `${PREFIXO_LEGADO}empreendimentos`,
    classe: 'migrar',
    modulo: 'Cadastro',
    destino: 'empreendimentos',
    contemDadoPessoal: false,
    descricao: 'Empreendimentos: nome, tipo, cidade, status',
  },
  {
    chave: `${PREFIXO_LEGADO}unidades`,
    classe: 'migrar',
    modulo: 'Cadastro',
    destino: 'unidades',
    contemDadoPessoal: false,
    descricao: 'Unidades: torre, bloco, prazos de entrega',
  },
  {
    chave: `${PREFIXO_LEGADO}contratos`,
    classe: 'migrar',
    modulo: 'Jurídico',
    destino: 'contratos',
    contemDadoPessoal: true,
    descricao: 'Contratos e situação',
  },
  {
    chave: `${PREFIXO_LEGADO}notificacoes`,
    classe: 'migrar',
    modulo: 'Jurídico',
    destino: 'notificacoes',
    contemDadoPessoal: true,
    descricao: 'Notificações: cliente, unidade, estágio',
  },
  {
    chave: `${PREFIXO_LEGADO}processos`,
    classe: 'migrar',
    modulo: 'Jurídico',
    destino: 'processos_judiciais',
    contemDadoPessoal: true,
    descricao: 'Processos judiciais',
  },
  {
    chave: `${PREFIXO_LEGADO}distratos`,
    classe: 'migrar',
    modulo: 'Jurídico',
    destino: 'distratos',
    contemDadoPessoal: true,
    descricao: 'Distratos e desistências',
  },
  {
    chave: `${PREFIXO_LEGADO}retomadas`,
    classe: 'migrar',
    modulo: 'Jurídico',
    destino: 'distratos',
    contemDadoPessoal: true,
    descricao: 'Retomadas e recompras',
  },
  {
    chave: `${PREFIXO_LEGADO}fatos`,
    classe: 'migrar',
    modulo: 'Comitê',
    destino: 'fatos',
    contemDadoPessoal: true,
    descricao: 'Fatos relevantes redigidos à mão — conteúdo autoral',
  },
  {
    chave: `${PREFIXO_LEGADO}riscos`,
    classe: 'migrar',
    modulo: 'Comitê',
    destino: 'riscos',
    contemDadoPessoal: true,
    descricao: 'Cronograma, riscos e renegociação — conteúdo autoral',
  },
  {
    chave: `${PREFIXO_LEGADO}regulatorios`,
    classe: 'migrar',
    modulo: 'Comitê',
    destino: 'regulatorios',
    contemDadoPessoal: false,
    descricao: 'Legislação e checklist regulatório',
  },

  // ── Preferência ──────────────────────────────────────────────────────────
  {
    chave: `${PREFIXO_LEGADO}active_comite`,
    classe: 'preferencia',
    modulo: 'Interface',
    contemDadoPessoal: false,
    descricao: 'Comitê selecionado',
    motivo:
      'É "última visualização utilizada", não dado de negócio. Renomeada para patrono.pref.v1.comite_ativo.',
  },

  // ── Excluir ──────────────────────────────────────────────────────────────
  {
    chave: 'jur_monday_token',
    classe: 'excluir',
    modulo: 'Integração',
    contemDadoPessoal: false,
    descricao: 'Token pessoal do Monday',
    motivo: 'Credencial. Já removida na Etapa 1; a limpeza roda na carga da página.',
  },
  {
    chave: 'monday_token',
    classe: 'excluir',
    modulo: 'Integração',
    contemDadoPessoal: false,
    descricao: 'Variante do token em versões anteriores',
    motivo: 'Credencial.',
  },
  {
    chave: 'jur_token_monday',
    classe: 'excluir',
    modulo: 'Integração',
    contemDadoPessoal: false,
    descricao: 'Variante do token em versões anteriores',
    motivo: 'Credencial.',
  },
];

/**
 * Chaves dos protótipos do Claude Design.
 *
 * NÃO estão implantadas: nenhum usuário possui esses dados. Ficam catalogadas
 * para que a decisão seja consciente quando os módulos forem construídos, e
 * para que a migração as reconheça em vez de tratá-las como desconhecidas.
 */
export const CATALOGO_PROTOTIPOS: DefinicaoChave[] = [
  ['patrono_diarios_v1', 'Diário do Dia', true],
  ['patrono_feedbacks_v1', 'Feedback', true],
  ['patrono_recompensas_v1', 'Recompensas', true],
  ['patrono_usuarios_v1', 'Usuários simulados', true],
  ['patrono_departamentos_v1', 'Departamentos', false],
  ['patrono_lembretes_v1', 'Lembretes', true],
  ['patrono_tickets_v1', 'Suporte', true],
  ['patrono_ia_chats_v1', 'IA', true],
  ['patrono_modulos_v1', 'Configuração', false],
  ['patrono_plano_v1', 'Plano comercial', false],
  ['patrono_brand_overrides_v1', 'White-label', false],
  ['patrono_regulatorio_check_v1', 'Regulatório', false],
  ['patrono_setup_done_v1', 'Onboarding', false],
  ['patrono_onboarding_colab_v1', 'Onboarding', false],
  ['patrono_onboarding_dismissed_v1', 'Onboarding', false],
  ['patrono_trial_banner_dismissed_v1', 'Comercial', false],
].map(([chave, modulo, pessoal]) => ({
  chave: chave as string,
  classe: 'revisao' as const,
  modulo: modulo as string,
  contemDadoPessoal: pessoal as boolean,
  descricao: `Protótipo do Claude Design — ${modulo}`,
  motivo:
    'Módulo não implantado. Migrar agora seria importar dado que nenhum usuário possui. ' +
    'Quando for construído, deve nascer falando com o backend.',
}));

const PORS_CHAVE = new Map(
  [...CATALOGO, ...CATALOGO_PROTOTIPOS].map((d) => [d.chave, d]),
);

/**
 * Classifica uma chave encontrada no navegador.
 *
 * Chave desconhecida vai para `revisao`, nunca é migrada às cegas nem apagada.
 */
export function classificar(chave: string): DefinicaoChave {
  const conhecida = PORS_CHAVE.get(chave);
  if (conhecida) return conhecida;

  return {
    chave,
    classe: 'revisao',
    modulo: 'desconhecido',
    contemDadoPessoal: true, // presume o pior até alguém olhar
    descricao: 'Chave não catalogada',
    motivo:
      'Estrutura desconhecida. Não é migrada nem apagada: precisa de decisão humana.',
  };
}

/** Preferências que podem permanecer no navegador. */
export const PREFERENCIAS_PERMITIDAS = [
  'patrono.pref.v1.tema',
  'patrono.pref.v1.menu_recolhido',
  'patrono.pref.v1.aba_selecionada',
  'patrono.pref.v1.densidade_tabela',
  'patrono.pref.v1.comite_ativo',
  'patrono.pref.v1.ultima_visualizacao',
] as const;

export const PREFIXO_PREFERENCIA = 'patrono.pref.v1.';

/** IDs dos dados de exemplo do seed. Entram com demonstrativo = true. */
export const IDS_DEMONSTRATIVOS = new Set([
  'e_alencar',
  'e_carpe',
  'e_coevo',
  'e_jp',
  'e_js',
  'e_moratta',
  'e_pe',
  'e_tetus',
  'risco_jp_abc',
]);

/**
 * Reconhece um registro de exemplo.
 *
 * Dado demonstrativo entra no banco marcado, nunca apresentado como real —
 * `js/seed.js` grava nas mesmas tabelas dos dados reais, sem distinção.
 */
export function ehDemonstrativo(registro: Record<string, unknown>): boolean {
  const id = registro.id;
  if (typeof id === 'string' && IDS_DEMONSTRATIVOS.has(id)) return true;
  // O seed usa prefixos previsíveis nos registros derivados.
  if (typeof id === 'string' && /^(e_|risco_|seed_|demo_)/.test(id)) return true;
  return registro.demonstrativo === true || registro._seed === true;
}
