# =============================================================================
#  Patrono - preenche as credenciais no server\.env, perguntando uma a uma.
#
#  Existe como ARQUIVO, e nao como bloco para colar no terminal, por um motivo
#  aprendido na pratica: um bloco colado com Read-Host no meio consome as
#  linhas seguintes do proprio bloco como resposta das perguntas, e o arquivo
#  acaba gravado com pedacos de comando no lugar dos valores. Rodado com
#  -File, o script executa como unidade e as perguntas leem do teclado.
#
#  Mantido em ASCII puro, como os demais .ps1 deste projeto.
# =============================================================================

$ErrorActionPreference = 'Stop'
$arquivo = Join-Path $PSScriptRoot 'server\.env'

function Parar($t) {
  Write-Host ""
  Write-Host "  [PAROU AQUI] $t" -ForegroundColor Red
  Write-Host ""
  Read-Host "  Pressione Enter para fechar"
  exit 1
}

if (-not (Test-Path $arquivo)) {
  Parar "server\.env nao existe. Rode 'Instalar Patrono.bat' primeiro."
}

Write-Host ""
Write-Host "  ==========================================================" -ForegroundColor Cyan
Write-Host "   Credenciais do Patrono" -ForegroundColor Cyan
Write-Host "  ==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Os valores APARECEM na tela enquanto voce digita, de proposito,"
Write-Host "  para poder conferir. No final a tela e limpa sozinha."
Write-Host ""
Write-Host "  NAO tire foto desta janela ate o final." -ForegroundColor Yellow
Write-Host ""

# --- 1. Token do Monday ------------------------------------------------------
$tk = (Read-Host "  1/5  Token do Monday (cole com o botao direito)").Trim()
if ($tk -eq '') { Parar "Token vazio." }
if ($tk.StartsWith('<')) {
  Parar "O token comecou com '<'. Os sinais < e > sao marcacao de exemplo, nao fazem parte do token. Cole so o token."
}
if (-not $tk.StartsWith('eyJ')) {
  Write-Host ""
  Write-Host "  [atencao] Tokens do Monday costumam comecar com eyJ e o seu nao comeca." -ForegroundColor Yellow
  $segue = Read-Host "  Continuar mesmo assim? (s/n)"
  if ($segue -ne 's') { Parar "Interrompido para voce conferir o token." }
}

# --- 2. Subdominio do Sienge --------------------------------------------------
$sub = (Read-Host "  2/5  Subdominio do Sienge (so o nome)").Trim()
# Tolerancia deliberada: se vier a URL inteira, extraimos o nome em vez de
# falhar - e mostramos o que sera usado, para a pessoa conferir.
$sub = $sub -replace '^https?://', '' -replace '\.sienge\.com\.br.*$', '' -replace '/.*$', ''
if ($sub -eq '') { Parar "Subdominio vazio." }
Write-Host "        vai usar: $sub" -ForegroundColor DarkGray

# --- 3 e 4. Usuario e senha da API -------------------------------------------
$us = (Read-Host "  3/5  Usuario da API do Sienge").Trim()
if ($us -eq '') { Parar "Usuario vazio." }
$se = (Read-Host "  4/5  Senha da API do Sienge").Trim()
if ($se -eq '') { Parar "Senha vazia." }

# --- 5. Chave de backup -------------------------------------------------------
$ch = (Read-Host "  5/5  Chave de backup (a do seu papel, minimo 16 caracteres)").Trim()
if ($ch.Length -lt 16) {
  Parar "A chave tem $($ch.Length) caracteres; o minimo e 16. Confira no papel."
}

# --- Confirmacao sem expor valores --------------------------------------------
Write-Host ""
Write-Host "  Conferencia (tamanhos, nao valores):"
Write-Host "    token do Monday: $($tk.Length) caracteres"
Write-Host "    subdominio:      $sub"
Write-Host "    usuario da API:  $us"
Write-Host "    senha da API:    $($se.Length) caracteres"
Write-Host "    chave de backup: $($ch.Length) caracteres"
Write-Host ""
$ok = Read-Host "  Gravar? (s/n)"
if ($ok -ne 's') { Parar "Nada foi gravado." }

# O $ e escapado porque na substituicao ele tem significado proprio; uma senha
# com $1 dentro viraria outra coisa silenciosamente.
$texto = Get-Content $arquivo -Raw
foreach ($par in @(
  @('MONDAY_TOKEN', $tk),
  @('SIENGE_SUBDOMAIN', $sub),
  @('SIENGE_USER', $us),
  @('SIENGE_PASSWORD', $se),
  @('SIENGE_HABILITADO', 'true'),
  @('BACKUP_CHAVE', $ch)
)) {
  $texto = $texto -replace ('(?m)^' + $par[0] + '=.*'), ($par[0] + '=' + $par[1].Replace('$', '$$'))
}
Set-Content $arquivo $texto -Encoding UTF8

Clear-Host
Write-Host ""
Write-Host "  Credenciais gravadas e tela limpa." -ForegroundColor Green
Write-Host ""
Write-Host "  Proximos passos:"
Write-Host "    1. feche a janela preta da plataforma, se estiver aberta"
Write-Host "    2. abra de novo pelo atalho Patrono"
Write-Host "    3. entre e clique em Sincronizar Monday"
Write-Host ""
Read-Host "  Pressione Enter para fechar"
