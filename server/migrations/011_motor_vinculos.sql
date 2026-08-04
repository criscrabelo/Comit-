-- Up Migration
-- ============================================================================
-- Motor de relacionamento: persistencia dos vinculos.
--
-- A tabela `vinculos_fontes` foi criada na 004 com o essencial. Aqui recebe o
-- que os requisitos exigem: score, criterios atendidos e conflitantes, situacao,
-- e o registro da decisao humana posterior.
--
-- Principio: o vinculo NAO e um fato, e uma HIPOTESE com grau de confianca. Por
-- isso guarda como foi formado, o que sustentou e o que contrariou — para que
-- alguem possa discordar depois com base no mesmo material.
-- ============================================================================

ALTER TABLE vinculos_fontes
  ADD COLUMN situacao          situacao_vinculo NOT NULL DEFAULT 'sugerido',

  -- Score de 0 a 100. Nao substitui os criterios: e um resumo deles, para
  -- ordenar a fila de revisao.
  ADD COLUMN score             integer,

  -- Criterios que somaram e criterios que contrariaram, cada um com o peso e o
  -- valor comparado. E o que torna a confianca AUDITAVEL em vez de opaca.
  ADD COLUMN criterios_atendidos    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN criterios_conflitantes jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Motivo do bloqueio automatico, quando houver.
  ADD COLUMN bloqueio          text,

  -- Registros comparados, com fonte e id_origem de cada lado, preservados.
  ADD COLUMN registros_comparados jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ── Decisao humana posterior ──
  ADD COLUMN decidido_por      uuid REFERENCES usuarios(id),
  ADD COLUMN decidido_em       timestamptz,
  ADD COLUMN decisao_humana    text,
  ADD COLUMN justificativa     text,
  -- Quando o humano escolhe entre candidatos, qual foi o escolhido.
  ADD COLUMN candidato_escolhido text,

  -- Vinculo desfeito aponta para o que o substituiu, se houver.
  ADD COLUMN desfeito_em       timestamptz,
  ADD COLUMN substituido_por   uuid REFERENCES vinculos_fontes(id),

  ADD COLUMN atualizado_em     timestamptz NOT NULL DEFAULT now(),

  ADD CONSTRAINT score_intervalo CHECK (score IS NULL OR (score >= 0 AND score <= 100)),

  -- Decisao humana exige autor, data e justificativa juntos.
  ADD CONSTRAINT decisao_humana_completa CHECK (
    (decidido_por IS NULL AND decidido_em IS NULL AND decisao_humana IS NULL)
    OR (decidido_por IS NOT NULL AND decidido_em IS NOT NULL
        AND decisao_humana IS NOT NULL AND justificativa IS NOT NULL)
  ),

  -- Bloqueado exige o motivo declarado. "Nao vinculei" sem dizer por que seria
  -- inutil para quem revisa.
  ADD CONSTRAINT bloqueio_justificado CHECK (
    situacao <> 'bloqueado' OR bloqueio IS NOT NULL
  );

COMMENT ON COLUMN vinculos_fontes.criterios_atendidos IS
  'Cada criterio com nome, peso e os valores comparados. Torna a confianca auditavel.';
COMMENT ON COLUMN vinculos_fontes.criterios_conflitantes IS
  'Criterios que contrariaram o vinculo. Presenca de conflito impede vinculo automatico.';
COMMENT ON COLUMN vinculos_fontes.situacao IS
  'automatico=alta | sugerido=media | recusado=baixa | ambiguo | bloqueado | aceito | rejeitado | desfeito';

CREATE INDEX ix_vinculos_situacao ON vinculos_fontes (situacao, criado_em DESC);
CREATE INDEX ix_vinculos_revisao ON vinculos_fontes (situacao)
  WHERE situacao IN ('sugerido', 'ambiguo');
CREATE INDEX ix_vinculos_score ON vinculos_fontes (score DESC NULLS LAST);

-- O indice unico da 004 impede dois vinculos para o mesmo par. Mas um vinculo
-- DESFEITO precisa poder conviver com o novo que o substituiu, senao a correcao
-- formal seria impossivel sem apagar o historico.
DROP INDEX IF EXISTS ux_vinculo_par;
CREATE UNIQUE INDEX ux_vinculo_par_vigente
  ON vinculos_fontes (entidade, fonte_a, id_origem_a, fonte_b, id_origem_b)
  WHERE situacao <> 'desfeito';


