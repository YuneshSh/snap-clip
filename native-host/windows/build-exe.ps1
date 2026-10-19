#Requires -Version 5.1
<#
  Build snapclip-clipboard-host.exe with PyInstaller (run on Windows).
  Usage:  powershell -ExecutionPolicy Bypass -File native-host/windows/build-exe.ps1
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Native = Resolve-Path (Join-Path $Root "..")
$OutDir = Join-Path $Root "dist-exe"
$PyHost = Join-Path $Native "snapclip-clipboard-host.py"

if (-not (Test-Path $PyHost)) { throw "Missing $PyHost" }

Write-Host "Installing build deps..."
python -m pip install --upgrade pip
python -m pip install "Pillow>=10.0.0" "pywin32>=306" pyinstaller

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Work = Join-Path $OutDir "build"
Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue

Write-Host "Running PyInstaller..."
python -m PyInstaller `
  --onefile `
  --noconfirm `
  --clean `
  --name snapclip-clipboard-host `
  --distpath $OutDir `
  --workpath $Work `
  --specpath $Work `
  --hidden-import win32clipboard `
  --hidden-import win32api `
  --hidden-import PIL.ImageGrab `
  $PyHost

$Exe = Join-Path $OutDir "snapclip-clipboard-host.exe"
if (-not (Test-Path $Exe)) { throw "PyInstaller did not produce $Exe" }
Copy-Item -Force $Exe (Join-Path $Root "snapclip-clipboard-host.exe")
Write-Host "Built -> $Exe"
Write-Host "Copied -> $(Join-Path $Root 'snapclip-clipboard-host.exe')"
