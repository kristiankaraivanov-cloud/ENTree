@echo off
if not exist "%~dp0dist\ENTree-win32-x64\ENTree.exe" (
  echo The portable build is missing. Run npm ci and npm run package first.
  pause
  exit /b 1
)
start "" "%~dp0dist\ENTree-win32-x64\ENTree.exe"
