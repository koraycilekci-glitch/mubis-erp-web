@echo off
rem mubis-gib:// protokolu baslaticisi
cd /d "%~dp0"

if not exist node_modules (
  echo.
  echo PAKETLER YOK! Once bu klasordeki "kur.bat" dosyasini calistirin.
  pause
  exit /b 1
)

node "%~dp0index.js" --protokol %1 2>> "%~dp0protokol-hata.log"

if errorlevel 1 (
  echo.
  echo HATA OLUSTU! Ayrintilar: "%~dp0protokol-hata.log"
  type "%~dp0protokol-hata.log"
  pause
)
