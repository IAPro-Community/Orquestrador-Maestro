$script = Join-Path (Join-Path $PSScriptRoot "..") "orquestrador\bin\dev-context-tools.js"
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $node) {
  throw "Node.js 20+ is required to run compact-worklog."
}

& $node.Source $script "compact-worklog" @args
exit $LASTEXITCODE
