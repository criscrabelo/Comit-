-- Up Migration
-- ============================================================================
-- Central de Inconsistencias — extensao para os 15 requisitos obrigatorios.
--
-- A tabela base foi criada em 004. Aqui ela recebe o que os requisitos exigem e
-- o schema da skill nao previa: impacto, regra e confianca do vinculo, analise,
-- decisao, justificativa, e um historico proprio append-only.
--
-- Requisito 12 — "a resolucao nao deve apagar ou alterar silenciosamente os
-- valores originais" — deixa de ser convencao e passa a ser imposto por gatilho.
-- ============================================================================

-- ── Impacto: o que a inconsistencia compromete ──────────────────────────────
-- Separado da gravidade de proposito. Gravidade e urgencia; impacto e a
-- natureza do que fica comprometido. Uma divergencia pode ser critica para o
-- indicador financeiro e irrelevante para o cadastro.
CREATE TYPE impacto_inconsistencia AS ENUM (
  'nenhum',
  'cadastro',            -- afeta identificacao, sem efeito em indicador
  'indicador',           -- altera contagem de clientes, processos, resolucoes
  'valor_financeiro',    -- altera saldo, carteira, inadimplencia ou PDD
  'situacao_juridica',   -- altera judicializacao, acordo ou resolucao
  'multiplo'
);

ALTER TABLE inconsistencias
  ADD COLUMN impacto            impacto_inconsistencia NOT NULL DEFAULT 'indicador',
  -- Diferenca monetaria entre os valores em conflito, quando aplicavel.
  -- Permite ordenar a triagem por dinheiro em risco.
  ADD COLUMN impacto_valor      numeric(18,2),

  -- Requisitos 4 e 5: como os registros foram relacionados e com que confianca.
  ADD COLUMN regra_vinculo      regra_vinculo,
  ADD COLUMN confianca_vinculo  confianca_vinculo,
  ADD COLUMN vinculo_id         uuid REFERENCES vinculos_fontes(id),

  -- Requisito 9: analise, decisao e justificativa, em campos distintos.
  -- Juntar os tres num campo de observacao perderia a diferenca entre o que se
  -- constatou, o que se decidiu e por que.
  ADD COLUMN analise            text,
  ADD COLUMN decisao            text,
  ADD COLUMN justificativa      text,

  -- Enquanto aberta e bloqueante, os indicadores dependentes ficam "sem dado"
  -- com motivo declarado, em vez de exibir numero possivelmente errado.
  ADD COLUMN bloqueia_indicador boolean NOT NULL DEFAULT false,

  -- Competencia e data de referencia, para o filtro por periodo (requisito 13).
  ADD COLUMN competencia_ref    text REFERENCES competencias(ref),
  ADD COLUMN data_referencia    date,

  -- Requisito 15: quantas vezes foi vista e por quem pela ultima vez.
  ADD COLUMN visualizacoes      integer NOT NULL DEFAULT 0,
  ADD COLUMN vista_por          uuid REFERENCES usuarios(id),

  ADD COLUMN atualizado_em      timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN inconsistencias.impacto IS
  'Natureza do que fica comprometido. Separado da gravidade, que e urgencia.';
COMMENT ON COLUMN inconsistencias.impacto_valor IS
  'Diferenca monetaria entre os valores em conflito. Permite triagem por dinheiro em risco.';
COMMENT ON COLUMN inconsistencias.analise IS
  'O que se constatou. Distinto de decisao (o que se fez) e justificativa (por que).';

-- Requisito 8 e 13: triagem por gravidade e impacto.
CREATE INDEX ix_inconsistencias_impacto ON inconsistencias (impacto, gravidade);
CREATE INDEX ix_inconsistencias_competencia ON inconsistencias (competencia_ref);
CREATE INDEX ix_inconsistencias_data_ref ON inconsistencias (data_referencia);
CREATE INDEX ix_inconsistencias_bloqueantes ON inconsistencias (bloqueia_indicador)
  WHERE bloqueia_indicador = true AND status_revisao IN ('aberta', 'em_revisao');


-- ============================================================================
-- Requisito 12 — os valores originais sao IMUTAVEIS
--
-- Resolver uma inconsistencia registra analise, decisao e justificativa; nunca
-- reescreve o que as fontes disseram. Sem este gatilho, "preservar os dois
-- valores" seria apenas uma intencao.
-- ============================================================================
CREATE OR REPLACE FUNCTION proteger_valores_originais() RETURNS trigger AS $$
BEGIN
  IF NEW.valores_em_conflito IS DISTINCT FROM OLD.valores_em_conflito THEN
    RAISE EXCEPTION
      'valores_em_conflito e imutavel: a resolucao nao pode alterar o que as fontes informaram (inconsistencia %)',
      OLD.id;
  END IF;

  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    RAISE EXCEPTION 'tipo da inconsistencia e imutavel (inconsistencia %)', OLD.id;
  END IF;

  IF NEW.fonte IS DISTINCT FROM OLD.fonte THEN
    RAISE EXCEPTION 'fonte da inconsistencia e imutavel (inconsistencia %)', OLD.id;
  END IF;

  IF NEW.detectado_em IS DISTINCT FROM OLD.detectado_em THEN
    RAISE EXCEPTION 'detectado_em e imutavel (inconsistencia %)', OLD.id;
  END IF;

  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_inconsistencia_valores_imutaveis
  BEFORE UPDATE ON inconsistencias
  FOR EACH ROW EXECUTE FUNCTION proteger_valores_originais();


