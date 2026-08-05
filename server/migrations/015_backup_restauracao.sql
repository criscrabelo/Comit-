-- Up Migration
-- ============================================================================
-- Backup e restauracao.
--
-- Um backup sem metadado nao e backup: e um arquivo. O que torna recuperavel e
-- saber DE ONDE veio, DE QUANDO, com QUAL esquema, se esta INTEIRO e se ja foi
-- testado. Por isso a tabela de metadados e mais rica que o proprio comando
-- que gera o arquivo.
--
-- Duas regras impostas aqui, e nao por disciplina do programador:
--   - backup protegido nao pode ser excluido (CHECK)
--   - restauracao em producao exige confirmacao registrada (CHECK)
-- ============================================================================

-- ── Permissoes do modulo `sistema` ──────────────────────────────────────────
--
-- Administrador executa e restaura. Gestora consulta e solicita, sem restaurar.
-- Diretoria consulta o relatorio de continuidade. Os demais nao aparecem aqui,
-- e negacao por omissao ja os cobre.
INSERT INTO permissoes_perfil (perfil, modulo, acao) VALUES
  ('administrador', 'sistema', 'ler'),
  ('administrador', 'sistema', 'backup'),
  ('administrador', 'sistema', 'restaurar'),
  ('administrador', 'sistema', 'remover'),
  ('administrador', 'sistema', 'exportar'),
  -- Gestora pede o backup e acompanha; nao restaura, nao exclui, nao baixa.
  ('gestora', 'sistema', 'ler'),
  ('gestora', 'sistema', 'backup'),
  -- Diretoria le o relatorio de continuidade. Nao opera.
  ('diretoria', 'sistema', 'ler')
ON CONFLICT DO NOTHING;


-- ── Migracoes aplicadas ─────────────────────────────────────────────────────
--
-- Restaurar um backup sobre um esquema diferente do de origem corrompe dado em
-- silencio. Para comparar, e preciso saber que migracoes o banco de origem
-- tinha — e o `pgmigrations` do node-pg-migrate nao existe nos bancos criados
-- por scripts/recriar-banco.sh.
--
-- O checksum e do CONTEUDO do arquivo: renomear ou editar uma migracao ja
-- aplicada passa a ser detectavel.
CREATE TABLE migracoes_aplicadas (
  nome          text PRIMARY KEY,
  checksum      text NOT NULL,
  aplicada_em   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE migracoes_aplicadas IS
  'Versao do esquema. Comparada na restauracao: backup de esquema divergente e recusado.';


-- ── Backups ─────────────────────────────────────────────────────────────────
CREATE TYPE tipo_backup AS ENUM (
  'completo',            -- dump logico integral
  'preventivo',          -- feito automaticamente antes de restaurar
  'pre_migracao',        -- feito antes de migracao destrutiva
  'agendado'             -- disparado pelo agendador
);

CREATE TYPE status_backup AS ENUM (
  'em_andamento',
  'concluido',
  'erro',
  'corrompido',          -- verificacao de checksum falhou depois de gravado
  'expurgado'            -- removido pela retencao; o metadado permanece
);

CREATE TYPE classe_retencao AS ENUM ('diario', 'semanal', 'mensal', 'permanente');

CREATE TABLE backups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Identificacao ─────────────────────────────────────────────────────────
  -- Legivel por humano, ordenavel por nome: patrono-<ambiente>-<AAAAMMDD>-<HHMMSS>
  rotulo              text NOT NULL,
  ambiente            text NOT NULL,
  tipo                tipo_backup NOT NULL,
  status              status_backup NOT NULL DEFAULT 'em_andamento',

  -- ── Tempo ─────────────────────────────────────────────────────────────────
  iniciado_em         timestamptz NOT NULL DEFAULT now(),
  concluido_em        timestamptz,
  duracao_ms          integer,

  -- ── Versoes ───────────────────────────────────────────────────────────────
  versao_aplicacao    text NOT NULL,
  versao_banco        text NOT NULL,
  versao_esquema      text NOT NULL,   -- checksum combinado das migracoes
  migracoes           jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ── Arquivo ───────────────────────────────────────────────────────────────
  arquivo             text,            -- nome, nao caminho absoluto
  local_armazenamento text,            -- rotulo do destino: 'local', 's3://...'
  copia_redundante    text,            -- segundo destino, quando configurado
  tamanho_bytes       bigint,
  tamanho_claro_bytes bigint,          -- antes de cifrar; util para conferencia
  -- SHA-256 do arquivo COMO ESTA no disco (cifrado). Detecta corrupcao em
  -- repouso sem precisar da chave.
  checksum            text,
  -- SHA-256 do dump em claro. So verificavel com a chave; prova que a
  -- decifragem devolveu exatamente o que foi gerado.
  checksum_claro      text,
  algoritmo_cifra     text NOT NULL DEFAULT 'aes-256-gcm',

  -- ── Conteudo ──────────────────────────────────────────────────────────────
  -- Contagem por tabela no momento do dump. E o que permite dizer, depois da
  -- restauracao, se voltou tudo — sem depender de o operador lembrar.
  contagens           jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_registros     bigint,

  -- ── Responsabilidade ──────────────────────────────────────────────────────
  iniciado_por        uuid REFERENCES usuarios(id),
  iniciado_por_nome   text NOT NULL,
  origem              text NOT NULL,   -- 'api' | 'cli' | 'agendador' | 'restauracao'

  -- ── Retencao ──────────────────────────────────────────────────────────────
  classe_retencao     classe_retencao NOT NULL DEFAULT 'diario',
  reter_ate           timestamptz,
  -- Protecao contra exclusao acidental: enquanto true, nem a retencao nem a
  -- API removem. Desproteger e ato explicito e auditado.
  protegido           boolean NOT NULL DEFAULT false,
  expurgado_em        timestamptz,
  expurgado_por       uuid REFERENCES usuarios(id),

  -- ── Verificacao ───────────────────────────────────────────────────────────
  verificado_em       timestamptz,
  restauracao_testada_em timestamptz,

  erro                text,
  detalhe             jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT backup_origem_valida CHECK (origem IN ('api', 'cli', 'agendador', 'restauracao', 'migracao')),
  -- Concluido tem de ter arquivo, tamanho e checksum. Sem os tres nao ha o que
  -- restaurar, e marcar como concluido seria mentir no relatorio.
  CONSTRAINT backup_concluido_completo CHECK (
    status <> 'concluido' OR (
      arquivo IS NOT NULL AND checksum IS NOT NULL AND tamanho_bytes IS NOT NULL
    )
  ),
  -- Backup protegido nao pode estar expurgado. A regra vale mesmo para quem
  -- escrever direto no banco.
  CONSTRAINT backup_protegido_nao_expurgado CHECK (
    NOT (protegido AND expurgado_em IS NOT NULL)
  )
);

