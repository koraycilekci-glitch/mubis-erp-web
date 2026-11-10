@echo off
rem MUBiS ERP - Cloudflare Pages yayinlama
rem Kullanim: npm run build calistirdiktan sonra bu dosyayi calistir.
rem Token .cf-token dosyasinda tutulur (git'e eklenmez).

cd /d "%~dp0"

if not exist .cf-token (
  echo .cf-token dosyasi yok. Cloudflare API token'ini iceren .cf-token dosyasi olusturun.
  pause
  exit /b 1
)

set /p CF_TOKEN=<.cf-token
set CLOUDFLARE_API_TOKEN=%CF_TOKEN%
set CLOUDFLARE_ACCOUNT_ID=f885d2d48c6825ca14a4dcbec74b07e8

echo [1/2] Build aliniyor...
call npm run build || goto :hata

echo [2/2] Cloudflare Pages'e yukleniyor...
call npx -y wrangler@latest pages deploy dist --project-name mubis-erp-web --branch main --commit-dirty=true || goto :hata

echo.
echo TAMAM! Yayin: https://mubiserp.com
pause
exit /b 0

:hata
echo HATA OLUSTU!
pause
exit /b 1
