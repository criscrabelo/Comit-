-- Up Migration
-- ============================================================================
-- Comites, competencia e os modulos juridicos.
--
-- Fonte de precedencia (escopo da Fase 1): situacao juridica, tarefas e
-- responsaveis vem do Monday. Cada notificacao e um EVENTO separado; o cliente
-- conta uma vez por empreendimento nos indicadores consolidados.
-- ============================================================================

CREATE TABLE competencias (
  ref           text PRIMARY KEY,   -- 'YYYY-MM'
  rotulo        text NOT NULL,      -- 'Abril 2026'
  inicio        date NOT NULL,
  fim           date NOT NULL,
  fechada_em    timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competencia_formato CHECK (ref ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT competencia_intervalo CHECK (fim >= inicio)
);

CREATE TABLE comites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_ref     text NOT NULL REFERENCES competencias(ref),
  rotulo              text NOT NULL,
  data_apresentacao   date,
  -- Fluxo de 7 estagios (2c do Diagnostico e Wireframes).
  estagio             text NOT NULL DEFAULT 'preparacao',
  status              text NOT NULL DEFAULT 'rascunho',
  ata_aprovada_em     timestamptz,
  ata_aprovada_por    uuid REFERENCES usuarios(id),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comite_estagio_valido CHECK (estagio IN (
    'preparacao','revisao','reuniao','deliberacao','plano_de_acao','acompanhamento','encerramento'
  )),
  CONSTRAINT comite_status_valido CHECK (status IN ('rascunho','publicado','encerrado'))
);

CREATE UNIQUE INDEX ux_comites_competencia ON comites (competencia_ref);

-- Fecha as FKs de competencia/comite deixadas abertas na migracao 004.
ALTER TABLE execucoes_importacao
  ADD CONSTRAINT fk_execucao_comite FOREIGN KEY (comite_id) REFERENCES comites(id),
  ADD CONSTRAINT fk_execucao_competencia FOREIGN KEY (competencia) REFERENCES competencias(ref);


-- ============================================================================
-- Notificacoes — cada item e um evento
-- ============================================================================
CREATE TABLE notificacoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comite_id         uuid REFERENCES comites(id),
  competencia_ref   text REFERENCES competencias(ref),
  cliente_id        uuid REFERENCES clientes(id),
  contrato_id       uuid REFERENCES contratos(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  unidade_id        uuid REFERENCES unidades(id),

  cliente_nome      text,
  torre             text,
  unidade           text,
  grupo             text,
  modelo            text,
  -- Normalizado: 'Resolvida' | 'Em Andamento'. O rotulo bruto da origem fica em
  -- estagio_detalhe, para nao perder a fidelidade a fonte.
  estagio           text,
  estagio_detalhe   text,
  situacao          text,
  data_notificacao  date,
  data_solucao      date,
  total_dias        integer,
  CONSTRAINT notificacao_solucao_coerente CHECK (
    data_solucao IS NULL OR estagio = 'Resolvida'
  )
);
SELECT aplicar_proveniencia('notificacoes');
SELECT aplicar_trilha('notificacoes');
CREATE INDEX ix_notificacoes_comite ON notificacoes (comite_id);
CREATE INDEX ix_notificacoes_cliente_empr ON notificacoes (cliente_id, empreendimento_id);

COMMENT ON COLUMN notificacoes.estagio_detalhe IS
  'Rotulo bruto da coluna ESTAGIOS do Monday. Rotulo tem de ser fiel a origem.';


