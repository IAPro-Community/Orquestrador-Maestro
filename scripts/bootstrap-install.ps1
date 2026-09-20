[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$package = "@iapro/orquestrador-maestro-cli"
$packageVersion = "0.4.4"
$bootstrapVersion = "2026.09.20.1"
Write-Host "Orquestrador Maestro bootstrap $bootstrapVersion"

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js e npm são necessários. Instale o Node.js LTS e execute novamente."
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Execute o bootstrap em um PowerShell normal, sem Administrador."
}

$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
  throw "Node.js 20 ou superior é necessário. Versão atual: $(& node --version)."
}

$prefix = if ($env:ORQUESTRADOR_NPM_PREFIX) {
  $env:ORQUESTRADOR_NPM_PREFIX
} else {
  Join-Path $env:APPDATA "npm"
}
$currentPrefix = (& npm config get prefix 2>$null).Trim()
$bin = $prefix
$globalRoot = (& npm root -g 2>$null).Trim()
$writable = $true
foreach ($directory in @($bin, $globalRoot)) {
  try {
    if (-not $directory) { throw "Caminho npm vazio." }
    if (-not (Test-Path -LiteralPath $directory)) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $probe = Join-Path $directory ".orquestrador-write-test"
    Set-Content -LiteralPath $probe -Value "ok" -Encoding UTF8
    Remove-Item -LiteralPath $probe -Force
  } catch {
    $writable = $false
    break
  }
}

if (-not $writable -and -not $env:ORQUESTRADOR_NPM_PREFIX) {
  $prefix = Join-Path $env:LOCALAPPDATA "npm"
  New-Item -ItemType Directory -Path $prefix -Force | Out-Null
  & npm config set prefix $prefix
  $bin = $prefix
} elseif ($prefix -ne $currentPrefix) {
  & npm config set prefix $prefix
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$parts = @($userPath -split ";" | Where-Object { $_ })
if ($parts -notcontains $bin) {
  [Environment]::SetEnvironmentVariable("Path", (($parts + $bin) -join ";"), "User")
}
$env:Path = "$bin;$env:Path"

& npm install -g "$package@$packageVersion" --force --prefer-online
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$globalRoot = (& npm root -g).Trim()
$installedPackage = Join-Path $globalRoot "@iapro\orquestrador-maestro-cli\package.json"
if (-not (Test-Path -LiteralPath $installedPackage)) {
  throw "Não foi possível confirmar a instalação da CLI em $bin."
}
$installedVersion = (Get-Content -Raw -LiteralPath $installedPackage | ConvertFrom-Json).version
if ($installedVersion -ne $packageVersion) {
  throw "Versão instalada $installedVersion; esperada $packageVersion."
}
Write-Host "Versão instalada: $installedVersion"

& orquestrador-maestro install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& orquestrador-maestro verify
exit $LASTEXITCODE
