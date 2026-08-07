@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Patrono Alta Performance - Instalacao

REM ============================================================================
REM  Instalacao do Patrono Alta Performance em maquina Windows.
REM
REM  Este script NAO instala Node.js nem PostgreSQL. Ele confere se os dois
REM  estao presentes e para com instrucao clara se faltarem. Instalar por conta
REM  propria, em silencio, deixaria a maquina em um estado que ninguem sabe
REM  descrever depois — e essa maquina vai guardar CPF e situacao financeira de
REM  cliente real.
REM
REM  O que ele faz:
REM    1. confere Node.js 22+ e PostgreSQL 16+
REM    2. cria o banco patrono, se ainda nao existir
REM    3. instala as dependencias do servidor
REM    4. aplica todas as migracoes
REM    5. cria o arquivo .env a partir do modelo, se ainda nao existir
REM    6. cria o primeiro usuario administrador
REM
REM  Rodar de novo e seguro: nenhum passo apaga dado existente.
REM ============================================================================

cd /d "%~dp0"

echo.
echo  ==========================================================
echo   Patrono Alta Performance - Instalacao
echo  ==========================================================
echo.

REM ── 1. Node.js ──────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo  [FALTA] Node.js nao encontrado.
  echo.
  echo  Baixe a versao LTS em https://nodejs.org e instale.
  echo  Depois feche esta janela e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if !NODEMAJOR! LSS 22 (
  echo  [VERSAO] Node.js !NODEMAJOR! encontrado; o Patrono exige 22 ou superior.
  echo  Atualize em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo  [ok] Node.js
node -v

REM ── 2. PostgreSQL ───────────────────────────────────────────────────────────
REM  psql e pg_dump precisam estar no PATH. pg_dump e o que gera o backup; sem
REM  ele a plataforma sobe e nunca consegue proteger o proprio dado.
where psql >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [FALTA] PostgreSQL nao encontrado no PATH.
  echo.
  echo  Baixe o PostgreSQL 16 em:
  echo    https://www.postgresql.org/download/windows/
  echo.
  echo  Durante a instalacao:
  echo    - anote a senha do usuario postgres, voce vai precisar dela aqui
  echo    - mantenha a porta padrao 5432
  echo    - marque a opcao de adicionar ao PATH, se aparecer
  echo.
  echo  Depois feche esta janela e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
where pg_dump >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [FALTA] pg_dump nao encontrado no PATH.
  echo  A instalacao do PostgreSQL veio incompleta: sem pg_dump nao ha backup,
  echo  e sem backup esta maquina nao pode guardar dado de cliente.
  echo.
  pause
  exit /b 1
)
echo  [ok] PostgreSQL
psql --version

REM ── 3. Senha do banco ───────────────────────────────────────────────────────
echo.
echo  Informe a senha do usuario "postgres" definida na instalacao do
echo  PostgreSQL. Ela fica gravada apenas no arquivo .env desta maquina.
echo.
set "PGPASSWORD="
set /p PGPASSWORD=  Senha do postgres:
if "!PGPASSWORD!"=="" (
  echo.
  echo  [ERRO] Senha vazia. A instalacao nao continua sem ela.
  pause
  exit /b 1
)

psql -U postgres -h localhost -p 5432 -c "select 1" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [ERRO] Nao consegui conectar ao PostgreSQL com essa senha.
  echo  Confira a senha e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo  [ok] Conexao com o PostgreSQL

REM ── 4. Banco patrono ────────────────────────────────────────────────────────
echo.
echo  Preparando o banco "patrono"...
for /f %%c in ('psql -U postgres -h localhost -p 5432 -tAc "select count(*) from pg_database where datname='patrono'"') do set EXISTE=%%c
if "!EXISTE!"=="0" (
  psql -U postgres -h localhost -p 5432 -c "create database patrono" >nul
  echo  [ok] Banco criado
) else (
  echo  [ok] Banco ja existia, preservado
)

