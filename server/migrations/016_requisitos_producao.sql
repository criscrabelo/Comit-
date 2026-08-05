-- Up Migration
-- ============================================================================
-- Requisitos obrigatorios antes da producao (B15) e metricas da homologacao
-- controlada do Monday (B16).
--
-- Dois deles nao sao documentacao: sao travas. Registrar como "requisito" algo
-- que o codigo continua violando nao e registrar, e adiar.
--
--   1. restauracao sobre o banco em uso so acontece depois de uma restauracao
--      isolada VALIDADA do mesmo backup, e com plano de corte declarado
--   2. o estado anterior permanece no banco, em schema renomeado, para rollback
-- ============================================================================

-- ── Restauracao: pre-requisitos e rollback ──────────────────────────────────
ALTER TABLE restauracoes
  -- Restauracao isolada que validou este mesmo backup. Sem ela, substituir o
  -- banco em uso e recusado: ninguem deve descobrir que o backup nao presta
  -- com o banco de producao ja apagado.
  ADD COLUMN ensaio_id uuid REFERENCES restauracoes(id),
  -- Plano de corte: quem para a aplicacao, em que janela, quem confere depois,
  -- e como se volta atras. Texto livre, obrigatorio em producao.
  ADD COLUMN plano_corte text,
  -- Schema onde o estado anterior ficou preservado. Enquanto existir, o
  -- rollback e um ALTER SCHEMA — nao depende de restaurar arquivo nenhum.
  ADD COLUMN schema_preservado text,
  ADD COLUMN schema_descartado_em timestamptz;

COMMENT ON COLUMN restauracoes.ensaio_id IS
  'Restauracao isolada bem-sucedida do mesmo backup. Pre-requisito para substituir o banco em uso.';
COMMENT ON COLUMN restauracoes.schema_preservado IS
  'Schema com o estado anterior. Rollback = renomear de volta. Descartar so apos a janela de corte.';

-- A restricao antiga so exigia confirmacao e preventivo. Agora exige tambem o
-- ensaio e o plano de corte — as duas coisas que faltavam para que uma
-- restauracao em producao seja uma operacao planejada, e nao uma reacao.
ALTER TABLE restauracoes DROP CONSTRAINT IF EXISTS restauracao_producao_confirmada;
ALTER TABLE restauracoes ADD CONSTRAINT restauracao_producao_confirmada CHECK (
  destino <> 'producao'
  OR status IN ('recusada', 'erro')
  OR (
    confirmacao IS NOT NULL
    AND backup_preventivo_id IS NOT NULL
    AND ensaio_id IS NOT NULL
    AND plano_corte IS NOT NULL
  )
);


-- ── Verificacao periodica e ensaio amostral ─────────────────────────────────
--
-- "Temos backup" e "sabemos que o backup funciona" sao afirmacoes diferentes.
-- A segunda so se sustenta com verificacao que roda sozinha.
CREATE TABLE verificacoes_backup (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executada_em      timestamptz NOT NULL DEFAULT now(),
  origem            text NOT NULL,          -- 'agendador' | 'api' | 'cli'
  tipo              text NOT NULL,          -- 'checksum' | 'ensaio_restauracao'
  backups_avaliados integer NOT NULL DEFAULT 0,
  integros          integer NOT NULL DEFAULT 0,
  corrompidos       integer NOT NULL DEFAULT 0,
  ausentes          integer NOT NULL DEFAULT 0,
  -- Preenchido no ensaio: qual backup foi restaurado, e com que resultado.
  backup_id         uuid REFERENCES backups(id),
  restauracao_id    uuid REFERENCES restauracoes(id),
  duracao_ms        integer,
  detalhe           jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro              text,
  CONSTRAINT verificacao_tipo_valido CHECK (tipo IN ('checksum', 'ensaio_restauracao')),
  CONSTRAINT verificacao_origem_valida CHECK (origem IN ('agendador', 'api', 'cli'))
);