-- ============================================================================
-- Historico do vinculo (append-only)
--
-- Requisito: "desfazer vinculo por correcao formal, preservando historico".
-- Cada transicao fica registrada com autor, data e justificativa.
-- ============================================================================
CREATE TABLE vinculos_eventos (
  id              bigserial PRIMARY KEY,
  vinculo_id      uuid NOT NULL REFERENCES vinculos_fontes(id) ON DELETE CASCADE,
  ocorrido_em     timestamptz NOT NULL DEFAULT now(),

  -- proposto, aceito, rejeitado, escolhido, desfeito, rebloqueado, reavaliado
  evento          text NOT NULL,

  usuario_id      uuid REFERENCES usuarios(id),
  usuario_nome    text,

  situacao_antes  situacao_vinculo,
  situacao_depois situacao_vinculo,
  score_antes     integer,
  score_depois    integer,

  justificativa   text,
  detalhe         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ix_vinculos_eventos_vinculo ON vinculos_eventos (vinculo_id, ocorrido_em);
CREATE INDEX ix_vinculos_eventos_usuario ON vinculos_eventos (usuario_id, ocorrido_em DESC);

COMMENT ON TABLE vinculos_eventos IS
  'Append-only. UPDATE e DELETE bloqueados: desfazer vinculo preserva historico.';

CREATE OR REPLACE FUNCTION recusar_alteracao_evento_vinculo() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vinculos_eventos e append-only: % nao e permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_evento_vinculo_imutavel
  BEFORE UPDATE OR DELETE ON vinculos_eventos
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao_evento_vinculo();


-- ============================================================================
-- Como o vinculo foi formado tambem e imutavel
--
-- Aceitar ou rejeitar registra a decisao; nao reescreve o que o motor apurou.
-- Sem isso, "score 85 com estes criterios" poderia ser editado depois para
-- justificar uma decisao ja tomada.
-- ============================================================================
CREATE OR REPLACE FUNCTION proteger_apuracao_vinculo() RETURNS trigger AS $$
BEGIN
  IF NEW.regra IS DISTINCT FROM OLD.regra
     OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.criterios_atendidos IS DISTINCT FROM OLD.criterios_atendidos
     OR NEW.criterios_conflitantes IS DISTINCT FROM OLD.criterios_conflitantes
     OR NEW.registros_comparados IS DISTINCT FROM OLD.registros_comparados
     OR NEW.fonte_a IS DISTINCT FROM OLD.fonte_a
     OR NEW.id_origem_a IS DISTINCT FROM OLD.id_origem_a
     OR NEW.fonte_b IS DISTINCT FROM OLD.fonte_b
     OR NEW.id_origem_b IS DISTINCT FROM OLD.id_origem_b
     OR NEW.versao_regra IS DISTINCT FROM OLD.versao_regra
  THEN
    RAISE EXCEPTION
      'a apuracao do vinculo e imutavel: reprocessar deve criar um vinculo novo, nao reescrever o anterior (vinculo %)',
      OLD.id;
  END IF;

  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_vinculo_apuracao_imutavel
  BEFORE UPDATE ON vinculos_fontes
  FOR EACH ROW EXECUTE FUNCTION proteger_apuracao_vinculo();


-- ============================================================================
-- Versao da regra de relacionamento
-- ============================================================================
INSERT INTO versoes_regras (versao, descricao, vigente_de) VALUES (
  'vinculo-1.0.0',
  'Motor de relacionamento Monday x Sienge: 5 niveis de chave, score 0-100, '
  || 'confianca alta>=60 / media>=25 / baixa<25, 11 bloqueios automaticos, '
  || 'comparacao financeira condicionada a data de referencia e natureza do valor',
  CURRENT_DATE
) ON CONFLICT (versao) DO NOTHING;


-- Down Migration
DROP TRIGGER IF EXISTS tg_vinculo_apuracao_imutavel ON vinculos_fontes;
DROP FUNCTION IF EXISTS proteger_apuracao_vinculo();
DROP TRIGGER IF EXISTS tg_evento_vinculo_imutavel ON vinculos_eventos;
DROP FUNCTION IF EXISTS recusar_alteracao_evento_vinculo();
DROP TABLE IF EXISTS vinculos_eventos;
DROP INDEX IF EXISTS ux_vinculo_par_vigente;
DROP INDEX IF EXISTS ix_vinculos_score;
DROP INDEX IF EXISTS ix_vinculos_revisao;
DROP INDEX IF EXISTS ix_vinculos_situacao;
ALTER TABLE vinculos_fontes
  DROP CONSTRAINT IF EXISTS bloqueio_justificado,
  DROP CONSTRAINT IF EXISTS decisao_humana_completa,
  DROP CONSTRAINT IF EXISTS score_intervalo,
  DROP COLUMN IF EXISTS atualizado_em,
  DROP COLUMN IF EXISTS substituido_por,
  DROP COLUMN IF EXISTS desfeito_em,
  DROP COLUMN IF EXISTS candidato_escolhido,
  DROP COLUMN IF EXISTS justificativa,
  DROP COLUMN IF EXISTS decisao_humana,
  DROP COLUMN IF EXISTS decidido_em,
  DROP COLUMN IF EXISTS decidido_por,
  DROP COLUMN IF EXISTS registros_comparados,
  DROP COLUMN IF EXISTS bloqueio,
  DROP COLUMN IF EXISTS criterios_conflitantes,
  DROP COLUMN IF EXISTS criterios_atendidos,
  DROP COLUMN IF EXISTS score,
  DROP COLUMN IF EXISTS situacao;
CREATE UNIQUE INDEX ux_vinculo_par
  ON vinculos_fontes (entidade, fonte_a, id_origem_a, fonte_b, id_origem_b);
DELETE FROM versoes_regras WHERE versao = 'vinculo-1.0.0';
