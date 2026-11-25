<#
.SYNOPSIS
Homologation for issue #44 on Windows with Claude Code.

.DESCRIPTION
Runs the acceptance items against a throwaway home so the real user profile is
never mutated, and writes a machine-readable EVIDENCE.json next to the logs.

Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/homologate-windows-claude.ps1 -OutputDir .homologation/windows-claude

Exit code: 0 only when every case passes (skips are reported explicitly).
#>
[CmdletBinding()]
param(
  [string]$OutputDir = "",
  [string]$HomePath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Cli = Join-Path $RootDir "bin/orquestrador-maestro.js"
$isWindowsHost = $env:OS -eq "Windows_NT"
$OutputDir = if ($OutputDir) { $OutputDir } else { Join-Path $RootDir ".homologation/windows-claude" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$LogDir = Join-Path $OutputDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$cases = New-Object System.Collections.Generic.List[object]

function Add-Case {
  param([string]$Id, [string]$Status, [string]$Detail)
  $clean = ($Detail -replace "`t", " " -replace "`r?`n", " ")
  if ($clean.Length -gt 600) { $clean = $clean.Substring(0, 599) + "…" }
  $script:cases.Add([pscustomobject]@{ id = $Id; status = $Status; detail = $clean })
  Write-Host ("  {0,-32} {1} {2}" -f $Id, $Status, $clean)
}

function Invoke-Maestro {
  param([string[]]$Arguments, [string]$LogName, [hashtable]$Environment = @{})
  $stdout = Join-Path $LogDir "$LogName.out"
  $stderr = Join-Path $LogDir "$LogName.err"
  $old = @{}
  foreach ($key in $Environment.Keys) {
    $old[$key] = [Environment]::GetEnvironmentVariable($key)
    [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key])
  }
  try {
    $process = Start-Process -FilePath "node" -ArgumentList (@($Cli) + $Arguments) `
      -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
  } finally {
    foreach ($key in $old.Keys) {
      [Environment]::SetEnvironmentVariable($key, $old[$key])
    }
  }
}

function Get-LogText {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  return (Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue)
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("maestro-homologation-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
$tempHome = if ($HomePath) { $HomePath } else { Join-Path $work "home" }
New-Item -ItemType Directory -Force -Path $tempHome | Out-Null
$realProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }

# Claude Code is not installed on most CI runners. With the explicit opt-in, a
# stub executable keeps the install/detection path realistic, and the evidence
# states plainly that a stub was used instead of the real CLI.
$claudeEvidence = "unavailable"
$claudeCommand = Get-Command claude -ErrorAction SilentlyContinue
if ($claudeCommand) {
  $claudeEvidence = (& claude --version 2>$null | Select-Object -First 1)
} elseif ($env:MAESTRO_HOMOLOGATION_FAKE_CLAUDE -eq "1" -or $env:MAESTRO_HOMOLOGATION_FORCE_STUB -eq "1") {
  $stubBin = Join-Path $work "stub-bin"
  New-Item -ItemType Directory -Force -Path $stubBin | Out-Null
  # A .cmd shim cannot be spawned with shell:false (the provider adapter's
  # contract), so the stub is a renamed Node executable: `claude --version`
  # exits 0 and detection follows the real code path.
  $nodeSource = (Get-Command node -ErrorAction Stop).Source
  Copy-Item -LiteralPath $nodeSource -Destination (Join-Path $stubBin "claude.exe") -Force
  $env:PATH = "$stubBin;$env:PATH"
  $claudeEvidence = "stub (fake claude executable; real Claude Code CLI absent)"
}

Write-Host "homologate-windows-claude — issue #44 acceptance"
Write-Host "repo:   $RootDir"
Write-Host "output: $OutputDir"
Write-Host "home:   $tempHome (throwaway)"
Write-Host ""

try {
  ########## Case 1: install into a throwaway profile without elevation ##########
  $install = Invoke-Maestro -Arguments @(
    "install", "--home-path", $tempHome, "--non-interactive",
    "--skip-skill-sync", "--skip-community-skills", "--skip-desktop-plugin"
  ) -LogName "install"
  $installText = (Get-LogText $install.Stdout) + (Get-LogText $install.Stderr)
  if ($install.ExitCode -ne 0) {
    Add-Case "install-into-temp-home" "FAIL" "install exited $($install.ExitCode); see logs/install.err"
  } elseif ($installText -match "(?i)\b(sudo|run as administrator)\b") {
    Add-Case "install-into-temp-home" "FAIL" "install output asked for elevation"
  } else {
    Add-Case "install-into-temp-home" "PASS" "exit 0 without elevation"
  }

  ########## Case 2: npm prefix diagnostic without elevation ##########
  if ($isWindowsHost) {
    # A regular file blocks the path entirely: npm cannot create or write the
    # prefix, which is the condition the diagnostic must handle without
    # elevation. No ACL or administrator right is involved.
    $blocker = Join-Path $work "prefix-blocker"
    Set-Content -LiteralPath $blocker -Value "not a directory" -Encoding ascii
    $prefix = Join-Path $blocker "unwritable-prefix"

    # The EACCES guidance is the operator-facing answer to item 1 of #44: it
    # must point to a user-writable prefix and must not recommend sudo.
    $guidanceScript = Join-Path $work "check-prefix-guidance.js"
    Set-Content -LiteralPath $guidanceScript -Encoding ascii -Value @'
const { npmPermissionHint } = require(process.argv[2]);
const hint = npmPermissionHint({ stderr: "npm error code EACCES" });
if (!hint || /sudo\s+npm\s+install\s+-g/iu.test(hint)) process.exit(1);
process.stdout.write(hint);
'@
    $guidance = (& node $guidanceScript (Join-Path $RootDir "orquestrador/lib/install-diagnostics.js") 2>$null)
    $guidanceStatus = $LASTEXITCODE

    $doctorPrefix = Invoke-Maestro -Arguments @("doctor", "--home-path", $tempHome) `
      -LogName "doctor-prefix" -Environment @{ npm_config_prefix = $prefix }
    $prefixText = (Get-LogText $doctorPrefix.Stdout) + (Get-LogText $doctorPrefix.Stderr)
    if ($doctorPrefix.ExitCode -ne 0) {
      Add-Case "npm-prefix-diagnostic" "FAIL" "doctor failed with an impossible npm prefix"
    } elseif ($guidanceStatus -ne 0 -or -not $guidance) {
      Add-Case "npm-prefix-diagnostic" "FAIL" "EACCES guidance is missing or recommends sudo"
    } elseif ($prefixText -match "(?i)\brun as administrator\b") {
      Add-Case "npm-prefix-diagnostic" "FAIL" "diagnostic asked for elevation"
    } else {
      Add-Case "npm-prefix-diagnostic" "PASS" "EACCES guidance is actionable; doctor survives an impossible prefix without elevation"
    }
  } else {
    Add-Case "npm-prefix-diagnostic" "SKIP" "Windows-only case; run it on windows-latest or a Windows host"
  }

  ########## Case 3: doctor runs and verifies the installation ##########
  $doctor = Invoke-Maestro -Arguments @("doctor", "--home-path", $tempHome) -LogName "doctor"
  $doctorText = (Get-LogText $doctor.Stdout) + (Get-LogText $doctor.Stderr)
  if ($doctor.ExitCode -ne 0) {
    Add-Case "doctor-verify-install" "FAIL" "doctor exited $($doctor.ExitCode); see logs/doctor.err"
  } elseif (($doctorText -match "Install verification passed") -or ($doctorText -match '"ManagedFilesHealth"')) {
    Add-Case "doctor-verify-install" "PASS" "doctor reported a healthy installation (native or PowerShell report)"
  } else {
    Add-Case "doctor-verify-install" "FAIL" "doctor did not report a verified installation"
  }

  ########## Case 4: targets add + targets list --json coherence ##########
  $targetsAdd = Invoke-Maestro -Arguments @("targets", "add", "claude", "--home-path", $tempHome, "--non-interactive") -LogName "targets-add"
  $targetsList = Invoke-Maestro -Arguments @("targets", "list", "--json", "--home-path", $tempHome) -LogName "targets-list"
  $problems = @()
  if ($targetsAdd.ExitCode -ne 0) { $problems += "targets add exited $($targetsAdd.ExitCode)" }
  if ($targetsList.ExitCode -ne 0) { $problems += "targets list --json exited $($targetsList.ExitCode)" }
  if ($problems.Count -eq 0) {
    try {
      $report = (Get-LogText $targetsList.Stdout) | ConvertFrom-Json
      $detection = @("detected", "configured", "not-detected", "missing")
      $configuration = @("present", "absent", "partial", "maestro-managed")
      $enabled = @("yes", "no")
      if ($report.schemaVersion -ne 1) { $problems += "schemaVersion != 1" }
      if (-not $report.targets -or $report.targets.Count -eq 0) { $problems += "no targets" }
      foreach ($target in $report.targets) {
        if ($detection -notcontains [string]$target.Detection) { $problems += "$($target.ToolId): bad Detection" }
        if ($configuration -notcontains [string]$target.Configuration) { $problems += "$($target.ToolId): bad Configuration" }
        if ($enabled -notcontains [string]$target.Enabled) { $problems += "$($target.ToolId): bad Enabled" }
        if (-not $target.DetectionReason) { $problems += "$($target.ToolId): missing DetectionReason" }
      }
      $claudeTarget = $report.targets | Where-Object { $_.ToolId -eq "claude" } | Select-Object -First 1
      if (-not $claudeTarget) { $problems += "claude target missing" }
      else {
        if ($claudeTarget.Enabled -ne "yes") { $problems += "claude not enabled after targets add" }
        if ($claudeTarget.Detection -ne "detected" -and $claudeTarget.Detection -ne "configured") {
          $problems += "claude detection regressed to $($claudeTarget.Detection) after targets add"
        }
        if ($claudeTarget.Configuration -ne "maestro-managed") {
          $problems += "claude configuration is $($claudeTarget.Configuration), expected maestro-managed"
        }
      }
    } catch {
      $problems += "targets list --json is not valid JSON"
    }
  }
  if ($problems.Count -eq 0) {
    Add-Case "targets-json-coherent" "PASS" "detection/configuration/enabled coherent; claude enabled"
  } else {
    Add-Case "targets-json-coherent" "FAIL" ($problems -join "; ")
  }

  ########## Case 5: Claude skill content is host-neutral ##########
  $skillPath = Join-Path $tempHome ".claude/skills/orquestrador-maestro/SKILL.md"
  if (-not (Test-Path -LiteralPath $skillPath)) {
    Add-Case "claude-skill-host-neutral" "FAIL" "~/.claude/skills/orquestrador-maestro/SKILL.md missing"
  } else {
    $skill = Get-Content -LiteralPath $skillPath -Raw
    $skillProblems = @()
    if ($skill -match "Codex is the orquestrador") { $skillProblems += "codex-specific-role" }
    if ($skill -match "~/\.codex/skills") { $skillProblems += "codex-skill-root" }
    if ($skill -notmatch "active client") { $skillProblems += "missing-host-neutral-wording" }
    if ($skillProblems.Count -eq 0) {
      Add-Case "claude-skill-host-neutral" "PASS" "host-neutral wording, no Codex-only role or skill root"
    } else {
      Add-Case "claude-skill-host-neutral" "FAIL" ($skillProblems -join " ")
    }
  }

  ########## Case 6: no absolute user profile path leaks into generated files ##########
  $leaks = @()
  if ($realProfile -and $realProfile -ne "/" -and $realProfile.Length -gt 2) {
    $leaks = @(Get-ChildItem -LiteralPath $tempHome -Recurse -File -ErrorAction SilentlyContinue |
      Select-String -SimpleMatch -Pattern $realProfile -List -ErrorAction SilentlyContinue |
      Select-Object -First 5 -ExpandProperty Path)
  }
  if ($leaks.Count -eq 0) {
    Add-Case "no-absolute-user-paths" "PASS" "no real-profile path in generated files"
  } else {
    Add-Case "no-absolute-user-paths" "FAIL" ("absolute user path in: " + ($leaks -join " "))
  }

  ########## Case 7: Claude hooks stay textual ##########
  $settingsPath = Join-Path $tempHome ".claude/settings.json"
  $hooksPath = Join-Path $tempHome ".claude/hooks.md"
  $hookProblems = @()
  if (-not (Test-Path -LiteralPath $hooksPath)) { $hookProblems += "missing-hooks.md" }
  if (Test-Path -LiteralPath $settingsPath) {
    $settings = Get-Content -LiteralPath $settingsPath -Raw
    if ($settings -match '"hooks"') { $hookProblems += "executable-hooks-registered" }
  }
  if ((Test-Path -LiteralPath $hooksPath) -and
      (Get-Content -LiteralPath $hooksPath -Raw) -notmatch "not a registered Claude Code executable hook") {
    $hookProblems += "hooks-doc-not-explicit"
  }
  if ($hookProblems.Count -eq 0) {
    Add-Case "claude-hooks-textual" "PASS" "hooks remain textual guidance; no executable hooks installed"
  } else {
    Add-Case "claude-hooks-textual" "FAIL" ($hookProblems -join " ")
  }

  ########## Case 8: new-session notice is emitted ##########
  $noticeText = (Get-LogText $install.Stdout) + (Get-LogText $install.Stderr) + (Get-LogText $doctor.Stdout) + (Get-LogText $doctor.Stderr)
  if ($noticeText -match "sessão nova") {
    Add-Case "new-session-notice" "PASS" "install/doctor tell the operator to open a new Claude session"
  } else {
    Add-Case "new-session-notice" "FAIL" "no new-session guidance in install or doctor output"
  }
} finally {
  if (-not $HomePath) {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}

########## EVIDENCE.json ##########
$failed = @($cases | Where-Object { $_.status -eq "FAIL" })
$skipped = @($cases | Where-Object { $_.status -eq "SKIP" })
$caseArray = $cases.ToArray()
$sha = "unknown"
$branch = "unknown"
try { $sha = (git -C $RootDir rev-parse HEAD 2>$null | Select-Object -First 1) } catch { }
try { $branch = (git -C $RootDir branch --show-current 2>$null | Select-Object -First 1) } catch { }
$packageVersion = "unknown"
try { $packageVersion = (Get-Content -LiteralPath (Join-Path $RootDir "package.json") -Raw | ConvertFrom-Json).version } catch { }

$evidence = [ordered]@{
  schemaVersion = 1
  issue = 44
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  repository = [ordered]@{ sha = $sha; branch = $branch; packageVersion = $packageVersion }
  environment = [ordered]@{
    platform = if ($isWindowsHost) { "win32" } else { "posix" }
    os = [System.Environment]::OSVersion.VersionString
    arch = $env:PROCESSOR_ARCHITECTURE
    node = (node --version)
    powershell = $PSVersionTable.PSVersion.ToString()
    claude = $claudeEvidence
    throwawayHome = $tempHome
  }
  cases = $caseArray
  totals = [ordered]@{
    cases = $cases.Count
    passed = @($cases | Where-Object { $_.status -eq "PASS" }).Count
    skipped = $skipped.Count
    failed = $failed.Count
  }
  verdict = if ($failed.Count -eq 0) { "PASS" } else { "FAIL" }
}

$evidencePath = Join-Path $OutputDir "EVIDENCE.json"
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidencePath -Encoding utf8

Write-Host ""
Write-Host "evidence: $evidencePath"
Write-Host ("cases: {0}, failed: {1}, skipped: {2}" -f $cases.Count, $failed.Count, $skipped.Count)
if ($failed.Count -ne 0) {
  Write-Host "homologate-windows-claude: FAIL"
  exit 1
}
Write-Host "homologate-windows-claude: PASS"
exit 0
