@echo off
title Configurar Google Drive
cd /d "%~dp0"
echo ========================================
echo  Configuracao do Google Drive (rclone)
echo ========================================
echo.
echo 1. Uma janela do navegador vai abrir
echo 2. Faca login na sua conta Google
echo 3. Clique em "Permitir" (Allow)
echo 4. Volte aqui e pronto!
echo.
pause
.\rclone.exe config create gdrive drive config_is_local=false
echo.
echo Se aparecer "Success", configurado!
echo.
pause
