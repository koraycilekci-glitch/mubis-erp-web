@echo off
title MUBiS GIB Yardimci - Protokol Kurulumu
cd /d "%~dp0"

rem mubis-gib:// protokolunu Windows'a kaydet (yonetici izni gerekmez)
reg add "HKCU\Software\Classes\mubis-gib" /ve /d "URL:MUBiS GIB Yardimci" /f
reg add "HKCU\Software\Classes\mubis-gib" /v "URL Protocol" /d "" /f
reg add "HKCU\Software\Classes\mubis-gib\shell\open\command" /ve /d "\"%~dp0protokol-launcher.bat\" \"%%1\"" /f

if %errorlevel%==0 (
  echo.
  echo TAMAM! mubis-gib:// protokolu kuruldu.
  echo Artik MUBiS'te "Ode" butonuna basinca program otomatik acilacak.
) else (
  echo.
  echo AYARLANAMADI!
)
pause
