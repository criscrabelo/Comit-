# =============================================================================
#  Patrono Alta Performance - sobe a plataforma nesta maquina.
#
#  Enquanto esta janela estiver aberta, a plataforma esta no ar. Fechar a
#  janela desliga a plataforma; o dado continua guardado no PostgreSQL e nada
#  se perde.
#
#  Mantido em ASCII puro pelo mesmo motivo do instalar.ps1: o PowerShell 5.1
#  do Windows le arquivo sem marca de codificacao como ANSI, e um acento aqui
#  quebraria a leitura do arquivo inteiro.
# =============================================================================

Set-Location -LiteralPath $PSScriptRoot

$compilado = Join-Path $PSScriptRoot 'server\dist\server.js'
$config    = Join-Path $PSScriptRoot 'server\.env'

if (-not (Test-Path $config)) {
  Write-Host ""
  Write-Host "  [FALTA] server\.env nao existe." -ForegroundColor Red
  Write-Host "  Rode 'Instalar Patrono.bat' primeiro."
  Write-Host ""
  Read-Host "  Pressione Enter para fechar"
  exit 1
}

if (-not (Test-Path $compilado)) {
  Write-Host ""
  Write-Host "  [FALTA] O servidor ainda nao foi gerado." -ForegroundColor Red
  Write-Host "  Rode 'Instalar Patrono.bat' primeiro."
  Write-Host ""
  Read-Host "  Pressione Enter para fechar"
  exit 1
}

Write-Host ""
Write-Host "  ==========================================================" -ForegroundColor Cyan
Write-Host "   Patrono Alta Performance" -ForegroundColor Cyan
Write-Host "  ==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Iniciando... aguarde alguns segundos."
Write-Host ""
Write-Host "  Para desligar a plataforma, feche esta janela." -ForegroundColor Yellow
Write-Host ""

# O navegador abre em paralelo. O servidor leva alguns segundos para aceitar
# conexao; se a pagina nao carregar de primeira, atualizar resolve.
Start-Process 'http://localhost:3131'

Set-Location (Join-Path $PSScriptRoot 'server')
& node dist\server.js

Write-Host ""
Write-Host "  A plataforma foi encerrada."
Read-Host "  Pressione Enter para fechar"