CREATE UNIQUE INDEX ux_backups_rotulo ON backups (rotulo);
CREATE INDEX ix_backups_ambiente_data ON backups (ambiente, iniciado_em DESC);
CREATE INDEX ix_backups_recuperaveis ON backups (iniciado_em DESC)
  WHERE status = 'concluido' AND expurgado_em IS NULL;
CREATE INDEX ix_backups_retencao ON backups (classe_retencao, reter_ate)
  WHERE expurgado_em IS NULL;

COMMENT ON COLUMN backups.checksum IS
  'SHA-256 do arquivo cifrado. Verificavel sem a chave — detecta corrupcao em repouso.';
COMMENT ON COLUMN backups.checksum_claro IS
  'SHA-256 do dump em claro. Prova que a decifragem devolveu o conteudo original.';
COMMENT ON COLUMN backups.contagens IS
  'Registros por tabela no instante do dump. Base da conferencia pos-restauracao.';


-- ── Restauracoes ────────────────────────────────────────────────────────────
CREATE TYPE destino_restauracao AS ENUM (
  'isolado',      -- banco descartavel, criado para a ocasiao; nao toca o vivo
  'producao'      -- substitui o banco em uso; exige confirmacao reforcada
);

CREATE TYPE status_restauracao AS ENUM (
  'em_andamento',
  'concluida',
  'concluida_com_ressalvas',   -- restaurou, mas alguma verificacao divergiu
  'recusada',                  -- barrada na validacao; nada foi tocado
  'erro',
  'interrompida'
);

