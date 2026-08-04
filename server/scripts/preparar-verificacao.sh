#!/usr/bin/env bash
# Prepara um ambiente descartavel para scripts/verificar-inversao.mjs:
# recria o banco, cria a conta de verificacao e sobe o servidor.
#
# O banco e recriado do zero de proposito: a verificacao cria comite, migra
# dados legados e testa conflito de versao. Rodar sobre uma base ja usada
# esbarraria nas proprias restricoes de unicidade que ela deveria provar.
set -euo pipefail

PORTA="${PORTA:-3131}"
PGPORT="${PGPORT:-55432}"
BANCO="${BANCO:-patrono_verif}"
USUARIO="${USUARIO:-verificacao}"
: "${SENHA:?defina SENHA no ambiente}"

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

export DATABASE_URL="postgres://postgres@127.0.0.1:${PGPORT}/${BANCO}"

fuser -k "${PORTA}/tcp" 2>/dev/null || true
sleep 1

PGPORT="$PGPORT" PGDATABASE="$BANCO" ./scripts/recriar-banco.sh

SENHA="$SENHA" npx tsx scripts/criar-usuario.ts \
  --usuario "$USUARIO" --nome 'Conta de Verificacao' --perfil gestora --area juridico

# Escopo de todos os empreendimentos: sem ele, a conta enxergaria apenas o que
# lhe fosse atribuido, e a verificacao mediria o recorte em vez da inversao.
cat > /tmp/patrono-escopo.ts <<'TS'
import { db, fecharBanco } from '../src/db/pool.js';
const login = process.env.USUARIO ?? 'verificacao';
const u = await db.selectFrom('usuarios').select('id').where('usuario', '=', login).executeTakeFirstOrThrow();
await db.insertInto('escopos_empreendimento').values({ usuario_id: u.id, todos: true }).execute();
await fecharBanco();
TS
cp /tmp/patrono-escopo.ts scripts/.escopo-verificacao.ts
USUARIO="$USUARIO" npx tsx scripts/.escopo-verificacao.ts
rm -f scripts/.escopo-verificacao.ts /tmp/patrono-escopo.ts

PORT="$PORTA" NODE_ENV=development LOG_LEVEL=warn \
  CORS_ORIGINS="http://127.0.0.1:${PORTA}" \
  npx tsx src/server.ts > /tmp/patrono-verificacao.log 2>&1 &

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${PORTA}/api/saude" >/dev/null; then
    echo "✓ servidor pronto em http://127.0.0.1:${PORTA}"
    exit 0
  fi
  sleep 1
done

echo "✗ servidor nao respondeu; ver /tmp/patrono-verificacao.log" >&2
exit 1
