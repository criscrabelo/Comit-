-- Up Migration
-- ============================================================================
-- Financeiro: origem Sienge (precedencia sobre Monday).
--
-- Duas regras estruturais materializadas aqui:
--
--   1. POSICAO x MOVIMENTACAO estao em tabelas SEPARADAS.
--      Saldo e carteira sao posicao numa data — nunca se somam entre periodos.
--      Pagamento e comissao sao movimentacao — somam eventos unicos.
--      Separar fisicamente e o que torna o erro dificil de cometer.
--
--   2. CARTEIRA DE REFERENCIA e deduplicada por
--      empresa + empreendimento + data_referencia + tipo, no proprio banco
--      (references/regras-classificacao.md secao Carteira).
-- ============================================================================

-- ── Titulos a receber (posicao) ─────────────────────────────────────────────
CREATE TABLE titulos_receber (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa           text,
  empreendimento_id uuid REFERENCES empreendimentos(id),
  cliente_id        uuid REFERENCES clientes(id),
  contrato_id       uuid REFERENCES contratos(id),
  unidade_id        uuid REFERENCES unidades(id),
  -- Identificador original do Sienge, preservado.
  numero_titulo     text,
  situacao          text,
  valor_nominal     numeric(18,2),   -- Sienge: "valor original" do titulo/parcela
  saldo_atualizado  numeric(18,2)
);
SELECT aplicar_proveniencia('titulos_receber');
SELECT aplicar_trilha('titulos_receber');
CREATE INDEX ix_titulos_contrato ON titulos_receber (contrato_id);


-- ── Parcelas (posicao) ──────────────────────────────────────────────────────
CREATE TABLE parcelas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id         uuid REFERENCES titulos_receber(id),
  contrato_id       uuid REFERENCES contratos(id),
  cliente_id        uuid REFERENCES clientes(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  numero_parcela    text,
  vencimento        date,
  valor_nominal     numeric(18,2),   -- Sienge: "valor original" do titulo/parcela
  saldo_vencido     numeric(18,2),
  saldo_atualizado  numeric(18,2),
  juros             numeric(18,2),
  multa             numeric(18,2),
  dias_atraso       integer,
  -- Derivada de dias_atraso conforme comum.py:157-171. Persistida para que a
  -- fotografia guarde a faixa apurada na epoca, nao a recalculada hoje.
  faixa             faixa_atraso,
  status            text
);
SELECT aplicar_proveniencia('parcelas');
SELECT aplicar_trilha('parcelas');
CREATE INDEX ix_parcelas_contrato_venc ON parcelas (contrato_id, vencimento);
CREATE INDEX ix_parcelas_faixa ON parcelas (faixa) WHERE faixa IS NOT NULL;

COMMENT ON COLUMN parcelas.faixa IS
  'Faixa de atraso apurada na data_referencia. 1-30, 31-60, 61-90, 91-120, >120.';


-- ── Pagamentos (MOVIMENTACAO — soma eventos unicos) ────────────────────────
CREATE TABLE pagamentos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id        uuid REFERENCES parcelas(id),
  titulo_id         uuid REFERENCES titulos_receber(id),
  contrato_id       uuid REFERENCES contratos(id),
  cliente_id        uuid REFERENCES clientes(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  data_pagamento    date NOT NULL,
  valor_pago        numeric(18,2) NOT NULL,
  valor_juros       numeric(18,2),
  valor_multa       numeric(18,2),
  forma             text
);
SELECT aplicar_proveniencia('pagamentos');
SELECT aplicar_trilha('pagamentos');
CREATE INDEX ix_pagamentos_data ON pagamentos (data_pagamento);

COMMENT ON TABLE pagamentos IS
  'MOVIMENTACAO: soma eventos unicos no periodo. Nunca confundir com posicao de saldo.';


