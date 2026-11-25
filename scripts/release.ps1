[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [switch]$CreateTag,
  [switch]$PushTag
)
$ErrorActionPreference = 'Stop'
if ($CreateTag -or $PushTag) {
  throw 'Criação de tag desabilitada neste script. Consulte docs/release.md para autorização independente.'
}
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  function Invoke-Gate([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Gate falhou: $Command ($LASTEXITCODE)" }
  }
  $before = git rev-parse HEAD
  if ($LASTEXITCODE -ne 0 -or -not $before) { throw 'Git HEAD indisponível.' }
  $dirty = git status --porcelain
  if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Checkout limpo obrigatório.' }
  Invoke-Gate node @('scripts/check-release-version.js', $Version)
  Invoke-Gate npm @('ci')
  Invoke-Gate npm @('run', 'verify:pr')
  Invoke-Gate npm @('run', 'skills:contract-audit:strict')
  Invoke-Gate npm @('run', 'validate:paths')
  Invoke-Gate pwsh @('-NoProfile','-File','scripts/validate-public.ps1')
  Invoke-Gate pwsh @('-NoProfile','-File','scripts/validate-skills.ps1')
  Invoke-Gate npm @('run','validate')
  Invoke-Gate npm @('pack','--dry-run')
  Invoke-Gate git @('diff','--check')
  $after = git rev-parse HEAD
  if ($LASTEXITCODE -ne 0 -or $after -ne $before) { throw 'HEAD mudou durante a validação.' }
  $dirty = git status --porcelain
  if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Checkout mudou durante a validação.' }
  Write-Host "Validação local concluída: $Version $before. Nenhuma tag ou publicação criada."
} finally { Pop-Location }
