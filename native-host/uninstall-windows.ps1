#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$HostName = "com.snapclip.clipboard"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ManifestFile = Join-Path $Dir "$HostName.json"

$Keys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Vivaldi\NativeMessagingHosts\$HostName"
)

foreach ($key in $Keys) {
  if (Test-Path $key) {
    Remove-Item -Path $key -Recurse -Force
    Write-Host "Removed -> $key"
  }
}

if (Test-Path $ManifestFile) {
  Remove-Item -Path $ManifestFile -Force
  Write-Host "Removed -> $ManifestFile"
}

Write-Host "Done."
