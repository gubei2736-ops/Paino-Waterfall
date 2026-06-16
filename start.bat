@echo off
title Piano Waterfall Startup Manager

echo ===================================================
echo             Piano Waterfall Startup Manager
echo ===================================================
echo.

netstat -ano | findstr LISTENING | findstr :8000 > nul
if %errorlevel% equ 0 (
    echo Backend OMR engine is already running on port 8000. Skipping backend startup.
    goto start_frontend
)

echo Starting backend OMR recognition engine (FastAPI)...
cd /d "%~dp0backend"

if exist "venv\Scripts\python.exe" (
    echo Starting backend using local virtual environment...
    start /b "" "venv\Scripts\python.exe" main.py
) else (
    echo ERROR: Python virtual environment not found inside backend\venv!
    echo Please create one and install dependencies:
    echo   cd backend
    echo   python -m venv venv
    echo   venv\Scripts\pip install -r requirements.txt
    echo.
)

:start_frontend
echo.
echo Starting frontend workbench (Vite / React)...
cd /d "%~dp0frontend"
start /b "" npm run dev

echo.
echo Automatically opening frontend in default browser...
ping 127.0.0.1 -n 4 > nul
start http://localhost:5173

echo.
echo ===================================================
echo Startup commands sent successfully!
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Note: Both servers are running concurrently in this window.
echo       Press CTRL+C or close this window to stop both.
echo ===================================================
echo.

cd /d "%~dp0"
pause
