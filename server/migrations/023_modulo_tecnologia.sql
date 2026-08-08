-- Up Migration
-- ============================================================================
-- Modulo `tecnologia`, para a tela de Projetos de TI.
--
-- Esta migracao SO acrescenta o valor ao enum. A concessao por perfil vive na
-- 025, porque o PostgreSQL nao permite usar um valor de enum na mesma
-- transacao em que ele foi criado — mesma regra da migracao 014/015.
-- ============================================================================

ALTER TYPE modulo_plataforma ADD VALUE IF NOT EXISTS 'tecnologia';


-- Down Migration
-- PostgreSQL nao remove valor de enum. Reverter exigiria recriar o tipo e
-- todas as colunas que o usam — operacao destrutiva que nao cabe num rollback
-- automatico. Se for mesmo necessario, faca a mao, com backup antes.
SELECT 1;
