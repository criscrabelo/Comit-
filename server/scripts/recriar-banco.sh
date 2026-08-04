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
executar -d postgres -q -c "DROP DATABASE IF EXISTS $PGDATABASE;"
executar -d postgres -q -c "CREATE DATABASE $PGDATABASE;"

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

tabelas=$(executar -d "$PGDATABASE" -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
negocio=$(executar -d "$PGDATABASE" -Atc "SELECT count(*) FROM tabelas_de_negocio;")

echo "✓ $PGDATABASE pronto — $tabelas tabelas, $negocio de negocio com proveniencia"
