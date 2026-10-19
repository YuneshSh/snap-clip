#Requires -Version 5.1
<#
  Installs SnapClip Companion for the current Windows user.
  Prefers snapclip-clipboard-host.exe (no Python). Falls back to Python + vendor deps.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SrcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostName = "com.snapclip.clipboard"
$InstallDir = Join-Path $env:LOCALAPPDATA "SnapClip"
$VersionFile = Join-Path $SrcDir "VERSION"
$Version = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { "0.0.0" }

$ExtensionOrigins = @(
  "chrome-extension://felceegmoadjlpodhpdpcpiidgafnlid/",
  "chrome-extension://lklehcjpnlhnghobjoldmfdeobjcnoej/",
  "chrome-extension://lghlilkcfmckhgikebafnmiimkhbofpc/",
  "chrome-extension://cibfbcjggdbgdmllckalpjjicpoioheb/",
  "chrome-extension://doeoikmjihhhbemlbkjohmlmcdjffoel/"
)

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$HasExe = Test-Path (Join-Path $SrcDir "snapclip-clipboard-host.exe")
$HasPy = Test-Path (Join-Path $SrcDir "snapclip-clipboard-host.py")

if (-not $HasExe -and -not $HasPy) {
  throw "Neither snapclip-clipboard-host.exe nor .py found next to install-user.ps1"
}

if ($HasExe) {
  Copy-Item -Force (Join-Path $SrcDir "snapclip-clipboard-host.exe") (Join-Path $InstallDir "snapclip-clipboard-host.exe")
  Write-Host "Installed prebuilt host exe (no Python needed)."
} else {
  Copy-Item -Force (Join-Path $SrcDir "snapclip-clipboard-host.py") (Join-Path $InstallDir "snapclip-clipboard-host.py")
  $Req = Join-Path $SrcDir "requirements.txt"
  if (Test-Path $Req) { Copy-Item -Force $Req (Join-Path $InstallDir "requirements.txt") }

  function Invoke-Python {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PyArgs)
    if (Get-Command py -ErrorAction SilentlyContinue) {
      & py -3 @PyArgs
      if ($LASTEXITCODE -ne 0) { throw "py failed ($LASTEXITCODE)" }
      return
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
      & python @PyArgs
      if ($LASTEXITCODE -ne 0) { throw "python failed ($LASTEXITCODE)" }
      return
    }
    throw "Python 3 not found. Install from https://www.python.org/downloads/ (enable Add to PATH), or use a release ZIP that includes snapclip-clipboard-host.exe."
  }

  $Vendor = Join-Path $InstallDir "vendor"
  New-Item -ItemType Directory -Force -Path $Vendor | Out-Null
  Write-Host "Installing Python deps into $Vendor ..."
  Invoke-Python -m pip install --upgrade pip
  Invoke-Python -m pip install --target $Vendor -r (Join-Path $InstallDir "requirements.txt")
}

Copy-Item -Force (Join-Path $SrcDir "run-host.bat") (Join-Path $InstallDir "run-host.bat")
Set-Content -Path (Join-Path $InstallDir "VERSION") -Value $Version -NoNewline

$Launcher = if ($HasExe) {
  Join-Path $InstallDir "snapclip-clipboard-host.exe"
} else {
  Join-Path $InstallDir "run-host.bat"
}

# Chrome requires backslashes escaped as \\ in the JSON path on Windows.
$PathForJson = $Launcher.Replace('\', '\\')
$originsJson = ($ExtensionOrigins | ForEach-Object { '    "' + $_ + '"' }) -join ",`n"
$manifest = @"
{
  "name": "$HostName",
  "description": "SnapClip clipboard monitor",
  "path": "$PathForJson",
  "type": "stdio",
  "allowed_origins": [
$originsJson
  ]
}
"@

$ManifestFile = Join-Path $InstallDir "$HostName.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($ManifestFile, $manifest.Trim() + "`n", $utf8NoBom)
Write-Host "Wrote manifest -> $ManifestFile"

$Browsers = @(
  @{ Label = "Google Chrome"; Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" },
  @{ Label = "Microsoft Edge"; Key = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName" },
  @{ Label = "Brave"; Key = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName" },
  @{ Label = "Chromium"; Key = "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName" },
  @{ Label = "Vivaldi"; Key = "HKCU:\Software\Vivaldi\NativeMessagingHosts\$HostName" }
)

foreach ($browser in $Browsers) {
  New-Item -Path $browser.Key -Force | Out-Null
  Set-ItemProperty -Path $browser.Key -Name "(default)" -Value $ManifestFile
  Write-Host "Registered $($browser.Label)"
}

Write-Host ""
Write-Host "SnapClip Companion v$Version installed."
Write-Host "  Host: $Launcher"
Write-Host "Fully quit and reopen your browser, then click Check connection in SnapClip."
