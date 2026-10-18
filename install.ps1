[CmdletBinding()]
param(
  [string]$HomePath = [Environment]::GetFolderPath("UserProfile"),
  [switch]$NoForce,
  [switch]$NoToolProfiles,
  [switch]$CoreOnly,
  [switch]$SkipCommunitySkills,
  [switch]$SkipSkillSync,
  [string[]]$Only = @(),
  [switch]$DryRun,
  [switch]$ListTargets,
  [switch]$Uninstall,
  [switch]$NonInteractive,
  [switch]$AllTargets,
  [switch]$VerbosePaths
)

$ErrorActionPreference = "Stop"

$engine = Join-Path $PSScriptRoot "scripts\install.ps1"
if (-not (Test-Path -LiteralPath $engine)) {
  throw "Missing installer engine: $engine"
}

$argsList = @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $engine,
  "-HomePath",
  $HomePath
)

if (-not $NoForce) {
  $argsList += "-Force"
}
if ((-not $NoToolProfiles) -and (-not $CoreOnly)) {
  $argsList += "-InstallToolProfiles"
}
if ($CoreOnly) {
  $argsList += "-SkipExtraSkills"
}
if ($SkipCommunitySkills) {
  $argsList += "-SkipCommunitySkills"
}
if ($SkipSkillSync) {
  $argsList += "-SkipSkillSync"
}
foreach ($component in $Only) {
  $argsList += @("-Only", $component)
}
if ($DryRun) {
  $argsList += "-DryRun"
}
if ($ListTargets) {
  $argsList += "-ListTargets"
}
if ($Uninstall) {
  $argsList += "-Uninstall"
}
if ($NonInteractive) {
  $argsList += "-NonInteractive"
}
if ($AllTargets) {
  $argsList += "-AllTargets"
}
if ($VerbosePaths) {
  $argsList += "-VerbosePaths"
}

# Resolve the PowerShell host to invoke the engine. Hardcoding `powershell`
# made the Windows installer unrunnable on Linux/macOS with only pwsh (Core),
# which also broke scripts/test-install.ps1 there.
$psHost = $null
foreach ($candidate in @("pwsh", "powershell")) {
  if (Get-Command $candidate -ErrorAction SilentlyContinue) { $psHost = $candidate; break }
}
if (-not $psHost) { throw "PowerShell not found (tried pwsh, powershell)." }

& $psHost @argsList
exit $LASTEXITCODE