CREATE INDEX ix_verificacoes_tipo_data ON verificacoes_backup (tipo, executada_em DESC);

COMMENT ON TABLE verificacoes_backup IS
  'Verificacao automatica de checksum e ensaio amostral de restauracao. Backup nao testado e hipotese.';


-- ── Janelas de backup agendado ──────────────────────────────────────────────
--
-- Sem isto, um backup agendado que nunca rodou e indistinguivel de um dia em
-- que ninguem olhou. A janela e registrada quando ABRE, e fechada quando o
-- backup conclui — uma janela aberta e velha e o alerta.
CREATE TABLE janelas_backup (
  dia               date PRIMARY KEY,
  ambiente          text NOT NULL,
  esperada_para     timestamptz NOT NULL,
  aberta_em         timestamptz NOT NULL DEFAULT now(),
  concluida_em      timestamptz,
  backup_id         uuid REFERENCES backups(id),
  tentativas        integer NOT NULL DEFAULT 0,
  ultimo_erro       text
);

COMMENT ON TABLE janelas_backup IS
  'Uma linha por dia com agendamento. Janela aberta e vencida = backup agendado nao concluiu.';


-- ── Metricas completas da execucao de importacao ────────────────────────────
--
-- A homologacao controlada exige numeros que a tabela ainda nao guardava.
-- Sem eles o relatorio seria montado a mao, e um relatorio montado a mao nao
-- prova nada sobre a proxima execucao.
ALTER TABLE execucoes_importacao
  -- Quantas paginas foram consultadas na origem.
  ADD COLUMN paginas integer,
  -- Cursor devolvido pela ultima pagina. Null quando a leitura chegou ao fim.
  ADD COLUMN ultimo_cursor text,
  -- Itens que passaram pela transformacao e viraram registro gravavel. Fica
  -- entre `lidos` e `incluidos + atualizados`: e onde some o que foi ignorado.
  ADD COLUMN normalizados integer,
  -- Data de referencia do conjunto lido.
  ADD COLUMN data_referencia date,
  -- Quadro/endpoint na origem, como identificador externo.
  ADD COLUMN id_origem_escopo text,
  -- Ultimo dado valido ANTES desta execucao. E o que se preserva quando esta
  -- falha, e o que a interface mostra em vez de fingir atualidade.
  ADD COLUMN ultimo_dado_valido_em timestamptz;

COMMENT ON COLUMN execucoes_importacao.normalizados IS
  'Itens transformados com sucesso. lidos - ignorados - com_erro = normalizados.';
COMMENT ON COLUMN execucoes_importacao.ultimo_dado_valido_em IS
  'ultima_carga_valida_em da integracao no INICIO desta execucao. Falha nao apaga: preserva este.';


-- Down Migration
ALTER TABLE execucoes_importacao
  DROP COLUMN IF EXISTS ultimo_dado_valido_em,
  DROP COLUMN IF EXISTS id_origem_escopo,
  DROP COLUMN IF EXISTS data_referencia,
  DROP COLUMN IF EXISTS normalizados,
  DROP COLUMN IF EXISTS ultimo_cursor,
  DROP COLUMN IF EXISTS paginas;
DROP TABLE IF EXISTS janelas_backup;
DROP TABLE IF EXISTS verificacoes_backup;
ALTER TABLE restauracoes DROP CONSTRAINT IF EXISTS restauracao_producao_confirmada;
ALTER TABLE restauracoes ADD CONSTRAINT restauracao_producao_confirmada CHECK (
  destino <> 'producao'
  OR status IN ('recusada', 'erro')
  OR (confirmacao IS NOT NULL AND backup_preventivo_id IS NOT NULL)
);
ALTER TABLE restauracoes
  DROP COLUMN IF EXISTS schema_descartado_em,
  DROP COLUMN IF EXISTS schema_preservado,
  DROP COLUMN IF EXISTS plano_corte,
  DROP COLUMN IF EXISTS ensaio_id;
