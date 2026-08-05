#!/usr/bin/env bash
# Aplica migracoes pendentes, com backup obrigatorio antes das destrutivas.
#
# O problema que isto resolve: uma migracao que derruba coluna ou tabela nao
# tem volta pelo `down` — o `down` recria a estrutura, nao o conteudo. Quando a
# perda e de dado, o unico caminho de volta e o backup, e ele precisa existir
# ANTES.
#
# A deteccao e por leitura do SQL pendente. Prefere o falso positivo: uma
# migracao inofensiva classificada como destrutiva custa um backup a mais;
# o contrario custa os dados.
#
# Uso:
#   ./scripts/migrar-com-backup.sh              aplica as pendentes
#   ./scripts/migrar-com-backup.sh --verificar  so informa o que faria
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

: "${DATABASE_URL:?defina DATABASE_URL}"

APENAS_VERIFICAR=false
[[ "${1:-}" == "--verificar" ]] && APENAS_VERIFICAR=true

# Comandos que removem estrutura ou conteudo. ALTER ... DROP COLUMN entra;
# ALTER ... ADD COLUMN, nao.
PADRAO_DESTRUTIVO='DROP[[:space:]]+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE|CONSTRAINT|INDEX)|TRUNCATE|DELETE[[:space:]]+FROM|ALTER[[:space:]]+TABLE[^;]*DROP'

pendentes=$(psql "$DATABASE_URL" -Atc "
  SELECT string_agg(nome, ' ' ORDER BY nome) FROM (
    SELECT regexp_replace(f, '.*/', '') AS nome
    FROM unnest(ARRAY[$(printf "'%s'," migrations/*.sql | sed 's/,$//')]) f
  ) t
  WHERE nome NOT IN (SELECT nome FROM migracoes_aplicadas)
" 2>/dev/null || echo '')

if [[ -z "$pendentes" || "$pendentes" == " " ]]; then
  echo "✓ nenhuma migracao pendente"
  exit 0
fi

echo "→ migracoes pendentes: $pendentes"

destrutivas=()
for nome in $pendentes; do
  arquivo="migrations/$nome"
  [[ -f "$arquivo" ]] || continue
  # So a secao Up: o Down e destrutivo por definicao e nao roda agora.
  up=$(sed -n '/^-- Up Migration/,/^-- Down Migration/p' "$arquivo")
  if grep -qiE "$PADRAO_DESTRUTIVO" <<<"$up"; then
    destrutivas+=("$nome")
  fi
done

if (( ${#destrutivas[@]} > 0 )); then
  echo "⚠  destrutivas: ${destrutivas[*]}"
  echo "   backup obrigatorio antes de aplicar."
else
  echo "✓ nenhuma migracao pendente e destrutiva"
fi

if $APENAS_VERIFICAR; then
  exit 0
fi

if (( ${#destrutivas[@]} > 0 )); then
  : "${BACKUP_CHAVE:?BACKUP_CHAVE e obrigatoria para migracao destrutiva}"
  echo
  # --proteger: este backup e a unica volta possivel se a migracao destruir o
  # que nao devia. A retencao nao pode expurga-lo sozinha.
  npx tsx scripts/backup.ts \
    --tipo pre_migracao \
    --proteger \
    --motivo "antes de: ${destrutivas[*]}"
  echo
fi

echo "→ aplicando migracoes"
npm run migrate:up

# Mantem migracoes_aplicadas em dia: e dela que sai a versao do esquema gravada
# no backup e conferida na restauracao.
for nome in $pendentes; do
  arquivo="migrations/$nome"
  [[ -f "$arquivo" ]] || continue
  soma="$(sha256sum "$arquivo" | cut -d' ' -f1)"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO migracoes_aplicadas (nome, checksum) VALUES ('$nome', '$soma')
     ON CONFLICT (nome) DO UPDATE SET checksum = EXCLUDED.checksum;"
done

echo "✓ migracoes aplicadas e registradas"
