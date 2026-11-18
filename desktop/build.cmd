@echo off
rem Builds Sonavia.exe (the optional desktop add-on) next to this script.
setlocal
cd /d "%~dp0"

where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust is not installed. Get it from https://rustup.rs and run this again.
  pause
  exit /b 1
)

rem The GNU Rust toolchain needs a MinGW gcc on PATH; use MSYS2's if it is there.
rustc -vV | findstr /c:"host: x86_64-pc-windows-gnu" >nul
if not errorlevel 1 (
  where gcc >nul 2>nul
  if errorlevel 1 if exist "C:\msys64\ucrt64\bin\gcc.exe" set "PATH=C:\msys64\ucrt64\bin;%PATH%"
)

cargo build --release
if errorlevel 1 (
  echo.
  echo Build failed - see the errors above.
  pause
  exit /b 1
)

copy /y "target\release\Sonavia.exe" "Sonavia.exe" >nul
echo.
echo Built: %~dp0Sonavia.exe
echo Next: run install.cmd (once) so your browser can start it.
