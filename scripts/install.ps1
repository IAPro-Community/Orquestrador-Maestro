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

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$SourceOrquestrador = Join-Path $RepoRoot "orquestrador"
$SourceAgents = Join-Path $RepoRoot "home\AGENTS.md"
$SourceCodex = Join-Path $RepoRoot "codex"
$SourceCommunitySkills = Join-Path $RepoRoot "skill-library\community-skills"
$SourceToolProfiles = Join-Path $RepoRoot "tool-profiles"
$TargetOrquestrador = Join-Path $HomePath ".orquestrador"
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
    $content = $content.Replace("{{USER_HOME}}", $homeForText)
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
      Label = ".orquestrador"
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
    if (Test-SelectedComponent -Names @("skills", "community-skills", "codex", "agents", "claude", "opencode", "cursor", "gemini", "windsurf", "antigravity", "mimo", "kimi", "grok")) {
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
    @{ Source = "codex"; Destination = ".codex"; Label = ".codex__profile"; Component = "codex" },
    @{ Source = "opencode"; Destination = ".opencode"; Label = ".opencode"; Component = "opencode" },
    @{ Source = "opencode-global"; Destination = ".config\opencode"; Label = ".config__opencode"; Component = "opencode" },
    @{ Source = "claude"; Destination = ".claude"; Label = ".claude"; Component = "claude" },
    @{ Source = "cursor"; Destination = ".cursor"; Label = ".cursor"; Component = "cursor" },
    @{ Source = "gemini"; Destination = ".gemini"; Label = ".gemini"; Component = "gemini" },
    @{ Source = "windsurf"; Destination = ".windsurf"; Label = ".windsurf"; Component = "windsurf" },
    @{ Source = "windsurf-global"; Destination = ".codeium\windsurf\memories"; Label = ".codeium__windsurf__memories"; Component = "windsurf" },
    @{ Source = "antigravity"; Destination = ".antigravity"; Label = ".antigravity"; Component = "antigravity" },
    @{ Source = "ai-standards"; Destination = ".ai-standards"; Label = ".ai-standards"; Component = "antigravity" },
    @{ Source = "mimo"; Destination = ".mimo"; Label = ".mimo"; Component = "mimo" },
    @{ Source = "kimi"; Destination = ".kimi-code"; Label = ".kimi-code"; Component = "kimi" },
    @{ Source = "grok"; Destination = ".grok"; Label = ".grok"; Component = "grok" }
  )
  foreach ($target in $toolProfileTargets) {
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
    Add-InstallFileTarget `
      -Targets $extraFileTargets `
      -Source (Join-Path $SourceToolProfiles "antigravity-home\antigravity-rules.json") `
      -Destination (Join-Path $HomePath "antigravity-rules.json") `
      -Label "antigravity-rules.json" `
      -Component "antigravity"
  }
}

if ($ListTargets -or $DryRun) {
  $mode = if ($Uninstall) { "uninstall-plan" } elseif ($DryRun) { "dry-run" } else { "list" }
  Write-InstallPlan -CoreTargets $coreTargets -DirectoryTargets $extraTargets.ToArray() -FileTargets $extraFileTargets.ToArray() -Mode $mode
  if ($DryRun -or $ListTargets) {
    return
  }
}

if ($Uninstall) {
  if ($includeCore) {
    Backup-MappedDirectory -SourceDir $SourceOrquestrador -DestinationDir $TargetOrquestrador -Label ".orquestrador"
    Backup-MappedFile -DestinationFile $TargetAgents -Label "AGENTS.md"
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

  [pscustomobject]@{
    HomePath = if ($VerbosePaths) { $HomePath } else { "[redacted]" }
    UninstalledCore = $includeCore
    Backup = if (Test-Path -LiteralPath $BackupDir) { if ($VerbosePaths) { $BackupDir } else { "[created]" } } else { $null }
    ExtraTargets = $extraTargets.Count
    FileTargets = $extraFileTargets.Count
  } | Format-List
  return
}

Backup-MappedDirectory -SourceDir $SourceOrquestrador -DestinationDir $TargetOrquestrador -Label ".orquestrador"
Backup-MappedFile -DestinationFile $TargetAgents -Label "AGENTS.md"
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

if (Test-Path -LiteralPath $TargetOrquestrador) {
  if (-not (Test-PathUnderRoot -Path $TargetOrquestrador -Root $HomePath)) {
    throw "Refusing to remove target outside home: $TargetOrquestrador"
  }
  Remove-Item -LiteralPath $TargetOrquestrador -Recurse -Force
}

Copy-TreeWithPlaceholders -SourceDir $SourceOrquestrador -DestinationDir $TargetOrquestrador
Copy-WithPlaceholders -SourceFile $SourceAgents -DestinationFile $TargetAgents
New-Item -ItemType Directory -Force -Path (Join-Path $TargetOrquestrador "logs") | Out-Null

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
    & powershell -NoProfile -ExecutionPolicy Bypass -File $syncScript @syncArgs
  }
}

[pscustomobject]@{
  HomePath = if ($VerbosePaths) { $HomePath } else { "[redacted]" }
  InstalledOrquestrador = if ($VerbosePaths) { $TargetOrquestrador } else { ".orquestrador" }
  InstalledAgents = if ($VerbosePaths) { $TargetAgents } else { "AGENTS.md" }
  Backup = if (Test-Path -LiteralPath $BackupDir) { if ($VerbosePaths) { $BackupDir } else { "[created]" } } else { $null }
  SkillSync = -not $SkipSkillSync
  ToolProfiles = $InstallToolProfiles
  ExtraSkillTargets = $extraTargets.Count
} | Format-List
