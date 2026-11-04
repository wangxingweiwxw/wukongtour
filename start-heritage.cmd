@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
if not exist node_modules\vite\bin\vite.js call npm ci
node node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5177 --open /
