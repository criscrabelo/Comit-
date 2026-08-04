#!/usr/bin/env bash
# Entrega intermediaria — as sete confirmacoes exigidas, executadas de verdade.
#
# Nada aqui e declarativo: cada item roda o comando e mostra a saida. Se algo
# falhar, o script termina com codigo diferente de zero e diz qual item falhou.
#
# Uso:
#   PGPORT=5432 DATABASE_URL='postgres://...' ./scripts/entrega-intermediaria.sh
set -uo pipefail

PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-patrono_test}"
PORT="${PORT:-3199}"
BASE="http://localhost:${PORT}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

falhas=0
titulo() { printf '\n\n%s\n%s\n%s\n' "$(printf '═%.0s' {1..78})" "$1" "$(printf '═%.0s' {1..78})"; }
ok()     { printf '  ✓ %s\n' "$1"; }
falha()  { printf '  ✗ %s\n' "$1"; falhas=$((falhas + 1)); }
checar() { if [[ "$3" == *"$2"* ]]; then ok "$1"; else falha "$1 — esperado conter: $2"; fi; }

# ═══════════════════════════════════════════════════════════════════════════
titulo '1. AS MIGRATIONS EXECUTAM'

saida_migracoes="$(su postgres -c "PGPORT=$PGPORT PGDATABASE=$PGDATABASE $RAIZ/scripts/recriar-banco.sh" 2>&1)"
echo "$saida_migracoes" | sed 's/^/  /'
if [[ "$saida_migracoes" == *"pronto"* ]]; then
  ok 'todas as migracoes aplicadas do zero, em transacao'
else
  falha 'as migracoes nao aplicaram'
fi

# ═══════════════════════════════════════════════════════════════════════════
titulo '2. O BACKEND INICIA CORRETAMENTE'

fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
sleep 1
nohup npx tsx src/server.ts > /tmp/patrono-inicio.log 2>&1 &
for _ in $(seq 40); do
  curl -sS "$BASE/api/saude" >/dev/null 2>&1 && break
  sleep 0.5
done

echo '  ── log de partida:'
grep -iE 'banco conectado|no ar|desligad|MONDAY_TOKEN' /tmp/patrono-inicio.log | sed 's/^/    /' | head -6

saude="$(curl -sS "$BASE/api/saude")"
echo "  ── GET /api/saude"
echo "    $saude"
checar 'servidor responde e o banco esta conectado' '"estado":"ok"' "$saude"
checar 'Monday desligado sem token (nao finge estar conectado)' '"monday":"desligada"' "$saude"
checar 'Sienge desligado, como previsto para a Fase 1'     '"sienge":"desligada"' "$saude"

# ═══════════════════════════════════════════════════════════════════════════
titulo '3. O POSTGRESQL PRESERVA OS DADOS'

# As senhas coincidem com as que verificar-autenticacao.sh espera.
export SENHA='senha-de-teste-longa-1'
npx tsx scripts/criar-usuario.ts \
  --usuario cristiane --nome 'Cristiane Rabelo' --perfil gestora --area juridico \
  --todos-empreendimentos --documento-completo 2>&1 | sed 's/^/  /'
SENHA='senha-de-teste-longa-2' npx tsx scripts/criar-usuario.ts \
  --usuario joao.colab --nome 'Joao Colaborador' --perfil colaborador --area juridico 2>&1 | sed 's/^/  /'
unset SENHA

antes="$(su postgres -c "psql -p $PGPORT -d $PGDATABASE -Atc 'SELECT count(*) FROM usuarios;'")"
echo "  ── usuarios no banco: $antes"

# Reinicia o processo: o dado tem de sobreviver, porque nao esta em memoria.
echo '  ── reiniciando o servidor para provar a persistencia'
fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
sleep 1
nohup npx tsx src/server.ts > /tmp/patrono-reinicio.log 2>&1 &
for _ in $(seq 40); do curl -sS "$BASE/api/saude" >/dev/null 2>&1 && break; sleep 0.5; done

depois="$(su postgres -c "psql -p $PGPORT -d $PGDATABASE -Atc 'SELECT count(*) FROM usuarios;'")"
echo "  ── usuarios apos reiniciar: $depois"
if [[ "$antes" == "$depois" && "$depois" -ge 2 ]]; then
  ok "dados preservados entre reinicios ($depois usuarios)"
