@echo off
rem PLAYLOG 글쓰기 - 더블클릭하면 브라우저에 에디터가 열려요. 이 창을 닫으면 에디터도 꺼져요.
chcp 65001 > nul
cd /d "%~dp0"
python tools\editor\server.py
if errorlevel 1 pause
