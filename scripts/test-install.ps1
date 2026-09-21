[CmdletBinding()]
param(
  [switch]$KeepTemp,
  [switch]$Full
)

$ErrorActionPreference = "Stop"

function Get-HostPowerShell {
  # pwsh-only hosts have no WinPS 5.1 `powershell` binary.
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) { return "pwsh" }
  return "powershell"
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

  & (Get-HostPowerShell) -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "install.ps1") @installArgs -DryRun
  if ($LASTEXITCODE -ne 0) { throw "DryRun failed." }

  & (Get-HostPowerShell) -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "install.ps1") @installArgs
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

  & (Get-HostPowerShell) -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\verify-install.ps1") @verifyArgs
  if ($LASTEXITCODE -ne 0) { throw "Verify failed." }

  & (Get-HostPowerShell) -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "install.ps1") -HomePath $TempHome -ListTargets
  if ($LASTEXITCODE -ne 0) { throw "ListTargets failed." }

  & (Get-HostPowerShell) -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "install.ps1") -HomePath $TempHome -Uninstall -DryRun
  if ($LASTEXITCODE -ne 0) { throw "Uninstall DryRun failed." }

  & (Get-HostPowerShell) -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "install.ps1") -HomePath $TempHome -Uninstall
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
