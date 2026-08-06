-- Up Migration
-- ============================================================================
-- Notificacao pode ENCERRAR sem ter sido resolvida.
--
-- O que a homologacao do board 5630368737 mostrou: 7 notificacoes tem data de
-- resolucao preenchida na origem e estagio terminal — 6 `Distratado` e 1
-- `A Retomar` —, mas o modelo so admitia data de solucao com
-- `estagio = 'Resolvida'`. Resultado: a data era descartada, e essas
-- notificacoes ficavam eternamente "em andamento" no tempo medio de solucao.
--
-- A correcao obvia seria classifica-las como `Resolvida`. Seria errada: o
-- cliente distratou, a unidade foi para retomada — a notificacao acabou, mas
-- nao com o desfecho que se queria. Contar isso como resolucao inflaria a taxa
-- de resolucao de notificacoes, que e indicador de comite.
--
-- Dai o terceiro estado. `Encerrada` fecha o caso e registra a data — entra no
-- tempo medio, que passa a refletir quanto tempo o caso ficou aberto — sem
-- entrar na contagem de resolvidas.
--
-- Decisao da Coevo em 06/08/2026, sobre os dois rotulos apontados na
-- homologacao. `Recompra` (7 ocorrencias) e da mesma familia e NAO foi
-- alterada: nenhuma das 7 tem data de resolucao hoje, e mexer numa regra de
-- indicador sem a pergunta ter sido feita e exatamente o que nao se faz aqui.
-- ============================================================================

ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacao_solucao_coerente;

ALTER TABLE notificacoes ADD CONSTRAINT notificacao_solucao_coerente CHECK (
  data_solucao IS NULL OR estagio IN ('Resolvida', 'Encerrada')
);

COMMENT ON COLUMN notificacoes.estagio IS
  'Resolvida = desfecho favoravel. Encerrada = caso fechado sem resolucao (distrato, retomada). Em Andamento = aberto. Só as duas primeiras admitem data_solucao.';


-- Down Migration
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacao_solucao_coerente;
-- Notificacoes encerradas perderiam a data ao voltar a restricao antiga; a
-- data e zerada antes, para que o DOWN nao falhe deixando o esquema no meio.
UPDATE notificacoes SET data_solucao = NULL WHERE estagio = 'Encerrada';
ALTER TABLE notificacoes ADD CONSTRAINT notificacao_solucao_coerente CHECK (
  data_solucao IS NULL OR estagio = 'Resolvida'
);
