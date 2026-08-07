# =============================================================================
#  Patrono Alta Performance - instalacao em maquina Windows
#
#  Escrito em PowerShell, e nao em .bat, por um motivo concreto: o
#  interpretador de comandos do Windows le arquivos .bat byte a byte na tabela
#  de caracteres do console, e qualquer acento no arquivo vira lixo que ele
#  tenta executar como comando. A primeira versao deste instalador era .bat com
#  acentos e falhou exatamente assim - anunciando sucesso sem ter feito nada.
#
#  Este arquivo e mantido em ASCII puro pelo mesmo motivo: o PowerShell 5.1 do
#  Windows le arquivo sem marca de codificacao como ANSI, e um acento aqui
#  reintroduziria a mesma classe de erro.
#
#  O que ele faz:
#    1. confere Node.js 22+
#    2. localiza o PostgreSQL, mesmo fora do PATH
#    3. cria o banco patrono, se ainda nao existir
#    4. cria o server\.env a partir do modelo, se ainda nao existir
#    5. instala as dependencias e aplica as migracoes
#    6. compila o servidor
#    7. cria o primeiro usuario administrador
#
#  Rodar de novo e seguro: nenhum passo apaga dado existente.
# =============================================================================

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Le o server\.env e joga os valores no ambiente deste processo.
#
# Faz falta porque nada no projeto carrega .env sozinho: em producao as
# variaveis vem da plataforma de hospedagem, e no desenvolvimento vinham da
# linha de comando. Numa maquina Windows nao ha nem uma coisa nem outra, e sem
# isto as migracoes e a criacao do usuario nao enxergam o banco.
function CarregarEnv($caminho) {
  foreach ($linha in Get-Content -LiteralPath $caminho -Encoding UTF8) {
    if ($linha -match '^\s*#') { continue }
    if ($linha -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $nome  = $Matches[1]
      $valor = $Matches[2].Trim().Trim('"').Trim("'")
      if ($valor -ne '') { Set-Item -LiteralPath "Env:$nome" -Value $valor }
    }
  }
}

function Titulo($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor Cyan }
function Ok($t)     { Write-Host "  [ok] $t" -ForegroundColor Green }
function Aviso($t)  { Write-Host "  [atencao] $t" -ForegroundColor Yellow }
function Parar($t) {
  Write-Host ""
  Write-Host "  [PAROU AQUI] $t" -ForegroundColor Red
  Write-Host ""
  Write-Host "  Nada foi deixado pela metade. Corrija o ponto acima e rode de novo."
  Write-Host ""
  Read-Host "  Pressione Enter para fechar"
  exit 1
}

Write-Host ""
Write-Host "  ==========================================================" -ForegroundColor Cyan
Write-Host "   Patrono Alta Performance - Instalacao" -ForegroundColor Cyan
Write-Host "  ==========================================================" -ForegroundColor Cyan

# --- 1. Node.js --------------------------------------------------------------
Titulo "1/7  Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Parar "Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo."
}
$versaoNode = (& node -p "process.versions.node")
$maiorNode  = [int]($versaoNode -split '\.')[0]
if ($maiorNode -lt 22) {
  Parar "Node.js $versaoNode encontrado; o Patrono exige 22 ou superior. Atualize em https://nodejs.org."
}
Ok "Node.js $versaoNode"

# --- 2. PostgreSQL -----------------------------------------------------------
#  O instalador oficial do PostgreSQL para Windows nao acrescenta a propria
#  pasta bin ao PATH. Mandar a pessoa editar variavel de ambiente do Windows
#  para instalar um sistema seria transferir a ela um problema que e nosso.
Titulo "2/7  PostgreSQL"
$pgBin = $null
if (Get-Command psql -ErrorAction SilentlyContinue) {
  $pgBin = Split-Path (Get-Command psql).Source
} else {
  foreach ($v in 16, 17, 18, 15, 14) {
    $tentativa = Join-Path $env:ProgramFiles "PostgreSQL\$v\bin"
    if (Test-Path (Join-Path $tentativa 'psql.exe')) { $pgBin = $tentativa; break }
  }
}
if (-not $pgBin) {
  Parar "PostgreSQL nao encontrado. Instale a versao 16 em https://www.postgresql.org/download/windows/ e rode de novo."
}
# pg_dump e o que gera o backup. Sem ele a plataforma sobe e nunca consegue
# proteger o proprio dado - e esta maquina vai guardar CPF de cliente real.
if (-not (Test-Path (Join-Path $pgBin 'pg_dump.exe'))) {
  Parar "pg_dump nao encontrado junto do PostgreSQL. Sem ele nao existe backup, e sem backup esta maquina nao pode guardar dado de cliente."
}
$env:PATH = "$pgBin;$env:PATH"
Ok "PostgreSQL em $pgBin"

# --- 3. Senha do banco -------------------------------------------------------
Titulo "3/7  Conexao com o banco"
Write-Host "  Informe a senha do usuario postgres, definida na instalacao do"
Write-Host "  PostgreSQL. Ela nao aparece na tela enquanto voce digita."
Write-Host ""
$segura = Read-Host "  Senha do postgres" -AsSecureString
$senhaPg = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
if ([string]::IsNullOrWhiteSpace($senhaPg)) { Parar "Senha vazia." }

$env:PGPASSWORD = $senhaPg
& psql -U postgres -h localhost -p 5432 -tAc "select 1" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  $env:PGPASSWORD = $null
  Parar "Nao consegui conectar ao PostgreSQL com essa senha. Ela nao e a senha do Windows nem a da plataforma - e a que voce definiu na tela Password do instalador do PostgreSQL."
}
Ok "Conectado"

