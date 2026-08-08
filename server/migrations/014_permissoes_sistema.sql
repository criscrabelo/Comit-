-- Up Migration
-- ============================================================================
-- Modulo `sistema` e as acoes `backup` e `restaurar`.
--
-- Backup e restauracao nao cabem em `administracao`. Administrar a base e uma
-- coisa; poder levar a base inteira embora num arquivo, ou substitui-la por
-- outra, e outra. Separar permite conceder uma sem a outra — e permite que a
-- Gestora consulte o estado da continuidade sem poder restaurar nada.
--
-- Esta migracao SO acrescenta os valores ao enum. A concessao por perfil vive
-- na 015, porque o PostgreSQL nao permite usar um valor de enum na mesma
-- transacao em que ele foi criado.
--
-- ATENCAO ao rodar: a separacao em dois arquivos so funciona se cada migracao
-- tiver a PROPRIA transacao. `node-pg-migrate` envolve a execucao inteira numa
-- transacao unica por padrao, e ai a 015 volta a usar o valor antes do commit
-- da 014 — o erro e `unsafe use of new value "sistema" of enum type
-- modulo_plataforma`. Por isso `npm run migrate` passa `--no-single-transaction`.
-- ============================================================================

ALTER TYPE modulo_plataforma ADD VALUE IF NOT EXISTS 'sistema';

ALTER TYPE acao_permissao ADD VALUE IF NOT EXISTS 'backup';
ALTER TYPE acao_permissao ADD VALUE IF NOT EXISTS 'restaurar';


-- Down Migration
-- PostgreSQL nao remove valor de enum. Reverter exigiria recriar os dois tipos
-- e todas as colunas que os usam — operacao destrutiva que nao cabe num
-- rollback automatico. Se for mesmo necessario, faca a mao, com backup antes.
SELECT 1;