else
  falha "dados nao preservados (antes=$antes depois=$depois)"
fi

login_pos_reinicio="$(curl -sS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"usuario":"cristiane","senha":"senha-de-teste-longa-1"}')"
checar 'login funciona com a senha gravada antes do reinicio' '"token"' "$login_pos_reinicio"

tabelas="$(su postgres -c "psql -p $PGPORT -d $PGDATABASE -Atc \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';\"")"
negocio="$(su postgres -c "psql -p $PGPORT -d $PGDATABASE -Atc 'SELECT count(*) FROM tabelas_de_negocio;'")"
echo "  ── esquema: $tabelas tabelas, $negocio de negocio com proveniencia"

# ═══════════════════════════════════════════════════════════════════════════
titulo '4. TESTES DE AUTENTICACAO E PERMISSOES'

BASE="$BASE" ./scripts/verificar-autenticacao.sh 2>&1 | sed 's/^/  /'
if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
  ok 'verificacao de autenticacao e permissoes passou'
else
  falha 'verificacao de autenticacao falhou'
fi

echo '  ── permissao por perfil na Central de Inconsistencias:'
token_gestora="$(curl -sS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"usuario":"cristiane","senha":"nova-senha-de-teste-9"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')"
token_colab="$(curl -sS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"usuario":"joao.colab","senha":"senha-de-teste-longa-2"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')"

gestora_central="$(curl -sS "$BASE/api/cobranca/inconsistencias/catalogo" -H "Authorization: Bearer $token_gestora")"
colab_central="$(curl -sS "$BASE/api/cobranca/inconsistencias/catalogo" -H "Authorization: Bearer $token_colab")"
sem_sessao="$(curl -sS "$BASE/api/cobranca/inconsistencias")"

checar 'gestora acessa a Central'                    '"tipos"'                   "$gestora_central"
checar 'colaborador NAO acessa a Central'            '"codigo":"nao_autorizado"' "$colab_central"
checar 'sem sessao nao acessa a Central'             '"codigo":"nao_autenticado"' "$sem_sessao"

# ═══════════════════════════════════════════════════════════════════════════
titulo '5. TESTES DO PROXY DO MONDAY'

# O proxy tem duas guardas em ordem: primeiro autorizacao, depois estado da
# integracao. Testar as duas exige perfis diferentes.
SENHA='senha-de-teste-longa-3' npx tsx scripts/criar-usuario.ts \
  --usuario admin.ti --nome 'Admin TI' --perfil administrador --area ti 2>&1 | sed 's/^/  /'
token_admin="$(curl -sS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"usuario":"admin.ti","senha":"senha-de-teste-longa-3"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')"

echo '  ── o estado da integracao NAO expoe o token, so a presenca dele:'
estado="$(curl -sS "$BASE/api/monday/estado" -H "Authorization: Bearer $token_gestora")"
echo "    $(echo "$estado" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps({k:d[k] for k in ("token_configurado","modo","estado","ultima_carga_valida_em")}))')"
checar 'informa que o token nao esta configurado'  '"token_configurado":false' "$estado"
checar 'integracao opera somente em leitura'       '"modo":"leitura"'          "$estado"
checar 'sem carga valida ainda'                    '"ultima_carga_valida_em":null' "$estado"
# O token nunca aparece na resposta, em nenhuma forma.
if echo "$estado" | grep -qiE '"(token|monday_token|authorization)":\s*"[^"]'; then
  falha 'a resposta expoe um valor de token'
else
  ok 'nenhum valor de token na resposta'
fi

echo '  ── autorizacao vem ANTES do estado da integracao:'
gestora_em_admin="$(curl -sS -X POST "$BASE/api/monday/testar" -H "Authorization: Bearer $token_gestora")"
echo "    gestora em rota de administracao: $gestora_em_admin"
checar 'gestora nao alcanca rota de administracao' '"codigo":"nao_autorizado"' "$gestora_em_admin"

echo '  ── com perfil correto e SEM token, recusa em vez de fingir:'
admin_sem_token="$(curl -sS -X POST "$BASE/api/monday/testar" -H "Authorization: Bearer $token_admin")"
echo "    $admin_sem_token"
checar 'testar recusa sem MONDAY_TOKEN' '"codigo":"integracao_desligada"' "$admin_sem_token"

