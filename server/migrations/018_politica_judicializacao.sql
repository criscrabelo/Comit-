-- Up Migration
-- ============================================================================
-- Politica de judicializacao: configuravel por FONTE e por DATA DE VIGENCIA.
--
-- Por que existe. Ate aqui, "esta judicializado?" era decidido por listas de
-- termos embutidas no codigo, alimentadas por uma unica coluna de um unico
-- quadro do Monday. A homologacao do board 5959705266 mostrou o custo disso:
-- nenhum dos 6 rotulos reais de `'MEU TRABALHO'` casava com as listas, os 250
-- processos cairam todos em revisao, e mudar a resposta exigiria alterar
-- codigo — sem versao, sem vigencia, sem registro de quem decidiu.
--
-- A decisao da Coevo (05/08/2026): hoje o Monday e a fonte oficial da situacao
-- juridica, e todo registro do quadro Processos Judiciais e judicializado. Mas
-- a regra NAO pode ficar presa ao Monday: o Sienge deve poder assumir a fonte
-- principal sem que a logica precise ser refeita.
--
-- Dai o desenho em tres partes:
--
--   1. `politicas_judicializacao` — a regra em si, versionada, com fonte,
--      escopo, vigencia e ciclo de aprovacao. Trocar de fonte e cadastrar uma
--      politica nova, nao editar codigo.
--
--   2. `judicializacao_apuracoes` — o que CADA fonte concluiu sobre CADA
--      registro. Na transicao, Monday e Sienge coexistem: as duas conclusoes
--      ficam gravadas lado a lado. Conflito nao e resolvido apagando um lado.
--
--   3. Colunas de consolidacao em `processos_judiciais` — qual fonte decidiu o
--      valor operacional, sob qual politica, e se houve divergencia.
--
-- O que este arquivo NAO faz: aprovar politica nenhuma. A politica do Monday
-- entra como `proposta`, e enquanto nenhuma estiver aprovada os registros
-- permanecem em `revisao_necessaria` — que e exatamente onde os 250 estao.
-- Aplicar classificacao definitiva depende de aprovacao humana explicita.
-- ============================================================================

-- ── Como a politica decide ──────────────────────────────────────────────────
CREATE TYPE tipo_politica_judicializacao AS ENUM (
  -- Todo registro do escopo e judicializado pelo fato de estar ali. E a regra
  -- da Coevo hoje: o quadro Processos Judiciais so contem processos.
  'premissa_de_escopo',
  -- Mapa explicito rotulo -> judicializado. Para quando a resposta varia por
  -- rotulo e a equipe listou cada caso.
  'por_rotulo',
  -- Listas de termos casadas por substring. Comportamento historico, mantido
  -- para que uma politica antiga continue reproduzivel.
  'por_termos'
);

COMMENT ON TYPE tipo_politica_judicializacao IS
  'Como a politica conclui. premissa_de_escopo nao olha rotulo: o escopo decide.';

-- ── Ciclo de vida ───────────────────────────────────────────────────────────
-- `proposta` nao classifica nada. So `aprovada` produz efeito.
CREATE TYPE situacao_politica AS ENUM ('proposta', 'aprovada', 'revogada');


