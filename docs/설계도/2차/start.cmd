@echo off
rem moimer mockup launcher - double-click this file.
rem Kept ASCII-only on purpose: cmd.exe parses this file with the console
rem codepage, so Korean text here would garble. Node prints the Korean instead.
title moimer mockup server

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is required. Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

node "%~dp0serve.js" --open
pause
