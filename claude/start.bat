@echo off
rem Starts a tiny local web server and opens the game in your browser.
cd /d "%~dp0"
start "" http://localhost:5173
python -m http.server 5173
