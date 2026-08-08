-- Up Migration
-- ============================================================================
-- Concessoes do modulo `tecnologia`, criado na 023. Precisa de migracao
-- separada pelo mesmo motivo da 014/015: o PostgreSQL nao deixa usar um valor
-- de enum na mesma transacao em que ele foi criado.
--
-- Mesmo desenho das concessoes gerais (002_identidade_acesso.sql): gestora e
-- lider operam, administrador e diretoria so leem/exportam, colaborador e
-- convidado ficam de fora — quem cadastra e mantem os projetos e a mesma
-- linha de comando de sempre.
-- ============================================================================

INSERT INTO permissoes_perfil (perfil, modulo, acao) VALUES
  ('gestora',       'tecnologia', 'ler'),
  ('gestora',       'tecnologia', 'criar'),
  ('gestora',       'tecnologia', 'editar'),
  ('gestora',       'tecnologia', 'remover'),
  ('gestora',       'tecnologia', 'exportar'),
  ('administrador', 'tecnologia', 'ler'),
  ('diretoria',     'tecnologia', 'ler'),
  ('diretoria',     'tecnologia', 'exportar'),
  ('lider',         'tecnologia', 'ler'),
  ('lider',         'tecnologia', 'criar'),
  ('lider',         'tecnologia', 'editar'),
  ('lider',         'tecnologia', 'exportar');


-- Down Migration
DELETE FROM permissoes_perfil WHERE modulo = 'tecnologia';
