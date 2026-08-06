-- Up Migration
-- ============================================================================
-- Liga o distrato/retomada as notificacoes que o precederam.
--
-- A pergunta que motiva: "quantos dias, DA NOTIFICACAO ate a conclusao de todo
-- o processo?". O comeco existe (notificacoes.data_notificacao) e o fim ainda
-- nao (o quadro de Distratos nao tem data de conclusao — item 6.1 de
-- docs/HOMOLOGACAO-MONDAY-DISTRATOS.md). Falta tambem, e e o que esta coluna
-- resolve, saber QUAL notificacao corresponde a QUAL distrato.
--
-- Sem ela a unica ligacao possivel e por empreendimento + unidade, que e
-- adivinhacao: casou 12 dos 38 distratos, e um dos pares deu -29 dias — pedido
-- de distrato ANTES da notificacao, ou seja, casou dois episodios diferentes da
-- mesma unidade. Chave errada nao produz erro, produz numero errado.
--
-- Guarda o `id_origem` da notificacao, e nao uma chave estrangeira para
-- `notificacoes(id)`, por dois motivos:
--
--   1. Nao cria dependencia de ORDEM de carga. Um distrato pode ser
--      sincronizado antes da notificacao que ele referencia; com FK o vinculo
--      viraria nulo em silencio, e so uma segunda passada o consertaria.
--   2. `id_origem` ja e a chave de juncao de toda a ingestao. O vinculo e
--      proveniencia da origem, nao uma relacao local — e continua verdadeiro
--      mesmo que a notificacao ainda nao tenha sido lida, ou tenha sido
--      marcada ausente.
--
-- ARRAY porque a mesma unidade pode ter sido notificada mais de uma vez antes
-- de virar distrato — sao 1072 notificacoes distribuidas em 38 competencias, e
-- reincidencia e o caso comum, nao a excecao. Guardar so a primeira descartaria
-- o historico de cobranca; guardar so a ultima responderia a pergunta errada.
--
-- Conferido na origem em 06/08/2026: o quadro de Retomadas (18413057491) JA tem
-- a coluna de ligacao, preenchida em 23 de 23 itens. O de Distratos
-- (18404493605) ainda nao tem — quando for criada, a ingestao passa a preencher
-- sem nenhuma alteracao de codigo.
-- ============================================================================

ALTER TABLE distratos
  ADD COLUMN notificacoes_origem text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN distratos.notificacoes_origem IS
  'id_origem das notificacoes ligadas a este distrato no quadro de origem. Vazio = sem ligacao declarada, nao "sem notificacao".';

-- A juncao natural e `notificacoes.id_origem = ANY(distratos.notificacoes_origem)`.
CREATE INDEX ix_distratos_notificacoes_origem
  ON distratos USING gin (notificacoes_origem);


-- Down Migration
DROP INDEX IF EXISTS ix_distratos_notificacoes_origem;
ALTER TABLE distratos DROP COLUMN IF EXISTS notificacoes_origem;
