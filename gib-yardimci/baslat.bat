@echo off
title MUBiS GIB Yardimci Servisi
cd /d "%~dp0"
if not exist node_modules (
  echo Once "kur.bat" dosyasini calistirin.
  pause
  exit /b 1
)
echo MUBiS GIB Yardimci baslatiliyor...
node index.js --servis
pause
