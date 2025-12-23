@echo off
chcp 65001 >nul

echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║      ◈  H O L O T R E E  ◈                               ║
echo ║      Interactive Knowledge Base                           ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM Check and install backend dependencies
if not exist "backend\node_modules" (
    echo 📦 Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

REM Check and install frontend dependencies
if not exist "frontend\node_modules" (
    echo 📦 Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

REM Build frontend if needed
if not exist "backend\public\index.html" (
    echo 🔨 Building frontend...
    cd frontend
    call npm run build
    cd ..
    if not exist "backend\public" mkdir backend\public
    xcopy /E /Y frontend\dist\* backend\public\
)

echo.
echo 🚀 Starting HoloTree server...
echo.
echo    Open in browser: http://localhost:3001
echo.
echo    Press Ctrl+C to stop
echo.

cd backend
node server.js
