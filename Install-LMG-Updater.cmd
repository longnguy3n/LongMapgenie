@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0updater\Install-LMGUpdater.ps1"
if errorlevel 1 pause