sync_sem_token="$(curl -sS -X POST "$BASE/api/monday/sync" -H "Authorization: Bearer $token_gestora" \
  -H 'Content-Type: application/json' -d '{"quadro":"notificacoes","competencia":"2026-07"}')"
echo "    sync: $sync_sem_token"
checar 'sync recusa sem MONDAY_TOKEN'   '"codigo":"integracao_desligada"' "$sync_sem_token"
checar 'sync afirma que nada foi alterado' 'nenhum dado foi alterado' "$sync_sem_token"

echo '  ── nenhuma execucao foi criada pela tentativa recusada:'
execucoes="$(su postgres -c "psql -p $PGPORT -d $PGDATABASE -Atc \"SELECT count(*) FROM execucoes_importacao WHERE fonte='monday';\"")"
echo "    execucoes de monday no banco: $execucoes"
if [[ "$execucoes" == "0" ]]; then
  ok 'recusa antes de abrir execucao: nada foi tocado'
else
  falha "recusa criou $execucoes execucao(oes) indevidamente"
fi

echo '  ── sem sessao, o proxy nao responde nada sobre a integracao:'
proxy_sem_sessao="$(curl -sS "$BASE/api/monday/estado")"
checar 'proxy exige sessao' '"codigo":"nao_autenticado"' "$proxy_sem_sessao"

echo '  ── testes automatizados do cliente e das transformacoes do Monday:'
npx vitest run test/transformacao.test.ts test/upsert.test.ts 2>&1 | tail -6 | sed 's/^/    /'
if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
  ok 'transformacoes e persistencia idempotente do Monday passaram'
else
  falha 'testes do Monday falharam'
fi

# ═══════════════════════════════════════════════════════════════════════════
titulo '6. NENHUMA CREDENCIAL NO FRONTEND OU NO REPOSITORIO'

cd "$RAIZ/.."

echo '  ── varredura por padroes de segredo no que esta versionado:'
achados="$(git grep -nIE 'gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\.' -- . 2>/dev/null | grep -vE '^(DECISOES.md|server/README.md|docs/)' || true)"
if [[ -z "$achados" ]]; then
  ok 'nenhum token, chave de API ou JWT no codigo versionado'
else
  echo "$achados" | sed 's/^/    /'
  falha 'padrao de segredo encontrado no repositorio'
fi

echo '  ── o token do Monday sai do navegador? (js/ do frontend antigo)'
token_no_front="$(grep -rn "jur_monday_token" js/ 2>/dev/null | wc -l)"
echo "    ocorrencias no frontend legado: $token_no_front (sera removido na migracao, item B8)"
echo "  ── o backend novo le o token de onde?"
grep -n "MONDAY_TOKEN" server/src/config.ts | sed 's/^/    /'
if grep -q "env.MONDAY_TOKEN" server/src/config.ts; then
  ok 'backend le o token apenas de variavel de ambiente'
else
  falha 'backend nao le o token de variavel de ambiente'
fi

echo '  ── .env esta ignorado pelo git?'
if git check-ignore -q server/.env 2>/dev/null || grep -qx '.env' .gitignore; then
  ok '.env ignorado: valores reais nunca sao versionados'
else
  falha '.env NAO esta ignorado'
fi

echo '  ── o token aparece em log? (redacao automatica)'
if grep -q "'\*.token'" server/src/logging.ts && grep -q "cpf_cnpj" server/src/logging.ts; then
  ok 'token, senha e CPF/CNPJ redigidos na saida de log'
else
  falha 'redacao de log nao configurada'
fi

cd "$RAIZ"

# ═══════════════════════════════════════════════════════════════════════════
titulo '7. SUITE COMPLETA DE TESTES'

npx vitest run 2>&1 | tail -8 | sed 's/^/  /'
if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
  ok 'suite completa passou'
else
  falha 'suite completa falhou'
fi

# ═══════════════════════════════════════════════════════════════════════════
titulo 'RESULTADO'

if (( falhas == 0 )); then
  echo '  ✓ todas as confirmacoes passaram'
else
  echo "  ✗ $falhas confirmacao(oes) falharam"
fi
exit $(( falhas > 0 ? 1 : 0 ))
