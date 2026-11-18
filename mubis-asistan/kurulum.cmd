@echo off
title MUBiS Asistan - Kurulum ve Exe Olusturucu
cd /d "%~dp0"

set KAYNAK=C:\Users\hp\.verdent\generate_images

echo ============================================
echo  MUBiS Asistan - Gorseller kopyalaniyor
echo ============================================
if not exist assets\kopek mkdir assets\kopek
if not exist assets\kedi mkdir assets\kedi
if not exist assets\kalem mkdir assets\kalem

rem --- Kopek ---
copy /Y "%KAYNAK%\edit_20260917_221049_f16c7def.png" assets\kopek\oturuyor.png
copy /Y "%KAYNAK%\edit_20260917_221158_e3759c66.png" assets\kopek\yuruyor.png
copy /Y "%KAYNAK%\edit_20260917_221158_466375ba_1.png" assets\kopek\kosuyor.png
copy /Y "%KAYNAK%\edit_20260917_221158_fc7b3e79_2.png" assets\kopek\oynuyor.png
copy /Y "%KAYNAK%\edit_20260917_221158_c68f53ad_3.png" assets\kopek\uyuyor.png
copy /Y "%KAYNAK%\edit_20260917_221256_0e7f2b51.png" assets\kopek\pativeriyor.png
copy /Y "%KAYNAK%\edit_20260917_221256_f1317b9c_1.png" assets\kopek\havliyor.png
copy /Y "%KAYNAK%\edit_20260917_221256_a61696d3_2.png" assets\kopek\zipliyor.png

rem --- Kedi ---
copy /Y "%KAYNAK%\generate_20260917_221356_5c846eb0.png" assets\kedi\oturuyor.png
copy /Y "%KAYNAK%\generate_20260917_221356_ffc5b6e2_1.png" assets\kedi\yuruyor.png
copy /Y "%KAYNAK%\generate_20260917_221356_608b0706_2.png" assets\kedi\kosuyor.png
copy /Y "%KAYNAK%\generate_20260917_221356_7221862f_3.png" assets\kedi\oynuyor.png
copy /Y "%KAYNAK%\generate_20260917_221501_ed7328d1.png" assets\kedi\uyuyor.png
copy /Y "%KAYNAK%\generate_20260917_221501_f04f6848_1.png" assets\kedi\pativeriyor.png
copy /Y "%KAYNAK%\generate_20260917_221501_57f692f0_2.png" assets\kedi\havliyor.png
copy /Y "%KAYNAK%\generate_20260917_221501_e154ac52_3.png" assets\kedi\zipliyor.png

rem --- Kalem ---
copy /Y "%KAYNAK%\generate_20260917_221632_6a4de4e1.png" assets\kalem\oturuyor.png
copy /Y "%KAYNAK%\generate_20260917_221632_388b9508_1.png" assets\kalem\yuruyor.png
copy /Y "%KAYNAK%\generate_20260917_221632_c2577ef4_2.png" assets\kalem\kosuyor.png
copy /Y "%KAYNAK%\generate_20260917_221632_d606a10a_3.png" assets\kalem\oynuyor.png
copy /Y "%KAYNAK%\generate_20260917_221929_d0fd99ef.png" assets\kalem\uyuyor.png
copy /Y "%KAYNAK%\generate_20260917_221929_eaac78db_1.png" assets\kalem\pativeriyor.png
copy /Y "%KAYNAK%\generate_20260917_221929_11fc8e26_2.png" assets\kalem\havliyor.png
copy /Y "%KAYNAK%\generate_20260917_221929_62b867ae_3.png" assets\kalem\zipliyor.png

echo ============================================
echo  Paketler kuruluyor (Electron - ilk seferde ~100MB indirir)
echo ============================================
call npm install
if errorlevel 1 goto HATA

echo ============================================
echo  Exe olusturuluyor (electron-builder portable)
echo ============================================
call npm run dist
if errorlevel 1 goto HATA

echo ============================================
echo  Exe Downloads'a kopyalaniyor (yardimci program orayi yonetir)
echo ============================================
if not exist "C:\Users\hp\Downloads" mkdir "C:\Users\hp\Downloads"
copy /Y "dist\MUBiS Asistan 1.0.0.exe" "C:\Users\hp\Downloads\mubis-asistan.exe"

echo.
echo  TAMAM! Exe: C:\Users\hp\Downloads\mubis-asistan.exe
echo  Yardimci program acikken MUBiS Ayarlarindan asistani acip kapatabilir,
echo  karakter secebilirsiniz (Kopek / Kedi / Kalem).
echo  Ilk test icin simdi calistirmak isterseniz:
echo    start "" "C:\Users\hp\Downloads\mubis-asistan.exe"
echo.
goto SON

:HATA
echo.
echo  HATA OLUSTU! Yukaridaki mesaji destek ile paylasin.
pause
exit /b 1

:SON
pause
