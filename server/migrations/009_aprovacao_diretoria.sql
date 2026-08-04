-- Up Migration
-- ============================================================================
-- Aprovacao formal da Diretoria, separada do encerramento operacional.
--
-- Correcao de uma contradicao real: a Diretoria foi definida como perfil de
-- leitura e deliberacao, mas a regra de encerramento de inconsistencia critica
-- a listava como habilitada. Como a Diretoria tem apenas `juridico:ler`, ela
-- nunca alcancava o endpoint — a lista estava errada, nao o comportamento, mas
-- a intencao ficava ambigua.
--
-- Passa a existir uma acao propria: a Diretoria APROVA (delibera), a Gestora
-- ENCERRA (opera). Sao registros distintos, com autoria e justificativa
-- proprias.
-- ============================================================================

ALTER TABLE inconsistencias
  -- Aprovacao formal da Diretoria. Independente do encerramento: pode vir
  -- antes (autorizando) ou depois (ratificando).
  ADD COLUMN aprovado_por            uuid REFERENCES usuarios(id),
  ADD COLUMN aprovado_em             timestamptz,
  ADD COLUMN aprovacao_decisao       text,
  ADD COLUMN aprovacao_justificativa text,
  -- Marca as que a Gestora considera que dependem de deliberacao da Diretoria.
  ADD COLUMN requer_aprovacao        boolean NOT NULL DEFAULT false,

  -- Aprovacao exige quem, quando, decisao e justificativa — os quatro juntos.
  ADD CONSTRAINT aprovacao_completa CHECK (
    (aprovado_por IS NULL AND aprovado_em IS NULL
      AND aprovacao_decisao IS NULL AND aprovacao_justificativa IS NULL)
    OR (aprovado_por IS NOT NULL AND aprovado_em IS NOT NULL
      AND aprovacao_decisao IS NOT NULL AND aprovacao_justificativa IS NOT NULL)
  );

COMMENT ON COLUMN inconsistencias.aprovado_por IS
  'Deliberacao da Diretoria. Distinto de resolvido_por, que e o encerramento operacional.';
COMMENT ON COLUMN inconsistencias.requer_aprovacao IS
  'Marcada pela Gestora quando o caso depende de deliberacao formal da Diretoria.';

CREATE INDEX ix_inconsistencias_aguardando_aprovacao
  ON inconsistencias (requer_aprovacao)
  WHERE requer_aprovacao = true AND aprovado_em IS NULL;

-- A aprovacao tambem e imutavel: aprovar duas vezes com decisoes diferentes
-- apagaria a deliberacao anterior.
CREATE OR REPLACE FUNCTION proteger_aprovacao() RETURNS trigger AS $$
BEGIN
  IF OLD.aprovado_em IS NOT NULL AND (
       NEW.aprovado_por            IS DISTINCT FROM OLD.aprovado_por
    OR NEW.aprovado_em             IS DISTINCT FROM OLD.aprovado_em
    OR NEW.aprovacao_decisao       IS DISTINCT FROM OLD.aprovacao_decisao
    OR NEW.aprovacao_justificativa IS DISTINCT FROM OLD.aprovacao_justificativa
  ) THEN
    RAISE EXCEPTION
      'a aprovacao da Diretoria e imutavel: registre uma nova inconsistencia em vez de reescrever a deliberacao (inconsistencia %)',
      OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_inconsistencia_aprovacao_imutavel
  BEFORE UPDATE ON inconsistencias
  FOR EACH ROW EXECUTE FUNCTION proteger_aprovacao();

-- ============================================================================
-- Permissao: a Diretoria delibera sem operar
--
-- `deliberar` e uma acao propria, para nao ser confundida com `editar`. Assim a
-- Diretoria aprova sem receber permissao de alterar o tratamento operacional.
-- ============================================================================
-- `deliberar` NAO e um valor do enum acao_permissao, por escolha de modelagem:
-- a deliberacao nao e uma permissao sobre um modulo, e uma competencia do
-- perfil Diretoria sobre um recurso especifico. Concede-la pelo enum abriria a
-- porta para "diretoria pode deliberar em qualquer modulo", que nao e a regra.
--
-- A verificacao e: perfil = 'diretoria' E permissoes_perfil(diretoria,
-- juridico, 'ler'). Implementada em src/inconsistencias/rotas.ts
-- (PERFIS_APROVAM), com teste cobrindo os outros cinco perfis.
--
-- Nota tecnica: ALTER TYPE ... ADD VALUE FUNCIONA dentro de transacao no
-- PostgreSQL 12+, desde que o valor novo nao seja usado na mesma transacao.
-- Verificado neste banco. A migracao 010 usa esse recurso.

-- Down Migration
DROP TRIGGER IF EXISTS tg_inconsistencia_aprovacao_imutavel ON inconsistencias;
DROP FUNCTION IF EXISTS proteger_aprovacao();
DROP INDEX IF EXISTS ix_inconsistencias_aguardando_aprovacao;
ALTER TABLE inconsistencias
  DROP CONSTRAINT IF EXISTS aprovacao_completa,
  DROP COLUMN IF EXISTS requer_aprovacao,
  DROP COLUMN IF EXISTS aprovacao_justificativa,
  DROP COLUMN IF EXISTS aprovacao_decisao,
  DROP COLUMN IF EXISTS aprovado_em,
  DROP COLUMN IF EXISTS aprovado_por;
-- Valor de ENUM nao e removivel no PostgreSQL; 'deliberar' permanece.
