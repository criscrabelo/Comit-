-- Up Migration
-- ============================================================================
-- Integracao: execucoes, area bruta, inconsistencias e vinculos entre fontes.
--
-- Duas regras obrigatorias estao materializadas aqui:
--   1. "Falha de uma fonte nao pode apagar o ultimo dado valido" — a execucao
--      registra o que falhou; os registros ficam marcados, nunca removidos.
--   2. "Reprocessamento deve criar nova versao" — a area bruta guarda o payload
--      original, permitindo reprocessar sem reconsultar a fonte.
-- ============================================================================

CREATE TABLE integracoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema               fonte_dado NOT NULL UNIQUE,
  -- Modo de operacao. A Fase 1 opera exclusivamente em leitura.
  modo                  text NOT NULL DEFAULT 'leitura',
  estado                estado_integracao NOT NULL DEFAULT 'desconectada',
  habilitada            boolean NOT NULL DEFAULT false,
  -- Trava de seguranca do Sienge: nenhuma ingestao antes de confirmar os
  -- endpoints no ambiente real (references/sienge.md diz "confirmar no ambiente").
  ambiente_verificado_em  timestamptz,
  ambiente_verificado_por uuid REFERENCES usuarios(id),
  relatorio_verificacao   jsonb,
  -- Configuracao sem segredo. Credenciais vivem so em variavel de ambiente.
  configuracao          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ultima_carga_em       timestamptz,
  ultima_carga_valida_em timestamptz,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integracao_modo_leitura CHECK (modo = 'leitura')
);

COMMENT ON COLUMN integracoes.configuracao IS
  'Nunca contem credencial. Segredos ficam apenas em variavel de ambiente ou cofre.';
COMMENT ON COLUMN integracoes.ultima_carga_valida_em IS
  'Ultima carga bem-sucedida. Separada de ultima_carga_em para sinalizar atualizacao parcial.';

INSERT INTO integracoes (sistema, estado, habilitada) VALUES
  ('monday', 'desconectada', false),
  ('sienge', 'desconectada', false),
  ('cvcrm',  'desconectada', false);


-- ============================================================================
-- Execucoes de importacao
--
-- Contadores exigidos no escopo da Fase 1: lidos, incluidos, atualizados,
-- ignorados, duplicados e com erro.
-- ============================================================================
CREATE TABLE execucoes_importacao (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte               fonte_dado NOT NULL,
  escopo              text,          -- quadro do Monday, endpoint do Sienge
  destino             text,          -- tabela de destino
  competencia         text,          -- 'YYYY-MM'
  comite_id           uuid,
  iniciada_em         timestamptz NOT NULL DEFAULT now(),
  finalizada_em       timestamptz,
  status              status_execucao NOT NULL DEFAULT 'em_andamento',

  lidos               integer NOT NULL DEFAULT 0,
  incluidos           integer NOT NULL DEFAULT 0,
  atualizados         integer NOT NULL DEFAULT 0,
  ignorados           integer NOT NULL DEFAULT 0,
  duplicados          integer NOT NULL DEFAULT 0,
  com_erro            integer NOT NULL DEFAULT 0,
  -- Detalhamento dos ignorados: grupo excluido, fora do periodo, sem
  -- empreendimento. A base atual descarta silenciosamente; aqui fica registrado.
  detalhe_ignorados   jsonb NOT NULL DEFAULT '{}'::jsonb,

  mensagem            text,
  erros               jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Atualizacao parcial: a resposta sinaliza, e o dado anterior fica preservado.
  parcial             boolean NOT NULL DEFAULT false,
  fontes_com_falha    text[] NOT NULL DEFAULT '{}',

  usuario_id          uuid REFERENCES usuarios(id),
  versao_regra        text,
  CONSTRAINT execucao_contadores_nao_negativos CHECK (
    lidos >= 0 AND incluidos >= 0 AND atualizados >= 0
    AND ignorados >= 0 AND duplicados >= 0 AND com_erro >= 0
  ),
  CONSTRAINT execucao_competencia_formato CHECK (
    competencia IS NULL OR competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'
  )
);

CREATE INDEX ix_execucoes_fonte ON execucoes_importacao (fonte, iniciada_em DESC);
CREATE INDEX ix_execucoes_competencia ON execucoes_importacao (competencia);
CREATE INDEX ix_execucoes_status ON execucoes_importacao (status) WHERE status = 'em_andamento';


-- ============================================================================
-- Area bruta (imutavel)
--
-- Payload original antes de qualquer interpretacao. E o que permite cumprir
-- "reprocessamento cria nova versao" sem chamar Monday ou Sienge de novo, e o
-- que permite provar depois qual valor a fonte realmente devolveu.
-- ============================================================================
CREATE TABLE registros_brutos (
  id             bigserial,
  execucao_id    uuid NOT NULL REFERENCES execucoes_importacao(id) ON DELETE CASCADE,
  fonte          fonte_dado NOT NULL,
  escopo         text,
  id_origem      text,
  payload        jsonb NOT NULL,
  extraido_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, extraido_em)
) PARTITION BY RANGE (extraido_em);

COMMENT ON TABLE registros_brutos IS
  'Imutavel. Particionada por ano para sustentar a retencao minima de 20 anos.';

-- Particoes iniciais. Uma rotina de manutencao cria as seguintes.
CREATE TABLE registros_brutos_2026 PARTITION OF registros_brutos
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE registros_brutos_2027 PARTITION OF registros_brutos
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
-- Particao de guarda para dados de carga historica anteriores.
CREATE TABLE registros_brutos_historico PARTITION OF registros_brutos
  FOR VALUES FROM (MINVALUE) TO ('2026-01-01');

