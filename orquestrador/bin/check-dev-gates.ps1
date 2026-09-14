[CmdletBinding()]
param(
  [string]$ProjectPath = "",
  [int]$MaxEntries = 0,
  [switch]$Strict,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "check-dev-gates.js"
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $node) {
  throw "Node.js 20+ is required to run check-dev-gates."
}

$nodeArgs = @()
if ($Help) { $nodeArgs += "--help" }
if (-not [string]::IsNullOrWhiteSpace($ProjectPath)) { $nodeArgs += @("--project-path", $ProjectPath) }
if ($MaxEntries -gt 0) { $nodeArgs += @("--max-entries", [string]$MaxEntries) }
if ($Strict) { $nodeArgs += "--strict" }

& $node.Source $script @nodeArgs
exit $LASTEXITCODE
