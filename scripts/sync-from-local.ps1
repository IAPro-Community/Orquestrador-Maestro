[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$SourceHome = [Environment]::GetFolderPath("UserProfile"),
  [string]$SourceOrquestrador = "",
  [string]$RepoRoot = "",
  [string[]]$PrivateTerm = @(),
  [string]$PrivateTermsPath = "",
  [switch]$KeepExistingGenerated,
  [switch]$SkipCodexPack,
  [switch]$SkipCommunitySkills,
  [switch]$SkipToolProfiles
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
if ([string]::IsNullOrWhiteSpace($SourceOrquestrador)) {
  $SourceOrquestrador = Join-Path $SourceHome ".orquestrador"
}
if ([string]::IsNullOrWhiteSpace($PrivateTermsPath)) {
  $PrivateTermsPath = Join-Path $RepoRoot ".local\private-terms.txt"
}

function Get-FullPath {
  param([string]$Path)
  return [System.IO.Path]::GetFullPath($Path)
}

function Test-PathUnderRoot {
  param([string]$Path, [string]$Root)
  $resolvedPath = Get-FullPath -Path $Path
  $resolvedRoot = Get-FullPath -Path $Root
  return $resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)
}

function Get-RelativePath {
  param([string]$BasePath, [string]$Path)
  $baseFull = Get-FullPath -Path $BasePath
  if (-not $baseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $baseFull += [System.IO.Path]::DirectorySeparatorChar
  }
  $baseUri = [Uri]$baseFull
  $pathUri = [Uri](Get-FullPath -Path $Path)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace("/", [System.IO.Path]::DirectorySeparatorChar)
}

function Remove-GeneratedPath {
  param([string]$Path, [string]$Root)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  if (-not (Test-PathUnderRoot -Path $Path -Root $Root)) {
    throw "Refusing to remove path outside repo root: $Path"
  }
  Remove-Item -LiteralPath $Path -Recurse -Force
}

