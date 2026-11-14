@echo off
title MUBiS GIB Yardimci - EXE Olusturucu
cd /d "%~dp0"

rem Surum numarasi: index.js icindeki /ping "version" degeriyle ayni tutulmali
set SURUM=2.8.330

echo ============================================
echo  MUBiS GIB Yardimci - EXE olusturuluyor
echo ============================================
echo.

set "NODE_VERSION="
for /f "delims=" %%v in ('node -p "process.versions.node" 2^>nul') do set "NODE_VERSION=%%v"
if not defined NODE_VERSION (
  echo HATA: Node.js calistirilamadi veya surum bilgisi alinamadi.
  goto :hata
)

if not exist node_modules (
  echo [1/6] Paketler kuruluyor...
  call npm install || goto :hata
) else (
  echo [1/6] Paketler hazir.
)

echo [2/6] Araclar (esbuild, postject) kontrol ediliyor...
call npm install --no-save esbuild postject || goto :hata

if not exist dist mkdir dist

echo [2a/6] Tesseract.js Node worker paketleniyor...
call npx esbuild node_modules\tesseract.js\src\worker-script\node\index.js --bundle --platform=node --target=node20 --outfile=dist\tesseract-worker.js || goto :hata

echo [2b/6] Tesseract.js wasm dosyalari kopyalaniyor...
rem NOT: "copy" joker (*.wasm) ile bu surucude hata veriyor; dosya dosya kopyala.
for %%f in ("node_modules\tesseract.js-core\*.wasm") do copy /y "%%~ff" "dist\" >nul
if not exist "dist\tesseract-core.wasm" goto :hata

echo [2c/6] Tray logosu (masot kafasi) hazirlaniyor...
rem Kalem maskotunun SADECE KAFA kismi: tray simgesinde tam vucut okunmuyor.
rem Onceden uretilmis kafa resmi; yoksa adim sessizce atlanir (yedek ikon cizilir).
set "TRAY_KAYNAK=C:\Users\hp\.verdent\generate_images\edit_20260916_220705_3d163112.png"
if not exist "%TRAY_KAYNAK%" set "TRAY_KAYNAK=%~dp0..\public\mubis-tray.png"
rem NOT: node --experimental-sea-config asset yolunu calisma dizininden
rem cozer; bu yuzden dosya hem proje kokune hem dist\ altina kopyalanir.
if exist "%TRAY_KAYNAK%" copy /y "%TRAY_KAYNAK%" "%~dp0mubis-tray.png" >nul
if exist "%TRAY_KAYNAK%" copy /y "%TRAY_KAYNAK%" "dist\mubis-tray.png" >nul
if exist "%TRAY_KAYNAK%" copy /y "%TRAY_KAYNAK%" "%~dp0..\public\mubis-tray.png" >nul
if exist "dist\mubis-tray.png" (echo   mubis-tray.png hazir - exe icine gomulecek) else (echo   UYARI: tray logosu bulunamadi, yedek ikon kullanilacak)

echo [2d/6] Luca kisayol ikonu hazirlaniyor...
rem "Luca'ya Gir" masaustu kisayolunun ikonu (MUBiS logosu, 256x256 ICO).
rem Kisayol ikonu dosya olarak exe'nin yanina cikarilir; yoksa exe ikonu kullanilir.
if not exist "%~dp0luca-kisayol.ico" set "LUCA_ICO_KAYNAK=%~dp0..\public\luca-kisayol.ico"
if exist "%~dp0luca-kisayol.ico" set "LUCA_ICO_KAYNAK=%~dp0luca-kisayol.ico"
if exist "%LUCA_ICO_KAYNAK%" copy /y "%LUCA_ICO_KAYNAK%" "dist\luca-kisayol.ico" >nul
if exist "dist\luca-kisayol.ico" (echo   luca-kisayol.ico hazir - exe icine gomulecek) else (echo   UYARI: Luca kisayol ikonu bulunamadi, exe ikonu kullanilacak)

echo [2e/6] MUBiS ERP logosu (fatura PDF alt bandi) hazirlaniyor...
set "MUBIS_LOGO_KAYNAK=%~dp0..\public\logo-text.png"
if exist "%MUBIS_LOGO_KAYNAK%" copy /y "%MUBIS_LOGO_KAYNAK%" "%~dp0mubis-logo.png" >nul
if exist "%MUBIS_LOGO_KAYNAK%" copy /y "%MUBIS_LOGO_KAYNAK%" "dist\mubis-logo.png" >nul
if exist "dist\mubis-logo.png" (echo   mubis-logo.png hazir - exe icine gomulecek) else (echo   UYARI: mubis-logo.png bulunamadi, fatura PDF alt bandi logosuz olur)

echo [3/6] Uygulama tek dosyada paketleniyor...
call npx esbuild index.js --bundle --platform=node --target=node20 --outfile=dist\sea-app.cjs || goto :hata

echo {"main":"dist/sea-app.cjs","output":"dist/sea-prep.blob","disableExperimentalSEAWarning":true,"assets":{"mubis-tray.png":"mubis-tray.png","luca-kisayol.ico":"luca-kisayol.ico","mubis-logo.png":"mubis-logo.png"}} > dist\sea-config.json
call node --experimental-sea-config dist\sea-config.json || goto :hata

echo [4/6] Node tabanina kopyalaniyor...
for /f "delims=" %%p in ('where node') do set "NODE_EXE=%%p"
copy /y "%NODE_EXE%" dist\mubis-gib-yardimci.exe >nul || goto :hata

echo [5/6] Blob exe icine gomuluyor...
call npx postject dist\mubis-gib-yardimci.exe NODE_SEA_BLOB dist\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 || goto :hata

echo [6/6] Surum dosyasi degistirilmedi.
echo Exe yuklenip dogrulandi sonra helper-surum.json surumunu %SURUM% yapin.

echo.
echo ============================================
echo  TAMAM! Exe hazir:
echo  Exe: %~dp0dist\mubis-gib-yardimci.exe
echo  (Supabase Storage indirilenler bucket'ina yukleyin)
echo ============================================
pause
exit /b 0

:hata
echo.
echo HATA OLUSTU! Yukaridaki mesaji destek ile paylasin.
pause
exit /b 1

