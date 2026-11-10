@echo off
title MUBiS GIB Yardimci Servisi
cd /d "%~dp0"
if not exist node_modules (
  echo Once "kur.bat" dosyasini calistirin.
  pause
  exit /b 1
)
echo MUBiS GIB Yardimci gizli servis olarak baslatiliyor...
rem Pencere kendiliginden kapanir; servis arka planda gizli calismaya devam eder.
powershell -NoProfile -Command "Start-Process node -ArgumentList 'index.js','--servis' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
timeout /t 2 /nobreak >nul
exit
