-- Up Migration
-- ============================================================================
-- Identidade, autorizacao, sessoes e auditoria.
--
-- Corrige as falhas encontradas na auditoria das duas bases de codigo:
--   - endpoints de dados sem autenticacao (server.js:99-138)
--   - qualquer usuario autenticado grava o banco inteiro (code-drop server.js:600)
--   - trocar senha nao encerra sessoes (code-drop server.js:417)
--   - sem limite de tentativas de login (code-drop server.js:344)
--   - sem trilha de auditoria (ambas as bases)
-- ============================================================================

CREATE TABLE usuarios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario               text NOT NULL UNIQUE,
  nome                  text NOT NULL,
  email                 citext,
  perfil                perfil_usuario NOT NULL,
  area                  area_organizacional,
  status                status_usuario NOT NULL DEFAULT 'pendente',

  -- Hash da senha com algoritmo declarado no proprio valor, para permitir troca
  -- de algoritmo sem migracao destrutiva. Nunca guarda a senha.
  hash_senha            text,
  algoritmo_senha       text,
  senha_alterada_em     timestamptz,

  -- Convidado tem acesso com prazo (1c do Diagnostico e Wireframes).
  acesso_expira_em      timestamptz,

  ultimo_acesso_em      timestamptz,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  criado_por            uuid REFERENCES usuarios(id),

  CONSTRAINT usuario_formato CHECK (usuario ~ '^[a-z0-9_.-]{3,64}$'),
  CONSTRAINT senha_completa CHECK (
    (hash_senha IS NULL AND algoritmo_senha IS NULL)
    OR (hash_senha IS NOT NULL AND algoritmo_senha IS NOT NULL)
  ),
  -- Somente convidado pode ter prazo de acesso; os demais nao expiram.
  CONSTRAINT prazo_so_para_convidado CHECK (
    acesso_expira_em IS NULL OR perfil = 'convidado'
  )
);

CREATE INDEX ix_usuarios_perfil ON usuarios (perfil) WHERE status = 'ativo';
CREATE UNIQUE INDEX ux_usuarios_email ON usuarios (email) WHERE email IS NOT NULL;

COMMENT ON COLUMN usuarios.hash_senha IS
  'Hash com algoritmo declarado em algoritmo_senha. A senha em claro nunca e persistida.';


-- ============================================================================
-- Autorizacao em quatro dimensoes combinadas
--
-- Escopo da Fase 1: "autorizacao por modulo, area, empreendimento e tipo de
-- informacao". Cada dimensao e uma tabela propria — o efeito e a intersecao.
-- ============================================================================

-- 1. Permissao padrao do perfil: o que o verbo do perfil permite.
CREATE TABLE permissoes_perfil (
  perfil          perfil_usuario NOT NULL,
  modulo          modulo_plataforma NOT NULL,
  acao            acao_permissao NOT NULL,
  PRIMARY KEY (perfil, modulo, acao)
);

COMMENT ON TABLE permissoes_perfil IS
  'Permissao padrao por perfil e modulo. Concessao, nao restricao: ausencia = negado.';

-- 2. Escopo por area: sobre qual area o usuario atua.
CREATE TABLE escopos_area (
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  area            area_organizacional NOT NULL,
  PRIMARY KEY (usuario_id, area)
);

