@echo off
echo.
echo  ========================================
echo   MUBiS Baglanti Merkezi - Kurulum
echo  ========================================
echo.

:: Node.js kontrol
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [HATA] Node.js bulunamadi!
    echo  Lutfen https://nodejs.org adresinden Node.js yukleyin.
    pause
    exit /b 1
)

echo  [1/3] Node.js bulundu...
node --version

echo  [2/3] Bagimliliklar yukleniyor...
cd /d "%~dp0"
call npm install

echo  [3/3] Kurulum tamamlandi!
echo.
echo  Baslatmak icin "baslat.bat" dosyasini calistirin.
echo.
pause
