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
rem NOT: Klasor adi kesme isareti (') icerebildigi icin PowerShell tarafinda
rem tek tirnak KULLANILMAZ; %~dp0 degeri ortam degiskeni ile aktarilir.
set "MUBIS_HELPER_DIR=%~dp0"
powershell -NoProfile -Command "Start-Process node -ArgumentList 'index.js','--servis' -WorkingDirectory $env:MUBIS_HELPER_DIR -WindowStyle Hidden"
timeout /t 2 /nobreak >nul
exit