-- ============================================================================
-- Processos judiciais
--
-- "Enviar para advogado" NAO e processo judicial. A classificacao segue
-- references/regras-classificacao.md; duvida vira 'Revisao necessaria'.
-- ============================================================================
CREATE TABLE processos_judiciais (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comite_id         uuid REFERENCES comites(id),
  competencia_ref   text REFERENCES competencias(ref),
  cliente_id        uuid REFERENCES clientes(id),
  contrato_id       uuid REFERENCES contratos(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),

  numero            text,
  ano               text,
  tipo              text,          -- natureza / tipo de acao (status8)
  motivo            text,
  posicao           text,          -- Reu | Autor | Terceiro
  situacao          text,          -- de status5 (MEU TRABALHO), nao de status84__1
  situacao_comite   text,          -- status84__1, preservado para conferencia
  -- status3 e ATUACAO (INTERNO / EXTERNO <nome>), nao comarca.
  atuacao           text,
  interno           boolean,
  comarca           text,          -- so quando existir coluna propria mapeada
  valor_causa       numeric(18,2),
  data_citacao      date,
  data_ciencia      date,
  data_audiencia    date,
  data_finalizacao  date,
  judicializado     boolean NOT NULL DEFAULT false,
  revisao_necessaria boolean NOT NULL DEFAULT false,
  honorarios_efetivados numeric(18,2)
);
SELECT aplicar_proveniencia('processos_judiciais');
SELECT aplicar_trilha('processos_judiciais');
CREATE INDEX ix_processos_comite ON processos_judiciais (comite_id);
CREATE INDEX ix_processos_cliente ON processos_judiciais (cliente_id);
CREATE INDEX ix_processos_judicializado ON processos_judiciais (judicializado)
  WHERE judicializado = true;

COMMENT ON COLUMN processos_judiciais.atuacao IS
  'Coluna status3 do Monday: INTERNO/EXTERNO. NAO e comarca — nao reaproveitar como tal.';
COMMENT ON COLUMN processos_judiciais.comarca IS
  'Somente quando houver coluna propria mapeada no Monday. Hoje nao existe no pipeline.';


-- ============================================================================
-- Acordos e resolucoes
--
-- Precedencia temporal: descumprido posterior invalida acordo anterior; novo
-- acordo vigente posterior volta a resolver.
-- ============================================================================
CREATE TABLE acordos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid REFERENCES clientes(id),
  contrato_id       uuid REFERENCES contratos(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  status            text NOT NULL,
  data_evento       date NOT NULL,
  valor             numeric(18,2),
  CONSTRAINT acordo_status_valido CHECK (status IN ('vigente','descumprido','proposto'))
);
SELECT aplicar_proveniencia('acordos');
SELECT aplicar_trilha('acordos');
CREATE INDEX ix_acordos_contrato_data ON acordos (contrato_id, data_evento DESC);

CREATE TABLE resolucoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid REFERENCES clientes(id),
  contrato_id       uuid REFERENCES contratos(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  categoria         text NOT NULL,
  data_evento       date NOT NULL,
  confirmado        boolean NOT NULL DEFAULT false,
  CONSTRAINT resolucao_categoria_valida CHECK (categoria IN (
    'acordo','pagamento','distrato','retomada','recompra'
  ))
);
SELECT aplicar_proveniencia('resolucoes');
SELECT aplicar_trilha('resolucoes');
CREATE INDEX ix_resolucoes_cliente ON resolucoes (cliente_id, data_evento DESC);


-- ============================================================================
-- Distratos, desistencias, retomadas e recompras
--
-- A base de producao distingue Distrato de Desistencia pelo grupo do Monday
-- (js/monday-sync.js:362) — regra que o code-drop perdeu. Preservada aqui.
-- ============================================================================
CREATE TABLE distratos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comite_id         uuid REFERENCES comites(id),
  competencia_ref   text REFERENCES competencias(ref),
  cliente_id        uuid REFERENCES clientes(id),
  contrato_id        uuid REFERENCES contratos(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  unidade           text,
  -- 'distrato' | 'desistencia' | 'retomada' | 'recompra'
  categoria         text NOT NULL,
  motivo            text,
  equipe            text,
  data_solicitacao  date,
  data_venda        date,
  data_conclusao    date,
  tempo_dias        integer,
  CONSTRAINT distrato_categoria_valida CHECK (categoria IN (
    'distrato','desistencia','retomada','recompra'
  ))
);
SELECT aplicar_proveniencia('distratos');
SELECT aplicar_trilha('distratos');
CREATE INDEX ix_distratos_comite_cat ON distratos (comite_id, categoria);

