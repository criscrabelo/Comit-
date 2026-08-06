-- Up Migration
-- ============================================================================
-- Liga o distrato ao item do quadro (JUR) CONTRATOS PARA CLIENTES.
--
-- O pedido de distrato NAO entra so pela notificacao. Ele tambem entra pelo
-- quadro de contratos, que e por onde Relacionamento e Credito (repasses e
-- financiamentos) encaminham o caso. Sao duas portas de entrada diferentes, e
-- guardar so uma faria o distrato parecer sem origem em metade dos casos.
--
-- A coluna de ligacao JA EXISTE no board 18404493605 e JA ESTA PREENCHIDA em
-- 26 dos 38 itens (conferido em 06/08/2026). Nada precisa mudar na origem —
-- faltava so a ingestao ler.
--
-- E por essa ligacao que chegam as colunas espelhadas do quadro: SETOR
-- (RELACIONAMENTO, CREDITO, JURIDICO, COMERCIAL), SOLICITANTE e EMPREENDIMENTO.
-- As tres vem vazias exatamente nos 12 itens sem ligacao — o que confirma o
-- caminho e explica os vazios sem precisar supor.
--
-- Mesmas tres decisoes da migracao 020, pelos mesmos motivos: guarda o
-- `id_origem` e nao uma chave estrangeira (nao cria dependencia de ordem de
-- carga), le o id e nao o nome (nome e digitado), e e ARRAY (um distrato pode
-- referenciar mais de um contrato — permuta, unidade trocada, contrato aditado).
-- ============================================================================

ALTER TABLE distratos
  ADD COLUMN contratos_origem text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN distratos.contratos_origem IS
  'id_origem dos itens do quadro (JUR) CONTRATOS PARA CLIENTES ligados a este distrato. Segunda porta de entrada do pedido, ao lado da notificacao. Vazio = sem ligacao declarada.';

CREATE INDEX ix_distratos_contratos_origem
  ON distratos USING gin (contratos_origem);


-- Down Migration
DROP INDEX IF EXISTS ix_distratos_contratos_origem;
ALTER TABLE distratos DROP COLUMN IF EXISTS contratos_origem;
