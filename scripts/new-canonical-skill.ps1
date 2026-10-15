[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [Parameter(Mandatory = $true)][string]$Description,
  [Parameter(Mandatory = $true)][string]$Category,
  [Parameter(Mandatory = $true)][string]$Risk,
  [Parameter(Mandatory = $true)][string[]]$Capability,
  [Parameter(Mandatory = $true)][string[]]$Output,
  [ValidateSet("maestro-core", "maestro-domain")][string]$Origin = "maestro-domain",
  [string]$Source = "local-patterns",
  [string[]]$Trigger = @(),
  [string[]]$Alias = @(),
  [string[]]$ContextRequired = @(),
  [string[]]$ContextUseful = @(),
  [string[]]$ContextAvoid = @("unrelated-domains"),
  [switch]$MirrorEverywhere
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "skill-catalog.js"

$argsList = @(
  $script,
  "new",
  "--name", $Name,
  "--description", $Description,
  "--category", $Category,
  "--risk", $Risk,
  "--origin", $Origin,
  "--source", $Source
)
foreach ($item in $Capability) { $argsList += @("--capability", $item) }
foreach ($item in $Output) { $argsList += @("--output", $item) }
foreach ($item in $Trigger) { $argsList += @("--trigger", $item) }
foreach ($item in $Alias) { $argsList += @("--alias", $item) }
foreach ($item in $ContextRequired) { $argsList += @("--context-required", $item) }
foreach ($item in $ContextUseful) { $argsList += @("--context-useful", $item) }
foreach ($item in $ContextAvoid) { $argsList += @("--context-avoid", $item) }
if ($MirrorEverywhere) { $argsList += "--mirror-everywhere" }

& node @argsList
exit $LASTEXITCODE
