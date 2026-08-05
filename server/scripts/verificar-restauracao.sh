#!/usr/bin/env bash
# Prova de ponta a ponta da restauracao — os dez passos do teste obrigatorio.
#
# Diferente de test/backup.test.ts, que roda dentro do Vitest, este script
# executa o que os dois ultimos passos exigem e um teste nao consegue provar
# sozinho: que a APLICACAO sobe sobre o banco restaurado e que a SUITE INTEIRA
# passa contra ele.
#
#    1. cria dados de teste
#    2. gera o backup
#    3. remove os dados
#    4. restaura em banco isolado
#    5. confirma que os dados voltaram
#    6. confirma usuarios e permissoes
#    7. confirma proveniencia e historico
#    8. confirma vinculos e inconsistencias
#    9. confirma que a aplicacao inicia sobre o banco restaurado
#   10. executa a suite de testes apontada para o banco restaurado
#
# Uso:
#   PGPORT=55432 BACKUP_CHAVE='...' ./scripts/verificar-restauracao.sh
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

PGPORT="${PGPORT:-5432}"
PGHOST="${PGHOST:-127.0.0.1}"
PGUSER="${PGUSER:-postgres}"
ORIGEM="${ORIGEM:-patrono_restaura_origem}"
PORTA="${PORTA:-3132}"
DIRETORIO="${BACKUP_DIRETORIO:-/tmp/patrono-backups-verificacao}"
: "${BACKUP_CHAVE:?defina BACKUP_CHAVE (minimo de 16 caracteres)}"

export BACKUP_DIRETORIO="$DIRETORIO"
export DATABASE_URL="postgres://${PGUSER}@${PGHOST}:${PGPORT}/${ORIGEM}"
export NODE_ENV=development
export LOG_LEVEL=warn

falhas=0
linhas=()

checar() {
  local rotulo="$1" condicao="$2" detalhe="${3:-}"
  local marca="  OK  "
  if [[ "$condicao" != "ok" ]]; then
    marca=" FALHA"
    falhas=$((falhas + 1))
  fi
  local linha="$marca  $rotulo"
  [[ -n "$detalhe" ]] && linha+=$'\n          '"$detalhe"
  linhas+=("$linha")
}

consultar() { psql "$1" -Atc "$2" 2>/dev/null || echo 'ERRO'; }
igual() { [[ "$1" == "$2" ]] && echo ok || echo nao; }

limpar() {
  # Por porta, e nao por PID: `npx` cria um processo filho, e matar o pai deixa
  # o servidor de pe segurando a porta. Foi assim que uma execucao anterior
  # sabotou a seguinte.
  fuser -k "${PORTA}/tcp" 2>/dev/null
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -q -c \
    "DROP DATABASE IF EXISTS ${DESTINO:-nao_existe} WITH (FORCE);" >/dev/null 2>&1
  rm -rf "$DIRETORIO"
}
trap limpar EXIT

echo "→ preparando banco de origem ($ORIGEM)"
PGPORT="$PGPORT" PGDATABASE="$ORIGEM" ./scripts/recriar-banco.sh >/dev/null

# ── 1. dados de teste ────────────────────────────────────────────────────────
echo "→ 1. criando dados de teste"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO usuarios (usuario, nome, perfil, status, hash_senha, algoritmo_senha)
  VALUES ('verifica.restauracao', 'CONTA DE VERIFICACAO', 'gestora', 'ativo',
          'scrypt$32768$8$1$abcd$efgh', 'scrypt');

INSERT INTO escopos_empreendimento (usuario_id, todos)
  SELECT id, true FROM usuarios WHERE usuario = 'verifica.restauracao';

INSERT INTO permissoes_usuario (usuario_id, modulo, acao, concedida, motivo)
  SELECT id, 'sistema', 'backup', true, 'verificacao'
  FROM usuarios WHERE usuario = 'verifica.restauracao';

INSERT INTO competencias (ref, rotulo, inicio, fim)
  VALUES ('2026-07', 'Julho 2026', '2026-07-01', '2026-07-31');
INSERT INTO comites (competencia_ref, rotulo) VALUES ('2026-07', 'Comite Julho 2026');

INSERT INTO empreendimentos (nome, nome_normalizado, fonte, id_origem)
  VALUES ('VERANO VERIFICACAO', 'VERANO VERIFICACAO', 'manual', 'verifica-e1');

INSERT INTO notificacoes (
  comite_id, empreendimento_id, cliente_nome, unidade, estagio,
  data_notificacao, fonte, id_origem, valor_original
) SELECT c.id, e.id, 'MARIA APARECIDA SILVA', '1105B', 'Em Andamento',
         '2026-07-15', 'manual', 'verifica-n1', '{"origem":"verificacao"}'::jsonb
  FROM comites c, empreendimentos e
  WHERE c.competencia_ref = '2026-07' AND e.id_origem = 'verifica-e1';

