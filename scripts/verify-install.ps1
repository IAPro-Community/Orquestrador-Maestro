[CmdletBinding()]
param(
  [string]$HomePath = [Environment]::GetFolderPath("UserProfile"),
  [switch]$SkipToolProfiles,
  [switch]$CoreOnly,
  [switch]$VerbosePaths
)

$ErrorActionPreference = "Stop"

$issues = New-Object System.Collections.Generic.List[string]

function Add-Issue {
  param([string]$Message)
  $issues.Add($Message)
}

function Assert-Path {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) {
    Add-Issue "$Label missing: $Path"
  }
}

function Assert-FileContains {
  param([string]$Path, [string]$Pattern, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ($content -notmatch $Pattern) {
    Add-Issue "$Label does not include expected content: $Path"
  }
}

function Assert-FileLineCountAtMost {
  param([string]$Path, [int]$MaxLines, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $lineCount = if ([string]::IsNullOrEmpty($content)) { 0 } else { ([regex]::Matches($content, "(`r`n|`n)")).Count + 1 }
  if ($lineCount -gt $MaxLines) {
    Add-Issue "$Label is too large for a compact hook router ($lineCount lines > $MaxLines): $Path"
  }
}

function Assert-FileNotContains {
  param([string]$Path, [string]$Pattern, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ($content -match $Pattern) {
    Add-Issue "$Label still contains a legacy hook catalog marker: $Path"
  }
}

function Count-Dirs {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  return @(Get-ChildItem -LiteralPath $Path -Directory -Force -ErrorAction SilentlyContinue).Count
}

function Count-Files {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  return @(Get-ChildItem -LiteralPath $Path -File -Force -ErrorAction SilentlyContinue).Count
}

function Get-DefaultInstallPolicy {
  return [pscustomobject]@{
    nativeRoots = [pscustomobject]@{
      codex = [pscustomobject]@{ path = ".codex/skills"; maxDirectories = 40 }
      opencode = [pscustomobject]@{ path = ".opencode/skills"; maxDirectories = 30 }
      agents = [pscustomobject]@{ path = ".agents/skills"; maxDirectories = 30 }
      claude = [pscustomobject]@{ path = ".claude/skills"; maxDirectories = 30 }
      cursor = [pscustomobject]@{ path = ".cursor/skills"; maxDirectories = 30 }
      gemini = [pscustomobject]@{ path = ".gemini/skills"; maxDirectories = 30 }
      windsurf = [pscustomobject]@{ path = ".windsurf/skills"; maxDirectories = 30 }
      antigravity = [pscustomobject]@{ path = ".antigravity-skills/skills"; maxDirectories = 30 }
    }
  }
}

function Get-InstallPolicy {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    try {
      return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
      return Get-DefaultInstallPolicy
    }
  }
  return Get-DefaultInstallPolicy
}

$canonicalOrquestrador = Join-Path $HomePath ".orquestrador-maestro"
$legacyOrquestrador = Join-Path $HomePath ".orquestrador"
$orquestrador = if (Test-Path -LiteralPath $canonicalOrquestrador) { $canonicalOrquestrador } else { $legacyOrquestrador }
$maestroReference = Split-Path -Leaf $orquestrador
$codex = Join-Path $HomePath ".codex"

Assert-Path -Path (Join-Path $orquestrador "rules.md") -Label "Orquestrador rules"
Assert-Path -Path (Join-Path $orquestrador "maestro.md") -Label "Orquestrador maestro"
Assert-Path -Path (Join-Path $orquestrador "PERSISTENCE.md") -Label "Orquestrador persistence contract"
Assert-Path -Path (Join-Path $orquestrador "PROJECT_DEV_HIERARCHY.md") -Label "Project DEV hierarchy"
Assert-Path -Path (Join-Path $orquestrador "bin\init-project-dev.ps1") -Label "Project DEV initializer"
Assert-Path -Path (Join-Path $orquestrador "bin\compact-worklog.ps1") -Label "Project DEV worklog compactor"
Assert-Path -Path (Join-Path $orquestrador "bin\check-dev-gates.ps1") -Label "Project DEV gate checker"
Assert-Path -Path (Join-Path $orquestrador "bin\dev-context-tools.js") -Label "Project DEV context helper"
Assert-Path -Path (Join-Path $orquestrador "SKILLS_INDEX.md") -Label "Orquestrador skills index"
Assert-Path -Path (Join-Path $orquestrador "SKILLS_ROUTER.json") -Label "Orquestrador skills router"
Assert-Path -Path (Join-Path $orquestrador "SKILL_INSTALL_POLICY.json") -Label "Orquestrador skill install policy"
Assert-Path -Path (Join-Path $orquestrador "SKILLS_DISCOVERY.json") -Label "Orquestrador local skills inventory"
Assert-Path -Path (Join-Path $orquestrador "skills") -Label "Orquestrador canonical skills"
Assert-Path -Path (Join-Path $HomePath "AGENTS.md") -Label "Global AGENTS.md"
Assert-FileContains -Path (Join-Path $HomePath "AGENTS.md") -Pattern "DEV/" -Label "Global AGENTS.md"
Assert-FileContains -Path (Join-Path $HomePath "AGENTS.md") -Pattern "DEV/WORKLOG\.md" -Label "Global AGENTS.md"
Assert-FileContains -Path (Join-Path $orquestrador "rules.md") -Pattern "DEV/WORKLOG\.md" -Label "Orquestrador rules"
Assert-FileContains -Path (Join-Path $orquestrador "maestro.md") -Pattern "PERSISTENCE\.md" -Label "Orquestrador maestro"
Assert-FileContains -Path (Join-Path $orquestrador "PROJECT_DEV_HIERARCHY.md") -Pattern "DEV/WORKLOG\.md" -Label "Project DEV hierarchy"

$installPolicy = Get-InstallPolicy -Path (Join-Path $orquestrador "SKILL_INSTALL_POLICY.json")
$nativeRootSpecs = @()
foreach ($prop in $installPolicy.nativeRoots.PSObject.Properties) {
  $nativeRootSpecs += [pscustomobject]@{
    Program = $prop.Name
    Path = Join-Path $HomePath ($prop.Value.path -replace "/", "\")
    MaxDirectories = [int]$prop.Value.maxDirectories
  }
}

if (-not $CoreOnly) {
  Assert-Path -Path (Join-Path $codex "skills") -Label "Codex skills"
  Assert-Path -Path (Join-Path $codex "agents") -Label "Codex agents"
  Assert-Path -Path (Join-Path $codex "prompts") -Label "Codex prompts"

  foreach ($root in $nativeRootSpecs) {
    Assert-Path -Path $root.Path -Label "Native skill root $($root.Program)"
    $dirCount = Count-Dirs -Path $root.Path
    if ($dirCount -gt $root.MaxDirectories) {
      Add-Issue "Native skill root $($root.Program) is oversized for low-token operation ($dirCount directories > $($root.MaxDirectories)): $($root.Path)"
    }
  }
  Assert-Path -Path (Join-Path $HomePath ".agents\skills\orquestrador-maestro\SKILL.md") -Label "Freebuff shared Maestro skill"
}

if ((-not $CoreOnly) -and (-not $SkipToolProfiles)) {
  Assert-Path -Path (Join-Path $HomePath ".codex\AGENTS.md") -Label "Codex AGENTS profile"
  Assert-Path -Path (Join-Path $HomePath ".config\opencode\AGENTS.md") -Label "OpenCode global AGENTS profile"
  Assert-Path -Path (Join-Path $HomePath ".config\opencode\opencode.json") -Label "OpenCode global config"
  Assert-Path -Path (Join-Path $HomePath ".opencode\default-skill.json") -Label "OpenCode default skill profile"
  Assert-Path -Path (Join-Path $HomePath ".opencode\hooks.md") -Label "OpenCode hooks profile"
  Assert-Path -Path (Join-Path $HomePath ".claude\CLAUDE.md") -Label "Claude global memory"
  Assert-Path -Path (Join-Path $HomePath ".claude\hooks.md") -Label "Claude hooks profile"
  Assert-Path -Path (Join-Path $HomePath ".cursor\AGENTS.md") -Label "Cursor AGENTS profile"
  Assert-Path -Path (Join-Path $HomePath ".cursor\rules\orquestrador-maestro.mdc") -Label "Cursor Orquestrador rule"
  Assert-Path -Path (Join-Path $HomePath ".cursor\commands\maestro.md") -Label "Cursor Maestro command"
  Assert-Path -Path (Join-Path $HomePath ".cursor\hooks.md") -Label "Cursor hooks profile"
  Assert-Path -Path (Join-Path $HomePath ".gemini\GEMINI.md") -Label "Gemini global context"
  Assert-Path -Path (Join-Path $HomePath ".gemini\hooks.md") -Label "Gemini hooks profile"
  Assert-Path -Path (Join-Path $HomePath ".codeium\windsurf\memories\global_rules.md") -Label "Windsurf global rules"
  Assert-Path -Path (Join-Path $HomePath ".windsurf\hooks.md") -Label "Windsurf hooks profile"
  Assert-Path -Path (Join-Path $HomePath ".mimo\AGENTS.md") -Label "MiMo Code global AGENTS profile"
  Assert-Path -Path (Join-Path $HomePath ".kimi-code\AGENTS.md") -Label "Kimi Code global AGENTS profile"
  Assert-Path -Path (Join-Path $HomePath ".kimi-code\config.toml") -Label "Kimi Code global config"
  Assert-Path -Path (Join-Path $HomePath ".grok\config.toml") -Label "Grok global config"
  Assert-Path -Path (Join-Path $HomePath "antigravity-rules.json") -Label "Antigravity global rules"
  Assert-Path -Path (Join-Path $HomePath ".antigravity\antigravity.json") -Label "Antigravity integration config"
  Assert-Path -Path (Join-Path $HomePath ".antigravity\settings.json") -Label "Antigravity settings"
  Assert-Path -Path (Join-Path $HomePath ".ai-standards\core\rules.md") -Label "Antigravity AI standards rules"
  Assert-Path -Path (Join-Path $HomePath ".ai-standards\core\workflow.md") -Label "Antigravity AI standards workflow"

  Assert-FileContains -Path (Join-Path $HomePath ".codex\AGENTS.md") -Pattern "DEV/WORKLOG\.md" -Label "Codex AGENTS profile"
  Assert-FileContains -Path (Join-Path $HomePath ".codex\AGENTS.md") -Pattern "PERSISTENCE\.md" -Label "Codex AGENTS profile"
  Assert-FileContains -Path (Join-Path $HomePath ".config\opencode\AGENTS.md") -Pattern "DEV/WORKLOG\.md" -Label "OpenCode global AGENTS profile"
  Assert-FileContains -Path (Join-Path $HomePath ".config\opencode\AGENTS.md") -Pattern "PERSISTENCE\.md" -Label "OpenCode global AGENTS profile"
  Assert-FileContains -Path (Join-Path $HomePath ".claude\CLAUDE.md") -Pattern "DEV/WORKLOG\.md" -Label "Claude global memory"
  Assert-FileContains -Path (Join-Path $HomePath ".claude\CLAUDE.md") -Pattern "PERSISTENCE\.md" -Label "Claude global memory"
  Assert-FileContains -Path (Join-Path $HomePath ".cursor\AGENTS.md") -Pattern "DEV/WORKLOG\.md" -Label "Cursor AGENTS profile"
  Assert-FileContains -Path (Join-Path $HomePath ".cursor\AGENTS.md") -Pattern "PERSISTENCE\.md" -Label "Cursor AGENTS profile"
  Assert-FileContains -Path (Join-Path $HomePath ".cursor\rules\orquestrador-maestro.mdc") -Pattern "DEV/WORKLOG\.md" -Label "Cursor Orquestrador rule"
  Assert-FileContains -Path (Join-Path $HomePath ".cursor\commands\maestro.md") -Pattern "DEV/HANDOFF\.md" -Label "Cursor Maestro command"
  Assert-FileContains -Path (Join-Path $HomePath ".gemini\GEMINI.md") -Pattern "DEV/WORKLOG\.md" -Label "Gemini global context"
  Assert-FileContains -Path (Join-Path $HomePath ".gemini\GEMINI.md") -Pattern "PERSISTENCE\.md" -Label "Gemini global context"
  Assert-FileContains -Path (Join-Path $HomePath ".codeium\windsurf\memories\global_rules.md") -Pattern "DEV/WORKLOG\.md" -Label "Windsurf global rules"
  Assert-FileContains -Path (Join-Path $HomePath ".codeium\windsurf\memories\global_rules.md") -Pattern "PERSISTENCE\.md" -Label "Windsurf global rules"
  Assert-FileContains -Path (Join-Path $HomePath ".mimo\AGENTS.md") -Pattern "PERSISTENCE\.md" -Label "MiMo Code global AGENTS profile"
  Assert-FileContains -Path (Join-Path $HomePath ".kimi-code\AGENTS.md") -Pattern "PERSISTENCE\.md" -Label "Kimi Code global AGENTS profile"
  Assert-FileContains -Path (Join-Path $HomePath ".kimi-code\config.toml") -Pattern "extra_skill_dirs" -Label "Kimi Code global config"
  Assert-FileContains -Path (Join-Path $HomePath ".grok\config.toml") -Pattern "\.agents/skills" -Label "Grok global config"
  Assert-FileContains -Path (Join-Path $HomePath "antigravity-rules.json") -Pattern "\.ai-standards" -Label "Antigravity global rules"
  Assert-FileContains -Path (Join-Path $HomePath ".antigravity\antigravity.json") -Pattern "\.orquestrador" -Label "Antigravity integration config"
  Assert-FileContains -Path (Join-Path $HomePath ".ai-standards\core\rules.md") -Pattern "DEV/WORKLOG\.md" -Label "Antigravity AI standards rules"
  Assert-FileContains -Path (Join-Path $HomePath "antigravity-rules.json") -Pattern "PERSISTENCE\.md" -Label "Antigravity global rules"

  $hookChecks = @(
    @{ Path = (Join-Path $orquestrador "hooks.md"); MaxLines = 80; Label = "Orquestrador hooks profile" },
    @{ Path = (Join-Path $HomePath ".opencode\hooks.md"); MaxLines = 30; Label = "OpenCode hooks profile" },
    @{ Path = (Join-Path $HomePath ".claude\hooks.md"); MaxLines = 20; Label = "Claude hooks profile" },
    @{ Path = (Join-Path $HomePath ".cursor\hooks.md"); MaxLines = 20; Label = "Cursor hooks profile" },
    @{ Path = (Join-Path $HomePath ".gemini\hooks.md"); MaxLines = 20; Label = "Gemini hooks profile" },
    @{ Path = (Join-Path $HomePath ".windsurf\hooks.md"); MaxLines = 20; Label = "Windsurf hooks profile" }
  )

  foreach ($hook in $hookChecks) {
    Assert-FileContains -Path $hook.Path -Pattern "SKILLS_ROUTER\.json" -Label $hook.Label
    Assert-FileLineCountAtMost -Path $hook.Path -MaxLines $hook.MaxLines -Label $hook.Label
    Assert-FileNotContains -Path $hook.Path -Pattern "(?i)(GLOBAL SKILLS HOOKS|Complete Skill Reference with Descriptions)" -Label $hook.Label
  }

  $opencodeConfig = Join-Path $HomePath ".config\opencode\opencode.json"
  if (Test-Path -LiteralPath $opencodeConfig) {
    try {
      $config = Get-Content -LiteralPath $opencodeConfig -Raw -Encoding UTF8 | ConvertFrom-Json
      $instructions = @($config.instructions)
      if (-not ($instructions -contains "~/$maestroReference/rules.md")) {
        Add-Issue "OpenCode global config does not include Orquestrador rules: $opencodeConfig"
      }
      if (-not ($instructions -contains "~/$maestroReference/maestro.md")) {
        Add-Issue "OpenCode global config does not include Orquestrador maestro: $opencodeConfig"
      }
    } catch {
      Add-Issue "OpenCode global config is not valid JSON: $opencodeConfig"
    }
  }

  foreach ($jsonPath in @(
    (Join-Path $HomePath "antigravity-rules.json"),
    (Join-Path $HomePath ".antigravity\antigravity.json"),
    (Join-Path $HomePath ".antigravity\settings.json")
  )) {
    if (Test-Path -LiteralPath $jsonPath) {
      try {
        Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
      } catch {
        Add-Issue "Antigravity JSON is not valid: $jsonPath"
      }
    }
  }
}

$summary = [pscustomobject]@{
  HomePath = if ($VerbosePaths) { $HomePath } else { "[redacted]" }
  OrquestradorSkills = Count-Dirs -Path (Join-Path $orquestrador "skills")
  CodexSkills = Count-Dirs -Path (Join-Path $codex "skills")
  CodexAgents = Count-Files -Path (Join-Path $codex "agents")
  CodexPrompts = Count-Files -Path (Join-Path $codex "prompts")
  AgentSkills = Count-Dirs -Path (Join-Path $HomePath ".agents\skills")
  ClaudeSkills = Count-Dirs -Path (Join-Path $HomePath ".claude\skills")
  OpenCodeSkills = Count-Dirs -Path (Join-Path $HomePath ".opencode\skills")
  CursorSkills = Count-Dirs -Path (Join-Path $HomePath ".cursor\skills")
  GeminiSkills = Count-Dirs -Path (Join-Path $HomePath ".gemini\skills")
  WindsurfSkills = Count-Dirs -Path (Join-Path $HomePath ".windsurf\skills")
  AntigravitySkills = Count-Dirs -Path (Join-Path $HomePath ".antigravity-skills\skills")
  ToolProfilesChecked = (-not $CoreOnly) -and (-not $SkipToolProfiles)
  CoreOnly = $CoreOnly
}

if ($issues.Count -gt 0) {
  "Install verification failed:"
  $issues | ForEach-Object { "  - $_" }
  $summary | Format-List
  exit 1
}

"Install verification passed."
$summary | Format-List
