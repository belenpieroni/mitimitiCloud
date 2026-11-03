# scripts/dev.ps1 - Native PowerShell launcher for Miti Miti
$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

# 1. Detect Host IP (Wi-Fi or main adapter)
$hostIp = $env:EXPO_HOST_IP
if (-not $hostIp) {
    try {
        $hostIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex).IPAddress
    } catch {
        $hostIp = "127.0.0.1"
    }
}

if (-not $hostIp) { $hostIp = "127.0.0.1" }

$apiUrl = "http://${hostIp}:3000/api"
$env:EXPO_PUBLIC_API_URL = $apiUrl
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $hostIp

# 2. Sync .env.local
$easId = ""
if (Test-Path ".env") {
    $match = Select-String -Path ".env" -Pattern "^EXPO_PUBLIC_EAS_PROJECT_ID=(.*)$"
    if ($match) {
        $easId = $match.Matches[0].Groups[1].Value.Trim()
    }
}

$envLocalContent = "EXPO_PUBLIC_API_URL=$apiUrl`n"
if ($easId) {
    $envLocalContent += "EXPO_PUBLIC_EAS_PROJECT_ID=$easId`n"
}
Set-Content -Path ".env.local" -Value $envLocalContent -NoNewline

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Miti Miti - Expo SDK 58 Dev Launcher" -ForegroundColor Green
Write-Host "  Host IP:  $hostIp" -ForegroundColor Yellow
Write-Host "  API URL:  $apiUrl" -ForegroundColor Yellow
if ($env:EXPO_TUNNEL -eq "1" -or $args -contains "--tunnel") {
    $env:EXPO_TUNNEL = "1"
    Write-Host "  Mode:     TUNNEL (ngrok proxy)" -ForegroundColor Magenta
} else {
    Write-Host "  Mode:     LAN (Local Network)" -ForegroundColor Cyan
}
Write-Host "==========================================" -ForegroundColor Cyan

docker compose up --build $args
