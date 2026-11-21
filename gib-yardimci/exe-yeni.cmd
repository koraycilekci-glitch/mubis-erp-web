@echo off
setlocal
cd /d "%~dp0"

echo [1/6] Paketler hazir
if not exist dist mkdir dist

echo [2a] Tesseract worker paketleniyor...
call npx esbuild node_modules\tesseract.js\src\worker-script\node\index.js --bundle --platform=node --target=node20 --outfile=dist\tesseract-worker.js
if errorlevel 1 goto hata

echo [2b] wasm dosyalari kopyalaniyor...
for %%f in ("node_modules\tesseract.js-core\*.wasm") do copy /y "%%~ff" "dist\" >nul

echo [2c] varliklar...
if exist "luca-kisayol.ico" copy /y "luca-kisayol.ico" "dist\luca-kisayol.ico" >nul
if exist "mubis-logo.png" copy /y "mubis-logo.png" "dist\mubis-logo.png" >nul
if exist "mubis-tray.png" copy /y "mubis-tray.png" "dist\mubis-tray.png" >nul

echo [3] Uygulama paketleniyor...
call npx esbuild index.js --bundle --platform=node --target=node20 --outfile=dist\sea-app.cjs
if errorlevel 1 goto hata

echo {"main":"dist/sea-app.cjs","output":"dist/sea-prep.blob","disableExperimentalSEAWarning":true,"assets":{"mubis-tray.png":"mubis-tray.png","luca-kisayol.ico":"luca-kisayol.ico","mubis-logo.png":"mubis-logo.png"}} > dist\sea-config.json
call node --experimental-sea-config dist\sea-config.json
if errorlevel 1 goto hata

echo [4] Node tabanina kopyalaniyor...
for /f "delims=" %%p in ('where node') do set "NODE_EXE=%%p"
copy /y "%NODE_EXE%" dist\mubis-gib-yardimci.exe >nul
if errorlevel 1 goto hata

echo [5] Blob gomuluyor...
call npx postject dist\mubis-gib-yardimci.exe NODE_SEA_BLOB dist\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if errorlevel 1 goto hata
echo [6] TAMAM
echo Exe: %~dp0dist\mubis-gib-yardimci.exe
exit /b 0

:hata
echo HATA OLUSTU
exit /b 1