-- ============================================================================
-- Requisito 11 — historico completo de alteracoes
--
-- Tabela propria, append-only. Registra cada mudanca de estado, atribuicao,
-- analise e decisao, com quem fez e quando. Ficaria pobre dentro de um jsonb:
-- aqui da para consultar "tudo que a Cristiane resolveu em julho".
-- ============================================================================
CREATE TABLE inconsistencias_eventos (
  id                bigserial PRIMARY KEY,
  inconsistencia_id uuid NOT NULL REFERENCES inconsistencias(id) ON DELETE CASCADE,
  ocorrido_em       timestamptz NOT NULL DEFAULT now(),

  -- detectada, revisitada, atribuida, analisada, decidida, resolvida,
  -- descartada, reaberta, reincidencia, visualizada
  evento            text NOT NULL,

  usuario_id        uuid REFERENCES usuarios(id),
  usuario_nome      text,   -- desnormalizado: o historico sobrevive a exclusao

  status_antes      status_revisao,
  status_depois     status_revisao,
  responsavel_antes uuid REFERENCES usuarios(id),
  responsavel_depois uuid REFERENCES usuarios(id),

  -- Texto registrado neste evento, preservado como foi escrito.
  analise           text,
  decisao           text,
  justificativa     text,
  observacao        text,

  detalhe           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ix_inconsistencia_eventos_inc
  ON inconsistencias_eventos (inconsistencia_id, ocorrido_em);
CREATE INDEX ix_inconsistencia_eventos_usuario
  ON inconsistencias_eventos (usuario_id, ocorrido_em DESC);
CREATE INDEX ix_inconsistencia_eventos_tipo
  ON inconsistencias_eventos (evento, ocorrido_em DESC);

COMMENT ON TABLE inconsistencias_eventos IS
  'Append-only. UPDATE e DELETE bloqueados: o historico de tratamento nao se reescreve.';

CREATE OR REPLACE FUNCTION recusar_alteracao_evento_inconsistencia() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'inconsistencias_eventos e append-only: % nao e permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_evento_inconsistencia_imutavel
  BEFORE UPDATE OR DELETE ON inconsistencias_eventos
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao_evento_inconsistencia();


-- ============================================================================
-- Requisito 14 — chegar ao registro original de cada fonte
--
-- View que liga a inconsistencia aos payloads brutos das fontes envolvidas,
-- para abrir o registro original do Monday e o correspondente do Sienge sem
-- consultar as APIs de novo.
-- ============================================================================
CREATE VIEW inconsistencias_com_origem AS
SELECT
  i.id AS inconsistencia_id,
  v.fonte,
  v.id_origem,
  v.payload,
  v.extraido_em,
  v.escopo
FROM inconsistencias i
JOIN LATERAL jsonb_array_elements(i.valores_em_conflito) AS lado ON true
JOIN registros_brutos v
  ON v.fonte = (lado ->> 'fonte')::fonte_dado
 AND v.id_origem = (lado ->> 'id_origem');

COMMENT ON VIEW inconsistencias_com_origem IS
  'Liga cada lado do conflito ao payload bruto preservado na ingestao (requisito 14).';


-- Down Migration
DROP VIEW IF EXISTS inconsistencias_com_origem;
DROP TRIGGER IF EXISTS tg_evento_inconsistencia_imutavel ON inconsistencias_eventos;
DROP FUNCTION IF EXISTS recusar_alteracao_evento_inconsistencia();
DROP TABLE IF EXISTS inconsistencias_eventos;
DROP TRIGGER IF EXISTS tg_inconsistencia_valores_imutaveis ON inconsistencias;
DROP FUNCTION IF EXISTS proteger_valores_originais();
DROP INDEX IF EXISTS ix_inconsistencias_bloqueantes;
DROP INDEX IF EXISTS ix_inconsistencias_data_ref;
DROP INDEX IF EXISTS ix_inconsistencias_competencia;
DROP INDEX IF EXISTS ix_inconsistencias_impacto;
ALTER TABLE inconsistencias
  DROP COLUMN IF EXISTS atualizado_em,
  DROP COLUMN IF EXISTS vista_por,
  DROP COLUMN IF EXISTS visualizacoes,
  DROP COLUMN IF EXISTS data_referencia,
  DROP COLUMN IF EXISTS competencia_ref,
  DROP COLUMN IF EXISTS bloqueia_indicador,
  DROP COLUMN IF EXISTS justificativa,
  DROP COLUMN IF EXISTS decisao,
  DROP COLUMN IF EXISTS analise,
  DROP COLUMN IF EXISTS vinculo_id,
  DROP COLUMN IF EXISTS confianca_vinculo,
  DROP COLUMN IF EXISTS regra_vinculo,
  DROP COLUMN IF EXISTS impacto_valor,
  DROP COLUMN IF EXISTS impacto;
DROP TYPE IF EXISTS impacto_inconsistencia;