CREATE TABLE politicas_judicializacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Versao da politica DENTRO do par (fonte, escopo). Reprocessar um periodo
  -- antigo usa a politica vigente naquela data, nao a atual.
  versao        text NOT NULL,

  fonte         fonte_dado NOT NULL,

  -- Recorte a que a politica se aplica: a chave do quadro/conector
  -- ('processos', 'distratos', ...) ou '*' para todo o conector.
  escopo        text NOT NULL,

  tipo          tipo_politica_judicializacao NOT NULL,

  -- Parametros do tipo. Em `premissa_de_escopo` guarda a origem concreta
  -- (board, endpoint) para auditoria; em `por_rotulo`, o mapa; em `por_termos`,
  -- as listas. Fica em jsonb porque a forma muda com o tipo — e porque uma
  -- coluna por parametro engessaria justamente o que precisa ser configuravel.
  configuracao  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Quando duas fontes valem ao mesmo tempo, a de MENOR numero decide o valor
  -- operacional. A conclusao da outra continua gravada, e a divergencia vira
  -- inconsistencia — precedencia escolhe o que exibir, nao o que descartar.
  precedencia   integer NOT NULL DEFAULT 100,

  vigente_de    date NOT NULL,
  vigente_ate   date,

  situacao      situacao_politica NOT NULL DEFAULT 'proposta',

  -- Por que esta regra existe, em texto. Uma politica sem justificativa e uma
  -- decisao sem autor: seis meses depois ninguem sabe o que ela respondia.
  justificativa text NOT NULL,

  proposta_por  uuid REFERENCES usuarios(id),
  proposta_em   timestamptz NOT NULL DEFAULT now(),

  aprovada_por  uuid REFERENCES usuarios(id),
  aprovada_em   timestamptz,

  revogada_por    uuid REFERENCES usuarios(id),
  revogada_em     timestamptz,
  revogada_motivo text,

  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT politica_versao_unica UNIQUE (fonte, escopo, versao),

  CONSTRAINT politica_vigencia_coerente
    CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de),

  -- Aprovacao sem autor e sem data nao e auditavel.
  CONSTRAINT politica_aprovacao_completa CHECK (
    situacao <> 'aprovada' OR (aprovada_por IS NOT NULL AND aprovada_em IS NOT NULL)
  ),

  CONSTRAINT politica_revogacao_completa CHECK (
    situacao <> 'revogada'
    OR (revogada_em IS NOT NULL AND revogada_motivo IS NOT NULL AND length(trim(revogada_motivo)) > 0)
  )
);

COMMENT ON TABLE politicas_judicializacao IS
  'Regra de judicializacao por fonte e vigencia. Só `aprovada` classifica; `proposta` e simulavel e nao produz efeito.';
COMMENT ON COLUMN politicas_judicializacao.precedencia IS
  'Menor numero decide o valor operacional quando duas fontes valem. Nao descarta a outra conclusao.';
COMMENT ON COLUMN politicas_judicializacao.escopo IS
  'Chave do quadro/conector a que se aplica, ou * para todo o conector.';

CREATE INDEX ix_politica_jud_vigente
  ON politicas_judicializacao (escopo, fonte, vigente_de DESC)
  WHERE situacao = 'aprovada';


-- ── Duas politicas aprovadas nao podem valer ao mesmo tempo ─────────────────
-- Sem isto, aprovar a politica nova sem encerrar a antiga deixaria o par
-- (fonte, escopo) com duas respostas validas na mesma data — e a escolha entre
-- elas viraria ordem de leitura, que e sorte, nao regra.
CREATE OR REPLACE FUNCTION politica_jud_sem_sobreposicao() RETURNS trigger AS $$
DECLARE
  v_conflito text;
BEGIN
  IF NEW.situacao <> 'aprovada' THEN
    RETURN NEW;
  END IF;

  SELECT p.versao INTO v_conflito
  FROM politicas_judicializacao p
  WHERE p.situacao = 'aprovada'
    AND p.fonte = NEW.fonte
    AND p.escopo = NEW.escopo
    AND p.id <> NEW.id
    -- Intervalos [vigente_de, vigente_ate] com fim aberto tratados como infinito.
    AND daterange(p.vigente_de, p.vigente_ate, '[]')
        && daterange(NEW.vigente_de, NEW.vigente_ate, '[]')
  LIMIT 1;

  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION
      'Politica % (% / %) se sobrepoe a versao % ja aprovada. Encerre a vigencia da anterior antes de aprovar.',
      NEW.versao, NEW.fonte, NEW.escopo, v_conflito
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_politica_jud_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON politicas_judicializacao
  FOR EACH ROW EXECUTE FUNCTION politica_jud_sem_sobreposicao();


