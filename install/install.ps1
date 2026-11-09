# SIGMA installer for Windows (PowerShell).
#   irm https://raw.githubusercontent.com/atreyakamat/sigma/main/install/install.ps1 | iex
# Needs Docker Desktop. Installs into %USERPROFILE%\sigma, starts SIGMA, and writes your
# sign-in details to SIGMA-LOGIN.txt in that folder.
$ErrorActionPreference = 'Stop'
$Dir = if ($env:SIGMA_DIR) { $env:SIGMA_DIR } else { Join-Path $HOME 'sigma' }
$Port = if ($env:SIGMA_PORT) { $env:SIGMA_PORT } else { '3387' }
$Version = if ($env:SIGMA_VERSION) { $env:SIGMA_VERSION } else { 'latest' }
$ComposeUrl = if ($env:SIGMA_COMPOSE_URL) { $env:SIGMA_COMPOSE_URL } else { 'https://raw.githubusercontent.com/atreyakamat/sigma/main/install/docker-compose.yml' }
$Url = "http://localhost:$Port"

function Fail($m) { Write-Host "`n$m" -ForegroundColor Red; exit 1 }
function Secret($n) { -join ((1..$n) | ForEach-Object { 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[(Get-Random -Maximum 57)] }) }

Write-Host "`nInstalling SIGMA into $Dir" -ForegroundColor White
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ , start it, then run this installer again.' }
docker info *> $null; if ($LASTEXITCODE -ne 0) { Fail 'Docker is installed but not running. Start Docker Desktop, wait until it is running, then run this installer again.' }

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Location $Dir
Invoke-WebRequest -UseBasicParsing $ComposeUrl -OutFile 'docker-compose.yml'

if (-not (Test-Path '.env')) {
  $AdminPassword = "$(Secret 6)-$(Secret 6)-$(Secret 6)"
  @"
WEB_PORT=$Port
PUBLIC_URL=$Url
SIGMA_VERSION=$Version
SESSION_SECRET=$(Secret 48)
POSTGRES_PASSWORD=$(Secret 32)
BOOTSTRAP_ADMIN_EMAIL=admin@sigma.local
BOOTSTRAP_ADMIN_PASSWORD=$AdminPassword
"@ | Set-Content -Encoding ascii '.env'
  @"
SIGMA is installed on this computer.

Open:      $Url
Email:     admin@sigma.local
Password:  $AdminPassword

Keep this file private. You can change the password after signing in
(account menu -> Change password), then delete this file.
"@ | Set-Content -Encoding utf8 'SIGMA-LOGIN.txt'
} else {
  Write-Host 'Existing settings found; keeping them (this is an update).'
}

"@echo off`r`ncd /d %~dp0`r`ndocker compose up -d --no-build && start $Url`r`npause" | Set-Content -Encoding ascii 'Start SIGMA.bat'
"@echo off`r`ncd /d %~dp0`r`ndocker compose down`r`necho SIGMA is stopped. Your files are kept.`r`npause" | Set-Content -Encoding ascii 'Stop SIGMA.bat'
"@echo off`r`ncd /d %~dp0`r`ndocker compose pull && docker compose up -d --no-build`r`necho SIGMA is up to date.`r`npause" | Set-Content -Encoding ascii 'Update SIGMA.bat'

Write-Host "`nDownloading SIGMA (this can take a few minutes the first time)..."
foreach ($try in 1..3) { docker compose pull; if ($LASTEXITCODE -eq 0) { break }; Write-Host "Download interrupted; trying again ($try of 3)..."; Start-Sleep 5 }
Write-Host "`nStarting SIGMA..."
docker compose up -d --no-build; if ($LASTEXITCODE -ne 0) { Fail "SIGMA could not start. Run 'docker compose logs' in $Dir to see why." }

Write-Host 'Waiting for SIGMA to be ready' -NoNewline
$ready = $false
foreach ($i in 1..90) {
  try { Invoke-WebRequest -UseBasicParsing "$Url/api/v1/health" -TimeoutSec 3 | Out-Null; $ready = $true; break } catch { Write-Host '.' -NoNewline; Start-Sleep 2 }
}
if (-not $ready) { Fail "SIGMA did not start in time. Run 'docker compose logs' in $Dir to see why." }

Write-Host "`n`nSIGMA is ready: $Url" -ForegroundColor Green
if (Test-Path 'SIGMA-LOGIN.txt') { Get-Content 'SIGMA-LOGIN.txt' }
Write-Host "`nNext time: double-click 'Start SIGMA' in $Dir."
Start-Process $Url
