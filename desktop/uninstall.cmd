@echo off
rem Removes what install.cmd added. You can then delete this folder.
setlocal
set "HOST=com.sonavia.desktop"

for %%B in ("BraveSoftware\Brave-Browser" "Google\Chrome" "Microsoft\Edge" "Chromium") do (
  reg delete "HKCU\Software\%%~B\NativeMessagingHosts\%HOST%" /f >nul 2>nul
  rem and the name it had before it was renamed to Sonavia
  reg delete "HKCU\Software\%%~B\NativeMessagingHosts\com.spotify_overlay.desktop" /f >nul 2>nul
)
del /q "%~dp0%HOST%.json" >nul 2>nul

echo Sonavia desktop add-on unregistered.
pause
