@echo off
title WhatsApp Music Bot
cd /d "%~dp0"

where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo PowerShell nao encontrado. Instale o PowerShell 5.1+.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -File "launcher.ps1"
pause
