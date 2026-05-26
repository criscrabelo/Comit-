@echo off
echo Liberando porta 3131 no Firewall do Windows...
netsh advfirewall firewall delete rule name="Plataforma Comites 3131" >nul 2>&1
netsh advfirewall firewall add rule name="Plataforma Comites 3131" dir=in action=allow protocol=TCP localport=3131 profile=private
echo.
echo Pronto! Porta 3131 liberada para a rede local.
echo Agora a outra maquina pode acessar via IP desta maquina.
pause
