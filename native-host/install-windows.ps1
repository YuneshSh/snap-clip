#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostName = "com.snapclip.clipboard"
$Launcher = Join-Path $Dir "run-host.bat"
$ManifestFile = Join-Path $Dir "$HostName.json"
$ExtensionOrigins = @(
  "chrome-extension://felceegmoadjlpodhpdpcpiidgafnlid/",
  "chrome-extension://lklehcjpnlhnghobjoldmfdeobjcnoej/",
  "chrome-extension://lghlilkcfmckhgikebafnmiimkhbofpc/",
  "chrome-extension://cibfbcjggdbgdmllckalpjjicpoioheb/",
  "chrome-extension://doeoikmjihhhbemlbkjohmlmcdjffoel/"
)

function Invoke-Python {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 @Args
    return
  }
  if (Get-Command python -ErrorAction SilentlyContinue) {
    & python @Args
    return
  }
  throw "Python 3 not found. Install from https://www.python.org/downloads/ and enable 'Add to PATH'."
}

Write-Host "Installing Python dependencies..."
Invoke-Python -m pip install --user -r (Join-Path $Dir "requirements.txt")

$manifest = @{
  name             = $HostName
  description      = "SnapClip clipboard monitor"
  path             = $Launcher
  type             = "stdio"
  allowed_origins  = $ExtensionOrigins
} | ConvertTo-Json -Compress

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($ManifestFile, $manifest, $utf8NoBom)
Write-Host "Wrote manifest -> $ManifestFile"

$Browsers = @(
  @{ Label = "Google Chrome"; Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" },
  @{ Label = "Microsoft Edge"; Key = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName" },
  @{ Label = "Brave"; Key = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName" },
  @{ Label = "Chromium"; Key = "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName" },
  @{ Label = "Vivaldi"; Key = "HKCU:\Software\Vivaldi\NativeMessagingHosts\$HostName" }
)

$installed = 0
foreach ($browser in $Browsers) {
  New-Item -Path $browser.Key -Force | Out-Null
  Set-ItemProperty -Path $browser.Key -Name "(default)" -Value $ManifestFile
  Write-Host "Registered $($browser.Label) -> $($browser.Key)"
  $installed++
}

Write-Host ""
Write-Host "Done. Fully quit and reopen your browser (or reload SnapClip at chrome://extensions)."
