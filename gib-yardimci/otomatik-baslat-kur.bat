@echo off
title MUBiS GIB Yardimci - Otomatik Baslatma Kurulumu
cd /d "%~dp0"
echo Bu ayar bilgisayari acilan her oturumda
echo MUBiS GIB Yardimci'yi otomatik baslatir.
echo.

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "KISAYOL=%STARTUP%\MUBiS GIB Yardimci.bat"

> "%KISAYOL%" echo @echo off
>> "%KISAYOL%" echo start "" /min cmd /c ""%~dp0baslat.bat""

if exist "%KISAYOL%" (
  echo.
  echo TAMAM! Program her bilgisayar acilisinda otomatik calisacak.
  echo Baslatma dosyasi: "%KISAYOL%"
) else (
  echo.
  echo AYARLANAMADI!
)
echo.
echo (Kaldirmak icin: otomatik-baslat-kaldir.bat)
pause