-- Gera historico e incrementa versao pelo gatilho.
UPDATE notificacoes SET estagio = 'Resolvida', data_solucao = '2026-07-20'
  WHERE id_origem = 'verifica-n1';

INSERT INTO inconsistencias (tipo, gravidade, impacto, fonte, descricao, chave_deduplicacao)
  VALUES ('duplicidade', 'media', 'indicador', 'manual',
          'Inconsistencia da verificacao de restauracao.', 'verifica-i1');

INSERT INTO vinculos_fontes (entidade, fonte_a, id_origem_a, fonte_b, id_origem_b, regra, confianca)
  VALUES ('cliente', 'monday', 'va1', 'sienge', 'vb1', 'cpf_cnpj', 'alta');

INSERT INTO logs_auditoria (acao, usuario_nome, modulo)
  VALUES ('login', 'CONTA DE VERIFICACAO', 'sistema');
SQL

antes_notificacoes=$(consultar "$DATABASE_URL" "SELECT count(*) FROM notificacoes")
antes_usuarios=$(consultar "$DATABASE_URL" "SELECT count(*) FROM usuarios")
antes_permissoes=$(consultar "$DATABASE_URL" "SELECT count(*) FROM permissoes_usuario")
antes_versao=$(consultar "$DATABASE_URL" "SELECT versao FROM notificacoes WHERE id_origem = 'verifica-n1'")
antes_trilha=$(consultar "$DATABASE_URL" "SELECT count(*) FROM logs_auditoria")
checar "1. dados de teste criados" "$(igual "$antes_notificacoes" 1)" \
  "notificacoes=$antes_notificacoes usuarios=$antes_usuarios versao=$antes_versao"

# ── 2. backup ────────────────────────────────────────────────────────────────
echo "→ 2. gerando backup"
saida_backup=$(npx tsx scripts/backup.ts --motivo "verificacao de restauracao" 2>&1)
rotulo=$(grep -oE 'patrono-[a-z]+-completo-[0-9]+-[0-9]+-[0-9]+' <<<"$saida_backup" | head -1)
checar "2. backup gerado" "$([[ -n "$rotulo" ]] && echo ok || echo nao)" "$rotulo"
[[ -z "$rotulo" ]] && { printf '%s\n' "${linhas[@]}"; echo "$saida_backup"; exit 1; }

arquivo="$DIRETORIO/${rotulo}.dump.enc"
checar "   arquivo cifrado no disco" \
  "$([[ -f "$arquivo" ]] && [[ "$(head -c 8 "$arquivo")" == "PATRONO1" ]] && echo ok || echo nao)" \
  "$(ls -l "$arquivo" 2>/dev/null | awk '{print $1, $5" bytes"}')"

# ── 3. remover os dados ──────────────────────────────────────────────────────
echo "→ 3. removendo os dados"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "DELETE FROM notificacoes; DELETE FROM inconsistencias; DELETE FROM vinculos_fontes;
   DELETE FROM permissoes_usuario;"
depois_delete=$(consultar "$DATABASE_URL" "SELECT count(*) FROM notificacoes")
checar "3. dados removidos" "$(igual "$depois_delete" 0)"

# ── 4. restaurar em banco isolado ────────────────────────────────────────────
echo "→ 4. restaurando em banco isolado"
DESTINO="patrono_restaurado_$(date +%s)"
saida_restauracao=$(npx tsx scripts/restaurar.ts --backup "$rotulo" --banco "$DESTINO" 2>&1)
checar "4. restauracao concluida" \
  "$(grep -q 'Restauracao concluida' <<<"$saida_restauracao" && echo ok || echo nao)" \
  "$(grep -E 'banco destino|duracao' <<<"$saida_restauracao" | tr '\n' ' ')"

URL_DESTINO="postgres://${PGUSER}@${PGHOST}:${PGPORT}/${DESTINO}"

# ── 5. os dados voltaram ─────────────────────────────────────────────────────
depois_notificacoes=$(consultar "$URL_DESTINO" "SELECT count(*) FROM notificacoes")
cliente=$(consultar "$URL_DESTINO" "SELECT cliente_nome FROM notificacoes WHERE id_origem = 'verifica-n1'")
checar "5. dados voltaram" "$(igual "$depois_notificacoes" "$antes_notificacoes")" \
  "notificacoes=$depois_notificacoes cliente='$cliente'"

origem_intacta=$(consultar "$DATABASE_URL" "SELECT count(*) FROM notificacoes")
checar "   o banco de origem NAO foi tocado" "$(igual "$origem_intacta" 0)"