-- 3. Escopo por empreendimento. Ausencia de linha com todos=true e sem linhas
--    especificas significa nenhum empreendimento — negado por omissao.
CREATE TABLE escopos_empreendimento (
  usuario_id         uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empreendimento_id  uuid,
  todos              boolean NOT NULL DEFAULT false,
  CONSTRAINT escopo_empr_coerente CHECK (
    (todos = true AND empreendimento_id IS NULL)
    OR (todos = false AND empreendimento_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX ux_escopo_empr_todos ON escopos_empreendimento (usuario_id)
  WHERE todos = true;
CREATE UNIQUE INDEX ux_escopo_empr_item ON escopos_empreendimento (usuario_id, empreendimento_id)
  WHERE empreendimento_id IS NOT NULL;

-- 4. Escopo por tipo de informacao: o que o usuario pode ver de dado sensivel.
--    Ver dado pessoal completo (CPF/CNPJ sem mascara) e uma concessao explicita.
CREATE TABLE escopos_tipo_informacao (
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo            tipo_informacao NOT NULL,
  completo        boolean NOT NULL DEFAULT false,
  PRIMARY KEY (usuario_id, tipo)
);

COMMENT ON COLUMN escopos_tipo_informacao.completo IS
  'false = enxerga mascarado. Mascaramento de CPF/CNPJ depende desta coluna.';

-- Concessao pontual, para excecoes que o perfil padrao nao cobre.
CREATE TABLE permissoes_usuario (
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modulo          modulo_plataforma NOT NULL,
  acao            acao_permissao NOT NULL,
  concedida       boolean NOT NULL,
  concedida_por   uuid REFERENCES usuarios(id),
  concedida_em    timestamptz NOT NULL DEFAULT now(),
  motivo          text,
  PRIMARY KEY (usuario_id, modulo, acao)
);

COMMENT ON TABLE permissoes_usuario IS
  'Excecao por usuario. concedida=false nega explicitamente, vencendo o padrao do perfil.';


-- ============================================================================
-- Sessoes
--
-- Token opaco com hash no banco, nao JWT. Decisao deliberada: o token da base
-- atual nao pode ser revogado — trocar a senha nao invalida sessao nenhuma.
-- Aqui a sessao e um registro, portanto revogavel individualmente.
-- ============================================================================
CREATE TABLE sessoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- Somente o hash do token. O valor em claro existe apenas na resposta do login.
  hash_token        text NOT NULL UNIQUE,
  criada_em         timestamptz NOT NULL DEFAULT now(),
  expira_em         timestamptz NOT NULL,
  ultima_atividade  timestamptz NOT NULL DEFAULT now(),
  endereco_ip       inet,
  agente_usuario    text,
  revogada_em       timestamptz,
  revogada_por      uuid REFERENCES usuarios(id),
  motivo_revogacao  text
);

CREATE INDEX ix_sessoes_usuario ON sessoes (usuario_id) WHERE revogada_em IS NULL;
CREATE INDEX ix_sessoes_expiracao ON sessoes (expira_em) WHERE revogada_em IS NULL;

COMMENT ON TABLE sessoes IS
  'Sessoes revogaveis. Troca de senha revoga todas as sessoes do usuario.';


-- ============================================================================
-- Limite de tentativas de autenticacao
--
-- Ausente nas duas bases: hoje um atacante pode tentar senha indefinidamente.
-- Registra por conta e por endereco, para travar as duas superficies.
-- ============================================================================
CREATE TABLE tentativas_autenticacao (
  id            bigserial PRIMARY KEY,
  usuario       text,
  endereco_ip   inet,
  sucesso       boolean NOT NULL,
  ocorrida_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_tentativas_usuario ON tentativas_autenticacao (usuario, ocorrida_em DESC)
  WHERE sucesso = false;
CREATE INDEX ix_tentativas_ip ON tentativas_autenticacao (endereco_ip, ocorrida_em DESC)
  WHERE sucesso = false;


-- Recuperacao de senha: token de uso unico, com hash, no banco (nao em memoria,
-- como no code-drop, onde um restart derruba os tokens em curso).
CREATE TABLE tokens_recuperacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  hash_token    text NOT NULL UNIQUE,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  expira_em     timestamptz NOT NULL,
  usado_em      timestamptz
);

CREATE INDEX ix_tokens_recuperacao_usuario ON tokens_recuperacao (usuario_id)
  WHERE usado_em IS NULL;


-- ============================================================================
-- Trilha de auditoria (append-only)
--
-- "Toda alteracao relevante deve ser auditavel." Inclui leitura de dado pessoal
-- e exportacao, exigidas por references/patrono-seguranca.md (LGPD).
-- ============================================================================
CREATE TABLE logs_auditoria (
  id                bigserial PRIMARY KEY,
  ocorrido_em       timestamptz NOT NULL DEFAULT now(),
  usuario_id        uuid REFERENCES usuarios(id),
  usuario_nome      text,          -- desnormalizado: a trilha sobrevive a exclusao do usuario
  perfil            perfil_usuario,
  sessao_id         uuid,
  acao              text NOT NULL, -- login, consulta_dado_pessoal, exportacao, upsert, revogacao...
  recurso           text,          -- nome da tabela ou rota
  recurso_id        text,
  modulo            modulo_plataforma,
  endereco_ip       inet,
  agente_usuario    text,
  valor_antes       jsonb,
  valor_depois      jsonb,
  detalhe           jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado         text NOT NULL DEFAULT 'sucesso'
);

CREATE INDEX ix_auditoria_usuario ON logs_auditoria (usuario_id, ocorrido_em DESC);
CREATE INDEX ix_auditoria_acao ON logs_auditoria (acao, ocorrido_em DESC);
CREATE INDEX ix_auditoria_recurso ON logs_auditoria (recurso, recurso_id);

COMMENT ON TABLE logs_auditoria IS
  'Append-only. UPDATE e DELETE bloqueados por gatilho: a trilha nao se reescreve.';

-- A trilha e imutavel. Sem isso, "auditavel" seria apenas uma intencao.
CREATE OR REPLACE FUNCTION recusar_alteracao_auditoria() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'logs_auditoria e append-only: % nao e permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON logs_auditoria
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao_auditoria();


-- ============================================================================
-- Permissoes padrao dos seis perfis
--
-- Fonte: 1c do Diagnostico e Wireframes (o verbo de cada perfil) e
-- references/patrono-seguranca.md. Concessao explicita: o que nao esta aqui
-- e negado.
-- ============================================================================

-- Gestora: prepara. Todos os modulos, todas as acoes exceto administrar base.
INSERT INTO permissoes_perfil (perfil, modulo, acao)
SELECT 'gestora', m, a
FROM unnest(ARRAY['visao_geral','equipe','juridico','empreendimentos','inteligencia']::modulo_plataforma[]) m
CROSS JOIN unnest(ARRAY['ler','criar','editar','remover','exportar','executar']::acao_permissao[]) a;

-- Administrador: garante a base. Administracao completa + leitura ampla.
INSERT INTO permissoes_perfil (perfil, modulo, acao)
SELECT 'administrador', 'administracao'::modulo_plataforma, a
FROM unnest(ARRAY['ler','criar','editar','remover','exportar','executar']::acao_permissao[]) a;
INSERT INTO permissoes_perfil (perfil, modulo, acao)
SELECT 'administrador', m, 'ler'::acao_permissao
FROM unnest(ARRAY['visao_geral','equipe','juridico','empreendimentos','inteligencia']::modulo_plataforma[]) m;

-- Diretoria: aprova. Le e exporta o consolidado; nao opera cadastro.
INSERT INTO permissoes_perfil (perfil, modulo, acao)
SELECT 'diretoria', m, a
FROM unnest(ARRAY['visao_geral','juridico','empreendimentos','inteligencia']::modulo_plataforma[]) m
CROSS JOIN unnest(ARRAY['ler','exportar']::acao_permissao[]) a;

-- Lider de area: distribui. Opera a propria area; le o resto do permitido.
INSERT INTO permissoes_perfil (perfil, modulo, acao)
SELECT 'lider', m, a
FROM unnest(ARRAY['visao_geral','equipe','juridico','empreendimentos']::modulo_plataforma[]) m
CROSS JOIN unnest(ARRAY['ler','criar','editar','exportar']::acao_permissao[]) a;

-- Colaborador: registra. O proprio trabalho.
INSERT INTO permissoes_perfil (perfil, modulo, acao) VALUES
  ('colaborador', 'visao_geral', 'ler'),
  ('colaborador', 'equipe', 'ler'),
  ('colaborador', 'equipe', 'criar'),
  ('colaborador', 'equipe', 'editar');

-- Convidado: consulta limitada, somente leitura, com prazo.
INSERT INTO permissoes_perfil (perfil, modulo, acao) VALUES
  ('convidado', 'visao_geral', 'ler');


-- Down Migration
DROP TRIGGER IF EXISTS tg_auditoria_imutavel ON logs_auditoria;
DROP FUNCTION IF EXISTS recusar_alteracao_auditoria();
DROP TABLE IF EXISTS logs_auditoria;
DROP TABLE IF EXISTS tokens_recuperacao;
DROP TABLE IF EXISTS tentativas_autenticacao;
DROP TABLE IF EXISTS sessoes;
DROP TABLE IF EXISTS permissoes_usuario;
DROP TABLE IF EXISTS escopos_tipo_informacao;
DROP TABLE IF EXISTS escopos_empreendimento;
DROP TABLE IF EXISTS escopos_area;
DROP TABLE IF EXISTS permissoes_perfil;
DROP TABLE IF EXISTS usuarios;