COMMENT ON COLUMN distratos.categoria IS
  'Classificado pelo titulo do grupo no Monday. Distrato e Desistencia sao categorias distintas.';


-- ============================================================================
-- Honorarios
--
-- Extrajudiciais vem do Monday (quadro 7231876117); judiciais vem de planilha.
-- A origem fica registrada em fonte + id_origem.
-- ============================================================================
CREATE TABLE honorarios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comite_id         uuid REFERENCES comites(id),
  competencia_ref   text REFERENCES competencias(ref),
  cliente_id        uuid REFERENCES clientes(id),
  processo_id       uuid REFERENCES processos_judiciais(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  especie           text NOT NULL,   -- 'extrajudicial' | 'judicial'
  parte             text,            -- autor | reu (honorarios judiciais)
  categoria         text,
  numero_processo   text,
  valor_principal   numeric(18,2),
  valor_honorarios  numeric(18,2),
  valor_oab         numeric(18,2),
  custos_advogado   numeric(18,2),
  cliente_novo      boolean,
  status            text,
  data_evento       date,
  CONSTRAINT honorario_especie_valida CHECK (especie IN ('extrajudicial','judicial'))
);
SELECT aplicar_proveniencia('honorarios');
SELECT aplicar_trilha('honorarios');
CREATE INDEX ix_honorarios_competencia ON honorarios (competencia_ref, especie);


-- ============================================================================
-- Fatos, riscos e regulatorios (cadastro manual do comite)
-- ============================================================================
CREATE TABLE fatos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comite_id         uuid REFERENCES comites(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  data              date,
  titulo            text,
  descricao         text NOT NULL
);
SELECT aplicar_proveniencia('fatos');
SELECT aplicar_trilha('fatos');

CREATE TABLE riscos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comite_id         uuid REFERENCES comites(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  contrato_ref      text,
  alerta            text,
  -- Estruturas que o seed carregava mas a interface nunca editava; agora
  -- persistidas e editaveis via API.
  cronograma        jsonb NOT NULL DEFAULT '[]'::jsonb,
  riscos_lista      jsonb NOT NULL DEFAULT '[]'::jsonb,
  renegociacao      jsonb,
  recomendacoes     jsonb NOT NULL DEFAULT '[]'::jsonb
);
SELECT aplicar_proveniencia('riscos');
SELECT aplicar_trilha('riscos');

CREATE TABLE regulatorios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comite_id       uuid REFERENCES comites(id),
  titulo          text NOT NULL,
  descricao       text,
  data_vigencia   date,
  destaque        text,
  checklist       jsonb NOT NULL DEFAULT '[]'::jsonb
);
SELECT aplicar_proveniencia('regulatorios');
SELECT aplicar_trilha('regulatorios');


-- Down Migration
DROP TABLE IF EXISTS regulatorios;
DROP TABLE IF EXISTS riscos;
DROP TABLE IF EXISTS fatos;
DROP TABLE IF EXISTS honorarios;
DROP TABLE IF EXISTS distratos;
DROP TABLE IF EXISTS resolucoes;
DROP TABLE IF EXISTS acordos;
DROP TABLE IF EXISTS processos_judiciais;
DROP TABLE IF EXISTS notificacoes;
ALTER TABLE execucoes_importacao
  DROP CONSTRAINT IF EXISTS fk_execucao_comite,
  DROP CONSTRAINT IF EXISTS fk_execucao_competencia;
DROP TABLE IF EXISTS comites;
DROP TABLE IF EXISTS competencias;
DELETE FROM tabelas_de_negocio WHERE nome_tabela IN (
  'notificacoes','processos_judiciais','acordos','resolucoes','distratos',
  'honorarios','fatos','riscos','regulatorios'
);
