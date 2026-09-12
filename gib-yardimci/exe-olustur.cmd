@echo off
title MUBiS GIB Yardimci - EXE Olusturucu
cd /d "%~dp0"

echo ============================================
echo  MUBiS GIB Yardimci - EXE olusturuluyor
echo ============================================
echo.

if not exist node_modules (
  echo [1/5] Paketler kuruluyor...
  call npm install || goto :hata
) else (
  echo [1/5] Paketler hazir.
)

echo [2/5] Araclar (esbuild, postject) kontrol ediliyor...
call npm install --no-save esbuild postject || goto :hata

if not exist dist mkdir dist

echo [2a/5] Tesseract.js Node worker paketleniyor...
call npx esbuild node_modules\tesseract.js\src\worker-script\node\index.js --bundle --platform=node --target=node20 --outfile=dist\tesseract-worker.js || goto :hata

echo [2b/5] Tesseract.js wasm dosyalari kopyalaniyor...
copy /y "node_modules\tesseract.js-core\*.wasm" "dist\" >nul || goto :hata

echo [3/5] Uygulama tek dosyada paketleniyor...
call npx esbuild index.js --bundle --platform=node --target=node20 --outfile=dist\sea-app.cjs || goto :hata

echo {"main":"dist/sea-app.cjs","output":"dist/sea-prep.blob","disableExperimentalSEAWarning":true} > dist\sea-config.json
call node --experimental-sea-config dist\sea-config.json || goto :hata

echo [4/5] Node tabanina kopyalaniyor...
for /f "delims=" %%p in ('where node') do set "NODE_EXE=%%p"
copy /y "%NODE_EXE%" dist\mubis-gib-yardimci.exe >nul || goto :hata

echo [5/5] Blob exe icine gomuluyor...
call npx postject dist\mubis-gib-yardimci.exe NODE_SEA_BLOB dist\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 || goto :hata

echo.
echo ============================================
echo  TAMAM! Exe hazir:
echo  %~dp0dist\mubis-gib-yardimci.exe
echo ============================================
pause
exit /b 0

:hata
echo.
echo HATA OLUSTU! Yukaridaki mesaji destek ile paylasin.
pause
exit /b 1
