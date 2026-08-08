-- Up Migration
-- ============================================================================
-- Transferencia Intermediada (nome comercial atual; a base juridica e a
-- cessao de direitos de recompra) — board Monday 6149480325.
--
-- Diferente de `distratos.categoria = 'recompra'` (o desfecho de uma
-- notificacao/cobranca que termina em a construtora recomprar a unidade do
-- cliente — ver migrations/019 e 022 e docs/REGRA-SAIDA-DE-CLIENTE.md), esta
-- tabela comeca DEPOIS disso: acompanha a revenda da unidade ja recomprada a
-- um novo comprador — valor da venda original, valor de mercado atual, lucro
-- e a data em que essa nova operacao foi efetivada ou recusada. Sao dois
-- momentos do mesmo processo, em dois quadros diferentes do Monday.
--
-- `data_liberacao`: data em que a unidade fica liberada para ser
-- comercializada de novo — nao vem do board do handoff, foi pedida por
-- Cristiane para controlar esse intervalo.
--
-- Cadastro manual por enquanto: sem MONDAY_TOKEN nesta sessao para
-- homologar as colunas do board 6149480325.
-- ============================================================================

CREATE TABLE transferencias_intermediadas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendimento_id  uuid REFERENCES empreendimentos(id),
  unidade            text,
  data_venda         date,
  valor_venda        numeric(18,2),
  valor_atual        numeric(18,2),
  lucro              numeric(18,2),
  conclusao          text,
  status             text,
  data_transferencia date,
  lucro_atualizado   numeric(18,2),
  data_liberacao     date,
  versao             integer NOT NULL DEFAULT 1,

  CONSTRAINT transf_conclusao_valida CHECK (conclusao IS NULL OR conclusao IN (
    'Concluído', 'Em andamento', 'Enviado'
  )),
  CONSTRAINT transf_status_valido CHECK (status IS NULL OR status IN (
    'SUCESSO', 'RECUSADO'
  ))
);

SELECT aplicar_proveniencia('transferencias_intermediadas');
SELECT aplicar_trilha('transferencias_intermediadas');

COMMENT ON TABLE transferencias_intermediadas IS
  'Revenda de unidade ja recomprada (transferencia intermediada / cessao de direitos de recompra). Sem comite_id: backlog continuo, nao recorte mensal.';
COMMENT ON COLUMN transferencias_intermediadas.data_liberacao IS
  'Data em que a unidade fica liberada para ser comercializada de novo. Pedido explicito de Cristiane, sem coluna correspondente no board do Monday.';

-- Down Migration
DROP TABLE IF EXISTS transferencias_intermediadas;
