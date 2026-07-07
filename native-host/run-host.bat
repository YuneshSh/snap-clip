@echo off
setlocal
set "DIR=%~dp0"
where py >nul 2>&1 && (
  py -3 "%DIR%snapclip-clipboard-host.py" %*
) else (
  python "%DIR%snapclip-clipboard-host.py" %*
)
