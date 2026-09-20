[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$publicCatalogScript = Join-Path $PSScriptRoot "public-skill-catalog.js"
& node $publicCatalogScript check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$script = Join-Path $PSScriptRoot "skill-catalog.js"
& node $script validate
exit $LASTEXITCODE
