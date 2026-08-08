-- Up Migration
-- ============================================================================
-- Projetos de TI — carteira de projetos de tecnologia (Coevo/Grupo Patrono).
--
-- Diferente das tabelas juridicas, um projeto de TI NAO pertence a um comite
-- mensal: e um backlog continuo (board Monday 5188439530, workspace IT), sem
-- data de competencia. Por isso, ao contrario de `notificacoes` ou `fatos`,
-- esta tabela nao tem `comite_id` — o padrao aqui e `empreendimentos`, base
-- de cadastro sem recorte de mes.
--
-- Fonte: design_handoff_comites_juridicos/README.md, secao "Tela: Projetos de
-- TI". Nao homologado contra o board real: falta MONDAY_TOKEN nesta sessao
-- para confirmar os titulos exatos das colunas. Ver docs/PENDENCIAS-MONDAY.md.
-- A tela funciona hoje por cadastro manual; a sincronizacao fica pendente.
-- ============================================================================

CREATE TABLE projetos_ti (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome     text NOT NULL,
  tipo     text,
  status   text NOT NULL DEFAULT 'IDEALIZAÇÃO',
  empresa  text,
  executor text,
  inicio   date,
  fim      date,
  -- Dias e um dado calculado no Monday (coluna DIAS). Guardado como veio da
  -- origem: recalcular aqui divergiria do que a origem mostra.
  dias     integer,
  versao   integer NOT NULL DEFAULT 1,

  CONSTRAINT proj_ti_status_valido CHECK (status IN (
    'IMPLEMENTADO', 'EM PROGRESSO', 'ATRASADO', 'PARADO',
    'IDEALIZAÇÃO', 'AGUARDANDO APROVAÇÃO'
  ))
);

-- Acrescenta fonte, id_origem, valor_original/normalizado, as tres datas de
-- proveniencia, regra e confianca de vinculo, versao_regra, execucao_id,
-- historico, ausente_desde, demonstrativo, criado_em/atualizado_em — e cria o
-- indice unico (fonte, id_origem) que torna o upsert idempotente por
-- construcao. Ver aplicar_proveniencia em 001_base.sql.
SELECT aplicar_proveniencia('projetos_ti');
SELECT aplicar_trilha('projetos_ti');

COMMENT ON TABLE projetos_ti IS
  'Carteira de projetos de tecnologia. Sem comite_id: nao e um recorte mensal, e backlog continuo.';


-- Down Migration
DROP TABLE IF EXISTS projetos_ti;
