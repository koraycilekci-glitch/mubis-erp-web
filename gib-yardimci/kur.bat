@echo off
title MUBiS GIB Yardimci - Kurulum
cd /d "%~dp0"

echo ============================================
echo  MUBiS GIB Yardimci - Kurulum
echo ============================================
echo.

echo [1/2] Node.js kontrol ediliyor...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo *************************************************
  echo   NODE.JS BILGISAYARINIZDA YUKLU DEGIL!
  echo.
  echo   1. Tarayicidan https://nodejs.org adresine girin
  echo   2. "LTS" surumunu indirin ve kurun
  echo   3. Kurulum bitince bu dosyayi tekrar calistirin
  echo *************************************************
  echo.
  pause
  exit /b 1
)
node -v
echo Node.js bulundu.

echo.
echo [2/2] Gerekli paketler indiriliyor (1-2 dakika surebilir)...
call npm install
if errorlevel 1 (
  echo.
  echo KURULUM BASARISIZ! Internet baglantinizi kontrol edin
  echo veya bu pencerede yazan hatayi MUBiS destek ile paylasin.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  KURULUM TAMAMLANDI!
echo  Simdi "baslat.bat" dosyasini calistirin.
echo ============================================
echo.
pause
