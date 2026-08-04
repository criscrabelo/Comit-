#!/usr/bin/env bash
# Verificacao ponta a ponta da autenticacao e autorizacao contra o servidor no ar.
#
# Nao substitui os testes automatizados (test/), mas prova o comportamento
# observavel pela rede: formato de erro, ausencia de enumeracao de usuario,
# revogacao de sessao e mascaramento de CPF/CNPJ por perfil.
#
# Uso: BASE=http://localhost:3199 ./scripts/verificar-autenticacao.sh
set -uo pipefail

BASE="${BASE:-http://localhost:3199}"
falhas=0

json() { python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps(d,ensure_ascii=False))' 2>/dev/null; }
campo() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

verificar() {
  local rotulo="$1" esperado="$2" obtido="$3"
  if [[ "$obtido" == *"$esperado"* ]]; then
    printf '  ok   %s\n' "$rotulo"
  else
    printf '  FALHA %s\n       esperado conter: %s\n       obtido:          %s\n' \
      "$rotulo" "$esperado" "$obtido"
    falhas=$((falhas + 1))
  fi
}

post() { curl -sS -X POST "$BASE$1" -H 'Content-Type: application/json' -d "$2"; }
get()  { curl -sS "$BASE$1" ${2:+-H "Authorization: Bearer $2"}; }

echo "Verificando $BASE"
echo

echo "Formato de resposta e erro"
verificar 'saude responde ok'          '"estado":"ok"'          "$(get /api/saude)"
verificar 'erro em formato uniforme'   '"codigo":"nao_autenticado"' "$(get /api/auth/eu)"
# Rota inexistente SEM sessao devolve 401, nao 404: por decisao de projeto, a API
# nao revela quais rotas existem a quem nao esta autenticado. O 404 aparece so
# depois de autenticar (verificado adiante, com token valido).
verificar 'rota inexistente nao vaza existencia' '"codigo":"nao_autenticado"' "$(get /api/nao-existe)"

echo
echo "Autenticacao"
senha_errada="$(post /api/auth/login '{"usuario":"cristiane","senha":"senha-errada-longa"}')"
inexistente="$(post /api/auth/login '{"usuario":"nao.existe.mesmo","senha":"senha-errada-longa"}')"
verificar 'senha errada recusada'      '"codigo":"credenciais_invalidas"' "$senha_errada"
verificar 'usuario inexistente recusado' '"codigo":"credenciais_invalidas"' "$inexistente"

# A mesma mensagem para os dois casos e o que impede descobrir quais contas existem.
msg_errada="$(echo "$senha_errada" | campo "['erro']['mensagem']")"
msg_inexistente="$(echo "$inexistente" | campo "['erro']['mensagem']")"
if [[ "$msg_errada" == "$msg_inexistente" ]]; then
  printf '  ok   sem enumeracao de usuario (mensagens identicas)\n'
else
  printf '  FALHA enumeracao de usuario possivel: "%s" != "%s"\n' "$msg_errada" "$msg_inexistente"
  falhas=$((falhas + 1))
fi

echo
echo "Sessao da gestora"
login_gestora="$(post /api/auth/login '{"usuario":"cristiane","senha":"senha-de-teste-longa-1"}')"
token_gestora="$(echo "$login_gestora" | campo "['token']")"
verificar 'login devolve token'        '"token"'                "$login_gestora"
verificar 'perfil correto'             '"perfil":"gestora"'     "$login_gestora"

eu_gestora="$(get /api/auth/eu "$token_gestora")"
verificar 'gestora ve documento completo' '"ve_documento_completo":true' "$eu_gestora"
verificar 'gestora tem todos os empreendimentos' '"todos_empreendimentos":true' "$eu_gestora"
verificar 'gestora pode editar juridico'  'juridico:editar'      "$eu_gestora"
# Com sessao valida, rota inexistente e 404 — a informacao deixa de ser sensivel.
verificar 'rota inexistente da 404 com sessao' '"codigo":"nao_encontrado"' \
  "$(get /api/nao-existe "$token_gestora")"

echo
echo "Sessao do colaborador"
login_colab="$(post /api/auth/login '{"usuario":"joao.colab","senha":"senha-de-teste-longa-2"}')"
token_colab="$(echo "$login_colab" | campo "['token']")"
eu_colab="$(get /api/auth/eu "$token_colab")"
verificar 'colaborador NAO ve documento completo' '"ve_documento_completo":false' "$eu_colab"
verificar 'colaborador NAO tem todos os empreendimentos' '"todos_empreendimentos":false' "$eu_colab"
# Colaborador registra o proprio trabalho; nao edita o juridico.
if [[ "$eu_colab" == *'"juridico:editar"'* ]]; then
  printf '  FALHA colaborador recebeu permissao de editar juridico\n'
  falhas=$((falhas + 1))
else
  printf '  ok   colaborador nao pode editar juridico\n'
fi

echo
echo "Revogacao de sessao"
sessoes="$(get /api/auth/sessoes "$token_colab")"
verificar 'lista sessao atual'         '"atual":true'           "$sessoes"
logout="$(curl -sS -X POST "$BASE/api/auth/logout" -H "Authorization: Bearer $token_colab")"
verificar 'logout encerra'             '"encerrada":true'       "$logout"
verificar 'token nao serve depois do logout' '"codigo":"nao_autenticado"' "$(get /api/auth/eu "$token_colab")"

echo
echo "Troca de senha encerra as outras sessoes"
# Duas sessoes da gestora; trocar a senha em uma encerra a outra.
token_extra="$(post /api/auth/login '{"usuario":"cristiane","senha":"senha-de-teste-longa-1"}' | campo "['token']")"
troca="$(curl -sS -X POST "$BASE/api/auth/senha" -H "Authorization: Bearer $token_extra" \
  -H 'Content-Type: application/json' \
  -d '{"senha_atual":"senha-de-teste-longa-1","senha_nova":"nova-senha-de-teste-9"}')"
verificar 'senha alterada'             '"alterada":true'        "$troca"
verificar 'sessao anterior foi encerrada' '"codigo":"nao_autenticado"' "$(get /api/auth/eu "$token_gestora")"
verificar 'sessao que trocou continua'  '"perfil":"gestora"'    "$(get /api/auth/eu "$token_extra")"
verificar 'senha antiga nao funciona mais' '"codigo":"credenciais_invalidas"' \
  "$(post /api/auth/login '{"usuario":"cristiane","senha":"senha-de-teste-longa-1"}')"
verificar 'senha nova funciona'         '"token"'               \
  "$(post /api/auth/login '{"usuario":"cristiane","senha":"nova-senha-de-teste-9"}')"

echo
echo "Senha fraca recusada"
token_atual="$(post /api/auth/login '{"usuario":"cristiane","senha":"nova-senha-de-teste-9"}' | campo "['token']")"
verificar 'senha curta recusada'        '"codigo":"entrada_invalida"' \
  "$(curl -sS -X POST "$BASE/api/auth/senha" -H "Authorization: Bearer $token_atual" \
      -H 'Content-Type: application/json' \
      -d '{"senha_atual":"nova-senha-de-teste-9","senha_nova":"curta"}')"

echo
if (( falhas == 0 )); then
  echo "✓ todas as verificacoes passaram"
else
  echo "✗ $falhas verificacao(oes) falharam"
fi
exit $(( falhas > 0 ? 1 : 0 ))
