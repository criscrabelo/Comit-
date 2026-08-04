-- Up Migration
-- ============================================================================
-- Migração do localStorage para o PostgreSQL.
--
-- Duas garantias estruturais:
--
--   1. SNAPSHOT ANTES DE QUALQUER COISA. O dump bruto do navegador é gravado
--      imutável antes da primeira linha ser interpretada. Se a importação der
--      errado no meio, o material original continua aqui — e a chave do
--      navegador só é apagada depois da confirmação.
--
--   2. RETOMADA. A migração é registrada chave a chave. Interromper e recomeçar
--      continua de onde parou, sem reimportar o que já entrou.
-- ============================================================================

CREATE TYPE status_migracao AS ENUM (
  'iniciada',
  'em_andamento',
  'concluida',
  'parcial',      -- algumas chaves falharam; o que entrou permanece
  'erro',
  'cancelada'
);

CREATE TYPE classe_chave AS ENUM (
  'migrar',       -- dado de negócio, vai para o PostgreSQL
  'preferencia',  -- fica no navegador, sem dado sensível
  'excluir',      -- credencial ou lixo: apagar
  'cache',        -- recriável, ignorar
  'revisao'       -- estrutura desconhecida, decisão humana
);

-- ============================================================================
-- Execução de migração
-- ============================================================================
CREATE TABLE migracoes_localstorage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        uuid NOT NULL REFERENCES usuarios(id),
  usuario_nome      text NOT NULL,

  iniciada_em       timestamptz NOT NULL DEFAULT now(),
  finalizada_em     timestamptz,
  status            status_migracao NOT NULL DEFAULT 'iniciada',

  -- Identifica a origem, para não misturar migração de navegadores diferentes
  -- da mesma pessoa nem de pessoas diferentes.
  origem_navegador  text,
  endereco_ip       inet,

  -- Snapshot do dump COMPLETO, antes de qualquer interpretação. Imutável.
  snapshot          jsonb NOT NULL,
  snapshot_bytes    integer NOT NULL,
  -- Impede importar o mesmo dump duas vezes por engano.
  snapshot_hash     text NOT NULL,

  versao_formato    text,

  chaves_encontradas integer NOT NULL DEFAULT 0,
  chaves_migradas    integer NOT NULL DEFAULT 0,

  lidos             integer NOT NULL DEFAULT 0,
  incluidos         integer NOT NULL DEFAULT 0,
  atualizados       integer NOT NULL DEFAULT 0,
  ignorados         integer NOT NULL DEFAULT 0,
  conflitantes      integer NOT NULL DEFAULT 0,
  com_erro          integer NOT NULL DEFAULT 0,
  demonstrativos    integer NOT NULL DEFAULT 0,

  -- Só vira true depois de a persistência ser confirmada por releitura.
  persistencia_confirmada boolean NOT NULL DEFAULT false,
  chaves_removidas_em     timestamptz,

  mensagem          text,
  erros             jsonb NOT NULL DEFAULT '[]'::jsonb,

  CONSTRAINT remocao_exige_confirmacao CHECK (
    chaves_removidas_em IS NULL OR persistencia_confirmada = true
  )
);

CREATE INDEX ix_migracoes_usuario ON migracoes_localstorage (usuario_id, iniciada_em DESC);
CREATE INDEX ix_migracoes_status ON migracoes_localstorage (status);
-- O mesmo dump não é importado duas vezes pelo mesmo usuário.
CREATE UNIQUE INDEX ux_migracao_snapshot ON migracoes_localstorage (usuario_id, snapshot_hash);

COMMENT ON COLUMN migracoes_localstorage.snapshot IS
  'Dump bruto do navegador, imutavel, gravado ANTES de interpretar qualquer linha.';
COMMENT ON CONSTRAINT remocao_exige_confirmacao ON migracoes_localstorage IS
  'A chave do navegador so pode ser apagada depois de a persistencia ser confirmada.';

-- O snapshot é a prova do que existia. Não se reescreve.
CREATE OR REPLACE FUNCTION proteger_snapshot_migracao() RETURNS trigger AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
  THEN
    RAISE EXCEPTION 'o snapshot da migracao e imutavel (migracao %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_migracao_snapshot_imutavel
  BEFORE UPDATE ON migracoes_localstorage
  FOR EACH ROW EXECUTE FUNCTION proteger_snapshot_migracao();


-- ============================================================================
-- Resultado por chave — é o que permite RETOMAR
-- ============================================================================
CREATE TABLE migracoes_chaves (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migracao_id       uuid NOT NULL REFERENCES migracoes_localstorage(id) ON DELETE CASCADE,

  chave             text NOT NULL,
  classe            classe_chave NOT NULL,
  destino           text,

  registros_lidos   integer NOT NULL DEFAULT 0,
  incluidos         integer NOT NULL DEFAULT 0,
  atualizados       integer NOT NULL DEFAULT 0,
  ignorados         integer NOT NULL DEFAULT 0,
  conflitantes      integer NOT NULL DEFAULT 0,
  com_erro          integer NOT NULL DEFAULT 0,
  demonstrativos    integer NOT NULL DEFAULT 0,

  concluida         boolean NOT NULL DEFAULT false,
  concluida_em      timestamptz,
  removida_do_navegador boolean NOT NULL DEFAULT false,

  erro              text,
  detalhe           jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT remocao_chave_exige_conclusao CHECK (
    removida_do_navegador = false OR concluida = true
  )
);

-- Uma linha por chave por migração: a retomada consulta e pula o que já entrou.
CREATE UNIQUE INDEX ux_migracao_chave ON migracoes_chaves (migracao_id, chave);
CREATE INDEX ix_migracao_chaves_pendentes ON migracoes_chaves (migracao_id)
  WHERE concluida = false;

COMMENT ON TABLE migracoes_chaves IS
  'Resultado por chave. Base da retomada: chave concluida nao e reimportada.';


-- ============================================================================
-- Preferências que continuam no navegador
--
-- Catálogo do que é permitido guardar localmente. Serve à interface e ao teste
-- que impede alguém de acrescentar dado sensível.
-- ============================================================================
CREATE TABLE preferencias_permitidas (
  chave       text PRIMARY KEY,
  descricao   text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO preferencias_permitidas (chave, descricao) VALUES
  ('patrono.pref.v1.tema',              'Claro ou escuro'),
  ('patrono.pref.v1.menu_recolhido',    'Menu lateral recolhido'),
  ('patrono.pref.v1.aba_selecionada',   'Ultima aba aberta em cada modulo'),
  ('patrono.pref.v1.densidade_tabela',  'Compacta ou confortavel'),
  ('patrono.pref.v1.comite_ativo',      'Ultimo comite visualizado'),
  ('patrono.pref.v1.ultima_visualizacao', 'Ultima tela utilizada');

COMMENT ON TABLE preferencias_permitidas IS
  'Unicas chaves que podem permanecer no navegador. Nenhuma contem dado pessoal, '
  'valor financeiro, situacao juridica ou credencial.';


-- Down Migration
DROP TABLE IF EXISTS preferencias_permitidas;
DROP TABLE IF EXISTS migracoes_chaves;
DROP TRIGGER IF EXISTS tg_migracao_snapshot_imutavel ON migracoes_localstorage;
DROP FUNCTION IF EXISTS proteger_snapshot_migracao();
DROP TABLE IF EXISTS migracoes_localstorage;
DROP TYPE IF EXISTS classe_chave;
DROP TYPE IF EXISTS status_migracao;
