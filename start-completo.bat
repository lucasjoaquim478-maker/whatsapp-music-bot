@echo off
title WhatsApp Bot + Ngrok
cd /d "%~dp0"
echo Iniciando ngrok...
start /B "" "%~dp0ngrok.exe" http 3000 --log=stdout > ngrok.log 2>&1
echo Aguardando ngrok...
timeout /t 3 /nobreak >NUL
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "& { (Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels').tunnels[0].public_url }" 2^>NUL') do set URL=%%a
if defined URL (
    echo ==============================
    echo Dashboard publica: %URL%
    echo ==============================
)
echo Iniciando bot...
launcher.exe
