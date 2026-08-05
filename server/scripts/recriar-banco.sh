#!/usr/bin/env bash
# Recria o banco de desenvolvimento/teste do zero e aplica todas as migracoes
# em ordem. Usado no desenvolvimento e pelos testes automatizados.
#
# Uso:
#   PGPORT=55432 PGDATABASE=patrono_test ./scripts/recriar-banco.sh
#
# Nao usar em producao: producao aplica migracoes com `npm run migrate:up`,
# que mantem o registro de versao e nunca derruba o banco.
set -euo pipefail

PGPORT="${PGPORT:-5432}"
PGHOST="${PGHOST:-127.0.0.1}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-patrono_dev}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

executar() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

echo "→ recriando $PGDATABASE em $PGHOST:$PGPORT"
# WITH FORCE encerra as conexoes abertas (PostgreSQL 13+). Sem isso, um servidor
# de desenvolvimento conectado faz o DROP falhar — e, se a saida estiver
# redirecionada, a falha passa despercebida e os testes rodam sobre dados velhos.
executar -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $PGDATABASE WITH (FORCE);"
executar -d postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $PGDATABASE;"

for arquivo in "$RAIZ"/migrations/*.sql; do
  nome="$(basename "$arquivo")"
  printf '→ %s' "$nome"
  # Extrai apenas a secao "Up Migration" e aplica numa transacao unica, para que
  # um erro no meio nao deixe o banco em estado parcial.
  {
    echo 'BEGIN;'
    sed -n '/^-- Up Migration/,/^-- Down Migration/p' "$arquivo" | sed '/^-- Down Migration/d'
    echo 'COMMIT;'
  } | executar -d "$PGDATABASE" -v ON_ERROR_STOP=1 -q >/dev/null
  echo ' ok'
done

# Registra as migracoes aplicadas com o checksum do arquivo. E a versao do
# esquema que o backup grava e a restauracao compara — sem isso, restaurar sobre
# um esquema diferente passaria despercebido.
for arquivo in "$RAIZ"/migrations/*.sql; do
  nome="$(basename "$arquivo")"
  soma="$(sha256sum "$arquivo" | cut -d' ' -f1)"
  executar -d "$PGDATABASE" -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO migracoes_aplicadas (nome, checksum) VALUES ('$nome', '$soma')
     ON CONFLICT (nome) DO UPDATE SET checksum = EXCLUDED.checksum;" >/dev/null
done

tabelas=$(executar -d "$PGDATABASE" -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
negocio=$(executar -d "$PGDATABASE" -Atc "SELECT count(*) FROM tabelas_de_negocio;")

echo "✓ $PGDATABASE pronto — $tabelas tabelas, $negocio de negocio com proveniencia"
