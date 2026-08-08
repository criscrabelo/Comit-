@echo off
chcp 65001 >nul
title Plataforma Comites - Preparar (primeira vez)
setlocal

echo.
echo  ========================================
echo   Plataforma de Comites - Juridico
echo   PREPARAR - rodar UMA vez nesta maquina
echo  ========================================
echo.
echo  Este script NAO apaga nada e NAO envia nada para fora.
echo  Ele instala as dependencias, cria a estrutura do banco e
echo  cadastra o primeiro usuario.
echo.

cd /d "%~dp0"

:: ── 1. Node ──────────────────────────────────────────────────────────────
echo  [1/6] Conferindo o Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  X Node.js nao encontrado.
  echo    Instale a versao 22 ou mais nova em https://nodejs.org
  echo    Depois rode este script de novo.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo      Node %%v
echo.

:: ── 2. PostgreSQL ────────────────────────────────────────────────────────
echo  [2/6] Conferindo o PostgreSQL...
where psql >nul 2>&1
if errorlevel 1 (
  echo.
  echo  X PostgreSQL nao encontrado no PATH.
  echo.
  echo    Instale a versao 16 ou mais nova:
  echo      https://www.postgresql.org/download/windows/
  echo.
  echo    Na instalacao, ANOTE a senha do usuario "postgres" - ela
  echo    vai no arquivo server\.env no passo seguinte.
  echo.
  echo    Se o PostgreSQL ja estiver instalado, o que falta e o PATH:
  echo    acrescente a pasta bin dele, algo como
  echo      C:\Program Files\PostgreSQL\16\bin
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('psql --version') do echo      %%v
echo.

:: ── 3. .env ──────────────────────────────────────────────────────────────
echo  [3/6] Conferindo a configuracao (server\.env)...
if not exist "server\.env" (
  copy /Y "server\.env.example" "server\.env" >nul
  echo.
  echo  ! Criei server\.env a partir do modelo. PRECISA ser preenchido
  echo    antes de continuar. Abra o arquivo e ajuste:
  echo.
  echo      DATABASE_URL=postgres://postgres:SUA_SENHA@localhost:5432/patrono
  echo      MONDAY_TOKEN=  (cole o token, SEM ^< ^> em volta)
  echo.
  echo    Vou abrir o arquivo no Notepad. Salve, feche, e rode este
  echo    script de novo.
  echo.
  start /WAIT notepad "server\.env"
  pause
  exit /b 1
)

findstr /R /C:"^DATABASE_URL=..*" "server\.env" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  X DATABASE_URL esta vazia em server\.env.
  echo    Preencha assim, trocando SUA_SENHA:
  echo      DATABASE_URL=postgres://postgres:SUA_SENHA@localhost:5432/patrono
  echo.
  start /WAIT notepad "server\.env"
  pause
  exit /b 1
)
echo      server\.env encontrado.
echo.

:: ── 4. Dependencias ──────────────────────────────────────────────────────
echo  [4/6] Instalando dependencias (demora alguns minutos)...
cd server
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  X Falha ao instalar as dependencias. A mensagem acima diz o motivo.
  echo.
  cd ..
  pause
  exit /b 1
)
echo.

:: ── 5. Banco ─────────────────────────────────────────────────────────────
echo  [5/6] Criando a estrutura do banco...
echo.
echo      Se o banco ainda nao existe, crie agora com:
echo        createdb -U postgres patrono
echo      (o nome tem de bater com o final da DATABASE_URL)
echo.
call npm run migrate:up
if errorlevel 1 (
  echo.
  echo  X Falha ao aplicar as migracoes.
  echo.
  echo    Causa mais comum: o banco da DATABASE_URL nao existe ainda.
  echo    Rode  createdb -U postgres patrono  e tente de novo.
  echo.
  cd ..
  pause
  exit /b 1
)
echo.

:: ── 6. Primeiro usuario ──────────────────────────────────────────────────
echo  [6/6] Primeiro usuario.
echo.
echo      A plataforma agora exige login. Vou cadastrar o seu acesso.
echo      A senha NAO aparece na tela e nao fica no historico do
echo      comando - ela e lida como variavel de ambiente.
echo.
set /p USUARIO=      Nome de usuario (ex: cristiane):
if "%USUARIO%"=="" (
  echo.
  echo  X Nome de usuario vazio. Rode o script de novo.
  cd ..
  pause
  exit /b 1
)

echo.
echo      Digite a senha (minimo 12 caracteres, use uma frase longa):
set "SENHA="
powershell -NoProfile -Command "$s = Read-Host -AsSecureString '      Senha'; $p = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)); Set-Content -Path $env:TEMP\_s.txt -Value $p -NoNewline -Encoding UTF8"
set /p SENHA=<"%TEMP%\_s.txt"
del "%TEMP%\_s.txt" >nul 2>&1

if "%SENHA%"=="" (
  echo.
  echo  X Senha vazia. Rode o script de novo.
  cd ..
  pause
  exit /b 1
)

set "SENHA_TEMP=%SENHA%"
set "SENHA="
cmd /c "set SENHA=%SENHA_TEMP% && npx tsx scripts/criar-usuario.ts --usuario %USUARIO% --nome %USUARIO% --perfil administrador --area juridico --todos-empreendimentos --documento-completo"
set "SENHA_TEMP="
if errorlevel 1 (
  echo.
  echo  X Falha ao criar o usuario. A mensagem acima diz o motivo.
  cd ..
  pause
  exit /b 1
)

cd ..
echo.
echo  ========================================
echo   PRONTO.
echo  ========================================
echo.
echo   Agora use "Iniciar Plataforma.bat" no dia a dia.
echo.
echo   ATENCAO - seus dados atuais:
echo   A plataforma nova guarda tudo no PostgreSQL, e os dados de
echo   hoje estao no navegador. Na primeira vez que entrar, a tela
echo   vai oferecer a migracao. Faca isso NO MESMO NAVEGADOR e no
echo   mesmo perfil que voce usa hoje - e de lá que os dados saem.
echo.
pause
endlocal
