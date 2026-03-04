@echo off
REM Start Metro bundler for Expo project

echo =========================================
echo Starting Metro Bundler
echo =========================================
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo Error: package.json not found!
    echo Please run this script from the project root directory.
    pause
    exit /b 1
)

echo Starting Expo Metro bundler...
echo.
echo Metro will start on http://localhost:8081
echo Press 'a' to open on Android device/emulator
echo Press 'r' to reload
echo Press Ctrl+C to stop
echo.

REM Start Expo
call npm start
