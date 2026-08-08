@echo off
chcp 65001 >nul
title Plataforma Comites - Compartilhada
setlocal enabledelayedexpansion

echo.
echo  ========================================
echo   Plataforma de Comites - Juridico
echo   Modo: Acesso Compartilhado (Internet)
echo  ========================================
echo.

cd /d "%~dp0"

if not exist "server\.env" (
  echo  X Falta preparar esta maquina.
  echo    Rode primeiro: "Preparar Plataforma (Primeira Vez).bat"
  echo.
  pause
  exit /b 1
)

:: ── Limpeza do que ficou de execucoes anteriores ─────────────────────────
echo  [0/3] Liberando a porta 3131...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3131 "') do (
  taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: ── O tunel vem ANTES do servidor, e a ordem e proposital ────────────────
::
:: Em producao a plataforma exige a lista de origens (CORS_ORIGINS) e recusa
:: subir sem ela. A origem, aqui, e o endereco do tunel - que so existe depois
:: que o tunel sobe. Subir o servidor primeiro obrigaria a reinicia-lo, ou a
:: rodar fora de producao, e fora de producao o cookie de sessao perde a marca
:: Secure num acesso que e HTTPS.
::
:: O tunel aceita subir antes do servidor: ele apenas encaminha, e quem chegar
:: antes da hora recebe erro de conexao por alguns segundos.
echo  [1/3] Criando o link publico via Cloudflare (aguarde)...
set TUNNEL_LOG=%TEMP%\cloudflared_tunnel.txt
del "%TUNNEL_LOG%" >nul 2>&1

set CF_EXE=%USERPROFILE%\.local\bin\cloudflared.exe
if not exist "%CF_EXE%" (
  echo.
  echo  X cloudflarednao encontrado em:
  echo      %CF_EXE%
  echo.
  echo    Sem ele nao ha link publico. Para uso apenas na rede local,
  echo    use "Iniciar Plataforma.bat".
  echo.
  pause
  exit /b 1
)

start /B "" "%CF_EXE%" tunnel --url http://localhost:3131 --no-autoupdate > "%TUNNEL_LOG%" 2>&1

set "LINHA="
for /L %%i in (1,1,30) do (
  timeout /t 1 /nobreak >nul
  for /f "tokens=*" %%a in ('findstr /C:"trycloudflare.com" "%TUNNEL_LOG%" 2^>nul') do (
    set "LINHA=%%a"
  )
  if defined LINHA goto :extrair
)
echo.
echo  X Tempo esgotado esperando o endereco do tunel.
echo    Log: %TUNNEL_LOG%
echo.
pause
exit /b 1

:extrair
set "URL_PUBLICA="
for %%a in (!LINHA!) do (
  echo %%a | findstr /C:"https://" >nul 2>&1
  if not errorlevel 1 set "URL_PUBLICA=%%a"
)
set URL_PUBLICA=!URL_PUBLICA:|=!
for /f "tokens=* delims= " %%a in ("!URL_PUBLICA!") do set "URL_PUBLICA=%%a"

if not defined URL_PUBLICA (
  echo.
  echo  X Nao consegui extrair o endereco. Log: %TUNNEL_LOG%
  echo.
  pause
  exit /b 1
)

echo !URL_PUBLICA! > "%~dp0URL_PUBLICA.txt"
echo Gerado em: %DATE% %TIME% >> "%~dp0URL_PUBLICA.txt"

:: ── Servidor, em producao, com a origem do tunel ─────────────────────────
echo  [2/3] Iniciando a plataforma em modo producao...
echo.
echo  =========================================
echo   [3/3] LINK PARA COMPARTILHAR:
echo.
echo   !URL_PUBLICA!
echo.
echo  =========================================
echo.
echo  Quem receber o link precisa de usuario e senha - a plataforma
echo  agora exige login, e cada pessoa entra com o seu.
echo.
echo  MANTENHA ESTA JANELA ABERTA enquanto usar.
echo  =========================================
echo.

cd server
set NODE_ENV=production
set PORT=3131
set CORS_ORIGINS=!URL_PUBLICA!
npx tsx src/server.ts

echo.
echo  A plataforma parou. A mensagem acima diz o motivo.
echo.
cd ..
taskkill /F /IM cloudflared.exe >nul 2>&1
pause
endlocal
