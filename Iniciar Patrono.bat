@echo off
setlocal
chcp 65001 >nul
title Patrono Alta Performance

REM ============================================================================
REM  Sobe a plataforma nesta maquina e abre o navegador.
REM
REM  Enquanto esta janela estiver aberta, a plataforma esta no ar. Fechar a
REM  janela desliga a plataforma — o dado continua guardado no PostgreSQL,
REM  nada se perde.
REM ============================================================================

cd /d "%~dp0"

if not exist "server\.env" (
  echo.
  echo  [FALTA] server\.env nao existe.
  echo  Rode "Instalar Patrono.bat" primeiro.
  echo.
  pause
  exit /b 1
)

if not exist "server\dist\server.js" (
  echo.
  echo  [FALTA] O servidor ainda nao foi gerado.
  echo  Rode "Instalar Patrono.bat" primeiro.
  echo.
  pause
  exit /b 1
)

echo.
echo  ==========================================================
echo   Patrono Alta Performance
echo  ==========================================================
echo.
echo  Iniciando... aguarde alguns segundos.
echo.
echo  Para desligar a plataforma, feche esta janela.
echo.

REM O navegador abre em paralelo; o servidor leva alguns segundos para aceitar
REM conexao, e o navegador tenta de novo sozinho ao atualizar a pagina.
start "" "http://localhost:3131"

cd server
call node dist\server.js

echo.
echo  A plataforma foi encerrada.
pause