CREATE INDEX ix_brutos_execucao ON registros_brutos (execucao_id);
CREATE INDEX ix_brutos_origem ON registros_brutos (fonte, id_origem);

CREATE OR REPLACE FUNCTION recusar_alteracao_bruto() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'registros_brutos e imutavel: % nao e permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_bruto_imutavel
  BEFORE UPDATE OR DELETE ON registros_brutos
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao_bruto();


-- ============================================================================
-- Central de Inconsistencias
--
-- Estrutura de schemas/inconsistencias.schema.json, acrescida do que 3d do
-- Diagnostico e Wireframes exige e o schema nao cobre: os dois valores em
-- conflito lado a lado, com proveniencia de cada lado, e a precedencia aplicada.
-- ============================================================================
CREATE TABLE inconsistencias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                tipo_inconsistencia NOT NULL,
  gravidade           gravidade_inconsistencia NOT NULL,
  fonte               fonte_dado NOT NULL,
  descricao           text NOT NULL,
  detectado_em        timestamptz NOT NULL DEFAULT now(),

  -- Referencia textual (do schema) e referencia real (para navegar na interface).
  cliente             text,
  contrato            text,
  empreendimento      text,
  cliente_id          uuid REFERENCES clientes(id),
  contrato_id         uuid REFERENCES contratos(id),
  empreendimento_id   uuid REFERENCES empreendimentos(id),

  -- Os dois lados do conflito, preservados. A plataforma nunca escolhe sozinha.
  valores_em_conflito jsonb NOT NULL DEFAULT '[]'::jsonb,
  precedencia_aplicada text,
  valor_aplicado      jsonb,
  hipotese            text,

  status_revisao      status_revisao NOT NULL DEFAULT 'aberta',
  responsavel_id      uuid REFERENCES usuarios(id),
  responsavel_area    area_organizacional,
  observacao          text,
  resolvido_em        timestamptz,
  resolvido_por       uuid REFERENCES usuarios(id),

  execucao_id         uuid REFERENCES execucoes_importacao(id),
  -- Impede reabrir a mesma inconsistencia a cada carga.
  chave_deduplicacao  text NOT NULL,
  ocorrencias         integer NOT NULL DEFAULT 1,
  vista_por_ultimo_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inconsistencia_resolucao_coerente CHECK (
    (status_revisao IN ('resolvida','ignorada') AND resolvido_em IS NOT NULL)
    OR (status_revisao IN ('aberta','em_revisao') AND resolvido_em IS NULL)
  )
);

-- Uma inconsistencia aberta por chave. Recorrencia incrementa o contador.
CREATE UNIQUE INDEX ux_inconsistencia_aberta ON inconsistencias (chave_deduplicacao)
  WHERE status_revisao IN ('aberta', 'em_revisao');
CREATE INDEX ix_inconsistencias_triagem
  ON inconsistencias (status_revisao, gravidade, detectado_em DESC);
CREATE INDEX ix_inconsistencias_tipo ON inconsistencias (tipo);
CREATE INDEX ix_inconsistencias_responsavel ON inconsistencias (responsavel_id)
  WHERE status_revisao IN ('aberta', 'em_revisao');

COMMENT ON COLUMN inconsistencias.valores_em_conflito IS
  'Os dois (ou mais) valores divergentes, cada um com fonte, id_origem, data de referencia e data de extracao. Nunca sobrescritos.';


-- ============================================================================
-- Vinculos entre fontes
--
-- Registra COMO cada par de registros foi relacionado, com que confianca, e
-- quais candidatos foram considerados. Vinculo ambiguo fica aqui como candidato
-- nao resolvido, aguardando validacao humana.
-- ============================================================================
CREATE TABLE vinculos_fontes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade          text NOT NULL,   -- 'cliente' | 'contrato' | 'unidade'
  entidade_id       uuid,

  fonte_a           fonte_dado NOT NULL,
  id_origem_a       text NOT NULL,
  fonte_b           fonte_dado NOT NULL,
  id_origem_b       text NOT NULL,

  regra             regra_vinculo NOT NULL,
  confianca         confianca_vinculo NOT NULL,
  chave_usada       text,
  -- Mais de um candidato => ambiguo => nao resolve automaticamente.
  candidatos        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ambiguo           boolean NOT NULL DEFAULT false,
  inconsistencia_id uuid REFERENCES inconsistencias(id),

  versao_regra      text,
  execucao_id       uuid REFERENCES execucoes_importacao(id),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  confirmado_em     timestamptz,
  confirmado_por    uuid REFERENCES usuarios(id)
);

CREATE UNIQUE INDEX ux_vinculo_par
  ON vinculos_fontes (entidade, fonte_a, id_origem_a, fonte_b, id_origem_b);
CREATE INDEX ix_vinculos_ambiguos ON vinculos_fontes (ambiguo) WHERE ambiguo = true;
CREATE INDEX ix_vinculos_entidade ON vinculos_fontes (entidade, entidade_id);

COMMENT ON TABLE vinculos_fontes IS
  'Rastro do relacionamento entre fontes. ambiguo=true nunca alimenta indicador sem confirmacao humana.';

-- Fecha a FK do comite depois que a tabela de comites existir (migracao 005).


-- Down Migration
DROP TABLE IF EXISTS vinculos_fontes;
DROP TABLE IF EXISTS inconsistencias;
DROP TRIGGER IF EXISTS tg_bruto_imutavel ON registros_brutos;
DROP FUNCTION IF EXISTS recusar_alteracao_bruto();
DROP TABLE IF EXISTS registros_brutos;
DROP TABLE IF EXISTS execucoes_importacao;
DROP TABLE IF EXISTS integracoes;
