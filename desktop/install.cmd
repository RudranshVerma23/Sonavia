@echo off
rem Lets the Sonavia extension start Sonavia.exe on demand.
rem Portable: registers wherever this folder is. If you move the folder, run it again.
rem Per-user only (no admin needed). Nothing is added to startup.
setlocal

set "HOST=com.sonavia.desktop"
rem Fixed by the "key" in the extension's manifest.json (same for everyone).
set "EXT_ID=lljlekkhndmkhaeehamdpfagfgjagend"

set "DIR=%~dp0"
set "MANIFEST=%DIR%%HOST%.json"

if not exist "%DIR%Sonavia.exe" (
  echo Sonavia.exe was not found next to this script.
  echo Build it with build.cmd, or download it from the project's Releases page.
  pause
  exit /b 1
)

rem "path" is relative to this manifest, so the folder stays portable.
> "%MANIFEST%" echo {
>>"%MANIFEST%" echo   "name": "%HOST%",
>>"%MANIFEST%" echo   "description": "Sonavia desktop add-on (always-on-top overlay)",
>>"%MANIFEST%" echo   "path": "Sonavia.exe",
>>"%MANIFEST%" echo   "type": "stdio",
>>"%MANIFEST%" echo   "allowed_origins": ["chrome-extension://%EXT_ID%/"]
>>"%MANIFEST%" echo }

rem Remove the registration from before the add-on was renamed to Sonavia.
set "OLD=com.spotify_overlay.desktop"
del /q "%DIR%%OLD%.json" >nul 2>nul

for %%B in ("BraveSoftware\Brave-Browser" "Google\Chrome" "Microsoft\Edge" "Chromium") do (
  reg delete "HKCU\Software\%%~B\NativeMessagingHosts\%OLD%" /f >nul 2>nul
  reg add "HKCU\Software\%%~B\NativeMessagingHosts\%HOST%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul
)

echo Sonavia desktop add-on registered for Brave, Chrome, Edge and Chromium.
echo   %DIR%
echo In Spotify, click the monitor button on the overlay to float it over every app.
echo IMPORTANT: if your browser was open, fully exit it once (menu - Exit, or the tray icon),
echo then reopen it. Just closing the windows is not enough - it keeps running in the background.
pause
