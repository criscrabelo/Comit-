-- Up Migration
-- ============================================================================
-- Historico: fotografias, indicadores, memoria de calculo e metas.
--
-- Tres regras obrigatorias materializadas:
--   1. Reprocessamento cria NOVA VERSAO — a fotografia original e preservada.
--   2. Indicador de POSICAO nao pode ser somado entre dias — o tipo esta na
--      propria linha, e a funcao de agregacao recusa somar posicao.
--   3. Nao recalcular o passado com a regra atual — cada fotografia guarda a
--      versao_regra e a meta vigente NAQUELA data.
-- ============================================================================

CREATE TABLE fotografias_diarias (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia       date NOT NULL,
  modulo                modulo_plataforma NOT NULL DEFAULT 'juridico',
  escopo                escopo_indicador NOT NULL DEFAULT 'geral',
  empreendimento_id     uuid REFERENCES empreendimentos(id),
  indicador             text NOT NULL,
  tipo_indicador        tipo_indicador NOT NULL,

  valor_numerico        numeric(20,4),
  valor_monetario       numeric(18,2),
  numerador             numeric(20,4),
  denominador           numeric(20,4),
  unidade_medida        unidade_medida,

  versao_regra          text NOT NULL,
  -- Reprocessamento incrementa a versao; a anterior continua existindo com
  -- vigente=false. Nunca substitui.
  versao_fotografia     integer NOT NULL DEFAULT 1,
  vigente               boolean NOT NULL DEFAULT true,
  motivo_reprocessamento text,
  reprocessado_por      uuid REFERENCES usuarios(id),

  status_fotografia     status_fotografia NOT NULL,
  fontes                text[] NOT NULL DEFAULT '{}',
  data_extracao_monday  timestamptz,
  data_extracao_sienge  timestamptz,
  data_extracao_cvcrm   timestamptz,
  data_processamento    timestamptz NOT NULL DEFAULT now(),

  quantidade_registros  integer,
  quantidade_excluidos  integer,
  motivo_exclusoes      text,
  -- Meta em vigor NA data_referencia, nao a meta de hoje.
  meta_vigente          numeric(20,4),

  memoria_id            uuid,
  execucao_id           uuid REFERENCES execucoes_importacao(id),
  criado_em             timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (id, data_referencia),
  CONSTRAINT fotografia_versao_positiva CHECK (versao_fotografia >= 1),
  CONSTRAINT fotografia_reprocessamento_justificado CHECK (
    versao_fotografia = 1 OR motivo_reprocessamento IS NOT NULL
  )
) PARTITION BY RANGE (data_referencia);

COMMENT ON TABLE fotografias_diarias IS
  'Particionada por ano. Retencao minima de 20 anos contada da data_referencia de cada linha.';
COMMENT ON COLUMN fotografias_diarias.tipo_indicador IS
  'posicao = situacao numa data, NUNCA somar entre dias. movimentacao = soma eventos unicos.';

CREATE TABLE fotografias_diarias_2026 PARTITION OF fotografias_diarias
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE fotografias_diarias_2027 PARTITION OF fotografias_diarias
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE fotografias_diarias_historico PARTITION OF fotografias_diarias
  FOR VALUES FROM (MINVALUE) TO ('2026-01-01');

-- Uma fotografia vigente por indicador, escopo e data. Reprocessar desliga a
-- anterior e insere a nova versao.
CREATE UNIQUE INDEX ux_fotografia_vigente ON fotografias_diarias (
  data_referencia, indicador, escopo,
  coalesce(empreendimento_id, '00000000-0000-0000-0000-000000000000'::uuid)
) WHERE vigente = true;

CREATE UNIQUE INDEX ux_fotografia_versao ON fotografias_diarias (
  data_referencia, indicador, escopo,
  coalesce(empreendimento_id, '00000000-0000-0000-0000-000000000000'::uuid),
  versao_fotografia
);

CREATE INDEX ix_fotografia_indicador ON fotografias_diarias (indicador, data_referencia DESC);

-- Fotografia e registro historico: nao se apaga.
CREATE OR REPLACE FUNCTION recusar_exclusao_fotografia() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'fotografias_diarias nao pode ser excluida: reprocessamento cria nova versao';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_fotografia_sem_exclusao
  BEFORE DELETE ON fotografias_diarias
  FOR EACH ROW EXECUTE FUNCTION recusar_exclusao_fotografia();


