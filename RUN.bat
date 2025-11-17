@echo off
title Axis API Server Runner
cd /d %~dp0

rem ===============================
rem Cek apakah Node.js sudah terinstal
rem ===============================
node -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js tidak ditemukan.
  echo Silakan install Node.js dari https://nodejs.org/
  pause
  exit /b 1
)

rem ===============================
rem Baca port dari argumen (opsional)
rem Contoh: run-server.bat 8080
rem ===============================
if "%1"=="" (
  echo Tidak ada port yang diberikan. Akan baca dari file .env (default 3000)
  set PORT_ARG=
) else (
  set PORT_ARG=%1
  set SERVER_PORT=%PORT_ARG%
  echo Port override: %SERVER_PORT%
)

rem ===============================
rem Jalankan server.js
rem ===============================
echo.
echo 🚀 Menjalankan Axis API Server ...
echo Lokasi: %cd%
if defined SERVER_PORT (
  echo Port: %SERVER_PORT%
) else (
  echo Port: (dibaca dari .env)
)
echo create by opchikamp
echo ================================================
echo.

if defined SERVER_PORT (
  set SERVER_PORT=%SERVER_PORT%
  node server.js
) else (
  node server.js
)

echo.
echo ================================================
echo Server berhenti.
pause
