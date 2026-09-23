[CmdletBinding()]
param(
  [string]$HomePath = [Environment]::GetFolderPath("UserProfile"),
  [switch]$Force,
  [switch]$SkipSkillSync,
  [switch]$SkipExtraSkills,
  [switch]$SkipCommunitySkills,
  [switch]$InstallToolProfiles,
  [string[]]$Only = @(),
  [switch]$DryRun,
  [switch]$ListTargets,
  [switch]$Uninstall,
  [switch]$NonInteractive,
  [switch]$AllTargets,
  [switch]$VerbosePaths
)

$ErrorActionPreference = "Stop"

# Parity with install.sh: refuse elevated installs that would land in the
# wrong profile. Override explicitly with ORQUESTRADOR_ALLOW_ROOT_INSTALL=1.
$windowsIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$windowsPrincipal = New-Object Security.Principal.WindowsPrincipal($windowsIdentity)
if (
  $windowsPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -and
  -not $env:ORQUESTRADOR_ALLOW_ROOT_INSTALL -and
  -not $DryRun -and
  -not $ListTargets
) {
  throw "Recuse instalar como Administrador: execute em um PowerShell normal de usuário (ou defina ORQUESTRADOR_ALLOW_ROOT_INSTALL=1 para forçar)."
}

function Get-HostPowerShell {
  # pwsh-only hosts have no WinPS 5.1 `powershell` binary.
  # Mirrored in scripts/test-install.ps1; keep both in sync.
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) { return "pwsh" }
  return "powershell"
}

function Test-ToolPresent {
  # Mirrors install.sh tool_is_present: binary on PATH, or a config dir
  # that we did not create ourselves (.maestro-managed marker).
  param([string]$Command, [string]$ConfigDir)
  if ($Command -and (Get-Command $Command -ErrorAction SilentlyContinue)) { return $true }
  if ($ConfigDir) {
    $dir = Join-Path $HomePath $ConfigDir
    if ((Test-Path -LiteralPath $dir) -and -not (Test-Path -LiteralPath (Join-Path $dir ".maestro-managed"))) { return $true }
  }
  return $false
}

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$SourceOrquestrador = Join-Path $RepoRoot "orquestrador"
$SourceAgents = Join-Path $RepoRoot "home\AGENTS.md"
$SourceCodex = Join-Path $RepoRoot "codex"
$SourceCommunitySkills = Join-Path $RepoRoot "skill-library\community-skills"
$SourceToolProfiles = Join-Path $RepoRoot "tool-profiles"
$CanonicalOrquestradorName = ".orquestrador-maestro"
$LegacyOrquestradorName = ".orquestrador"
$CanonicalOrquestrador = Join-Path $HomePath $CanonicalOrquestradorName
$LegacyOrquestrador = Join-Path $HomePath $LegacyOrquestradorName
$TargetOrquestrador = if (Test-Path -LiteralPath $CanonicalOrquestrador) { $CanonicalOrquestrador } elseif (Test-Path -LiteralPath $LegacyOrquestrador) { $LegacyOrquestrador } else { $CanonicalOrquestrador }
$TargetOrquestradorName = Split-Path -Leaf $TargetOrquestrador
$TargetSkillLibrary = Join-Path $TargetOrquestrador "skill-library"
$TargetAgents = Join-Path $HomePath "AGENTS.md"
$BackupRoot = Join-Path $HomePath ".orquestrador-public-backups"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = Join-Path $BackupRoot $Stamp

$SelectedComponents = @(
  $Only |
    ForEach-Object { $_ -split "," } |
    ForEach-Object { $_.Trim().ToLowerInvariant() } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
) | Select-Object -Unique

$AllowedComponents = @(
  "all",
  "core",
  "orquestrador",
  "global-agents",
  "skills",
  "community-skills",
  "codex",
  "agents",
  "freebuff",
  "claude",
  "opencode",
  "cursor",
  "gemini",
  "windsurf",
  "antigravity",
  "mimo",
  "kimi",
  "grok",
  "tool-profiles",
  "codex-skills",
  "codex-agents",
  "codex-prompts",
  "prompts"
)

foreach ($component in $SelectedComponents) {
  if ($AllowedComponents -notcontains $component) {
    throw "Unknown component for -Only: $component. Supported values: $($AllowedComponents -join ', ')"
  }
}

