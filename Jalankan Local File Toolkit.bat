@echo off
setlocal
cd /d "%~dp0"
title Local File Toolkit
set PORT=3000

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Pasang dulu dari https://nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b 1
)

rem Kalau server sudah jalan, cukup buka browser.
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Local File Toolkit sudah berjalan, membuka browser...
  start "" http://localhost:%PORT%
  exit /b 0
)

if not exist node_modules (
  echo Pertama kali dijalankan: memasang dependensi, tunggu sebentar...
  call npm install
  if errorlevel 1 goto :fail
)

rem Build ulang kalau belum ada build, atau kalau kode lebih baru dari build terakhir.
set NEEDBUILD=0
if /i "%~1"=="rebuild" set NEEDBUILD=1
if not exist ".next\BUILD_ID" set NEEDBUILD=1
if "%NEEDBUILD%"=="0" (
  powershell -NoProfile -Command "$b=(Get-Item '.next\BUILD_ID').LastWriteTime; $n=Get-ChildItem src,package.json,next.config.ts -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if($n.LastWriteTime -gt $b){exit 1}"
  if errorlevel 1 set NEEDBUILD=1
)
if "%NEEDBUILD%"=="1" (
  echo Menyiapkan aplikasi, ini hanya perlu saat ada perubahan kode...
  call npm run build
  if errorlevel 1 goto :fail
)

rem Buka browser otomatis begitu server siap.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest http://localhost:%PORT% -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process http://localhost:%PORT%; break}catch{Start-Sleep 1}}"

echo.
echo Local File Toolkit berjalan di http://localhost:%PORT%
echo Tutup jendela ini untuk menghentikan.
echo.
call npm run start -- -p %PORT%
goto :end

:fail
echo.
echo Gagal. Baca pesan error di atas.
pause
exit /b 1

:end
pause