-- ── Saldos financeiros (POSICAO — nao somar entre datas) ───────────────────
CREATE TABLE saldos_financeiros (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id       uuid REFERENCES contratos(id),
  cliente_id        uuid REFERENCES clientes(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  empresa           text,
  saldo_vencido     numeric(18,2),
  saldo_atualizado  numeric(18,2),
  saldo_contratual  numeric(18,2),
  dias_atraso       integer,
  faixa             faixa_atraso
);
SELECT aplicar_proveniencia('saldos_financeiros');
SELECT aplicar_trilha('saldos_financeiros');

-- Uma posicao por contrato por data de referencia. Impede que varias
-- notificacoes do Monday multipliquem o mesmo saldo (regra de sienge.md).
CREATE UNIQUE INDEX ux_saldo_contrato_data
  ON saldos_financeiros (contrato_id, data_referencia)
  WHERE contrato_id IS NOT NULL AND data_referencia IS NOT NULL;

COMMENT ON TABLE saldos_financeiros IS
  'POSICAO na data_referencia. Nunca somar entre datas: usar fechamento ou media.';


-- ── Carteira de referencia (POSICAO, deduplicada no banco) ─────────────────
CREATE TABLE carteiras_referencia (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa           text NOT NULL,
  empreendimento_id uuid NOT NULL REFERENCES empreendimentos(id),
  tipo              tipo_carteira NOT NULL,
  valor             numeric(18,2) NOT NULL,
  regra_deduplicacao text
);
SELECT aplicar_proveniencia('carteiras_referencia');
SELECT aplicar_trilha('carteiras_referencia');

-- A deduplicacao obrigatoria, imposta pelo banco. O teste test_financeiro.py da
-- skill existe justamente para impedir a multiplicacao da carteira por linha.
CREATE UNIQUE INDEX ux_carteira_dedup
  ON carteiras_referencia (empresa, empreendimento_id, data_referencia, tipo);

COMMENT ON TABLE carteiras_referencia IS
  'Deduplicada por empresa + empreendimento + data_referencia + tipo. NAO somar por linha.';


-- ── Comissoes (movimentacao) ────────────────────────────────────────────────
CREATE TABLE comissoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id       uuid REFERENCES contratos(id),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  beneficiario      text,
  valor             numeric(18,2),
  data_evento       date,
  status            text
);
SELECT aplicar_proveniencia('comissoes');
SELECT aplicar_trilha('comissoes');


-- ============================================================================
-- Percentuais de perda para PDD financeira
--
-- "Nunca inventar percentuais": a PDD financeira so e calculada quando existir
-- percentual APROVADO por faixa. Sem linha aqui, o indicador fica sem dado, com
-- o motivo declarado.
-- ============================================================================
CREATE TABLE percentuais_perda (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendimento_id uuid REFERENCES empreendimentos(id),
  faixa             faixa_atraso NOT NULL,
  percentual        numeric(7,4) NOT NULL,
  aprovado_por      uuid REFERENCES usuarios(id),
  aprovado_em       timestamptz NOT NULL,
  vigente_de        date NOT NULL,
  vigente_ate       date,
  CONSTRAINT percentual_intervalo CHECK (percentual >= 0 AND percentual <= 100)
);

CREATE UNIQUE INDEX ux_percentual_vigente
  ON percentuais_perda (coalesce(empreendimento_id, '00000000-0000-0000-0000-000000000000'::uuid), faixa)
  WHERE vigente_ate IS NULL;

COMMENT ON TABLE percentuais_perda IS
  'Sem percentual aprovado nao existe PDD financeira. A PDD operacional por clientes e outro indicador.';


-- Down Migration
DROP TABLE IF EXISTS percentuais_perda;
DROP TABLE IF EXISTS comissoes;
DROP TABLE IF EXISTS carteiras_referencia;
DROP TABLE IF EXISTS saldos_financeiros;
DROP TABLE IF EXISTS pagamentos;
DROP TABLE IF EXISTS parcelas;
DROP TABLE IF EXISTS titulos_receber;
DELETE FROM tabelas_de_negocio WHERE nome_tabela IN (
  'titulos_receber','parcelas','pagamentos','saldos_financeiros',
  'carteiras_referencia','comissoes'
);
