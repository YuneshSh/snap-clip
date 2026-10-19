@echo off
setlocal
set "DIR=%~dp0"

REM Prefer a bundled exe (no Python required).
if exist "%DIR%snapclip-clipboard-host.exe" (
  "%DIR%snapclip-clipboard-host.exe" %*
  exit /b %ERRORLEVEL%
)

set "PYTHONPATH=%DIR%vendor;%PYTHONPATH%"
where py >nul 2>&1 && (
  py -3 "%DIR%snapclip-clipboard-host.py" %*
  exit /b %ERRORLEVEL%
)
where python >nul 2>&1 && (
  python "%DIR%snapclip-clipboard-host.py" %*
  exit /b %ERRORLEVEL%
)

echo [snapclip-host] No snapclip-clipboard-host.exe and Python 3 not found. >&2
exit /b 1