-- ── Politica aprovada e imutavel no que ela decide ──────────────────────────
-- Editar o criterio de uma politica ja aprovada reescreveria o passado: um
-- indicador apurado sob a versao 1.0.0 passaria a ser explicado por um criterio
-- que nao existia no dia da apuracao. Mudanca de criterio e versao nova.
CREATE OR REPLACE FUNCTION politica_jud_aprovada_imutavel() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'aprovada' THEN
    RETURN NEW;
  END IF;

  IF NEW.fonte IS DISTINCT FROM OLD.fonte
     OR NEW.escopo IS DISTINCT FROM OLD.escopo
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.configuracao IS DISTINCT FROM OLD.configuracao
     OR NEW.versao IS DISTINCT FROM OLD.versao
     OR NEW.vigente_de IS DISTINCT FROM OLD.vigente_de
     OR NEW.precedencia IS DISTINCT FROM OLD.precedencia THEN
    RAISE EXCEPTION
      'Politica % ja aprovada: criterio, fonte, escopo, precedencia e inicio de vigencia sao imutaveis. Crie uma versao nova.',
      OLD.versao
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Encerrar vigencia e revogar continuam permitidos: nao alteram o que a
  -- politica decidiu enquanto valia.
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_politica_jud_aprovada_imutavel
  BEFORE UPDATE ON politicas_judicializacao
  FOR EACH ROW EXECUTE FUNCTION politica_jud_aprovada_imutavel();


-- ── O que cada fonte concluiu sobre cada registro ───────────────────────────
-- Uma linha por (registro, fonte). Durante a transicao Monday -> Sienge as duas
-- linhas coexistem, e e a comparacao entre elas que revela divergencia.
CREATE TABLE judicializacao_apuracoes (
  id            bigserial PRIMARY KEY,

  entidade      text NOT NULL,
  registro_id   uuid NOT NULL,

  fonte         fonte_dado NOT NULL,
  politica_id   uuid REFERENCES politicas_judicializacao(id),

  -- NULL = a politica olhou e nao concluiu. Diferente de `false`, que e uma
  -- conclusao. Colapsar os dois transformaria "nao sei" em "nao esta".
  judicializado boolean,
  revisao_necessaria boolean NOT NULL DEFAULT false,

  -- Em texto, o que levou a esta conclusao. Aparece na tela de revisao.
  motivo        text NOT NULL,

  -- O rotulo cru que a fonte apresentou, preservado como veio.
  valor_observado text,

  apurado_em    timestamptz NOT NULL DEFAULT now(),
  execucao_id   uuid REFERENCES execucoes_importacao(id),

  CONSTRAINT apuracao_unica_por_fonte UNIQUE (entidade, registro_id, fonte)
);

COMMENT ON TABLE judicializacao_apuracoes IS
  'Conclusao de CADA fonte sobre CADA registro. Coexistem na transicao; divergencia nao apaga nenhum lado.';
COMMENT ON COLUMN judicializacao_apuracoes.judicializado IS
  'NULL = a politica nao concluiu. Distinto de false, que e conclusao.';

CREATE INDEX ix_apuracao_registro ON judicializacao_apuracoes (entidade, registro_id);
CREATE INDEX ix_apuracao_revisao ON judicializacao_apuracoes (entidade, fonte)
  WHERE revisao_necessaria = true;


-- ── Consolidacao no registro ────────────────────────────────────────────────
ALTER TABLE processos_judiciais
  -- Qual fonte decidiu o valor que esta em `judicializado`.
  ADD COLUMN judicializacao_fonte     fonte_dado,
  ADD COLUMN judicializacao_politica  uuid REFERENCES politicas_judicializacao(id),
  -- Fontes concluiram coisas diferentes. O valor exibido segue a precedencia,
  -- e a inconsistencia fica aberta para decisao humana.
  ADD COLUMN judicializacao_divergente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN processos_judiciais.judicializacao_fonte IS
  'Fonte cuja conclusao prevaleceu. NULL enquanto nenhuma politica aprovada alcanca o registro.';
COMMENT ON COLUMN processos_judiciais.judicializacao_divergente IS
  'Monday e Sienge concluiram diferente. Valor exibido segue precedencia; ambos ficam em judicializacao_apuracoes.';

CREATE INDEX ix_processos_jud_divergente ON processos_judiciais (judicializacao_divergente)
  WHERE judicializacao_divergente = true;

-- Metadado de carga, nao conteudo: reapurar a politica nao pode inflar `versao`
-- nem o historico do registro (mesma regra estabelecida na migracao 017).
-- `judicializacao_fonte` e `judicializacao_divergente` FICAM de fora da exclusao
-- de proposito: mudar de fonte ou passar a divergir e informacao de conteudo,
-- e o historico tem de registrar.
CREATE OR REPLACE FUNCTION registrar_alteracao() RETURNS trigger AS $$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
  v_mudou  jsonb := '{}'::jsonb;
  v_chave  text;
