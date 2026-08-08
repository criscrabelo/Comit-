@echo off
chcp 65001 >nul
title Plataforma Comites - Juridico
setlocal

echo.
echo  ========================================
echo   Plataforma de Comites - Juridico
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

if not exist "server\node_modules" (
  echo  X As dependencias nao estao instaladas.
  echo    Rode primeiro: "Preparar Plataforma (Primeira Vez).bat"
  echo.
  pause
  exit /b 1
)

:: Libera a porta de uma execucao anterior que ficou pendurada. Sem isto o
:: servidor sobe, falha ao ouvir a porta, e a janela fecha antes de dar tempo
:: de ler o motivo.
echo  Liberando a porta 3131...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3131 "') do (
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo  Iniciando a plataforma...
echo.
echo  Abra no navegador:  http://localhost:3131
echo.
echo  Na rede local, as outras maquinas usam o IP desta:
ipconfig | findstr /C:"IPv4"
echo  (porta 3131 - se nao abrir, rode "Liberar Firewall (Admin).bat")
echo.
echo  MANTENHA ESTA JANELA ABERTA enquanto usar.
echo  ========================================
echo.

:: NODE_ENV=development de proposito, e nao por descuido.
::
:: Em producao o cookie de sessao recebe a marca Secure, e o navegador entao
:: SO o envia por HTTPS. O acesso aqui e por http://localhost e por
:: http://IP-da-maquina, sem certificado: com Secure o cookie seria descartado
:: e o login pareceria quebrado sem nenhuma mensagem de erro.
::
:: Para acesso pela internet, com HTTPS de verdade, use
:: "Iniciar e Compartilhar.bat" - la o modo e producao.
cd server
set NODE_ENV=development
set PORT=3131
npx tsx src/server.ts

echo.
echo  A plataforma parou. A mensagem acima diz o motivo.
echo.
cd ..
pause
endlocal
