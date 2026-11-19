@echo off
setlocal
title Vespa Greeter - Passo del Saluto

set "GAME_DIR=%~dp0"
set "INDEX_FILE=%GAME_DIR%index.html"
set "THREE_FILE=%GAME_DIR%vendor\three.min.js"

if not exist "%INDEX_FILE%" (
    echo [ERROR] Could not find index.html in "%GAME_DIR%".
    pause
    exit /b 1
)

if not exist "%THREE_FILE%" (
    echo [ERROR] Missing offline Three.js bundle at "%THREE_FILE%".
    pause
    exit /b 1
)

echo Launching Vespa Greeter - Passo del Saluto (Offline Edition)...
start "" "%INDEX_FILE%"
exit /b 0
