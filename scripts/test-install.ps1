[CmdletBinding()]
param(
  [switch]$KeepTemp,
  [switch]$Full
)

$ErrorActionPreference = "Stop"

# Resolve the PowerShell host to re-invoke. Hardcoding `powershell` made this
# smoke test unrunnable on Linux/macOS where only `pwsh` (Core) exists.
$psHost = $null
foreach ($candidate in @("pwsh", "powershell")) {
  if (Get-Command $candidate -ErrorAction SilentlyContinue) { $psHost = $candidate; break }
}
if (-not $psHost) { throw "PowerShell not found (tried pwsh, powershell)." }
function Invoke-MaestroScript {
  param([string]$ScriptPath, [string[]]$ScriptArgs)
  & $psHost -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @ScriptArgs
}

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$TempHome = Join-Path ([System.IO.Path]::GetTempPath()) ("orquestrador-install-test-" + [Guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Force -Path $TempHome | Out-Null

try {
  $installArgs = @("-HomePath", $TempHome)
  $verifyArgs = @("-HomePath", $TempHome)
  if (-not $Full) {
    $installArgs += @("-CoreOnly", "-SkipSkillSync")
    $verifyArgs += "-CoreOnly"
  } else {
    $sessionDir = Join-Path $TempHome ".codex\sessions"
    New-Item -ItemType Directory -Force -Path $sessionDir | Out-Null
    Set-Content -LiteralPath (Join-Path $sessionDir "personal.jsonl") -Value "personal-session-must-survive" -Encoding UTF8
  }

  Invoke-MaestroScript -ScriptPath (Join-Path $RepoRoot "install.ps1") -ScriptArgs ($installArgs + "-DryRun")
  if ($LASTEXITCODE -ne 0) { throw "DryRun failed." }

  Invoke-MaestroScript -ScriptPath (Join-Path $RepoRoot "install.ps1") -ScriptArgs $installArgs
  if ($LASTEXITCODE -ne 0) { throw "Install failed." }

  if (Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador-maestro\runtime")) {
    throw "Installer copied local runtime state into the installed core."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador-maestro\rules.md"))) {
    throw "Installer did not copy the public core rules."
  }

  if ($Full) {
    $personalBackups = Get-ChildItem -LiteralPath (Join-Path $TempHome ".orquestrador-public-backups") -Recurse -File -Filter "personal.jsonl" -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '[\\/].codex__profile[\\/]sessions[\\/]personal\.jsonl$' }
    if ($personalBackups) { throw "Installer backed up a personal Codex session." }
    if (-not (Test-Path -LiteralPath (Join-Path $TempHome ".codex\sessions\personal.jsonl"))) {
      throw "Installer removed a personal Codex session."
    }
  }

  Invoke-MaestroScript -ScriptPath (Join-Path $RepoRoot "scripts\verify-install.ps1") -ScriptArgs $verifyArgs
  if ($LASTEXITCODE -ne 0) { throw "Verify failed." }

  Invoke-MaestroScript -ScriptPath (Join-Path $RepoRoot "install.ps1") -ScriptArgs @("-HomePath", $TempHome, "-ListTargets")
  if ($LASTEXITCODE -ne 0) { throw "ListTargets failed." }

  Invoke-MaestroScript -ScriptPath (Join-Path $RepoRoot "install.ps1") -ScriptArgs @("-HomePath", $TempHome, "-Uninstall", "-DryRun")
  if ($LASTEXITCODE -ne 0) { throw "Uninstall DryRun failed." }

  Invoke-MaestroScript -ScriptPath (Join-Path $RepoRoot "install.ps1") -ScriptArgs @("-HomePath", $TempHome, "-Uninstall")
  if ($LASTEXITCODE -ne 0) { throw "Uninstall failed." }

  if ($Full) {
    $personalBackups = Get-ChildItem -LiteralPath (Join-Path $TempHome ".orquestrador-public-backups") -Recurse -File -Filter "personal.jsonl" -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '[\\/].codex__profile[\\/]sessions[\\/]personal\.jsonl$' }
    if ($personalBackups) { throw "Uninstaller backed up a personal Codex session." }
    if (-not (Test-Path -LiteralPath (Join-Path $TempHome ".codex\sessions\personal.jsonl"))) {
      throw "Uninstaller removed a personal Codex session."
    }
  }

  if ((Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador-maestro")) -or (Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador"))) {
    throw "Uninstall left a Maestro core directory behind."
  }
  if (Test-Path -LiteralPath (Join-Path $TempHome "AGENTS.md")) {
    throw "Uninstall left AGENTS.md behind."
  }

  "Installer smoke test passed."
} finally {
  if (-not $KeepTemp -and (Test-Path -LiteralPath $TempHome)) {
    Remove-Item -LiteralPath $TempHome -Recurse -Force
  } elseif ($KeepTemp) {
    "TempHome kept: $TempHome"
  }
}
