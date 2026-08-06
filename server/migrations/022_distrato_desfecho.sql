-- Up Migration
-- ============================================================================
-- Desfecho da tentativa: aceita, recusada, desistida.
--
-- A recompra e uma OFERTA (secao 1 de docs/REGRA-SAIDA-DE-CLIENTE.md), e oferta
-- tem taxa de conversao. A Coevo precisa saber "quantas tentamos e quantas deram
-- certo" — e por isso o quadro registra `RECUSADO PELO CLIENTE`.
--
-- A carga anterior IGNORAVA as recusadas, por decisao minha, para nao inflar a
-- contagem de recompras. Estava errado pela metade: nao inflar o numerador e
-- correto, mas descartar o denominador apaga a pergunta inteira. Com `desfecho`
-- as duas contagens convivem — 25 tentativas, 16 aceitas — sem que uma minta
-- sobre a outra.
--
-- Sem CHECK de valores. O desfecho vem do rotulo da origem e a Coevo ainda vai
-- acrescentar pelo menos um caso (cliente aceita e desiste depois). Um CHECK
-- aqui recusaria a carga inteira no dia em que um rotulo novo aparecesse no
-- quadro — que e exatamente quando se quer que o dado entre e apareca.
--
-- Vale para os quatro tipos de saida, nao so recompra: distrato tambem pode ser
-- pedido e nao concluido.
-- ============================================================================

ALTER TABLE distratos
  ADD COLUMN desfecho text;

COMMENT ON COLUMN distratos.desfecho IS
  'Rotulo bruto do desfecho na origem (SUCESSO, RECUSADO PELO CLIENTE, ...). NULL = a origem nao declara desfecho para este tipo. Registro existir NAO significa que a saida se concretizou.';

CREATE INDEX ix_distratos_desfecho ON distratos (categoria, desfecho)
  WHERE ausente_desde IS NULL;


-- Down Migration
DROP INDEX IF EXISTS ix_distratos_desfecho;
ALTER TABLE distratos DROP COLUMN IF EXISTS desfecho;
