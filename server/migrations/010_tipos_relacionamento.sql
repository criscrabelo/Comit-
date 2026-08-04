-- Up Migration
-- ============================================================================
-- Tipos do motor de relacionamento.
--
-- Arquivo separado das tabelas de proposito: `ALTER TYPE ... ADD VALUE` roda em
-- transacao no PostgreSQL 12+, mas o valor novo so pode ser USADO depois do
-- commit. Adicionar aqui e usar na 011 respeita essa regra.
-- ============================================================================

-- ── Dois tipos novos de inconsistencia ──────────────────────────────────────
--
-- Exigencia direta da regra de comparacao financeira: valores diferentes NAO
-- sao divergencia por si. Quando as datas de referencia nao coincidem, ou
-- quando ainda falta validar os elementos comparaveis, a conclusao fica
-- suspensa nesses dois estados intermediarios.
ALTER TYPE tipo_inconsistencia ADD VALUE IF NOT EXISTS 'data_referencia_incompativel';
ALTER TYPE tipo_inconsistencia ADD VALUE IF NOT EXISTS 'divergencia_valor_a_validar';
ALTER TYPE tipo_inconsistencia ADD VALUE IF NOT EXISTS 'natureza_valor_incompativel';

-- ── Situacao do vinculo ─────────────────────────────────────────────────────
CREATE TYPE situacao_vinculo AS ENUM (
  'automatico',   -- confianca alta: vinculado sem intervencao
  'sugerido',     -- confianca media: aguarda revisao humana
  'recusado',     -- confianca baixa: NAO vinculado automaticamente
  'ambiguo',      -- dois ou mais candidatos: inconsistencia obrigatoria
  'bloqueado',    -- um bloqueio automatico impediu o vinculo
  'aceito',       -- humano aceitou a sugestao
  'rejeitado',    -- humano rejeitou
  'desfeito'      -- vinculo anterior desfeito por correcao formal
);

-- Down Migration
DROP TYPE IF EXISTS situacao_vinculo;
-- Valores de ENUM nao sao removiveis no PostgreSQL. Os tres tipos de
-- inconsistencia acrescentados permanecem — sao aditivos e inofensivos.