# --- 4. Banco patrono --------------------------------------------------------
Titulo "4/7  Banco de dados"
$existe = (& psql -U postgres -h localhost -p 5432 -tAc "select count(*) from pg_database where datname='patrono'").Trim()
if ($existe -eq '0') {
  & psql -U postgres -h localhost -p 5432 -c "create database patrono" | Out-Null
  Ok "Banco patrono criado"
} else {
  Ok "Banco patrono ja existia, preservado"
}

# --- 5. Arquivo .env ---------------------------------------------------------
Titulo "5/7  Configuracao"
$envPath = Join-Path $PSScriptRoot 'server\.env'
if (Test-Path $envPath) {
  Ok "server\.env ja existe, preservado (suas credenciais nao foram tocadas)"
} else {
  Copy-Item (Join-Path $PSScriptRoot 'server\.env.example') $envPath -Force
  # A senha e escapada antes de entrar na URL. Uma senha com @ ou : partiria o
  # endereco de conexao ao meio, e o erro apareceria muito depois, sem ninguem
  # ligar uma coisa a outra.
  $senhaUrl = [uri]::EscapeDataString($senhaPg)
  $pastaBackup = (Join-Path $env:USERPROFILE 'Patrono-Backups') -replace '\\', '/'
  $texto = Get-Content $envPath -Raw
  $texto = $texto -replace 'DATABASE_URL=.*', "DATABASE_URL=postgres://postgres:$senhaUrl@localhost:5432/patrono"
  $texto = $texto -replace 'PORT=.*',            'PORT=3131'
  $texto = $texto -replace 'CORS_ORIGINS=.*',    'CORS_ORIGINS=http://localhost:3131'
  $texto = $texto -replace 'PG_BIN=.*',          "PG_BIN=$pgBin"
  $texto = $texto -replace 'BACKUP_DIRETORIO=.*', "BACKUP_DIRETORIO=$pastaBackup"
  Set-Content $envPath $texto -Encoding UTF8
  Ok "server\.env criado"
  Aviso "Criado SEM credencial do Monday, do Sienge e sem chave de backup."
  Write-Host "           A plataforma sobe assim, mas nao sincroniza e nao gera backup."
}
$senhaPg = $null

# O .env so vale a partir daqui: quem aplica as migracoes e quem cria o usuario
# le a configuracao do ambiente, nao do arquivo.
CarregarEnv $envPath
if (-not $env:DATABASE_URL) {
  Parar "DATABASE_URL nao foi encontrada em server\.env. Apague esse arquivo e rode o instalador de novo para ele ser recriado."
}

# --- 6. Dependencias, migracoes e compilacao ---------------------------------
Titulo "6/7  Dependencias (esta e a parte demorada, alguns minutos)"
Push-Location (Join-Path $PSScriptRoot 'server')
try {
  # Instalacao completa, com as dependencias de desenvolvimento: o compilador
  # TypeScript e o aplicador de migracoes estao entre elas. O download dos
  # navegadores do Playwright fica desligado - centenas de megabytes sem uso
  # nesta maquina.
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Parar "Falha ao instalar as dependencias." }
  Ok "Dependencias instaladas"

  Titulo "7/7  Banco e servidor"
  & npm run migrate:up
  if ($LASTEXITCODE -ne 0) { Parar "Falha ao aplicar as migracoes." }
  Ok "Tabelas criadas"

  & npm run build
  if ($LASTEXITCODE -ne 0) { Parar "Falha ao compilar o servidor." }
  Ok "Servidor compilado"
} finally {
  Pop-Location
}

# --- 7. Primeiro usuario -----------------------------------------------------
$quantos = (& psql -U postgres -h localhost -p 5432 -d patrono -tAc "select count(*) from usuarios").Trim()
if ($quantos -eq '0') {
  Titulo "Seu usuario"
  Write-Host "  Agora crie o usuario com que voce vai entrar na plataforma."
  Write-Host ""
  $nomeUsuario = Read-Host "  Nome de usuario (ex: cristiane)"
  Write-Host ""
  Write-Host "  A senha precisa de no minimo 12 caracteres, com maiuscula,"
  Write-Host "  minuscula, numero e simbolo. Aqui simbolo pode, sem problema."
  Write-Host ""
  $seguraApp = Read-Host "  Senha da plataforma" -AsSecureString
  $env:SENHA = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguraApp))

  Push-Location (Join-Path $PSScriptRoot 'server')
  try {
    & npx tsx scripts/criar-usuario.ts --usuario $nomeUsuario --nome $nomeUsuario --perfil administrador --area juridico
    $criou = ($LASTEXITCODE -eq 0)
  } finally {
    Pop-Location
    $env:SENHA = $null
  }
  if ($criou) { Ok "Usuario $nomeUsuario criado" }
  else { Aviso "O usuario nao foi criado. A senha provavelmente nao atendeu a exigencia acima. Rode este instalador de novo." }
} else {
  Ok "Ja existem usuarios cadastrados, nenhum foi criado"
}

$env:PGPASSWORD = $null

Write-Host ""
Write-Host "  ==========================================================" -ForegroundColor Green
Write-Host "   Instalacao concluida de verdade" -ForegroundColor Green
Write-Host "  ==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Para usar: clique em 'Iniciar Patrono.bat'"
Write-Host ""
Write-Host "  Antes de confiar dado real a esta maquina, preencha no server\.env:"
Write-Host "    BACKUP_CHAVE   sem ela nao existe backup"
Write-Host "    MONDAY_TOKEN   sem ele nao ha sincronizacao"
Write-Host "    SIENGE_*       sem eles nao ha dado financeiro"
Write-Host ""
Read-Host "  Pressione Enter para fechar"