BEGIN
  v_antes  := to_jsonb(OLD) - 'historico' - 'atualizado_em' - 'versao'
              - 'extraido_em' - 'execucao_id' - 'versao_regra'
              - 'judicializacao_politica';
  v_depois := to_jsonb(NEW) - 'historico' - 'atualizado_em' - 'versao'
              - 'extraido_em' - 'execucao_id' - 'versao_regra'
              - 'judicializacao_politica';

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

COMMENT ON FUNCTION registrar_alteracao IS
  'Trilha e versao por CONTEUDO. Metadado de carga (extraido_em, execucao_id, versao_regra, judicializacao_politica) nao conta como alteracao.';


-- ── Divergencia entre fontes vira inconsistencia ────────────────────────────
-- O valor novo so pode ser USADO depois que esta transacao terminar; por isso
-- nada aqui o referencia.
ALTER TYPE tipo_inconsistencia ADD VALUE IF NOT EXISTS 'divergencia_judicializacao';


-- ── A politica de hoje, como PROPOSTA ───────────────────────────────────────
-- Decisao da Coevo em 05/08/2026: o Monday e hoje a fonte oficial da situacao
-- juridica, e estar no quadro Processos Judiciais e o proprio criterio.
--
-- Entra como `proposta` de proposito. A instrucao foi explicita: "nao aplicar
-- classificacao definitiva aos 250 registros sem minha aprovacao". Aprovar e um
-- ato registrado, com autor e data — nao um efeito colateral de migracao.
INSERT INTO politicas_judicializacao
  (versao, fonte, escopo, tipo, configuracao, precedencia, vigente_de, situacao, justificativa)
VALUES (
  '1.0.0',
  'monday',
  'processos',
  'premissa_de_escopo',
  jsonb_build_object(
    'board', '5959705266',
    'quadro', 'Processos Judiciais',
    'judicializado', true,
    'coluna_situacao', 'MEU TRABALHO',
    'observacao',
      'A coluna de situacao descreve o ANDAMENTO (ACOMPANHANDO, FINALIZADO, ACORDO, '
      || 'BAIXA DEFINITIVA, RECOMPRA/ACORDO, ARQUIVADO PROVISORIAMENTE), nao a judicializacao. '
      || 'Ela continua alimentando situacao/estagio; a judicializacao vem do escopo.'
  ),
  10,
  CURRENT_DATE,
  'proposta',
  'Hoje o Monday e a fonte oficial da situacao juridica na Coevo. Todo registro do quadro '
  || 'Processos Judiciais e judicializado por definicao do proprio quadro. Regra decidida em '
  || '05/08/2026 apos a homologacao do board 5959705266, que mostrou que nenhum dos 6 rotulos '
  || 'reais de situacao responde "esta judicializado?" — todos descrevem andamento. '
  || 'Preparada para transicao: quando o Sienge for homologado, entra uma politica de fonte '
  || 'sienge e as duas coexistem com deteccao de divergencia ate o corte.'
);


-- Down Migration
DROP INDEX IF EXISTS ix_processos_jud_divergente;
ALTER TABLE processos_judiciais
  DROP COLUMN IF EXISTS judicializacao_divergente,
  DROP COLUMN IF EXISTS judicializacao_politica,
  DROP COLUMN IF EXISTS judicializacao_fonte;
DROP TABLE IF EXISTS judicializacao_apuracoes;
DROP TRIGGER IF EXISTS tg_politica_jud_aprovada_imutavel ON politicas_judicializacao;
DROP FUNCTION IF EXISTS politica_jud_aprovada_imutavel();
DROP TRIGGER IF EXISTS tg_politica_jud_sem_sobreposicao ON politicas_judicializacao;
DROP FUNCTION IF EXISTS politica_jud_sem_sobreposicao();
DROP TABLE IF EXISTS politicas_judicializacao;
DROP TYPE IF EXISTS situacao_politica;
DROP TYPE IF EXISTS tipo_politica_judicializacao;
