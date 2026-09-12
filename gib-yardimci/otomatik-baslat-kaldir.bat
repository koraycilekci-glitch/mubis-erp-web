@echo off
title MUBiS GIB Yardimci - Otomatik Baslatmayi Kaldir
set "KISAYOL=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MUBiS GIB Yardimci.bat"
if exist "%KISAYOL%" (
  del "%KISAYOL%"
  echo Otomatik baslatma kaldirildi.
) else (
  echo Otomatik baslatma zaten kurulu degil.
)
pause
