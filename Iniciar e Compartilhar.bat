@echo off
title Plataforma Comites - Compartilhada
chcp 65001 >nul
echo.
echo  ========================================
echo   Plataforma de Comites - Juridico
echo   Modo: Acesso Compartilhado (Internet)
echo  ========================================
echo.

cd /d "%~dp0"

:: Mata processos antigos na porta 3131
echo  [0/3] Liberando porta 3131...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3131 "') do (
  taskkill /F /PID %%a >nul 2>&1
)
:: Mata cloudflared antigo
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Inicia o servidor na porta 3131
echo  [1/3] Iniciando servidor com banco compartilhado...
start /B node server.js >nul 2>&1
timeout /t 3 /nobreak >nul

:: Inicia tunnel Cloudflare e captura URL automaticamente
echo  [2/3] Criando link publico via Cloudflare (aguarde 15 segundos)...
set TUNNEL_LOG=%TEMP%\cloudflared_tunnel.txt
del "%TUNNEL_LOG%" >nul 2>&1

:: Inicia cloudflared em background
set CF_EXE=%USERPROFILE%\.local\bin\cloudflared.exe
start /B "%CF_EXE%" tunnel --url http://localhost:3131 --no-autoupdate > "%TUNNEL_LOG%" 2>&1

:: Aguarda a URL aparecer no log (max 30 tentativas x 1s)
set URL_ENCONTRADA=
for /L %%i in (1,1,30) do (
  timeout /t 1 /nobreak >nul
  for /f "tokens=*" %%a in ('findstr /C:"trycloudflare.com" "%TUNNEL_LOG%" 2^>nul') do (
    set "LINHA=%%a"
  )
  if defined LINHA goto :extrair
)
echo  AVISO: Timeout aguardando URL do tunnel.
goto :fim

:extrair
:: Extrai a URL https://...trycloudflare.com da linha
for %%a in (%LINHA%) do (
  echo %%a | findstr /C:"https://" >nul 2>&1
  if not errorlevel 1 set "URL_ENCONTRADA=%%a"
)

:: Limpa barra vertical e espacos extras
set URL_ENCONTRADA=%URL_ENCONTRADA:|=%
for /f "tokens=* delims= " %%a in ("%URL_ENCONTRADA%") do set "URL_ENCONTRADA=%%a"

if not defined URL_ENCONTRADA (
  echo  AVISO: Nao foi possivel extrair a URL. Verifique: %TUNNEL_LOG%
  goto :fim
)

:: Salva a URL
echo %URL_ENCONTRADA% > "%~dp0URL_PUBLICA.txt"
echo Generated: %DATE% %TIME% >> "%~dp0URL_PUBLICA.txt"

echo.
echo  =========================================
echo   [3/3] LINK PARA COMPARTILHAR:
echo.
echo   %URL_ENCONTRADA%
echo.
echo  =========================================
echo.
echo  Copie o link acima e envie para a outra pessoa.
echo  A outra pessoa abre no navegador (celular ou PC).
echo  Todos verao os mesmos dados em tempo real.
echo.
echo  MANTENHA ESTA JANELA ABERTA enquanto usar.
echo  =========================================
echo.

:fim
pause