function Test-SelectedComponent {
  param([string[]]$Names)
  if ($SelectedComponents.Count -eq 0) { return $true }
  if ($SelectedComponents -contains "all") { return $true }
  foreach ($name in $Names) {
    if ($SelectedComponents -contains $name.ToLowerInvariant()) { return $true }
  }
  return $false
}

function Get-FullPath {
  param([string]$Path)
  return [System.IO.Path]::GetFullPath($Path)
}

function Test-PathUnderRoot {
  param([string]$Path, [string]$Root)
  $resolvedPath = (Get-FullPath -Path $Path).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $resolvedRoot = (Get-FullPath -Path $Root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  if ($resolvedPath.Equals($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  $rootWithSeparator = $resolvedRoot + [System.IO.Path]::DirectorySeparatorChar
  return $resolvedPath.StartsWith($rootWithSeparator, [StringComparison]::OrdinalIgnoreCase)
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

function Copy-WithPlaceholders {
  param([string]$SourceFile, [string]$DestinationFile)
  $destinationDir = Split-Path -Parent $DestinationFile
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null

  $homeForText = $HomePath.Replace("\", "/")
  $userName = Split-Path -Leaf $HomePath

  if (-not (Test-TextFile -Path $SourceFile)) {
    Copy-Item -LiteralPath $SourceFile -Destination $DestinationFile -Force
    return
  }

  try {
    $content = Get-Content -LiteralPath $SourceFile -Raw -Encoding UTF8
    $content = $content.Replace("{{USER_HOME}}/.orquestrador", ($TargetOrquestrador -replace "\\", "/"))
    $content = $content.Replace("{{USER_HOME}}", $homeForText)
    $content = $content.Replace("~/.orquestrador", "~/$TargetOrquestradorName")
    $content = $content.Replace("{{USER_NAME}}", $userName)
    $content = $content.Replace("{{USER_FULL_NAME}}", $userName)
    [System.IO.File]::WriteAllText($DestinationFile, $content, [System.Text.UTF8Encoding]::new($false))
  } catch {
    Copy-Item -LiteralPath $SourceFile -Destination $DestinationFile -Force
  }
}

function Get-TreeFiles {
  param([string]$SourceDir)
  $pending = New-Object System.Collections.Generic.Stack[string]
  $pending.Push((Get-FullPath -Path $SourceDir))

  while ($pending.Count -gt 0) {
    $currentDir = $pending.Pop()

    foreach ($file in Get-ChildItem -LiteralPath $currentDir -File -Force) {
      Write-Output $file
    }

    foreach ($directory in Get-ChildItem -LiteralPath $currentDir -Directory -Force) {
      $relativeDirectory = Get-RelativePath -BasePath $SourceDir -Path $directory.FullName
      $isLocalRuntime = $relativeDirectory.Equals("runtime", [StringComparison]::OrdinalIgnoreCase) -or
        $relativeDirectory.StartsWith("runtime\", [StringComparison]::OrdinalIgnoreCase)
      $isReparsePoint = ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
      if ($isLocalRuntime -or $isReparsePoint) {
        continue
      }
      $pending.Push($directory.FullName)
    }
  }
}

function Copy-TreeWithPlaceholders {
  param([string]$SourceDir, [string]$DestinationDir)
  foreach ($file in Get-TreeFiles -SourceDir $SourceDir) {
    $relative = Get-RelativePath -BasePath $SourceDir -Path $file.FullName
    $dest = Join-Path $DestinationDir $relative
    Copy-WithPlaceholders -SourceFile $file.FullName -DestinationFile $dest
  }
}

function Backup-Path {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $dest = Join-Path $BackupDir $Label
  Copy-Item -LiteralPath $Path -Destination $dest -Recurse -Force
}

function Backup-MappedDirectory {
  param([string]$SourceDir, [string]$DestinationDir, [string]$Label)
  if (-not (Test-Path -LiteralPath $DestinationDir)) { return }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $backupTarget = Join-Path $BackupDir $Label
  foreach ($sourceFile in Get-TreeFiles -SourceDir $SourceDir) {
    $relative = Get-RelativePath -BasePath $SourceDir -Path $sourceFile.FullName
    $existingFile = Join-Path $DestinationDir $relative
    if (Test-Path -LiteralPath $existingFile) {
      $backupFile = Join-Path $backupTarget $relative
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupFile) | Out-Null
      Copy-Item -LiteralPath $existingFile -Destination $backupFile -Force
    }
  }
}

function Backup-MappedFile {
  param([string]$DestinationFile, [string]$Label)
  if (-not (Test-Path -LiteralPath $DestinationFile)) { return }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  Copy-Item -LiteralPath $DestinationFile -Destination (Join-Path $BackupDir $Label) -Force
}

function Add-InstallTarget {
  param(
    [System.Collections.Generic.List[object]]$Targets,
    [string]$Source,
    [string]$Destination,
    [string]$Label,
    [string]$Component = ""
  )
  if (Test-Path -LiteralPath $Source) {
    $Targets.Add([pscustomobject]@{
      Source = $Source
      Destination = $Destination
      Label = $Label
      Component = $Component
      Kind = "directory"
    })
  }
}

function Add-InstallFileTarget {
  param(
    [System.Collections.Generic.List[object]]$Targets,
    [string]$Source,
    [string]$Destination,
    [string]$Label,
    [string]$Component = ""
  )
  if (Test-Path -LiteralPath $Source) {
    $Targets.Add([pscustomobject]@{
      Source = $Source
      Destination = $Destination
      Label = $Label
      Component = $Component
      Kind = "file"
    })
  }
}

function Write-InstallPlan {
  param(
    [object[]]$CoreTargets,
    [object[]]$DirectoryTargets,
    [object[]]$FileTargets,
    [string]$Mode
  )
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($target in @($CoreTargets + $DirectoryTargets + $FileTargets)) {
    $exists = Test-Path -LiteralPath $target.Destination
    if ($VerbosePaths) {
      $rows.Add([pscustomobject]@{
        Mode = $Mode
        Target = $target.Label
        Component = $target.Component
        Kind = $target.Kind
        Exists = $exists
        Source = $target.Source
        Destination = $target.Destination
      })
    } else {
      $rows.Add([pscustomobject]@{
        Mode = $Mode
        Target = $target.Label
        Component = $target.Component
        Kind = $target.Kind
        Exists = $exists
      })
    }
  }
  $rows | Format-Table -AutoSize
}

function Remove-EmptyParentsUnderRoot {
  param([string]$Path, [string]$Root)
  $rootFull = (Get-FullPath -Path $Root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $current = Get-FullPath -Path $Path
  while ((Test-Path -LiteralPath $current) -and
    (Test-PathUnderRoot -Path $current -Root $rootFull) -and
    (-not $current.TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    ).Equals($rootFull, [StringComparison]::OrdinalIgnoreCase))) {
    if (@(Get-ChildItem -LiteralPath $current -Force -ErrorAction SilentlyContinue).Count -gt 0) {
      break
    }
    Remove-Item -LiteralPath $current -Force
    $current = Split-Path -Parent $current
  }
}

function Uninstall-MappedDirectory {
  param([string]$SourceDir, [string]$DestinationDir)
  if (-not (Test-Path -LiteralPath $DestinationDir)) { return }
  if (-not (Test-PathUnderRoot -Path $DestinationDir -Root $HomePath)) {
    throw "Refusing to uninstall target outside home: $DestinationDir"
  }
  foreach ($sourceFile in Get-TreeFiles -SourceDir $SourceDir) {
    $relative = Get-RelativePath -BasePath $SourceDir -Path $sourceFile.FullName
    $dest = Join-Path $DestinationDir $relative
    if (Test-Path -LiteralPath $dest) {
      Remove-Item -LiteralPath $dest -Force
      Remove-EmptyParentsUnderRoot -Path (Split-Path -Parent $dest) -Root $DestinationDir
    }
  }
  Remove-EmptyParentsUnderRoot -Path $DestinationDir -Root $HomePath
}

function Get-ManagedMirrorNames {
  param([string]$SourceRoot)
  try {
    $names = @{}
    $manifestPath = Join-Path $SourceRoot "SKILLS_MANIFEST.json"
    if (Test-Path -LiteralPath $manifestPath) {
      $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($prop in $manifest.skills.PSObject.Properties) {
        if ($prop.Value.mirrorEverywhere -eq $true) { $names[$prop.Name] = $true }
      }
    }
    $policyPath = Join-Path $SourceRoot "SKILL_INSTALL_POLICY.json"
    if (Test-Path -LiteralPath $policyPath) {
      $policy = Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($prop in $policy.nativeRoots.PSObject.Properties) {
        foreach ($dir in @($prop.Value.allowDirectories)) { $names[$dir] = $true }
      }
    }
    $names["orquestrador-maestro"] = $true
    if ($names.Count -gt 0) { return @($names.Keys | Sort-Object) }
  } catch { }
  return @(
    ".system", "ask-claude", "ask-gemini", "autopilot", "cancel", "code-review",
    "deep-interview", "doctor", "orquestrador-maestro", "plan", "ralplan", "ralph",
    "security-review", "skill-adr", "skill-ai-orchestration", "skill-frontend-excellence",
    "skill-multiagent-orchestration", "skill-preflight", "skill-quality-gate",
    "skill-release-engineering", "skill-repo-health", "skill-research-and-synthesis",
    "skill-saas-factory", "skill-saas-security-scan", "skill-systematic-debugging",
    "skill-verification-before-completion", "skill-webapp-testing", "team",
    "ultrawork", "web-clone", "worker"
  )
}

function Get-SyncMirrorSpecs {
  return @(
    @{ Program = "codex"; Relative = ".codex\skills"; LabelPrefix = ".codex__skills" },
    @{ Program = "opencode"; Relative = ".opencode\skills"; LabelPrefix = ".opencode__skills" },
    @{ Program = "agents"; Relative = ".agents\skills"; LabelPrefix = ".agents__skills" },
    @{ Program = "claude"; Relative = ".claude\skills"; LabelPrefix = ".claude__skills" },
    @{ Program = "cursor"; Relative = ".cursor\skills"; LabelPrefix = ".cursor__skills" },
    @{ Program = "gemini"; Relative = ".gemini\skills"; LabelPrefix = ".gemini__skills" },
    @{ Program = "windsurf"; Relative = ".windsurf\skills"; LabelPrefix = ".windsurf__skills" },
    @{ Program = "antigravity"; Relative = ".antigravity-skills\skills"; LabelPrefix = ".antigravity-skills__skills" }
  )
}

function Test-SyncMirrorSelected {
  param([string]$Program)
  if ($SelectedComponents.Count -eq 0) { return $true }
  if ($SelectedComponents -contains "all") { return $true }
  $normalized = $Program.ToLowerInvariant()
  if ($SelectedComponents -contains $normalized) { return $true }
  if ($normalized -eq "agents" -and $SelectedComponents -contains "freebuff") { return $true }
  return $false
}

function Uninstall-SyncedMirrorDirectory {
  param([string]$DestinationDir, [string]$Label)
  if (-not (Test-Path -LiteralPath $DestinationDir)) { return }
  if (-not (Test-PathUnderRoot -Path $DestinationDir -Root $HomePath)) {
    throw "Refusing to uninstall synced mirror outside home: $DestinationDir"
  }
  Backup-Path -Path $DestinationDir -Label $Label
  Remove-Item -LiteralPath $DestinationDir -Recurse -Force
}

if (-not (Test-Path -LiteralPath $SourceOrquestrador)) {
  throw "Missing generated snapshot: $SourceOrquestrador. Run scripts\sync-from-local.ps1 first."
}
if (-not (Test-Path -LiteralPath $SourceAgents)) {
  throw "Missing home AGENTS template: $SourceAgents. Run scripts\sync-from-local.ps1 first."
}

if ((Test-Path -LiteralPath $TargetOrquestrador) -and -not $Force -and -not $DryRun -and -not $ListTargets -and -not $Uninstall) {
  throw "Target already exists: $TargetOrquestrador. Re-run with -Force to overwrite after backup."
}
if ((Test-Path -LiteralPath $TargetAgents) -and -not $Force -and -not $DryRun -and -not $ListTargets -and -not $Uninstall) {
  throw "Target already exists: $TargetAgents. Re-run with -Force to overwrite after backup."
}

$includeCore = if ($Uninstall) { Test-SelectedComponent -Names @("core", "orquestrador", "global-agents") } else { $true }
$coreTargets = @()
if ($includeCore) {
  $coreTargets = @(
    [pscustomobject]@{
      Source = $SourceOrquestrador
      Destination = $TargetOrquestrador
      Label = $TargetOrquestradorName
      Component = "core"
      Kind = "directory"
    },
    [pscustomobject]@{
      Source = $SourceAgents
      Destination = $TargetAgents
      Label = "AGENTS.md"
      Component = "core"
      Kind = "file"
    }
  )
}

$extraTargets = New-Object System.Collections.Generic.List[object]
$extraFileTargets = New-Object System.Collections.Generic.List[object]
if (-not $SkipExtraSkills) {
  if (-not $SkipCommunitySkills) {
    if (Test-SelectedComponent -Names @("skills", "community-skills", "codex", "agents", "freebuff", "claude", "opencode", "cursor", "gemini", "windsurf", "antigravity", "mimo", "kimi", "grok")) {
      Add-InstallTarget `
        -Targets $extraTargets `
        -Source $SourceCommunitySkills `
        -Destination (Join-Path $TargetSkillLibrary "community-skills") `
        -Label ".orquestrador__skill-library__community-skills" `
        -Component "community-skills"
    }
  }
  if (Test-SelectedComponent -Names @("codex", "codex-skills", "skills")) {
    Add-InstallTarget `
      -Targets $extraTargets `
      -Source (Join-Path $SourceCodex "skills") `
      -Destination (Join-Path $TargetSkillLibrary "codex-skills") `
      -Label ".orquestrador__skill-library__codex-skills" `
      -Component "codex"
  }
  if (Test-SelectedComponent -Names @("codex", "codex-agents", "agents")) {
    Add-InstallTarget -Targets $extraTargets -Source (Join-Path $SourceCodex "agents") -Destination (Join-Path $HomePath ".codex\agents") -Label ".codex__agents" -Component "codex"
  }
  if (Test-SelectedComponent -Names @("codex", "codex-prompts", "prompts")) {
    Add-InstallTarget -Targets $extraTargets -Source (Join-Path $SourceCodex "prompts") -Destination (Join-Path $HomePath ".codex\prompts") -Label ".codex__prompts" -Component "codex"
  }
}

if ($InstallToolProfiles) {
  $toolProfileTargets = @(
    @{ Source = "codex"; Destination = ".codex"; Label = ".codex__profile"; Component = "codex"; ToolCommand = "codex"; ToolConfigDir = ".codex" },
    @{ Source = "opencode"; Destination = ".opencode"; Label = ".opencode"; Component = "opencode"; ToolCommand = "opencode"; ToolConfigDir = ".opencode" },
    @{ Source = "opencode-global"; Destination = ".config\opencode"; Label = ".config__opencode"; Component = "opencode"; ToolCommand = "opencode"; ToolConfigDir = ".config/opencode" },
    @{ Source = "claude"; Destination = ".claude"; Label = ".claude"; Component = "claude"; ToolCommand = "claude"; ToolConfigDir = ".claude" },
    @{ Source = "cursor"; Destination = ".cursor"; Label = ".cursor"; Component = "cursor"; ToolCommand = "cursor"; ToolConfigDir = ".cursor" },
    @{ Source = "gemini"; Destination = ".gemini"; Label = ".gemini"; Component = "gemini"; ToolCommand = "gemini"; ToolConfigDir = ".gemini" },
    @{ Source = "windsurf"; Destination = ".windsurf"; Label = ".windsurf"; Component = "windsurf"; ToolCommand = "windsurf"; ToolConfigDir = ".windsurf" },
    @{ Source = "windsurf-global"; Destination = ".codeium\windsurf\memories"; Label = ".codeium__windsurf__memories"; Component = "windsurf"; ToolCommand = "windsurf"; ToolConfigDir = ".codeium/windsurf/memories" },
    @{ Source = "antigravity"; Destination = ".antigravity"; Label = ".antigravity"; Component = "antigravity"; ToolCommand = "antigravity"; ToolConfigDir = ".antigravity" },
    @{ Source = "ai-standards"; Destination = ".ai-standards"; Label = ".ai-standards"; Component = "antigravity"; ToolCommand = "antigravity"; ToolConfigDir = ".ai-standards" },
    @{ Source = "mimo"; Destination = ".mimo"; Label = ".mimo"; Component = "mimo"; ToolCommand = "mimo"; ToolConfigDir = ".mimo" },
    @{ Source = "kimi"; Destination = ".kimi-code"; Label = ".kimi-code"; Component = "kimi"; ToolCommand = "kimi"; ToolConfigDir = ".kimi-code" },
    @{ Source = "grok"; Destination = ".grok"; Label = ".grok"; Component = "grok"; ToolCommand = "grok"; ToolConfigDir = ".grok" }
  )
  foreach ($target in $toolProfileTargets) {
    # -AllTargets installs everything; -NonInteractive installs only
    # detected tools (mirrors install.sh tool_should_install).
    if (-not $AllTargets -and $NonInteractive) {
      if (-not (Test-ToolPresent -Command $target.ToolCommand -ConfigDir $target.ToolConfigDir)) { continue }
    }
    if (Test-SelectedComponent -Names @("tool-profiles", $target.Component)) {
      Add-InstallTarget `
        -Targets $extraTargets `
        -Source (Join-Path $SourceToolProfiles $target.Source) `
        -Destination (Join-Path $HomePath $target.Destination) `
        -Label $target.Label `
        -Component $target.Component
    }
  }

  if (Test-SelectedComponent -Names @("tool-profiles", "antigravity")) {
    $antigravityDetected = $AllTargets -or -not $NonInteractive -or (Test-ToolPresent -Command "antigravity" -ConfigDir ".antigravity")
    if ($antigravityDetected) {
      Add-InstallFileTarget `
        -Targets $extraFileTargets `
        -Source (Join-Path $SourceToolProfiles "antigravity-home\antigravity-rules.json") `
        -Destination (Join-Path $HomePath "antigravity-rules.json") `
        -Label "antigravity-rules.json" `
        -Component "antigravity"
    }
  }
}

if ($ListTargets -or $DryRun) {
  $mode = if ($Uninstall) { "uninstall-plan" } elseif ($DryRun) { "dry-run" } else { "list" }
  Write-InstallPlan -CoreTargets $coreTargets -DirectoryTargets $extraTargets.ToArray() -FileTargets $extraFileTargets.ToArray() -Mode $mode
  if ($DryRun -and -not $Uninstall) {
    Write-Output "Planned post-copy steps (not executed in dry-run):"
    $logsDisplay = if ($VerbosePaths) { Join-Path $TargetOrquestrador "logs" } else { "$TargetOrquestradorName\logs" }
    Write-Output "- Would create logs directory: $logsDisplay"
    if ($SkipSkillSync) {
      Write-Output "- Would skip skill sync (-SkipSkillSync specified)."
    } else {
      $syncDetail = "sync-skills.ps1 -Apply -HomePath <home>"
      if ($SelectedComponents.Count -gt 0) { $syncDetail += " -Only $($SelectedComponents -join ',')" }
      Write-Output "- Would run skill sync: $syncDetail"
    }
    $dryRunDiscoveryScript = Join-Path $RepoRoot "scripts\discover-skills.js"
    if (Test-Path -LiteralPath $dryRunDiscoveryScript) {
      Write-Output "- Would run skill discovery: node scripts\discover-skills.js -> $TargetOrquestradorName\SKILLS_DISCOVERY.json"
    }
  }
  if ($DryRun -and $Uninstall) {
    $dryRunManagedNames = Get-ManagedMirrorNames -SourceRoot $SourceOrquestrador
    foreach ($spec in Get-SyncMirrorSpecs) {
      if (-not (Test-SyncMirrorSelected -Program $spec.Program)) { continue }
      $dryRunMirrorRoot = Join-Path $HomePath $spec.Relative
      foreach ($managedName in $dryRunManagedNames) {
        $dryRunCandidate = Join-Path $dryRunMirrorRoot $managedName
        if (Test-Path -LiteralPath $dryRunCandidate) {
          $dryRunDisplay = if ($VerbosePaths) { $dryRunCandidate } else { "$($spec.LabelPrefix)__$managedName" }
          Write-Output "- Would remove synced mirror: $dryRunDisplay"
        }
      }
    }
  }
  if ($DryRun -or $ListTargets) {
    return
  }
}

if ($Uninstall) {
  if ($includeCore) {
    Backup-Path -Path $TargetOrquestrador -Label $TargetOrquestradorName
    Backup-Path -Path $TargetAgents -Label "AGENTS.md"
  }
  foreach ($target in $extraTargets) {
    Backup-MappedDirectory -SourceDir $target.Source -DestinationDir $target.Destination -Label $target.Label
  }
  foreach ($target in $extraFileTargets) {
    Backup-MappedFile -DestinationFile $target.Destination -Label $target.Label
  }

  if ($includeCore -and (Test-Path -LiteralPath $TargetOrquestrador)) {
    if (-not (Test-PathUnderRoot -Path $TargetOrquestrador -Root $HomePath)) {
      throw "Refusing to remove target outside home: $TargetOrquestrador"
    }
    Remove-Item -LiteralPath $TargetOrquestrador -Recurse -Force
  }
  if ($includeCore -and (Test-Path -LiteralPath $TargetAgents)) {
    if (-not (Test-PathUnderRoot -Path $TargetAgents -Root $HomePath)) {
      throw "Refusing to remove target outside home: $TargetAgents"
    }
    Remove-Item -LiteralPath $TargetAgents -Force
  }
  foreach ($target in $extraTargets) {
    Uninstall-MappedDirectory -SourceDir $target.Source -DestinationDir $target.Destination
  }
  foreach ($target in $extraFileTargets) {
    if (Test-Path -LiteralPath $target.Destination) {
      if (-not (Test-PathUnderRoot -Path $target.Destination -Root $HomePath)) {
        throw "Refusing to remove target outside home: $($target.Destination)"
      }
      Remove-Item -LiteralPath $target.Destination -Force
    }
  }
  $managedMirrorNames = Get-ManagedMirrorNames -SourceRoot $SourceOrquestrador
  foreach ($spec in Get-SyncMirrorSpecs) {
    if (-not (Test-SyncMirrorSelected -Program $spec.Program)) { continue }
    $mirrorRoot = Join-Path $HomePath $spec.Relative
    if (-not (Test-Path -LiteralPath $mirrorRoot)) { continue }
    foreach ($managedName in $managedMirrorNames) {
      $candidate = Join-Path $mirrorRoot $managedName
      if (Test-Path -LiteralPath $candidate) {
        Uninstall-SyncedMirrorDirectory -DestinationDir $candidate -Label "$($spec.LabelPrefix)__$managedName"
      }
    }
    Remove-EmptyParentsUnderRoot -Path $mirrorRoot -Root $HomePath
  }

  [pscustomobject]@{
    HomePath = if ($VerbosePaths) { $HomePath } else { "[redacted]" }
    UninstalledCore = $includeCore
    Backup = if (Test-Path -LiteralPath $BackupDir) { if ($VerbosePaths) { $BackupDir } else { "[created]" } } else { $null }
    ExtraTargets = $extraTargets.Count
    FileTargets = $extraFileTargets.Count
  } | Format-List
  return
}

Backup-Path -Path $TargetOrquestrador -Label $TargetOrquestradorName
Backup-Path -Path $TargetAgents -Label "AGENTS.md"
$backedUpExtraTargets = @{}
foreach ($target in $extraTargets) {
  $key = [System.IO.Path]::GetFullPath($target.Destination).ToLowerInvariant()
  if (-not $backedUpExtraTargets.ContainsKey($key)) {
    Backup-MappedDirectory -SourceDir $target.Source -DestinationDir $target.Destination -Label $target.Label
    $backedUpExtraTargets[$key] = $true
  }
}
foreach ($target in $extraFileTargets) {
  $key = [System.IO.Path]::GetFullPath($target.Destination).ToLowerInvariant()
  if (-not $backedUpExtraTargets.ContainsKey($key)) {
    Backup-MappedFile -DestinationFile $target.Destination -Label $target.Label
    $backedUpExtraTargets[$key] = $true
  }
}

$StagedOrquestrador = "$TargetOrquestrador.install-$Stamp-$PID"
$PreviousOrquestrador = "$TargetOrquestrador.previous-$Stamp-$PID"

foreach ($swapPath in @($StagedOrquestrador, $PreviousOrquestrador)) {
  if (-not (Test-PathUnderRoot -Path $swapPath -Root $HomePath)) {
    throw "Refusing install staging outside home: $swapPath"
  }
  if (Test-Path -LiteralPath $swapPath) {
    Remove-Item -LiteralPath $swapPath -Recurse -Force
  }
}

try {
  Copy-TreeWithPlaceholders -SourceDir $SourceOrquestrador -DestinationDir $StagedOrquestrador
  New-Item -ItemType Directory -Force -Path (Join-Path $StagedOrquestrador "logs") | Out-Null

  $stagedManifestPath = Join-Path $StagedOrquestrador "SKILLS_MANIFEST.json"
  if (-not (Test-Path -LiteralPath $stagedManifestPath)) {
    throw "Staged Maestro bundle is missing SKILLS_MANIFEST.json"
  }
  $stagedManifest = Get-Content -Raw -LiteralPath $stagedManifestPath | ConvertFrom-Json
  if ($stagedManifest.version -ne 3) {
    throw "Staged Maestro manifest must be V3; received $($stagedManifest.version)"
  }
  $stagedSkills = @($stagedManifest.skills.PSObject.Properties)
  if ($stagedSkills.Count -eq 0) {
    throw "Staged Maestro manifest has no canonical skills"
  }
  foreach ($skill in $stagedSkills) {
    if ($skill.Value.schemaVersion -ne 2 -or -not $skill.Value.contractVersion) {
      throw "Staged Maestro skill $($skill.Name) is not native Skill Contract V2"
    }
  }

  $previousMoved = $false
  if (Test-Path -LiteralPath $TargetOrquestrador) {
    if (-not (Test-PathUnderRoot -Path $TargetOrquestrador -Root $HomePath)) {
      throw "Refusing to replace target outside home: $TargetOrquestrador"
    }
    Move-Item -LiteralPath $TargetOrquestrador -Destination $PreviousOrquestrador
    $previousMoved = $true
  }

  try {
    Move-Item -LiteralPath $StagedOrquestrador -Destination $TargetOrquestrador
  } catch {
    if ($previousMoved -and -not (Test-Path -LiteralPath $TargetOrquestrador) -and (Test-Path -LiteralPath $PreviousOrquestrador)) {
      Move-Item -LiteralPath $PreviousOrquestrador -Destination $TargetOrquestrador
    }
    throw
  }

  if (Test-Path -LiteralPath $PreviousOrquestrador) {
    Remove-Item -LiteralPath $PreviousOrquestrador -Recurse -Force
  }
} finally {
  if (Test-Path -LiteralPath $StagedOrquestrador) {
    Remove-Item -LiteralPath $StagedOrquestrador -Recurse -Force
  }
}

Copy-WithPlaceholders -SourceFile $SourceAgents -DestinationFile $TargetAgents

foreach ($target in $extraTargets) {
  Copy-TreeWithPlaceholders -SourceDir $target.Source -DestinationDir $target.Destination
}
foreach ($target in $extraFileTargets) {
  Copy-WithPlaceholders -SourceFile $target.Source -DestinationFile $target.Destination
}

if (-not $SkipSkillSync) {
  $syncScript = Join-Path $TargetOrquestrador "sync-skills.ps1"
  if (Test-Path -LiteralPath $syncScript) {
    $syncArgs = @("-Apply", "-HomePath", $HomePath)
    if ($SelectedComponents.Count -gt 0) {
      $syncArgs += "-Only"
      $syncArgs += ($SelectedComponents -join ",")
    }
    & (Get-HostPowerShell) -NoProfile -ExecutionPolicy Bypass -File $syncScript @syncArgs
  }
}

$discoveryScript = Join-Path $RepoRoot "scripts\discover-skills.js"
if (Test-Path -LiteralPath $discoveryScript) {
  & node $discoveryScript --home-path $HomePath --maestro-root $TargetOrquestrador --output (Join-Path $TargetOrquestrador "SKILLS_DISCOVERY.json")
}

[pscustomobject]@{
  HomePath = if ($VerbosePaths) { $HomePath } else { "[redacted]" }
  InstalledOrquestrador = if ($VerbosePaths) { $TargetOrquestrador } else { $TargetOrquestradorName }
  InstalledAgents = if ($VerbosePaths) { $TargetAgents } else { "AGENTS.md" }
  Backup = if (Test-Path -LiteralPath $BackupDir) { if ($VerbosePaths) { $BackupDir } else { "[created]" } } else { $null }
  SkillSync = -not $SkipSkillSync
  ToolProfiles = $InstallToolProfiles
  ExtraSkillTargets = $extraTargets.Count
} | Format-List
