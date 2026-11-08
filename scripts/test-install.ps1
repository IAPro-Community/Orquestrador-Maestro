[CmdletBinding()]
param(
  [switch]$KeepTemp,
  [switch]$Full
)

$ErrorActionPreference = "Stop"

function Get-HostPowerShell {
  # pwsh-only hosts have no WinPS 5.1 `powershell` binary.
  # Mirrored in scripts/install.ps1; keep both in sync.
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) { return "pwsh" }
  return "powershell"
}

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$TempHome = Join-Path ([System.IO.Path]::GetTempPath()) ("orquestrador-install-test-" + [Guid]::NewGuid().ToString("N"))
$previousAllowRootInstall = $env:ORQUESTRADOR_ALLOW_ROOT_INSTALL
$env:ORQUESTRADOR_ALLOW_ROOT_INSTALL = "1"

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

  if (Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador\runtime")) {
    throw "Installer copied local runtime state into the installed core."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador\rules.md"))) {
    throw "Installer did not copy the public core rules."
  }
  if (Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador-maestro")) {
    throw "Fresh install created the legacy Maestro-named root."
  }

  $canonicalRoot = Join-Path $TempHome ".orquestrador"
  New-Item -ItemType Directory -Force -Path (Join-Path $canonicalRoot "memory") | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $canonicalRoot "memory\canonical-fixture.jsonl"), "canonical-memory-preserved`n", [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText((Join-Path $canonicalRoot "config.json"), '{"mode":"compatibility","interactionProfile":"default","collision":"canonical","canonicalMarker":"kept"}', [System.Text.UTF8Encoding]::new($false))

  $legacyRoot = Join-Path $TempHome ".orquestrador-maestro"
  $legacyMemory = Join-Path $legacyRoot "memory\migration-fixture.jsonl"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $legacyMemory) | Out-Null
  [System.IO.File]::WriteAllText($legacyMemory, "legacy-memory-preserved`n", [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText((Join-Path $legacyRoot "config.json"), '{"mode":"strict","interactionProfile":"focus","collision":"legacy","legacyMarker":"kept"}', [System.Text.UTF8Encoding]::new($false))

  $previousSkipCliUpdate = $env:ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE
  $env:ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE = "1"
  try {
    & node (Join-Path $RepoRoot "bin\orquestrador-maestro.js") update --home-path $TempHome --core-only --skip-skill-sync
  } finally {
    if ($null -eq $previousSkipCliUpdate) {
      Remove-Item Env:ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE -ErrorAction SilentlyContinue
    } else {
      $env:ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE = $previousSkipCliUpdate
    }
  }
  if ($LASTEXITCODE -ne 0) { throw "Legacy root migration failed." }
  if (Test-Path -LiteralPath $legacyRoot) { throw "Update left the legacy Maestro-named root behind." }
  if (-not (Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador\memory\migration-fixture.jsonl"))) {
    throw "Update did not preserve legacy memory in the canonical root."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $TempHome ".orquestrador\memory\canonical-fixture.jsonl"))) {
    throw "Update did not preserve canonical memory while migrating the legacy root."
  }
  $migratedConfig = Get-Content -LiteralPath (Join-Path $TempHome ".orquestrador\config.json") -Raw | ConvertFrom-Json
  if ($migratedConfig.mode -ne "compatibility" -or $migratedConfig.interactionProfile -ne "default" -or
      $migratedConfig.collision -ne "canonical" -or $migratedConfig.canonicalMarker -ne "kept" -or $migratedConfig.legacyMarker -ne "kept") {
    throw "Update did not merge both configurations with canonical values taking precedence."
  }
  $previousSkipCliUpdate = $env:ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE
  $env:ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE = "1"
  try {
    & node (Join-Path $RepoRoot "bin\orquestrador-maestro.js") update --home-path $TempHome --core-only --skip-skill-sync
  } finally {
    if ($null -eq $previousSkipCliUpdate) {
      Remove-Item Env:ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE -ErrorAction SilentlyContinue
    } else {
      $env:ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE = $previousSkipCliUpdate
    }
  }
  if ($LASTEXITCODE -ne 0) { throw "Repeated update failed." }
  $backupDirs = @(Get-ChildItem -LiteralPath (Join-Path $TempHome ".orquestrador-public-backups") -Directory -ErrorAction SilentlyContinue)
  if ($backupDirs.Count -lt 2) { throw "Repeated updates did not create separate backup directories." }
  if (@($backupDirs | ForEach-Object FullName | Select-Object -Unique).Count -ne $backupDirs.Count) {
    throw "Repeated updates reused a backup directory."
  }
  foreach ($backupDir in $backupDirs) {
    if (Test-Path -LiteralPath (Join-Path $backupDir.FullName ".orquestrador\.orquestrador")) {
      throw "A repeated update nested the canonical root inside a backup."
    }
  }
  $legacyBackup = Get-ChildItem -LiteralPath (Join-Path $TempHome ".orquestrador-public-backups") -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName ".orquestrador-maestro\memory\migration-fixture.jsonl") } |
    Select-Object -First 1
  if (-not $legacyBackup) { throw "Update did not back up the legacy core before migration." }
  $canonicalBackup = Get-ChildItem -LiteralPath (Join-Path $TempHome ".orquestrador-public-backups") -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName ".orquestrador\memory\canonical-fixture.jsonl") } |
    Select-Object -First 1
  if (-not $canonicalBackup) { throw "Update did not back up the canonical core before migration." }

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
  if ($null -eq $previousAllowRootInstall) {
    Remove-Item Env:ORQUESTRADOR_ALLOW_ROOT_INSTALL -ErrorAction SilentlyContinue
  } else {
    $env:ORQUESTRADOR_ALLOW_ROOT_INSTALL = $previousAllowRootInstall
  }
  if (-not $KeepTemp -and (Test-Path -LiteralPath $TempHome)) {
    Remove-Item -LiteralPath $TempHome -Recurse -Force
  } elseif ($KeepTemp) {
    "TempHome kept: $TempHome"
  }
}