-- ============================================================================
-- Memoria de calculo — todo indicador tem de poder ser aberto
--
-- "Nao criar painel sem rastreabilidade" (references/patrono-interface.md).
-- ============================================================================
CREATE TABLE memorias_calculo (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador             text NOT NULL,
  escopo                escopo_indicador NOT NULL DEFAULT 'geral',
  empreendimento_id     uuid REFERENCES empreendimentos(id),
  formula               text NOT NULL,
  numerador             numeric(20,4),
  denominador           numeric(20,4),
  resultado             numeric(20,4),
  unidade_medida        unidade_medida,
  registros_considerados integer,
  registros_excluidos   integer,
  motivo_exclusoes      text,
  fontes                text[] NOT NULL DEFAULT '{}',
  -- Identificadores dos registros que formaram o resultado, para abrir a lista.
  registros_formadores  jsonb NOT NULL DEFAULT '[]'::jsonb,
  extraido_em           timestamptz,
  data_referencia       date NOT NULL,
  versao_regra          text NOT NULL,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_memoria_indicador ON memorias_calculo (indicador, data_referencia DESC);


-- ============================================================================
-- Indicadores calculados (visao corrente, derivada da fotografia vigente)
-- ============================================================================
CREATE TABLE indicadores_calculados (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo            escopo_indicador NOT NULL,
  empreendimento_id uuid REFERENCES empreendimentos(id),
  indicador         text NOT NULL,
  tipo_indicador    tipo_indicador NOT NULL,
  valor             numeric(20,4),
  unidade_medida    unidade_medida,
  data_referencia   date NOT NULL,
  versao_regra      text NOT NULL,
  memoria_id        uuid REFERENCES memorias_calculo(id),
  -- Sem dado nao e zero. O motivo e obrigatorio quando nao houver valor.
  sem_dado_motivo   text,
  estado_fonte      estado_integracao NOT NULL DEFAULT 'conectada',
  calculado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT indicador_valor_ou_motivo CHECK (
    valor IS NOT NULL OR sem_dado_motivo IS NOT NULL
  )
);

CREATE UNIQUE INDEX ux_indicador_corrente ON indicadores_calculados (
  indicador, escopo,
  coalesce(empreendimento_id, '00000000-0000-0000-0000-000000000000'::uuid),
  data_referencia
);

COMMENT ON CONSTRAINT indicador_valor_ou_motivo ON indicadores_calculados IS
  'Ou existe valor, ou existe motivo declarado. Nunca exibir zero por ausencia de dado.';


-- ============================================================================
-- Metas com vigencia
--
-- Comparar com "a meta vigente no periodo", nao com a meta de hoje (2b).
-- ============================================================================
CREATE TABLE metas_historicas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador         text NOT NULL,
  escopo            escopo_indicador NOT NULL DEFAULT 'geral',
  empreendimento_id uuid REFERENCES empreendimentos(id),
  valor_meta        numeric(20,4) NOT NULL,
  comparador        text NOT NULL DEFAULT 'menor_igual',
  vigente_de        date NOT NULL,
  vigente_ate       date,
  definida_por      uuid REFERENCES usuarios(id),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_comparador_valido CHECK (comparador IN ('menor_igual','maior_igual','igual')),
  CONSTRAINT meta_vigencia CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de)
);

CREATE INDEX ix_metas_indicador ON metas_historicas (indicador, vigente_de DESC);


-- ============================================================================
-- Guarda contra somar posicao
--
-- A regra mais violada do produto ("e o erro mais comum em acumulado"). Aqui ela
-- vira funcao: agregar posicao por soma levanta excecao.
-- ============================================================================
CREATE OR REPLACE FUNCTION agregar_indicador(
  p_indicador   text,
  p_de          date,
  p_ate         date,
  p_metodo      text,                -- 'soma' | 'fechamento' | 'media' | 'maior' | 'menor'
  p_escopo      escopo_indicador DEFAULT 'geral',
  p_empr        uuid DEFAULT NULL
) RETURNS numeric AS $$
DECLARE
  v_tipo tipo_indicador;
  v_resultado numeric;
BEGIN
  SELECT tipo_indicador INTO v_tipo
  FROM fotografias_diarias
  WHERE indicador = p_indicador AND vigente = true
    AND data_referencia BETWEEN p_de AND p_ate
  LIMIT 1;

  IF v_tipo IS NULL THEN
    RETURN NULL;  -- sem dado no periodo: quem chama declara o motivo
  END IF;

  IF v_tipo = 'posicao' AND p_metodo = 'soma' THEN
    RAISE EXCEPTION
      'indicador "%" e de POSICAO e nao pode ser somado entre datas. Use fechamento, media, maior ou menor.',
      p_indicador;
  END IF;

  SELECT CASE p_metodo
    WHEN 'soma'        THEN sum(coalesce(valor_monetario, valor_numerico))
    WHEN 'media'       THEN avg(coalesce(valor_monetario, valor_numerico))
    WHEN 'maior'       THEN max(coalesce(valor_monetario, valor_numerico))
    WHEN 'menor'       THEN min(coalesce(valor_monetario, valor_numerico))
    WHEN 'fechamento'  THEN (
      SELECT coalesce(f2.valor_monetario, f2.valor_numerico)
      FROM fotografias_diarias f2
      WHERE f2.indicador = p_indicador AND f2.vigente = true
        AND f2.escopo = p_escopo
        AND f2.empreendimento_id IS NOT DISTINCT FROM p_empr
        AND f2.data_referencia BETWEEN p_de AND p_ate
      ORDER BY f2.data_referencia DESC LIMIT 1
    )
    ELSE NULL
  END INTO v_resultado
  FROM fotografias_diarias f
  WHERE f.indicador = p_indicador AND f.vigente = true
    AND f.escopo = p_escopo
    AND f.empreendimento_id IS NOT DISTINCT FROM p_empr
    AND f.data_referencia BETWEEN p_de AND p_ate;

  RETURN v_resultado;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION agregar_indicador IS
  'Recusa somar indicador de posicao. Movimentacao soma; posicao usa fechamento, media, maior ou menor.';


-- Versao de regra inicial.
INSERT INTO versoes_regras (versao, descricao, vigente_de) VALUES
  ('1.0.0', 'Metodologia inicial: judicializacao, resolucao, inadimplencia e PDD conforme references/regras-classificacao.md', CURRENT_DATE);


-- Down Migration
DROP FUNCTION IF EXISTS agregar_indicador(text, date, date, text, escopo_indicador, uuid);
DROP TABLE IF EXISTS metas_historicas;
DROP TABLE IF EXISTS indicadores_calculados;
DROP TABLE IF EXISTS memorias_calculo;
DROP TRIGGER IF EXISTS tg_fotografia_sem_exclusao ON fotografias_diarias;
DROP FUNCTION IF EXISTS recusar_exclusao_fotografia();
DROP TABLE IF EXISTS fotografias_diarias;
DELETE FROM versoes_regras WHERE versao = '1.0.0';