REM ── 5. Arquivo .env ─────────────────────────────────────────────────────────
echo.
if exist "server\.env" (
  echo  [ok] server\.env ja existe, preservado
  echo       As credenciais que voce ja configurou nao foram tocadas.
) else (
  copy /y "server\.env.example" "server\.env" >nul
  powershell -NoProfile -Command ^
    "$p = 'server\.env';" ^
    "$t = Get-Content $p -Raw -Encoding UTF8;" ^
    "$t = $t -replace 'DATABASE_URL=.*', 'DATABASE_URL=postgres://postgres:%PGPASSWORD%@localhost:5432/patrono';" ^
    "$t = $t -replace 'PORT=.*', 'PORT=3131';" ^
    "$t = $t -replace 'BACKUP_DIRETORIO=.*', ('BACKUP_DIRETORIO=' + (Join-Path $env:USERPROFILE 'Patrono-Backups' -replace '\\','/'));" ^
    "Set-Content $p $t -Encoding UTF8"
  echo  [ok] server\.env criado
  echo.
  echo  ATENCAO: o .env foi criado SEM as credenciais do Monday e do Sienge e
  echo  SEM a chave de backup. A plataforma sobe assim, mas nao sincroniza e
  echo  nao gera backup ate voce preencher. Veja INSTALAR-WINDOWS.md.
)

REM ── 6. Dependencias ─────────────────────────────────────────────────────────
echo.
echo  Instalando dependencias do servidor. Isso leva alguns minutos...
pushd server
REM  Instalacao completa, com as dependencias de desenvolvimento: o compilador
REM  TypeScript e o aplicador de migracoes estao entre elas, e sem os dois nao
REM  ha como preparar o banco nem gerar o servidor.
REM  O Playwright so serve para teste automatizado; baixar os navegadores dele
REM  aqui seriam centenas de megabytes sem nenhum uso nesta maquina.
set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  [ERRO] Falha ao instalar dependencias.
  popd
  pause
  exit /b 1
)

REM ── 7. Migracoes ────────────────────────────────────────────────────────────
echo.
echo  Aplicando as migracoes do banco...
call npm run migrate:up
if errorlevel 1 (
  echo.
  echo  [ERRO] Falha ao aplicar migracoes. Nada foi deixado pela metade:
  echo  cada migracao roda em transacao propria.
  popd
  pause
  exit /b 1
)
echo  [ok] Banco no esquema atual

REM ── 7b. Compilacao ──────────────────────────────────────────────────────────
echo.
echo  Gerando o servidor...
call npm run build
if errorlevel 1 (
  echo.
  echo  [ERRO] Falha ao compilar o servidor.
  popd
  pause
  exit /b 1
)
echo  [ok] Servidor gerado
popd

REM ── 8. Primeiro usuario ─────────────────────────────────────────────────────
echo.
for /f %%u in ('psql -U postgres -h localhost -p 5432 -d patrono -tAc "select count(*) from usuarios"') do set TEMUSER=%%u
if "!TEMUSER!"=="0" (
  echo  Vamos criar o seu usuario administrador.
  echo.
  set "NOVOUSER="
  set /p NOVOUSER=  Nome de usuario para entrar (ex: cristiane):
  echo.
  echo  A senha precisa de no minimo 12 caracteres, com maiuscula,
  echo  minuscula, numero e simbolo.
  echo.
  set "NOVASENHA="
  set /p NOVASENHA=  Senha:
  pushd server
  set "SENHA=!NOVASENHA!"
  call npx tsx scripts/criar-usuario.ts --usuario "!NOVOUSER!" --nome "!NOVOUSER!" --perfil administrador --area juridico
  set "SENHA="
  popd
  set "NOVASENHA="
) else (
  echo  [ok] Ja existem usuarios cadastrados, nenhum foi criado
)

REM ── Fim ─────────────────────────────────────────────────────────────────────
set "PGPASSWORD="
echo.
echo  ==========================================================
echo   Instalacao concluida
echo  ==========================================================
echo.
echo  Para usar a plataforma, clique em "Iniciar Patrono.bat".
echo.
echo  Antes de confiar dado real a esta maquina, leia
echo  INSTALAR-WINDOWS.md e preencha no server\.env:
echo    - BACKUP_CHAVE      (sem ela nao existe backup)
echo    - MONDAY_TOKEN      (sem ele nao ha sincronizacao)
echo    - SIENGE_*          (sem eles nao ha dado financeiro)
echo.
pause
