-- Up Migration
-- ============================================================================
-- Acrescenta `unidade` e `cliente_nome` a `honorarios` (criada em
-- 005_juridico.sql para o board 7231876117, mas nunca exposta por nenhuma
-- entidade nem preenchida ate agora — hoje a tabela esta vazia).
--
-- O desenho original ligava o cliente por `cliente_id`, correto para
-- honorarios JUDICIAIS (o processo ja tem um cliente cadastrado). Para
-- EXTRAJUDICIAIS, cadastrados manualmente nesta tela sem nenhum processo por
-- tras, exigir um `clientes.id` obrigaria a criar um registro em `clientes`
-- a cada lancamento — outra tabela, outra tela, e ainda expor
-- `clientes.cpf_cnpj` (dado_pessoal sob mascaramento por escopo) so para
-- guardar um nome. Mesma solucao que `notificacoes.cliente_nome` ja usa:
-- texto simples, sem tabela de apoio.
--
-- `unidade`, pelo mesmo motivo de `distratos.unidade` e
-- `notificacoes.unidade`: identifica de qual contrato/entrega o honorario
-- saiu, e sem ela a planilha nao tem o que mostrar alem do cliente e do
-- valor.
-- ============================================================================

ALTER TABLE honorarios ADD COLUMN unidade text;
ALTER TABLE honorarios ADD COLUMN cliente_nome text;

-- Down Migration
ALTER TABLE honorarios DROP COLUMN unidade;
ALTER TABLE honorarios DROP COLUMN cliente_nome;
