#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$HostName = "com.snapclip.clipboard"
$InstallDir = Join-Path $env:LOCALAPPDATA "SnapClip"

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

if (Test-Path $InstallDir) {
  Remove-Item -Path $InstallDir -Recurse -Force
  Write-Host "Removed -> $InstallDir"
}

Write-Host "Done. Fully quit and reopen your browser if it was open."