CREATE TABLE restauracoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_id             uuid NOT NULL REFERENCES backups(id),

  destino               destino_restauracao NOT NULL,
  banco_destino         text NOT NULL,
  ambiente_destino      text NOT NULL,
  -- Ambiente de onde o backup veio. Restaurar producao a partir de teste, ou o
  -- contrario, e o erro caro que a validacao existe para impedir.
  ambiente_origem       text NOT NULL,

  status                status_restauracao NOT NULL DEFAULT 'em_andamento',
  iniciada_em           timestamptz NOT NULL DEFAULT now(),
  concluida_em          timestamptz,
  duracao_ms            integer,

  solicitada_por        uuid REFERENCES usuarios(id),
  solicitada_por_nome   text NOT NULL,
  -- Texto que a pessoa digitou para confirmar. Guardado porque "confirmacao
  -- expressa" que nao deixa rastro nao e expressa.
  confirmacao           text,
  justificativa         text,

  -- Backup do estado ANTES de restaurar. Sem ele, uma restauracao errada nao
  -- tem volta.
  backup_preventivo_id  uuid REFERENCES backups(id),

  -- ── Resultado das validacoes, na ordem do procedimento ────────────────────
  checksum_conferido    boolean NOT NULL DEFAULT false,
  versao_conferida      boolean NOT NULL DEFAULT false,
  migracoes_conferidas  boolean NOT NULL DEFAULT false,
  ambiente_conferido    boolean NOT NULL DEFAULT false,
  integridade           jsonb NOT NULL DEFAULT '{}'::jsonb,
  divergencias          jsonb NOT NULL DEFAULT '[]'::jsonb,

  erro                  text,
  detalhe               jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Restauracao sobre producao exige confirmacao registrada e backup
  -- preventivo. O banco recusa a linha sem os dois — nao adianta o codigo
  -- esquecer.
  CONSTRAINT restauracao_producao_confirmada CHECK (
    destino <> 'producao'
    OR status IN ('recusada', 'erro')
    OR (confirmacao IS NOT NULL AND backup_preventivo_id IS NOT NULL)
  )
);

CREATE INDEX ix_restauracoes_backup ON restauracoes (backup_id, iniciada_em DESC);
CREATE INDEX ix_restauracoes_data ON restauracoes (iniciada_em DESC);

COMMENT ON TABLE restauracoes IS
  'Toda restauracao, inclusive as recusadas. Recusa e informacao: mostra tentativa de restaurar ambiente errado.';


-- ── Politica de retencao vigente ────────────────────────────────────────────
--
-- Em tabela, e nao so em variavel de ambiente, para que a politica em vigor
-- seja consultavel e auditavel — e para que mudar a politica deixe rastro.
CREATE TABLE politica_retencao (
  id                    integer PRIMARY KEY DEFAULT 1,
  diarios_manter        integer NOT NULL DEFAULT 14,
  semanais_manter       integer NOT NULL DEFAULT 8,
  mensais_manter        integer NOT NULL DEFAULT 12,
  -- Piso absoluto: nenhum backup e expurgado antes disto, qualquer que seja a
  -- classe. Protege contra uma politica mal configurada apagar o de ontem.
  retencao_minima_dias  integer NOT NULL DEFAULT 30,
  -- Nunca expurgar se sobrar menos que isto de backup recuperavel.
  minimo_recuperaveis   integer NOT NULL DEFAULT 3,
  atualizada_em         timestamptz NOT NULL DEFAULT now(),
  atualizada_por        uuid REFERENCES usuarios(id),
  CONSTRAINT politica_linha_unica CHECK (id = 1),
  CONSTRAINT politica_valores_positivos CHECK (
    diarios_manter > 0 AND semanais_manter > 0 AND mensais_manter > 0
    AND retencao_minima_dias >= 7 AND minimo_recuperaveis >= 1
  )
);

INSERT INTO politica_retencao (id) VALUES (1);

COMMENT ON TABLE politica_retencao IS
  'Politica vigente. A retencao operacional NAO se confunde com os 20 anos do dado historico, que vivem no banco.';


-- Down Migration
DROP TABLE IF EXISTS politica_retencao;
DROP TABLE IF EXISTS restauracoes;
DROP TYPE IF EXISTS status_restauracao;
DROP TYPE IF EXISTS destino_restauracao;
DROP TABLE IF EXISTS backups;
DROP TYPE IF EXISTS classe_retencao;
DROP TYPE IF EXISTS status_backup;
DROP TYPE IF EXISTS tipo_backup;
DROP TABLE IF EXISTS migracoes_aplicadas;
DELETE FROM permissoes_perfil WHERE modulo = 'sistema';