function Test-ExcludedRelativePath {
  param([string]$RelativePath)
  $rel = $RelativePath.Replace("\", "/")
  $leaf = Split-Path -Leaf $RelativePath

  if ($rel -match "(^|/)(logs|backups)(/|$)") { return $true }
  if ($leaf -like "*.bak*") { return $true }
  if ($leaf -in @(
    "doctor-last-report.json",
    "memoria.md",
    "PROACTIVE_LOG.md",
    "ecosistema.md",
    "PROJECT_STANDARDS.md",
    "ORQUESTRADOR.md",
    "ARQUITETURA_UNIFICADA.md",
    "opencode.json"
  )) { return $true }
  if ($rel -match "^skills/[^/]+-project-standards\.json$" -and $rel -ne "skills/global-project-standards.json") { return $true }
  return $false
}

function Test-ExcludedPortablePath {
  param([string]$RelativePath)
  $rel = $RelativePath.Replace("\", "/")
  $leaf = Split-Path -Leaf $RelativePath

  if ($rel -match "(^|/)(\.git|node_modules|logs|backups|__pycache__|\.cache|\.tmp|\.venv|venv|dist|build|out|coverage)(/|$)") { return $true }
  if ($rel -match "(^|/)benchmarks/results(/|$)") { return $true }
  if ($rel -match "(^|/)demo/recordings(/|$)") { return $true }
  if ($leaf -like "*.bak*" -or $leaf -like "*.log" -or $leaf -like "*.tmp" -or $leaf -like "*.pyc" -or $leaf -like "*.pyo") { return $true }
  if ($leaf -like "*.db" -or $leaf -like "*.db-shm" -or $leaf -like "*.db-wal") { return $true }
  if ($leaf -in @(".DS_Store", "Thumbs.db", "config.toml")) { return $true }
  if ($leaf -like ".env*") { return $true }
  return $false
}

function Test-PrivateRelativePath {
  param([string]$RelativePath)
  $terms = @(Get-PrivateTerms)
  $userName = Split-Path -Leaf $SourceHome
  if (-not [string]::IsNullOrWhiteSpace($userName)) {
    $terms += $userName
  }
  foreach ($term in ($terms | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)) {
    if ($RelativePath.IndexOf($term, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }
  return $false
}

function Test-TextFile {
  param([string]$Path)
  $leaf = Split-Path -Leaf $Path
  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($extension)) { return $true }
  if ($leaf -eq ".gitignore") { return $true }
  return $extension -in @(
    ".md", ".mdc", ".txt", ".json", ".jsonl", ".toml", ".yaml", ".yml", ".ps1", ".cmd",
    ".sh", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".rb", ".go",
    ".rs", ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".hpp", ".cs", ".html",
    ".css", ".scss", ".svg", ".xsd", ".xml", ".csv", ".patch", ".template",
    ".rules",
    ".ini", ".cfg", ".conf", ".sql"
  )
}

function Repair-Mojibake {
  param([string]$Text)
  $map = [ordered]@{}
  $map[([string][char]0x00C3 + [char]0x00A1)] = [string][char]0x00E1
  $map[([string][char]0x00C3 + [char]0x0081)] = [string][char]0x00C1
  $map[([string][char]0x00C3 + [char]0x00A9)] = [string][char]0x00E9
  $map[([string][char]0x00C3 + [char]0x0089)] = [string][char]0x00C9
  $map[([string][char]0x00C3 + [char]0x00AD)] = [string][char]0x00ED
  $map[([string][char]0x00C3 + [char]0x008D)] = [string][char]0x00CD
  $map[([string][char]0x00C3 + [char]0x00B3)] = [string][char]0x00F3
  $map[([string][char]0x00C3 + [char]0x0093)] = [string][char]0x00D3
  $map[([string][char]0x00C3 + [char]0x00BA)] = [string][char]0x00FA
  $map[([string][char]0x00C3 + [char]0x009A)] = [string][char]0x00DA
  $map[([string][char]0x00C3 + [char]0x00A2)] = [string][char]0x00E2
  $map[([string][char]0x00C3 + [char]0x00AA)] = [string][char]0x00EA
  $map[([string][char]0x00C3 + [char]0x00B4)] = [string][char]0x00F4
  $map[([string][char]0x00C3 + [char]0x00A3)] = [string][char]0x00E3
  $map[([string][char]0x00C3 + [char]0x00B5)] = [string][char]0x00F5
  $map[([string][char]0x00C3 + [char]0x00A7)] = [string][char]0x00E7
  $map[([string][char]0x00C3 + [char]0x0087)] = [string][char]0x00C7
  $map[([string][char]0x00C2 + [char]0x00BA)] = [string][char]0x00BA
  $map[([string][char]0x00C2 + [char]0x00AA)] = [string][char]0x00AA
  $map[([string][char]0x00C2 + [char]0x00B7)] = [string][char]0x00B7
  $map[([string][char]0x00C2 + [char]0x00A0)] = " "
  $map[([string][char]0x00E2 + [char]0x0080 + [char]0x0093)] = "-"
  $map[([string][char]0x00E2 + [char]0x0080 + [char]0x0094)] = "-"
  $map[([string][char]0x00E2 + [char]0x0080 + [char]0x00A6)] = "..."
  $map[([string][char]0x00E2 + [char]0x0080 + [char]0x0098)] = "'"
  $map[([string][char]0x00E2 + [char]0x0080 + [char]0x0099)] = "'"
  $map[([string][char]0x00E2 + [char]0x0080 + [char]0x009C)] = '"'
  $map[([string][char]0x00E2 + [char]0x0080 + [char]0x009D)] = '"'
  $result = $Text
  foreach ($key in $map.Keys) {
    $result = $result.Replace($key, $map[$key])
  }
  return $result
}

function Get-PrivateTerms {
  $terms = New-Object System.Collections.Generic.List[string]
  foreach ($term in $PrivateTerm) {
    if (-not [string]::IsNullOrWhiteSpace($term)) { $terms.Add($term.Trim()) }
  }
  if (Test-Path -LiteralPath $PrivateTermsPath) {
    foreach ($line in Get-Content -LiteralPath $PrivateTermsPath -Encoding UTF8) {
      $trimmed = $line.Trim()
      if ($trimmed -and -not $trimmed.StartsWith("#")) { $terms.Add($trimmed) }
    }
  }
  return @($terms | Select-Object -Unique)
}

function Sanitize-Content {
  param([string]$Content, [string]$RelativePath)

  $result = Repair-Mojibake -Text $Content

  $homeVariants = @(
    $SourceHome,
    $SourceHome.Replace("\", "/"),
    $SourceHome.Replace("\", "\\"),
    $SourceHome.ToLowerInvariant(),
    $SourceHome.ToLowerInvariant().Replace("\", "/"),
    $SourceHome.ToLowerInvariant().Replace("\", "\\")
  ) | Select-Object -Unique

  foreach ($variant in $homeVariants) {
    if (-not [string]::IsNullOrWhiteSpace($variant)) {
      $result = $result.Replace($variant, "{{USER_HOME}}")
    }
  }

  $result = [regex]::Replace($result, 'C:\\Users\\[^\\/\s`''"<>|]+', '{{USER_HOME}}', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $result = [regex]::Replace($result, 'C:/Users/[^\\/\s`''"<>|]+', '{{USER_HOME}}', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

  $userName = Split-Path -Leaf $SourceHome
  if (-not [string]::IsNullOrWhiteSpace($userName)) {
    $result = [regex]::Replace($result, [regex]::Escape($userName), "{{USER_NAME}}", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  }

  $fullName = $env:USERNAME
  if (-not [string]::IsNullOrWhiteSpace($fullName) -and $fullName -ne $userName) {
    $result = [regex]::Replace($result, [regex]::Escape($fullName), "{{USER_NAME}}", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  }

  foreach ($term in Get-PrivateTerms) {
    $result = [regex]::Replace($result, [regex]::Escape($term), "<PRIVATE_TERM>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  }

  $assignedSecretPattern = "(?i)(api[_-]?key|secret|password|passwd|token)(\s*[:=]\s*['""]?)(?!(process\.env|import\.meta\.env|os\.environ|Deno\.env|env\.|settings\.|config\.|<|\$\{|\{))[A-Za-z0-9_./+=-]{24,}"
  $result = [regex]::Replace($result, $assignedSecretPattern, '$1$2<REDACTED_EXAMPLE>')
  $result = [regex]::Replace($result, "(?i)(ghp_|github_pat_)[A-Za-z0-9_]{20,}", "github_pat_<REDACTED_EXAMPLE>")
  $result = [regex]::Replace($result, "(?i)(sk-proj-[A-Za-z0-9_-]{48,}|sk-svcacct-[A-Za-z0-9_-]{48,}|sk-[A-Za-z0-9]{32,})", "sk-<REDACTED_EXAMPLE>")
  $result = [regex]::Replace($result, "AKIA[0-9A-Z]{16}", "AKIA<REDACTED_EXAMPLE>")
  $result = [regex]::Replace($result, "xox[baprs]-[A-Za-z0-9-]{20,}", "xox-<REDACTED_EXAMPLE>")

  $result = $result.Replace("{{USER_NAME}}-orquestrador", "public-orquestrador")
  $result = $result.Replace("{{USER_HOME}}\\", "{{USER_HOME}}/")
  $result = $result.Replace("{{USER_HOME}}\", "{{USER_HOME}}/")

  if ($RelativePath -in @("sync-skills.ps1", "doctor.ps1")) {
    $result = [regex]::Replace(
      $result,
      '\[string\]\$HomePath\s*=\s*"[^"]*"',
      '[string]$HomePath = [Environment]::GetFolderPath("UserProfile")'
    )
  }

  return $result
}

function Copy-SanitizedFile {
  param([string]$SourceFile, [string]$DestinationFile, [string]$RelativePath)

  $destinationDir = Split-Path -Parent $DestinationFile
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null

  if (-not (Test-TextFile -Path $SourceFile)) {
    Copy-Item -LiteralPath $SourceFile -Destination $DestinationFile -Force
    return
  }

  try {
    $content = Get-Content -LiteralPath $SourceFile -Raw -Encoding UTF8
    $sanitized = Sanitize-Content -Content $content -RelativePath $RelativePath
    [System.IO.File]::WriteAllText($DestinationFile, $sanitized, [System.Text.UTF8Encoding]::new($false))
  } catch {
    Copy-Item -LiteralPath $SourceFile -Destination $DestinationFile -Force
  }
}

function Copy-SanitizedTree {
  param([string]$SourceRoot, [string]$DestinationRoot, [string]$Label)
  if (-not (Test-Path -LiteralPath $SourceRoot)) { return 0 }
  $count = 0
  New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
  foreach ($file in Get-ChildItem -LiteralPath $SourceRoot -Recurse -File -Force) {
    $relative = Get-RelativePath -BasePath $SourceRoot -Path $file.FullName
    if ((Test-ExcludedPortablePath -RelativePath $relative) -or (Test-PrivateRelativePath -RelativePath $relative)) {
      $skipped.Add("$Label/$relative")
      continue
    }
    $dest = Join-Path $DestinationRoot $relative
    Copy-SanitizedFile -SourceFile $file.FullName -DestinationFile $dest -RelativePath "$Label/$relative"
    $copied.Add("$Label/$relative")
    $count++
  }
  return $count
}

function Copy-SanitizedSkillDirectories {
  param([string]$SourceRoot, [string]$DestinationRoot, [string]$Label)
  if (-not (Test-Path -LiteralPath $SourceRoot)) { return 0 }
  $count = 0
  New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
  foreach ($dir in Get-ChildItem -LiteralPath $SourceRoot -Directory -Force | Sort-Object Name) {
    if (-not (Test-Path -LiteralPath (Join-Path $dir.FullName "SKILL.md"))) { continue }
    if (Test-PrivateRelativePath -RelativePath $dir.Name) {
      $skipped.Add("$Label/$($dir.Name)")
      continue
    }
    foreach ($file in Get-ChildItem -LiteralPath $dir.FullName -Recurse -File -Force) {
      $inner = Get-RelativePath -BasePath $dir.FullName -Path $file.FullName
      $relative = Join-Path $dir.Name $inner
      if ((Test-ExcludedPortablePath -RelativePath $relative) -or (Test-PrivateRelativePath -RelativePath $relative)) {
        $skipped.Add("$Label/$relative")
        continue
      }
      $dest = Join-Path $DestinationRoot $relative
      Copy-SanitizedFile -SourceFile $file.FullName -DestinationFile $dest -RelativePath "$Label/$relative"
      $copied.Add("$Label/$relative")
      $count++
    }
  }
  return $count
}

if (-not (Test-Path -LiteralPath $SourceOrquestrador)) {
  throw "Source Orquestrador path not found: $SourceOrquestrador"
}

$repoRootFull = Get-FullPath -Path $RepoRoot
$orchestratorDest = Join-Path $repoRootFull "orquestrador"
$homeDest = Join-Path $repoRootFull "home"
$codexDest = Join-Path $repoRootFull "codex"
$skillLibraryDest = Join-Path $repoRootFull "skill-library"
$toolProfilesDest = Join-Path $repoRootFull "tool-profiles"

if (-not $KeepExistingGenerated) {
  Remove-GeneratedPath -Path $orchestratorDest -Root $repoRootFull
  Remove-GeneratedPath -Path $homeDest -Root $repoRootFull
  Remove-GeneratedPath -Path $codexDest -Root $repoRootFull
  Remove-GeneratedPath -Path $skillLibraryDest -Root $repoRootFull
  Remove-GeneratedPath -Path $toolProfilesDest -Root $repoRootFull
}

New-Item -ItemType Directory -Force -Path $orchestratorDest | Out-Null
New-Item -ItemType Directory -Force -Path $homeDest | Out-Null

$copied = New-Object System.Collections.Generic.List[string]
$skipped = New-Object System.Collections.Generic.List[string]

foreach ($file in Get-ChildItem -LiteralPath $SourceOrquestrador -Recurse -File -Force) {
  $relative = Get-RelativePath -BasePath $SourceOrquestrador -Path $file.FullName
  if (Test-ExcludedRelativePath -RelativePath $relative) {
    $skipped.Add($relative)
    continue
  }

  $dest = Join-Path $orchestratorDest $relative
  Copy-SanitizedFile -SourceFile $file.FullName -DestinationFile $dest -RelativePath $relative
  $copied.Add($relative)
}

$sourceAgents = Join-Path $SourceHome "AGENTS.md"
if (Test-Path -LiteralPath $sourceAgents) {
  Copy-SanitizedFile -SourceFile $sourceAgents -DestinationFile (Join-Path $homeDest "AGENTS.md") -RelativePath "home/AGENTS.md"
  $copied.Add("home/AGENTS.md")
}

function Write-GeneratedFileIfMissing {
  param([string]$Path, [string]$RelativePath, [string]$Content)
  if (Test-Path -LiteralPath $Path) { return }
  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
  $copied.Add($RelativePath)
}

function Append-GeneratedBlockIfMissing {
  param([string]$Path, [string]$Marker, [string]$Block)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ($content.Contains($Marker)) { return }
  $updated = $content.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $Block.Trim() + [Environment]::NewLine
  [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
}

$languageContinuityBlock = @'
## Language Continuity

- Use the language explicitly requested by the user; otherwise use the latest substantive user message, preserving the established conversation language when prompts are mixed or ambiguous.
- Do not infer response language from instructions, code, documentation, logs, tool or agent output, commit messages, or retrieved context.
- Keep code, identifiers, commands, paths, and quoted text unchanged when appropriate; translate or explain user-facing prose and summaries in the user's language unless asked otherwise.
'@
$languageContinuityReferenceBlock = @'
## Language Continuity

- Preserve the user's response language. The canonical policy is `{{USER_HOME}}/.orquestrador/rules.md`; repository or tool language must not override it.
'@

Append-GeneratedBlockIfMissing -Path (Join-Path $homeDest "AGENTS.md") -Marker "## Language Continuity" -Block $languageContinuityReferenceBlock
Append-GeneratedBlockIfMissing -Path (Join-Path $orchestratorDest "rules.md") -Marker "## Language Continuity" -Block $languageContinuityBlock

Write-GeneratedFileIfMissing -Path (Join-Path $orchestratorDest "PROJECT_DEV_HIERARCHY.md") -RelativePath "PROJECT_DEV_HIERARCHY.md" -Content @'
# Project DEV Hierarchy

`DEV/` is the canonical project documentation and memory root.

Required files:

- `DEV/README.md`: short project documentation entrypoint.
- `DEV/INDEX.md`: map of project docs.
- `DEV/CONTEXT.md`: current project state, commands, risks, and assumptions.
- `DEV/WORKLOG.md`: compact chronological hook of substantive work done by agents.

Read project `AGENTS.md` first, then `DEV/README.md` or `DEV/INDEX.md`, then `DEV/CONTEXT.md`, then only task-relevant detail files.

Existing sub-hierarchies such as `DEV/LOGS/`, `DEV/SQL/`, `DEV/ARCH/`, `DEV/WORKFLOWS/`, `DEV/TESTS/`, `DEV/DOCUMENTATION/`, and `DEV/BACKLOG/` are valid. Do not rename or move existing DEV docs just to match another convention. Map the real project layout in `DEV/INDEX.md`.

Create durable project documentation under `DEV/` by default. After substantive work, update `DEV/WORKLOG.md` with what changed, why, verification, and next context. Update `DEV/INDEX.md` when DEV docs change and `DEV/CONTEXT.md` when project state changes.
'@

Append-GeneratedBlockIfMissing -Path (Join-Path $homeDest "AGENTS.md") -Marker "DEV/WORKLOG.md" -Block @'
## Project DEV Documentation

When a project has `DEV/`, treat it as the canonical project documentation and operational memory root. Read `DEV/README.md` or `DEV/INDEX.md`, then `DEV/CONTEXT.md`, then only task-relevant detail files.

Create durable project documentation under `DEV/` by default. After substantive work, update `DEV/WORKLOG.md` with what changed, why, verification, and next context. Update `DEV/INDEX.md` when DEV docs change and `DEV/CONTEXT.md` when project state changes.
'@

Append-GeneratedBlockIfMissing -Path (Join-Path $orchestratorDest "rules.md") -Marker "DEV/WORKLOG.md" -Block @'
## Project DEV Documentation

When a project has `DEV/`, treat it as the canonical project documentation and operational memory root. Read `DEV/README.md` or `DEV/INDEX.md`, then `DEV/CONTEXT.md`, then only task-relevant detail files.

Create durable project documentation under `DEV/` by default. After substantive work, update `DEV/WORKLOG.md` with what changed, why, verification, and next context. Update `DEV/INDEX.md` when DEV docs change and `DEV/CONTEXT.md` when project state changes.
'@

Append-GeneratedBlockIfMissing -Path (Join-Path $orchestratorDest "maestro.md") -Marker "DEV/WORKLOG.md" -Block @'
## Project DEV Context

When a project has `DEV/`, use it as local project memory after reading the nearest project `AGENTS.md` and before selecting global skills. Create durable project documentation under `DEV/` by default. After substantive work, update `DEV/WORKLOG.md`.

Follow `{{USER_HOME}}/.orquestrador/PERSISTENCE.md` as the mandatory cross-tool persistence contract.
'@

$codexSkillFiles = 0
$codexAgentFiles = 0
$codexPromptFiles = 0
$communitySkillFiles = 0
$toolProfileFiles = 0

if (-not $SkipCodexPack) {
  $codexSkillFiles = Copy-SanitizedTree -SourceRoot (Join-Path $SourceHome ".codex\skills") -DestinationRoot (Join-Path $codexDest "skills") -Label "codex/skills"
  $codexAgentFiles = Copy-SanitizedTree -SourceRoot (Join-Path $SourceHome ".codex\agents") -DestinationRoot (Join-Path $codexDest "agents") -Label "codex/agents"
  $codexPromptFiles = Copy-SanitizedTree -SourceRoot (Join-Path $SourceHome ".codex\prompts") -DestinationRoot (Join-Path $codexDest "prompts") -Label "codex/prompts"
}

if (-not $SkipCommunitySkills) {
  $communitySkillFiles = Copy-SanitizedSkillDirectories -SourceRoot (Join-Path $SourceHome ".agents\skills") -DestinationRoot (Join-Path $skillLibraryDest "community-skills") -Label "skill-library/community-skills"
}

if (-not $SkipToolProfiles) {
  New-Item -ItemType Directory -Force -Path $toolProfilesDest | Out-Null

  $profileFiles = @(
    @{ Source = ".codex\AGENTS.md"; Destination = "codex\AGENTS.md" },
    @{ Source = ".opencode\hooks.md"; Destination = "opencode\hooks.md" },
    @{ Source = ".opencode\SYSTEM.md"; Destination = "opencode\SYSTEM.md" },
    @{ Source = ".opencode\rules.md"; Destination = "opencode\rules.md" },
    @{ Source = ".opencode\maestro.md"; Destination = "opencode\maestro.md" },
    @{ Source = ".opencode\SKILLS_INDEX.md"; Destination = "opencode\SKILLS_INDEX.md" },
    @{ Source = ".opencode\default-skill.json"; Destination = "opencode\default-skill.json" },
    @{ Source = ".claude\hooks.md"; Destination = "claude\hooks.md" },
    @{ Source = ".claude\SYSTEM_PROMPT.md"; Destination = "claude\SYSTEM_PROMPT.md" },
    @{ Source = ".cursor\hooks.md"; Destination = "cursor\hooks.md" },
    @{ Source = ".gemini\hooks.md"; Destination = "gemini\hooks.md" },
    @{ Source = ".windsurf\hooks.md"; Destination = "windsurf\hooks.md" },
    @{ Source = "antigravity-rules.json"; Destination = "antigravity-home\antigravity-rules.json" },
    @{ Source = ".antigravity\antigravity.json"; Destination = "antigravity\antigravity.json" },
    @{ Source = ".antigravity\settings.json"; Destination = "antigravity\settings.json" },
    @{ Source = ".ai-standards\README.md"; Destination = "ai-standards\README.md" },
    @{ Source = ".ai-standards\core\rules.md"; Destination = "ai-standards\core\rules.md" },
    @{ Source = ".ai-standards\core\workflow.md"; Destination = "ai-standards\core\workflow.md" },
    @{ Source = ".ai-standards\core\orchestrator.md"; Destination = "ai-standards\core\orchestrator.md" },
    @{ Source = ".ai-standards\core\integration.md"; Destination = "ai-standards\core\integration.md" },
    @{ Source = ".ai-standards\core\patterns.md"; Destination = "ai-standards\core\patterns.md" },
    @{ Source = ".ai-standards\templates\session.md"; Destination = "ai-standards\templates\session.md" },
    @{ Source = ".ai-standards\templates\log.md"; Destination = "ai-standards\templates\log.md" }
  )

  foreach ($profile in $profileFiles) {
    $sourceFile = Join-Path $SourceHome $profile.Source
    if (-not (Test-Path -LiteralPath $sourceFile)) { continue }
    if (Test-ExcludedPortablePath -RelativePath $profile.Source) {
      $skipped.Add("tool-profiles/$($profile.Destination)")
      continue
    }
    $destinationFile = Join-Path $toolProfilesDest $profile.Destination
    Copy-SanitizedFile -SourceFile $sourceFile -DestinationFile $destinationFile -RelativePath "tool-profiles/$($profile.Destination)"
    $copied.Add("tool-profiles/$($profile.Destination)")
    $toolProfileFiles++
  }

  function Write-ToolProfileTemplateIfMissing {
    param([string]$Destination, [string]$Content)
    $destinationFile = Join-Path $toolProfilesDest $Destination
    if (Test-Path -LiteralPath $destinationFile) { return }
    $destinationDir = Split-Path -Parent $destinationFile
    New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    [System.IO.File]::WriteAllText($destinationFile, $Content, [System.Text.UTF8Encoding]::new($false))
    $copied.Add("tool-profiles/$Destination")
    $script:toolProfileFiles++
  }

  Write-ToolProfileTemplateIfMissing -Destination "mimo\AGENTS.md" -Content @'
# MiMo Code Global Orquestrador

Use the shared Orquestrador Maestro contract for substantive work:

1. Read `{{USER_HOME}}/AGENTS.md`.
2. Read `{{USER_HOME}}/.orquestrador/rules.md`.
3. Read `{{USER_HOME}}/.orquestrador/maestro.md`.
4. Read `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`.
5. In projects with `DEV/`, read the compact project documentation before task skills.
6. Use `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json` before loading skills.
7. Keep durable project notes in `DEV/` and update `DEV/WORKLOG.md` after substantive work.

MiMo Code is responsible for its own login, model selection, sessions, and local runtime data.
'@

  Write-ToolProfileTemplateIfMissing -Destination "kimi\AGENTS.md" -Content @'
# Kimi Code Global Orquestrador

Use the shared Orquestrador Maestro contract for substantive work:

1. Read `{{USER_HOME}}/AGENTS.md`.
2. Read `{{USER_HOME}}/.orquestrador/rules.md`.
3. Read `{{USER_HOME}}/.orquestrador/maestro.md`.
4. Read `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`.
5. In projects with `DEV/`, read the compact project documentation before task skills.
6. Use `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json` before loading skills.
7. Keep durable project notes in `DEV/` and update `DEV/WORKLOG.md` after substantive work.

Kimi Code is responsible for its own login, model selection, sessions, and local runtime data.
'@

  Write-ToolProfileTemplateIfMissing -Destination "kimi\config.toml" -Content @'
# Kimi Code user configuration. Authentication and sessions remain local to Kimi.
extra_skill_dirs = ["{{USER_HOME}}/.orquestrador/skill-library/community-skills", "{{USER_HOME}}/.agents/skills"]
'@

  Write-ToolProfileTemplateIfMissing -Destination "grok\config.toml" -Content @'
# Grok Build user configuration. Authentication and sessions remain local to Grok.
[skills]
paths = ["{{USER_HOME}}/.orquestrador/skill-library/community-skills", "{{USER_HOME}}/.agents/skills"]
'@

  Write-ToolProfileTemplateIfMissing -Destination "opencode-global\AGENTS.md" -Content @'
# OpenCode Global Orquestrador

Use this file as the global OpenCode rule file for this user.

Always apply the Orquestrador Maestro contract:

1. Read `{{USER_HOME}}/AGENTS.md`.
2. Read `{{USER_HOME}}/.orquestrador/rules.md`.
3. Read `{{USER_HOME}}/.orquestrador/maestro.md`.
4. Read `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`.
5. In projects with `DEV/`, read the project DEV overview after the nearest project `AGENTS.md`.
6. Use `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json` before loading task skills.
7. Load only the task-relevant `SKILL.md` files and task-relevant `DEV/` docs.
8. Keep durable project docs in `DEV/` by default and update `DEV/WORKLOG.md` after substantive work.
9. Treat the IA as `orquestrador` and the user as `maestro`.
10. Verify before claiming completion.
11. Do not commit or push unless the user explicitly asks.

Default skill: `orquestrador-maestro`.
'@

  Write-ToolProfileTemplateIfMissing -Destination "opencode-global\opencode.json" -Content @'
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [
    "~/AGENTS.md",
    "~/.orquestrador/rules.md",
    "~/.orquestrador/maestro.md",
    "~/.orquestrador/SKILLS_INDEX.md",
    "~/.orquestrador/SKILLS_ROUTER.json",
    "~/.opencode/SYSTEM.md",
    "~/.opencode/rules.md",
    "~/.opencode/hooks.md"
  ]
}
'@

  Write-ToolProfileTemplateIfMissing -Destination "claude\CLAUDE.md" -Content @'
# Claude Global Orquestrador

Always use the Orquestrador Maestro contract for this user.

Primary files:

- `{{USER_HOME}}/AGENTS.md`
- `{{USER_HOME}}/.orquestrador/rules.md`
- `{{USER_HOME}}/.orquestrador/maestro.md`
- `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`
- `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`
- `{{USER_HOME}}/.orquestrador/SKILLS_INDEX.md`

Operating rules:

- The assistant acts as the `orquestrador`; the user is the `maestro`.
- Before broad work, read the global contract, rules, and maestro files.
- Rehydrate and persist project context according to `PERSISTENCE.md`; never rely on chat history alone.
- In projects with `DEV/`, read the project DEV overview after the nearest project `AGENTS.md` and before task skills.
- Keep durable project docs in `DEV/` by default and update `DEV/WORKLOG.md` after substantive work.
- Before inventing a workflow, inspect the skills index and router.
- Load only task-relevant skills.
- Verify before claiming completion.
- Do not commit or push unless the user explicitly asks.

Default skill: `orquestrador-maestro`.
'@

  Write-ToolProfileTemplateIfMissing -Destination "cursor\AGENTS.md" -Content @'
# Cursor Global Orquestrador

Use Orquestrador Maestro as the default operating contract.

Read and follow:

- `{{USER_HOME}}/AGENTS.md`
- `{{USER_HOME}}/.orquestrador/rules.md`
- `{{USER_HOME}}/.orquestrador/maestro.md`
- `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`
- `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`

The assistant acts as `orquestrador`; the user is the `maestro`.
When a project has `DEV/`, read its overview docs after the nearest project `AGENTS.md` and before task skills.
Keep durable project docs in `DEV/` by default and update `DEV/WORKLOG.md` after substantive work.
Use the router before loading skills, verify before completion, and do not commit or push unless the user explicitly asks.
'@

  Write-ToolProfileTemplateIfMissing -Destination "cursor\rules\orquestrador-maestro.mdc" -Content @'
---
description: Orquestrador Maestro global routing and operating contract.
globs:
alwaysApply: true
---

# Orquestrador Maestro

Always use Orquestrador Maestro as the default operating contract.

Read and follow:

- `{{USER_HOME}}/AGENTS.md`
- `{{USER_HOME}}/.orquestrador/rules.md`
- `{{USER_HOME}}/.orquestrador/maestro.md`
- `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`
- `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`

Rules:

- The assistant acts as `orquestrador`; the user is the `maestro`.
- In projects with `DEV/`, read the project DEV overview after the nearest project `AGENTS.md` and before task skills.
- Keep durable project docs in `DEV/` by default and update `DEV/WORKLOG.md` after substantive work.
- Consult the router before loading skills.
- Load only task-relevant skills.
- Verify before claiming completion.
- Do not commit or push unless the user explicitly asks.
'@

  Write-ToolProfileTemplateIfMissing -Destination "cursor\commands\maestro.md" -Content @'
# Reidratar o Orquestrador Maestro

Reidrata o contexto operacional antes de continuar a tarefa atual.

Leia nesta ordem, sem abrir catálogos inteiros:

1. `{{USER_HOME}}/AGENTS.md`
2. `{{USER_HOME}}/.orquestrador/rules.md`
3. `{{USER_HOME}}/.orquestrador/maestro.md`
4. `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`
5. O `AGENTS.md` mais próximo do projeto atual
6. Se existir `DEV/`, leia `DEV/README.md` ou `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md` e `DEV/SPECS/ACTIVE.md`
7. Consulte `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json` somente para escolher a skill necessária

Depois de ler:

- confirme internamente que o usuário é o Maestro e você é o Orquestrador;
- retome a tarefa atual a partir do handoff e da spec ativa;
- não reinicie uma solução já concluída nem invente contexto ausente;
- se não houver handoff, diga exatamente qual contexto está faltando e peça apenas a informação mínima necessária;
- continue a execução com verificação proporcional e registre mudanças substantivas no `DEV/`.

Pedido atual do Maestro:

{{input}}
'@

  Write-ToolProfileTemplateIfMissing -Destination "gemini\GEMINI.md" -Content @'
# Gemini Global Orquestrador

Use Orquestrador Maestro as the default instructional context for this user.

Read and follow:

- `{{USER_HOME}}/AGENTS.md`
- `{{USER_HOME}}/.orquestrador/rules.md`
- `{{USER_HOME}}/.orquestrador/maestro.md`
- `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`
- `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`
- `{{USER_HOME}}/.orquestrador/SKILLS_INDEX.md`

The assistant acts as `orquestrador`; the user is the `maestro`.

When a project has `DEV/`, read its overview docs after the nearest project `AGENTS.md` and before task skills.
Keep durable project docs in `DEV/` by default and update `DEV/WORKLOG.md` after substantive work.

Before broad work, consult the router and load only the task-relevant skills. Verify before claiming completion. Do not commit or push unless the user explicitly asks.
'@

  Write-ToolProfileTemplateIfMissing -Destination "windsurf-global\global_rules.md" -Content @'
# Windsurf Global Orquestrador

Always use Orquestrador Maestro as the default operating contract.

Read and follow these files when starting substantive work:

- `{{USER_HOME}}/AGENTS.md`
- `{{USER_HOME}}/.orquestrador/rules.md`
- `{{USER_HOME}}/.orquestrador/maestro.md`
- `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`
- `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`
- `{{USER_HOME}}/.orquestrador/SKILLS_INDEX.md`

The assistant acts as `orquestrador`; the user is the `maestro`.

When a project has `DEV/`, read its overview docs after the nearest project `AGENTS.md` and before task skills.
Keep durable project docs in `DEV/` by default and update `DEV/WORKLOG.md` after substantive work.

Before loading skills, consult the router. Load only task-relevant skills. Verify before claiming completion. Do not commit or push unless the user explicitly asks.
'@

  Write-ToolProfileTemplateIfMissing -Destination "antigravity-home\antigravity-rules.json" -Content @'
{
  "name": "antigravity-maestro-integration",
  "description": "Antigravity + Maestro + Orquestrador integration",
  "version": "1.0.0",
  "standards_source": "{{USER_HOME}}/.ai-standards",
  "orchestrator": {
    "enabled": true,
    "endpoint": "ws://localhost:3001",
    "protocol": "universal_message_v3",
    "auto_connect": true,
    "timeout": 120000,
    "rules_path": "{{USER_HOME}}/.orquestrador/rules.md",
    "maestro_path": "{{USER_HOME}}/.orquestrador/maestro.md",
    "skills_router_path": "{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json",
    "skills_index_path": "{{USER_HOME}}/.orquestrador/SKILLS_INDEX.md"
  },
  "maestro": {
    "enabled": true,
    "workflow_mode": "integrated",
    "validation_level": "strict",
    "workflows_path": "{{USER_HOME}}/.ai-standards/core/workflow.md"
  },
  "standards": {
    "rules_path": "{{USER_HOME}}/.ai-standards/core/rules.md",
    "patterns_path": "{{USER_HOME}}/.ai-standards/core/patterns.md",
    "orchestrator_path": "{{USER_HOME}}/.ai-standards/core/orchestrator.md",
    "integration_path": "{{USER_HOME}}/.ai-standards/core/integration.md",
    "auto_sync": true,
    "sync_interval": 5000
  },
  "project_context": {
    "project_agents": "AGENTS.md",
    "dev_root": "DEV",
    "dev_index": "DEV/INDEX.md",
    "dev_context": "DEV/CONTEXT.md",
    "dev_worklog": "DEV/WORKLOG.md"
  },
  "commands": {
    "universal": [
      "/fix",
      "/implement",
      "/new-feature",
      "/refactor",
      "/test",
      "/review",
      "/dev-workflow"
    ],
    "context": [
      "/context",
      "/status",
      "/workflow",
      "/help",
      "/sync",
      "/orchestrate"
    ]
  },
  "validation": {
    "quality_gates": true,
    "verify_before_completion": true
  }
}
'@

  Write-ToolProfileTemplateIfMissing -Destination "antigravity\antigravity.json" -Content @'
{
  "name": "antigravity-maestro-integration",
  "description": "Portable Antigravity profile for Orquestrador Maestro",
  "version": "1.0.0",
  "standards_source": "{{USER_HOME}}/.ai-standards",
  "orchestrator": {
    "enabled": true,
    "endpoint": "ws://localhost:3001",
    "protocol": "universal_message_v3",
    "auto_connect": true,
    "timeout": 120000,
    "rules_path": "{{USER_HOME}}/.orquestrador/rules.md",
    "maestro_path": "{{USER_HOME}}/.orquestrador/maestro.md",
    "skills_router_path": "{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json"
  },
  "maestro": {
    "enabled": true,
    "workflow_mode": "integrated",
    "validation_level": "strict",
    "workflows_path": "{{USER_HOME}}/.ai-standards/core/workflow.md"
  },
  "standards": {
    "rules_path": "{{USER_HOME}}/.ai-standards/core/rules.md",
    "patterns_path": "{{USER_HOME}}/.ai-standards/core/patterns.md",
    "orchestrator_path": "{{USER_HOME}}/.ai-standards/core/orchestrator.md",
    "integration_path": "{{USER_HOME}}/.ai-standards/core/integration.md",
    "templates_path": "{{USER_HOME}}/.ai-standards/templates"
  },
  "skills": {
    "root": "{{USER_HOME}}/.antigravity-skills/skills",
    "canonical_root": "{{USER_HOME}}/.orquestrador/skills",
    "router": "{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json"
  },
  "project_context": {
    "global_agents": "{{USER_HOME}}/AGENTS.md",
    "project_agents": "AGENTS.md",
    "dev_root": "DEV",
    "dev_worklog": "DEV/WORKLOG.md"
  }
}
'@

  Write-ToolProfileTemplateIfMissing -Destination "antigravity\settings.json" -Content @'
{
  "workbench.colorTheme": "Default Dark+",
  "editor.fontSize": 14,
  "editor.tabSize": 2,
  "editor.wordWrap": "on",
  "editor.formatOnSave": true,
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000,
  "security.workspace.trust.enabled": false,
  "telemetry.telemetryLevel": "off",
  "update.mode": "manual",
  "orquestradorMaestro.enabled": true,
  "orquestradorMaestro.globalAgents": "{{USER_HOME}}/AGENTS.md",
  "orquestradorMaestro.rules": "{{USER_HOME}}/.orquestrador/rules.md",
  "orquestradorMaestro.maestro": "{{USER_HOME}}/.orquestrador/maestro.md",
  "orquestradorMaestro.skillsRouter": "{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json",
  "orquestradorMaestro.aiStandards": "{{USER_HOME}}/.ai-standards"
}
'@

  Write-ToolProfileTemplateIfMissing -Destination "ai-standards\README.md" -Content @'
# AI Standards For Antigravity

This directory is installed to `{{USER_HOME}}/.ai-standards`.

It gives Antigravity a portable standards root that points back to Orquestrador Maestro without exposing a real user path. Antigravity should read the project `AGENTS.md`, then `DEV/` overview docs when present, then the selected task skill.
'@

  Write-ToolProfileTemplateIfMissing -Destination "ai-standards\core\rules.md" -Content @'
# Antigravity Rules

Antigravity must use Orquestrador Maestro as the default operating contract for this user.

Read first:

1. `{{USER_HOME}}/AGENTS.md`
2. `{{USER_HOME}}/.orquestrador/rules.md`
3. `{{USER_HOME}}/.orquestrador/maestro.md`
4. nearest project `AGENTS.md`
5. project `DEV/README.md`, `DEV/INDEX.md` or `DEV/CONTEXT.md` when present
6. the task-relevant skill

Keep durable project documentation in `DEV/` by default and update `DEV/WORKLOG.md` after substantive project work. Verify before claiming completion.
'@

  Write-ToolProfileTemplateIfMissing -Destination "ai-standards\core\workflow.md" -Content @'
# Antigravity Workflow

Observe, classify, route, select, execute, verify, record and report. Use compact context first, then open only the selected skill and directly referenced files.
'@

  Write-ToolProfileTemplateIfMissing -Destination "ai-standards\core\orchestrator.md" -Content @'
# Orquestrador And Maestro

Antigravity acts as Orquestrador. The user is the Maestro. Execute safe, well-scoped work directly and ask only when a missing answer cannot be discovered safely.
'@

  Write-ToolProfileTemplateIfMissing -Destination "ai-standards\core\integration.md" -Content @'
# Tool Integration

Antigravity should use `{{USER_HOME}}/antigravity-rules.json`, `{{USER_HOME}}/.antigravity/antigravity.json`, `{{USER_HOME}}/.antigravity/settings.json`, `{{USER_HOME}}/.ai-standards` and `{{USER_HOME}}/.antigravity-skills/skills`.
'@

  Write-ToolProfileTemplateIfMissing -Destination "ai-standards\core\patterns.md" -Content @'
# Implementation Patterns

Prefer existing project patterns, keep changes scoped, verify before completion, and keep durable project notes under `DEV/`.
'@

  Write-ToolProfileTemplateIfMissing -Destination "ai-standards\templates\session.md" -Content @'
# Session Note

## Objective

## Context Read

## Decisions

## Verification

## Handoff
'@

  Write-ToolProfileTemplateIfMissing -Destination "ai-standards\templates\log.md" -Content @'
# Worklog Entry

## YYYY-MM-DD - Short Title

- Altered:
- Reason:
- Verified:
- Next context:
'@
}

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  source = "sanitized-local-export"
  packages = [ordered]@{
    orquestrador = [ordered]@{
      path = "orquestrador"
      files = @(Get-ChildItem -LiteralPath $orchestratorDest -Recurse -File -ErrorAction SilentlyContinue).Count
      skillDirectories = @(Get-ChildItem -LiteralPath (Join-Path $orchestratorDest "skills") -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") }).Count
    }
    codex = [ordered]@{
      path = "codex"
      skillFiles = $codexSkillFiles
      agentFiles = $codexAgentFiles
      promptFiles = $codexPromptFiles
    }
    communitySkills = [ordered]@{
      path = "skill-library/community-skills"
      files = $communitySkillFiles
      skillDirectories = @(Get-ChildItem -LiteralPath (Join-Path $skillLibraryDest "community-skills") -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") }).Count
    }
    toolProfiles = [ordered]@{
      path = "tool-profiles"
      files = $toolProfileFiles
    }
  }
  excluded = @(
    "logs",
    "backups",
    "runtime caches",
    "binary build artifacts",
    "benchmark results",
    "generated databases",
    "local memories",
    "local config files",
    "Codex local rules and command allowlists",
    "private path names",
    "backup files"
  )
}
New-Item -ItemType Directory -Force -Path $skillLibraryDest | Out-Null
[System.IO.File]::WriteAllText(
  (Join-Path $skillLibraryDest "MANIFEST.json"),
  ($manifest | ConvertTo-Json -Depth 8),
  [System.Text.UTF8Encoding]::new($false)
)

[pscustomobject]@{
  RepoRoot = $repoRootFull
  SourceOrquestrador = (Get-FullPath -Path $SourceOrquestrador)
  Copied = $copied.Count
  Skipped = $skipped.Count
  CodexSkillFiles = $codexSkillFiles
  CodexAgentFiles = $codexAgentFiles
  CodexPromptFiles = $codexPromptFiles
  CommunitySkillFiles = $communitySkillFiles
  ToolProfileFiles = $toolProfileFiles
  PrivateTermsPath = $PrivateTermsPath
} | Format-List

if ($skipped.Count -gt 0) {
  "Skipped private/local files:"
  $skipped | Sort-Object | ForEach-Object { "  - $_" }
}
