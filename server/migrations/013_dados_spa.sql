-- Up Migration
-- ============================================================================
-- Inversao da fonte da verdade: o PostgreSQL passa a ser a base oficial da
-- interface, e nao mais uma copia do localStorage.
--
-- Tres coisas faltavam para isso:
--
--   1. CONTROLE DE CONCORRENCIA. O dump inteiro que a SPA enviava fazia a
--      ultima gravacao vencer em silencio. Com `versao`, uma edicao sobre
--      dado desatualizado e RECUSADA, nao aplicada por cima.
--
--   2. Colunas que a interface ja usava e o banco nao tinha (`tipo` do
--      empreendimento, evolucao mensal do comite). Sem elas, migrar a tela
--      significaria perder campo aprovado.
--
--   3. Indices para o recorte que toda tela faz: por comite, vivo.
-- ============================================================================

-- ── 1. Versao para controle otimista de concorrencia ────────────────────────
--
-- Em toda tabela de negocio, pelo registro em tabelas_de_negocio — nao por
-- lista escrita a mao, que envelheceria na proxima tabela criada.
DO $$
DECLARE
  v_tabela text;
BEGIN
  FOR v_tabela IN SELECT nome_tabela FROM tabelas_de_negocio ORDER BY nome_tabela LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1',
      v_tabela);
  END LOOP;
END;
$$;

-- O gatilho de trilha ja roda BEFORE UPDATE em todas elas e ja sabe quando
-- algo mudou de fato. Incrementar ali garante que `versao` so avanca com
-- alteracao real — reenviar o mesmo valor nao invalida a versao de ninguem.
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
    'em', now(),
    'execucao_id', NEW.execucao_id,
    'campos', v_mudou
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION registrar_alteracao IS
  'Acumula em historico o valor anterior de cada campo alterado e incrementa versao. Append-only.';


-- ── 2. Comites: versao e evolucao mensal ────────────────────────────────────
--
-- `comites` nao e tabela de negocio (nao carrega proveniencia: e recorte de
-- calendario, nao dado importado), mas a tela edita e por isso precisa do
-- mesmo controle de concorrencia.
ALTER TABLE comites
  ADD COLUMN versao integer NOT NULL DEFAULT 1,
  -- Series mensais consolidadas que a interface ja exibia e guardava no
  -- navegador (js/monday-sync.js:447 e :643). Sao APURACOES do mes, nao
  -- posicao acumulada: cada chave e 'AAAA-MM' com a contagem daquele mes.
  ADD COLUMN distratos_evolucao  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN notif_evolucao      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN notif_evolucao_empr jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN comites.distratos_evolucao IS
  'Movimentacao mensal (AAAA-MM -> quantidade). Nao e posicao: nao somar entre competencias.';

CREATE OR REPLACE FUNCTION versionar_comite() RETURNS trigger AS $$
BEGIN
  IF to_jsonb(OLD) - 'atualizado_em' - 'versao'
     IS DISTINCT FROM to_jsonb(NEW) - 'atualizado_em' - 'versao' THEN
    NEW.atualizado_em := now();
    NEW.versao := OLD.versao + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_versao_comites BEFORE UPDATE ON comites
  FOR EACH ROW EXECUTE FUNCTION versionar_comite();


-- ── 3. Campos que a interface ja usava ──────────────────────────────────────
--
-- 'tipo' e classificacao do ativo na tela de cadastro (Vertical, Horizontal,
-- Loteamento, Imobiliaria, Em constituicao). Nao se confunde com `status`,
-- que e o estagio comercial.
ALTER TABLE empreendimentos ADD COLUMN tipo text;

COMMENT ON COLUMN empreendimentos.tipo IS
  'Classificacao do ativo (Vertical, Horizontal, Loteamento...). Distinto de status, que e estagio comercial.';


-- ── 4. Indices do recorte que toda tela faz ─────────────────────────────────
--
-- Toda listagem e "deste comite, o que nao esta ausente". Sem indice parcial,
-- cada tela varre a tabela inteira.
CREATE INDEX ix_fatos_comite_vivo ON fatos (comite_id) WHERE ausente_desde IS NULL;
CREATE INDEX ix_riscos_comite_vivo ON riscos (comite_id) WHERE ausente_desde IS NULL;
CREATE INDEX ix_regulatorios_comite_vivo ON regulatorios (comite_id) WHERE ausente_desde IS NULL;
CREATE INDEX ix_notificacoes_comite_vivo ON notificacoes (comite_id) WHERE ausente_desde IS NULL;
CREATE INDEX ix_distratos_comite_vivo ON distratos (comite_id, categoria) WHERE ausente_desde IS NULL;
CREATE INDEX ix_processos_comite_vivo ON processos_judiciais (comite_id) WHERE ausente_desde IS NULL;
CREATE INDEX ix_unidades_empr_vivo ON unidades (empreendimento_id) WHERE ausente_desde IS NULL;
CREATE INDEX ix_empreendimentos_vivo ON empreendimentos (nome) WHERE ausente_desde IS NULL;


-- Down Migration
DROP INDEX IF EXISTS ix_empreendimentos_vivo;
DROP INDEX IF EXISTS ix_unidades_empr_vivo;
DROP INDEX IF EXISTS ix_processos_comite_vivo;
DROP INDEX IF EXISTS ix_distratos_comite_vivo;
DROP INDEX IF EXISTS ix_notificacoes_comite_vivo;
DROP INDEX IF EXISTS ix_regulatorios_comite_vivo;
DROP INDEX IF EXISTS ix_riscos_comite_vivo;
DROP INDEX IF EXISTS ix_fatos_comite_vivo;
ALTER TABLE empreendimentos DROP COLUMN IF EXISTS tipo;
DROP TRIGGER IF EXISTS tg_versao_comites ON comites;
DROP FUNCTION IF EXISTS versionar_comite();
ALTER TABLE comites
  DROP COLUMN IF EXISTS notif_evolucao_empr,
  DROP COLUMN IF EXISTS notif_evolucao,
  DROP COLUMN IF EXISTS distratos_evolucao,
  DROP COLUMN IF EXISTS versao;
DO $$
DECLARE
  v_tabela text;
BEGIN
  FOR v_tabela IN SELECT nome_tabela FROM tabelas_de_negocio LOOP
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS versao', v_tabela);
  END LOOP;
END;
$$;
