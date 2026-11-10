@echo off
title MUBiS GIB Yardimci - Kurulum
echo ============================================
echo  MUBiS GIB Yardimci - Kurulum
echo ============================================
echo.

tasklist /FI "IMAGENAME eq mubis-gib-yardimci.exe" /NH | find /I "mubis-gib-yardimci.exe" >nul
if not errorlevel 1 (
  echo HATA: Yardimci program acik. Sistem tepsisi menusunden kapatin.
  echo Devam eden islemlerin tamamlandigindan emin olup kurulumu tekrar acin.
  pause
  exit /b 1
)

rem 1) Exe'yi sabit konuma kopyala (tum bilgisayarlarda ayni yol)
if not exist "C:\MUBiS" mkdir "C:\MUBiS"
copy /Y "%~dp0mubis-gib-yardimci.exe" "C:\MUBiS\mubis-gib-yardimci.exe" >nul
if errorlevel 1 (
  echo HATA: Exe kopyalanamadi. Program aciksa kapatip tekrar deneyin.
  pause
  exit /b 1
)

if not exist "C:\MUBiS\config.json" (
  > "C:\MUBiS\config.json" echo {"captcha_api_key":"","desktop_anahtari":""}
  if errorlevel 1 (
    echo HATA: Ayar dosyasi olusturulamadi.
    pause
    exit /b 1
  )
)

rem 2) Otomatik baslatma kisayolu (sabit yola isaret eder)
> "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MUBiS GIB Yardimci.vbs" (
  echo CreateObject^("Wscript.Shell"^).Run """C:\MUBiS\mubis-gib-yardimci.exe"" --servis", 0, False
)

if errorlevel 1 (
  echo HATA: Otomatik baslatma kaydedilemedi.
  pause
  exit /b 1
)

rem 3) Servisi baslat
start "" "C:\MUBiS\mubis-gib-yardimci.exe" --servis
if errorlevel 1 (
  echo HATA: Yardimci baslatilamadi.
  pause
  exit /b 1
)

echo Kurulum tamamlandi.
echo - Program: C:\MUBiS\mubis-gib-yardimci.exe
echo - Bilgisayar acilinca otomatik baslar.
echo - Saatin yanindaki MUBiS simgesine tiklayarak Guncelle / Cikis kullanabilirsiniz.
echo - Bildirim ve fatura Drive senkronu icin C:\MUBiS\config.json dosyasindaki
echo   desktop_anahtari alanini doldurup yardimci programi yeniden baslatin.
echo - Istege bagli 2Captcha anahtari ayni dosyada captcha_api_key alanina yazilir.
echo.
echo Pencere 5 saniye icinde kapanacak...
ping -n 6 127.0.0.1 >nul
exit
