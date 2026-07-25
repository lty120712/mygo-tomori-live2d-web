@echo off
cd /d "%~dp0"
echo Starting Tomori Live2D Viewer (Vue 3)...
echo Open http://127.0.0.1:5173
start http://127.0.0.1:5173
npm run dev
pause