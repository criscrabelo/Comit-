-- Up Migration
-- ============================================================================
-- `versao` e `historico` passam a ignorar metadado de CARGA.
--
-- O defeito, encontrado na homologacao controlada do Monday: `extraido_em`,
-- `execucao_id` e `versao_regra` mudam a cada sincronizacao, mesmo quando o
-- dado nao muda. O gatilho os via como alteracao e, a cada carga:
--
--   - incrementava `versao` de TODO registro lido;
--   - anexava uma entrada de historico dizendo apenas que a hora de extracao
--     mudou.
--
-- Depois de trinta dias de carga diaria, todo registro estaria na versao 31 com
-- trinta entradas de historico sem informacao nenhuma. Pior: `versao` deixaria
-- de significar "o dado mudou", e o controle otimista de concorrencia da
-- interface passaria a recusar edicoes legitimas — a versao teria avancado
-- durante a noite, sem ninguem ter editado nada.
--
-- A regra correta: `versao` e `historico` descrevem o CONTEUDO do registro.
-- Quando ele foi lido, por qual execucao e sob qual versao de regra descrevem a
-- CARGA — ficam nas colunas, continuam auditaveis, e nao contam como alteracao.
--
-- `valor_original` continua contando: se o payload da origem mudou, o registro
-- de origem mudou de fato, e isso e informacao.
-- ============================================================================

CREATE OR REPLACE FUNCTION registrar_alteracao() RETURNS trigger AS $$
DECLARE
  v_antes jsonb;
  v_depois jsonb;
  v_mudou jsonb := '{}'::jsonb;
  v_chave text;
BEGIN
  -- Excluidos da comparacao:
  --   historico, atualizado_em, versao  — saida do proprio gatilho
  --   extraido_em, execucao_id, versao_regra — metadado de carga
  v_antes  := to_jsonb(OLD) - 'historico' - 'atualizado_em' - 'versao'
              - 'extraido_em' - 'execucao_id' - 'versao_regra';
  v_depois := to_jsonb(NEW) - 'historico' - 'atualizado_em' - 'versao'
              - 'extraido_em' - 'execucao_id' - 'versao_regra';

  FOR v_chave IN SELECT jsonb_object_keys(v_depois) LOOP
    IF v_antes -> v_chave IS DISTINCT FROM v_depois -> v_chave THEN
      v_mudou := v_mudou || jsonb_build_object(
        v_chave, jsonb_build_object('de', v_antes -> v_chave, 'para', v_depois -> v_chave)
      );
    END IF;
  END LOOP;

  IF v_mudou = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  NEW.atualizado_em := now();
  NEW.versao := OLD.versao + 1;
  NEW.historico := OLD.historico || jsonb_build_object(
    'em', now(),
    'execucao_id', NEW.execucao_id,
    'campos', v_mudou
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION registrar_alteracao IS
  'Trilha e versao por CONTEUDO. Metadado de carga (extraido_em, execucao_id, versao_regra) nao conta como alteracao.';


-- ============================================================================
-- Contador de INALTERADOS.
--
-- `atualizados` contava toda linha que passou pelo caminho de conflito do
-- upsert — ou seja, o conjunto inteiro a cada re-sincronizacao. O relatorio
-- diria "31 atualizados" todo dia, mesmo sem nada ter mudado, e a metrica nao
-- distinguiria carga que corrigiu algo de carga que so releu.
--
-- Agora `atualizados` conta o que MUDOU de fato, e `inalterados` conta o que
-- foi reconhecido e nao precisou de alteracao. A contabilidade continua
-- fechando: lidos = incluidos + atualizados + inalterados + ignorados +
-- duplicados + com_erro.
-- ============================================================================
ALTER TABLE execucoes_importacao
  ADD COLUMN inalterados integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT execucao_inalterados_nao_negativo CHECK (inalterados >= 0);

COMMENT ON COLUMN execucoes_importacao.inalterados IS
  'Registros reconhecidos pelo upsert que nao precisaram de alteracao. Evidencia de idempotencia.';


-- Down Migration
ALTER TABLE execucoes_importacao
  DROP CONSTRAINT IF EXISTS execucao_inalterados_nao_negativo,
  DROP COLUMN IF EXISTS inalterados;

CREATE OR REPLACE FUNCTION registrar_alteracao() RETURNS trigger AS $$
DECLARE
  v_antes jsonb;
  v_depois jsonb;
  v_mudou jsonb := '{}'::jsonb;
  v_chave text;
BEGIN
  v_antes  := to_jsonb(OLD) - 'historico' - 'atualizado_em' - 'versao';
  v_depois := to_jsonb(NEW) - 'historico' - 'atualizado_em' - 'versao';

  FOR v_chave IN SELECT jsonb_object_keys(v_depois) LOOP
    IF v_antes -> v_chave IS DISTINCT FROM v_depois -> v_chave THEN
      v_mudou := v_mudou || jsonb_build_object(
        v_chave, jsonb_build_object('de', v_antes -> v_chave, 'para', v_depois -> v_chave)
      );
    END IF;
  END LOOP;

  IF v_mudou = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  NEW.atualizado_em := now();
  NEW.versao := OLD.versao + 1;
  NEW.historico := OLD.historico || jsonb_build_object(
    'em', now(), 'execucao_id', NEW.execucao_id, 'campos', v_mudou
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