# ── 6. usuarios e permissoes ─────────────────────────────────────────────────
depois_usuarios=$(consultar "$URL_DESTINO" "SELECT count(*) FROM usuarios")
depois_permissoes=$(consultar "$URL_DESTINO" "SELECT count(*) FROM permissoes_usuario")
perfis=$(consultar "$URL_DESTINO" "SELECT count(*) FROM permissoes_perfil")
hash=$(consultar "$URL_DESTINO" "SELECT left(hash_senha, 6) FROM usuarios WHERE usuario = 'verifica.restauracao'")
escopo=$(consultar "$URL_DESTINO" "SELECT todos FROM escopos_empreendimento LIMIT 1")
checar "6. usuarios e permissoes" \
  "$([[ "$depois_usuarios" == "$antes_usuarios" && "$depois_permissoes" == "$antes_permissoes" && "$perfis" -gt 0 && "$hash" == "scrypt" && "$escopo" == "t" ]] && echo ok || echo nao)" \
  "usuarios=$depois_usuarios permissoes_usuario=$depois_permissoes permissoes_perfil=$perfis hash=$hash escopo_total=$escopo"

# ── 7. proveniencia e historico ──────────────────────────────────────────────
fonte=$(consultar "$URL_DESTINO" "SELECT fonte FROM notificacoes WHERE id_origem = 'verifica-n1'")
versao=$(consultar "$URL_DESTINO" "SELECT versao FROM notificacoes WHERE id_origem = 'verifica-n1'")
historico=$(consultar "$URL_DESTINO" "SELECT jsonb_array_length(historico) FROM notificacoes WHERE id_origem = 'verifica-n1'")
valor=$(consultar "$URL_DESTINO" "SELECT valor_original->>'origem' FROM notificacoes WHERE id_origem = 'verifica-n1'")
checar "7. proveniencia e historico" \
  "$([[ "$fonte" == "manual" && "$versao" == "$antes_versao" && "$historico" == "1" && "$valor" == "verificacao" ]] && echo ok || echo nao)" \
  "fonte=$fonte versao=$versao historico=$historico valor_original.origem=$valor"

trilha=$(consultar "$URL_DESTINO" "SELECT count(*) FROM logs_auditoria")
checar "   trilha de auditoria preservada" "$([[ "$trilha" -ge "$antes_trilha" ]] && echo ok || echo nao)" \
  "registros=$trilha"

# ── 8. vinculos e inconsistencias ────────────────────────────────────────────
vinculos=$(consultar "$URL_DESTINO" "SELECT count(*) FROM vinculos_fontes WHERE regra = 'cpf_cnpj'")
inconsistencias=$(consultar "$URL_DESTINO" "SELECT count(*) FROM inconsistencias WHERE chave_deduplicacao = 'verifica-i1'")
checar "8. vinculos e inconsistencias" \
  "$([[ "$vinculos" == "1" && "$inconsistencias" == "1" ]] && echo ok || echo nao)" \
  "vinculos=$vinculos inconsistencias=$inconsistencias"

gatilhos=$(consultar "$URL_DESTINO" "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal")
funcao=$(consultar "$URL_DESTINO" "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='agregar_indicador'")
checar "   regras do banco voltaram (gatilhos e funcoes)" \
  "$([[ "$gatilhos" -gt 20 && "$funcao" == "1" ]] && echo ok || echo nao)" \
  "gatilhos=$gatilhos agregar_indicador=$funcao"

# ── 9. a aplicacao sobe sobre o banco restaurado ─────────────────────────────
echo "→ 9. subindo a aplicacao sobre o banco restaurado"
fuser -k "${PORTA}/tcp" 2>/dev/null
sleep 1
DATABASE_URL="$URL_DESTINO" PORT="$PORTA" CORS_ORIGINS="http://127.0.0.1:$PORTA" \
  npx tsx src/server.ts > /tmp/patrono-restaurado.log 2>&1 &

saude=''
for _ in $(seq 1 30); do
  saude=$(curl -sf "http://127.0.0.1:${PORTA}/api/saude" 2>/dev/null) && break
  sleep 1
done
checar "9. aplicacao inicia sobre o banco restaurado" \
  "$(grep -q '"estado":"ok"' <<<"$saude" && echo ok || echo nao)" \
  "${saude:-sem resposta; ver /tmp/patrono-restaurado.log}"

pagina=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORTA}/")
checar "   interface responde" "$(igual "$pagina" 200)" "HTTP $pagina"

fuser -k "${PORTA}/tcp" 2>/dev/null

# ── 10. suite de testes contra o banco restaurado ────────────────────────────
echo "→ 10. rodando a suite contra o banco restaurado"
saida_suite=$(DATABASE_URL="$URL_DESTINO" npx vitest run 2>&1)
resumo=$(grep -E '^\s+Tests ' <<<"$saida_suite" | tail -1 | xargs)
checar "10. suite de testes passa apos a restauracao" \
  "$(grep -qE 'Tests +[0-9]+ passed' <<<"$saida_suite" && ! grep -qE '[0-9]+ failed' <<<"$saida_suite" && echo ok || echo nao)" \
  "$resumo"

echo
echo "VERIFICACAO DA RESTAURACAO REAL"
echo "======================================================================"
printf '%s\n' "${linhas[@]}"
echo "======================================================================"
if (( falhas == 0 )); then
  echo "TODAS AS VERIFICACOES PASSARAM"
  exit 0
fi
echo "$falhas VERIFICACAO(OES) FALHARAM"
exit 1
