-- Up Migration
-- ============================================================================
-- Base: tipos do dominio, proveniencia e versionamento de regras.
--
-- Referencias: references/patrono-modelo-dados.md, schemas/*.json,
--              HANDOFF-CLAUDE-CODE.md (secao "Regras que nao podem ser violadas")
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ── Fontes de dado ──────────────────────────────────────────────────────────
-- 'cvcrm' esta previsto no tipo mas o conector nao e implementado na Fase 1.
-- 'migracao' identifica o que veio do localStorage; 'consolidacao' identifica o
-- que foi produzido pelo proprio motor de relacionamento.
CREATE TYPE fonte_dado AS ENUM (
  'monday', 'sienge', 'cvcrm', 'manual', 'migracao', 'consolidacao'
);

-- ── Relacionamento entre fontes ─────────────────────────────────────────────
-- Ordem de prioridade em references/relacionamento-dados.md.
CREATE TYPE regra_vinculo AS ENUM (
  'cpf_cnpj',        -- 1. documento validado por digito verificador
  'contrato',        -- 2. numero do contrato
  'empr_unidade',    -- 3. empreendimento + unidade
  'id_reserva',      -- 4. identificadores relacionados
  'id_unidade',
  'id_notificacao',
  'id_relacionado',
  'nome',            -- 5. nome completo normalizado, ultimo recurso
  'sem_vinculo'
);

CREATE TYPE confianca_vinculo AS ENUM ('alta', 'media', 'baixa');

-- ── Perfis e escopo de acesso ───────────────────────────────────────────────
-- Eixo hierarquico, conforme Documentacao_Claude_Design e o escopo da Fase 1.
CREATE TYPE perfil_usuario AS ENUM (
  'diretoria', 'gestora', 'lider', 'colaborador', 'administrador', 'convidado'
);

CREATE TYPE status_usuario AS ENUM ('ativo', 'pendente', 'inativo');

-- Eixo de area funcional, conforme references/patrono-seguranca.md.
CREATE TYPE area_organizacional AS ENUM (
  'juridico', 'ti', 'financeiro', 'comercial', 'obras', 'diretoria'
);

-- Areas de navegacao (1b do Diagnostico e Wireframes).
CREATE TYPE modulo_plataforma AS ENUM (
  'visao_geral', 'equipe', 'juridico', 'empreendimentos', 'inteligencia', 'administracao'
);

-- Autorizacao por tipo de informacao, exigida no escopo da Fase 1.
CREATE TYPE tipo_informacao AS ENUM (
  'dado_pessoal', 'valor_financeiro', 'situacao_juridica', 'documento', 'desempenho_individual'
);

CREATE TYPE acao_permissao AS ENUM ('ler', 'criar', 'editar', 'remover', 'exportar', 'executar');

-- ── Integracao ──────────────────────────────────────────────────────────────
-- Os nove estados de integracao definidos em 3f do Diagnostico e Wireframes.
CREATE TYPE estado_integracao AS ENUM (
  'conectada', 'sincronizando', 'concluida', 'parcial',
  'desatualizada', 'desconectada', 'erro', 'demonstrativo', 'inconsistente'
);

CREATE TYPE status_execucao AS ENUM ('em_andamento', 'sucesso', 'parcial', 'erro');

-- ── Inconsistencias ─────────────────────────────────────────────────────────
-- Os 17 tipos de schemas/inconsistencias.schema.json, mais tres extensoes
-- documentadas: o schema da skill nao cobre a divergencia Monday x Sienge, que
-- e justamente o caso desenhado em 3d (contrato C-1042), nem a falha de
-- importacao. Extensoes marcadas com [EXT].
CREATE TYPE tipo_inconsistencia AS ENUM (
  'cliente_sem_identificacao',
  'cpf_cnpj_invalido',
  'contrato_ausente',
  'unidade_ausente',
  'empreendimento_ausente',
  'duplicidade',
  'vinculo_ambiguo',
  'grafia_divergente',
  'contrato_divergente',
  'saldo_duplicado',
  'conflito_datas',
  'conflito_monday_cvcrm',
  'conflito_cvcrm_sienge',
  'ausencia_carteira_referencia',
  'ausencia_percentual_perda',
  'processo_sem_notificacao',
  'acordo_sem_confirmacao',
  'conflito_monday_sienge',   -- [EXT] divergencia de valor entre as duas fontes
  'divergencia_valor',        -- [EXT] divergencia generica preservando os dois lados
  'falha_importacao'          -- [EXT] fonte falhou; ultimo dado valido preservado
);

CREATE TYPE gravidade_inconsistencia AS ENUM ('baixa', 'media', 'alta', 'critica');

CREATE TYPE status_revisao AS ENUM ('aberta', 'em_revisao', 'resolvida', 'ignorada');

-- ── Historico e indicadores ─────────────────────────────────────────────────
-- A distincao mais importante do produto: posicao nao se soma entre dias.
CREATE TYPE tipo_indicador AS ENUM ('posicao', 'movimentacao');

CREATE TYPE unidade_medida AS ENUM ('quantidade', 'percentual', 'reais');

CREATE TYPE status_fotografia AS ENUM (
  'sucesso', 'parcial', 'erro', 'sem_atualizacao', 'recalculado', 'corrigido_manual'
);

CREATE TYPE escopo_indicador AS ENUM ('geral', 'empreendimento');

-- ── Financeiro ──────────────────────────────────────────────────────────────
CREATE TYPE tipo_carteira AS ENUM (
  'carteira_ativa_exigivel', 'vgv', 'saldo_contratual', 'contas_receber'
);

CREATE TYPE faixa_atraso AS ENUM ('1-30', '31-60', '61-90', '91-120', '>120');


-- ============================================================================
-- Versionamento de regras
--
-- Toda fotografia e todo indicador guardam a versao da regra vigente na
-- apuracao. Consultar o passado devolve o resultado calculado pela regra da
-- epoca — nunca recalculado silenciosamente com a regra atual.
-- ============================================================================
CREATE TABLE versoes_regras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versao          text NOT NULL UNIQUE,
  descricao       text NOT NULL,
  vigente_de      date NOT NULL,
  vigente_ate     date,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT versao_vigencia_coerente CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de)
);

COMMENT ON TABLE versoes_regras IS
  'Versoes da metodologia de calculo. Fotografias antigas mantem a regra da epoca.';


-- ============================================================================
-- Proveniencia
--
-- Aplicada por funcao, nao copiada a mao, para que nenhuma tabela de negocio
-- entre no banco sem os campos obrigatorios. Um teste automatizado verifica que
-- toda tabela marcada como de negocio tem todas estas colunas.
-- ============================================================================
CREATE TABLE tabelas_de_negocio (
  nome_tabela text PRIMARY KEY,
  registrada_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tabelas_de_negocio IS
  'Registro das tabelas que devem carregar proveniencia completa. Base do teste de conformidade.';

CREATE OR REPLACE FUNCTION aplicar_proveniencia(p_tabela text) RETURNS void AS $$
BEGIN
  EXECUTE format($f$
    ALTER TABLE %I
      -- de onde veio
      ADD COLUMN fonte              fonte_dado  NOT NULL,
      ADD COLUMN id_origem          text,
      -- o que veio, cru e normalizado; o original nunca e sobrescrito
      ADD COLUMN valor_original     jsonb,
      ADD COLUMN valor_normalizado  jsonb,
      -- as tres datas ficam separadas: extracao, referencia e fato
      ADD COLUMN extraido_em        timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN data_referencia    date,
      ADD COLUMN data_fato          date,
      -- como foi relacionado e com que confianca
      ADD COLUMN regra_vinculo      regra_vinculo,
      ADD COLUMN confianca_vinculo  confianca_vinculo,
      -- rastreabilidade de apuracao e de carga
      ADD COLUMN versao_regra       text,
      ADD COLUMN execucao_id        uuid,
      -- trilha append-only de alteracoes deste registro
      ADD COLUMN historico          jsonb NOT NULL DEFAULT '[]'::jsonb,
      -- registro visto na ultima carga? ausencia NAO apaga, apenas marca
      ADD COLUMN ausente_desde      timestamptz,
      -- dado demonstrativo nunca se mistura a dado real
      ADD COLUMN demonstrativo      boolean NOT NULL DEFAULT false,
      ADD COLUMN criado_em          timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN atualizado_em      timestamptz NOT NULL DEFAULT now()
  $f$, p_tabela);

  -- Upsert idempotente por construcao, nao por disciplina do programador.
  EXECUTE format(
    'CREATE UNIQUE INDEX %I ON %I (fonte, id_origem) WHERE id_origem IS NOT NULL',
    'ux_' || p_tabela || '_fonte_origem', p_tabela);

  EXECUTE format(
    'CREATE INDEX %I ON %I (data_referencia)',
    'ix_' || p_tabela || '_data_referencia', p_tabela);

  EXECUTE format(
    'CREATE INDEX %I ON %I (execucao_id)',
    'ix_' || p_tabela || '_execucao', p_tabela);

  INSERT INTO tabelas_de_negocio (nome_tabela) VALUES (p_tabela)
    ON CONFLICT (nome_tabela) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aplicar_proveniencia IS
  'Adiciona as colunas de proveniencia obrigatorias e os indices de idempotencia.';


-- ============================================================================
-- Trilha de alteracao (append-only)
--
-- Nenhuma alteracao relevante passa sem registro. O gatilho acumula em
-- historico o valor anterior dos campos que mudaram — e por isso que
-- "divergencia preserva os dois valores" e verificavel depois do fato.
-- ============================================================================
CREATE OR REPLACE FUNCTION registrar_alteracao() RETURNS trigger AS $$
DECLARE
  v_antes jsonb;
  v_depois jsonb;
  v_mudou jsonb := '{}'::jsonb;
  v_chave text;
BEGIN
  v_antes  := to_jsonb(OLD) - 'historico' - 'atualizado_em';
  v_depois := to_jsonb(NEW) - 'historico' - 'atualizado_em';

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
  NEW.historico := OLD.historico || jsonb_build_object(
    'em', now(),
    'execucao_id', NEW.execucao_id,
    'campos', v_mudou
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION aplicar_trilha(p_tabela text) RETURNS void AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION registrar_alteracao()',
    'tg_trilha_' || p_tabela, p_tabela);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION registrar_alteracao IS
  'Acumula em historico o valor anterior de cada campo alterado. Append-only.';


-- Down Migration
DROP FUNCTION IF EXISTS aplicar_trilha(text);
DROP FUNCTION IF EXISTS registrar_alteracao();
DROP FUNCTION IF EXISTS aplicar_proveniencia(text);
DROP TABLE IF EXISTS tabelas_de_negocio;
DROP TABLE IF EXISTS versoes_regras;

DROP TYPE IF EXISTS faixa_atraso;
DROP TYPE IF EXISTS tipo_carteira;
DROP TYPE IF EXISTS escopo_indicador;
DROP TYPE IF EXISTS status_fotografia;
DROP TYPE IF EXISTS unidade_medida;
DROP TYPE IF EXISTS tipo_indicador;
DROP TYPE IF EXISTS status_revisao;
DROP TYPE IF EXISTS gravidade_inconsistencia;
DROP TYPE IF EXISTS tipo_inconsistencia;
DROP TYPE IF EXISTS status_execucao;
DROP TYPE IF EXISTS estado_integracao;
DROP TYPE IF EXISTS acao_permissao;
DROP TYPE IF EXISTS tipo_informacao;
DROP TYPE IF EXISTS modulo_plataforma;
DROP TYPE IF EXISTS area_organizacional;
DROP TYPE IF EXISTS status_usuario;
DROP TYPE IF EXISTS perfil_usuario;
DROP TYPE IF EXISTS confianca_vinculo;
DROP TYPE IF EXISTS regra_vinculo;
DROP TYPE IF EXISTS fonte_dado;
DROP EXTENSION IF EXISTS citext;
DROP EXTENSION IF EXISTS pgcrypto;
