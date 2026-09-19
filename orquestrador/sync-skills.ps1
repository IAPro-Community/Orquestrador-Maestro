param(
  [switch]$Check,
  [switch]$DryRun,
  [switch]$Apply,
  [string]$HomePath = [Environment]::GetFolderPath("UserProfile"),
  [string[]]$Only = @()
)

$ErrorActionPreference = "Stop"

if (-not $Check -and -not $DryRun -and -not $Apply) {
  $Check = $true
}

$OnlyPrograms = @(
  $Only |
    ForEach-Object { $_ -split "," } |
    ForEach-Object { $_.Trim().ToLowerInvariant() } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
) | Select-Object -Unique

function Test-ShouldSyncTarget {
  param([string]$Program)
  if ($OnlyPrograms.Count -eq 0) { return $true }
  $normalized = $Program.ToLowerInvariant()
  if ($normalized -eq "agents" -and $OnlyPrograms -contains "freebuff") { return $true }
  return $OnlyPrograms -contains $normalized
}

function Get-DefaultInstallPolicy {
  return [pscustomobject]@{
    libraryRoots = [pscustomobject]@{
      community = ".orquestrador/skill-library/community-skills"
      codex = ".orquestrador/skill-library/codex-skills"
      disabledNative = ".orquestrador/skill-library/disabled-native"
    }
    nativeRoots = [pscustomobject]@{
      codex = [pscustomobject]@{
        path = ".codex/skills"
        maxDirectories = 64
        allowDirectories = @(
          ".system",
          "ask-claude",
          "ask-gemini",
          "autopilot",
          "cancel",
          "code-review",
          "deep-interview",
          "doctor",
          "orquestrador-maestro",
          "plan",
          "ralplan",
          "ralph",
          "security-review",
          "team",
          "ultrawork",
          "web-clone",
          "worker"
        )
      }
      opencode = [pscustomobject]@{ path = ".opencode/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "code-review", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker") }
      agents = [pscustomobject]@{ path = ".agents/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker") }
      claude = [pscustomobject]@{ path = ".claude/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker") }
      cursor = [pscustomobject]@{ path = ".cursor/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker") }
      gemini = [pscustomobject]@{ path = ".gemini/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker") }
      windsurf = [pscustomobject]@{ path = ".windsurf/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker") }
      antigravity = [pscustomobject]@{ path = ".antigravity-skills/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker") }
    }
  }
}

function Read-InstallPolicy {
  param([string]$HomePath)
  $policyRoot = if ($script:MaestroRoot) { $script:MaestroRoot } elseif (Test-Path -LiteralPath (Join-Path $HomePath ".orquestrador-maestro")) { Join-Path $HomePath ".orquestrador-maestro" } else { Join-Path $HomePath ".orquestrador" }
  $policyPath = Join-Path $policyRoot "SKILL_INSTALL_POLICY.json"
  if (Test-Path -LiteralPath $policyPath) {
    try {
      return Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
      return Get-DefaultInstallPolicy
    }
  }
  return Get-DefaultInstallPolicy
}

function Resolve-HomeRelativePath {
  param([string]$HomePath, [string]$RelativePath)
  $clean = $RelativePath -replace "/", "\"
  if ($clean.StartsWith(".orquestrador\", [StringComparison]::OrdinalIgnoreCase)) {
    $clean = $clean.Substring(".orquestrador\".Length)
    return Join-Path $script:MaestroRoot $clean
  }
  return Join-Path $HomePath $clean
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

function Get-SkillSource {
  param([string]$Name, [string[]]$Roots)
  foreach ($root in $Roots) {
    $candidate = Join-Path $root $Name
    if (Test-Path -LiteralPath (Join-Path $candidate "SKILL.md")) {
      return $candidate
    }
  }
  return $null
}

function Get-DirectorySource {
  param([string]$Name, [string[]]$Roots)
  foreach ($root in $Roots) {
    $candidate = Join-Path $root $Name
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  return $null
}

function Test-DirectoryDifferent {
  param([string]$SourceDir, [string]$DestDir)
  if (-not (Test-Path -LiteralPath $DestDir)) {
    return $true
  }
  $sourceRoot = Get-FullPath -Path $SourceDir
  $destRoot = Get-FullPath -Path $DestDir
  $sourceFiles = Get-ChildItem -LiteralPath $SourceDir -File -Recurse -Force | ForEach-Object {
    [pscustomobject]@{
      Relative = (Get-FullPath -Path $_.FullName).Substring($sourceRoot.Length).TrimStart("\")
      Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
  }
  $destFiles = Get-ChildItem -LiteralPath $DestDir -File -Recurse -Force | ForEach-Object {
    [pscustomobject]@{
      Relative = (Get-FullPath -Path $_.FullName).Substring($destRoot.Length).TrimStart("\")
      Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
  }
  $sourceMap = @{}
  foreach ($file in $sourceFiles) { $sourceMap[$file.Relative] = $file.Hash }
  $destMap = @{}
  foreach ($file in $destFiles) { $destMap[$file.Relative] = $file.Hash }
  if ($sourceMap.Count -ne $destMap.Count) { return $true }
  foreach ($key in $sourceMap.Keys) {
    if (-not $destMap.ContainsKey($key)) { return $true }
    if ($destMap[$key] -ne $sourceMap[$key]) { return $true }
  }
  return $false
}

function Copy-ManagedDirectory {
  param([string]$SourceDir, [string]$DestDir, [string]$TargetRoot)
  if ((Test-Path -LiteralPath $DestDir) -and (Test-PathUnderRoot -Path $DestDir -Root $TargetRoot)) {
    Remove-Item -LiteralPath $DestDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
  Get-ChildItem -LiteralPath $SourceDir -Force | Copy-Item -Destination $DestDir -Recurse -Force
}

function Move-NativeExtraDirectory {
  param(
    [string]$SourceDir,
    [string]$TargetRoot,
    [string]$DisabledRoot,
    [string]$Program,
    [string]$Stamp
  )
  if (-not (Test-Path -LiteralPath $SourceDir)) { return $null }
  if (-not (Test-PathUnderRoot -Path $SourceDir -Root $TargetRoot)) {
    throw "Refusing to move native skill outside target root: $SourceDir"
  }
  $programRoot = Join-Path (Join-Path $DisabledRoot $Program) $Stamp
  New-Item -ItemType Directory -Force -Path $programRoot | Out-Null
  $leaf = Split-Path -Leaf $SourceDir
  $destination = Join-Path $programRoot $leaf
  $suffix = 1
  while (Test-Path -LiteralPath $destination) {
    $destination = Join-Path $programRoot ($leaf + "-" + $suffix)
    $suffix += 1
  }
  if (-not (Test-PathUnderRoot -Path $destination -Root $DisabledRoot)) {
    throw "Refusing to move native skill outside disabled root: $destination"
  }
  Move-Item -LiteralPath $SourceDir -Destination $destination
  return $destination
}

$canonicalMaestroRoot = Join-Path $HomePath ".orquestrador-maestro"
$legacyMaestroRoot = Join-Path $HomePath ".orquestrador"
$script:MaestroRoot = if (Test-Path -LiteralPath $canonicalMaestroRoot) { $canonicalMaestroRoot } else { $legacyMaestroRoot }
$policy = Read-InstallPolicy -HomePath $HomePath
$libraryRoots = [pscustomobject]@{
  Community = Resolve-HomeRelativePath -HomePath $HomePath -RelativePath $policy.libraryRoots.community
  Codex = Resolve-HomeRelativePath -HomePath $HomePath -RelativePath $policy.libraryRoots.codex
  DisabledNative = Resolve-HomeRelativePath -HomePath $HomePath -RelativePath $policy.libraryRoots.disabledNative
}

$canonicalSourceRoots = @(
  (Join-Path $script:MaestroRoot "skills"),
  (Join-Path $HomePath ".global-skills"),
  $libraryRoots.Community,
  (Join-Path $HomePath ".codex\skills"),
  $libraryRoots.Codex
) | Where-Object { Test-Path -LiteralPath $_ }

$codexManagedSourceRoots = @(
  (Join-Path $HomePath ".codex\skills"),
  $libraryRoots.Codex
) | Where-Object { Test-Path -LiteralPath $_ }

$targets = @()
foreach ($prop in $policy.nativeRoots.PSObject.Properties) {
  $targets += [pscustomobject]@{
    Program = $prop.Name
    Root = Resolve-HomeRelativePath -HomePath $HomePath -RelativePath $prop.Value.path
    MaxDirectories = [int]$prop.Value.maxDirectories
    AllowDirectories = @($prop.Value.allowDirectories)
  }
}

$manifestPath = Join-Path $script:MaestroRoot "SKILLS_MANIFEST.json"
if (Test-Path -LiteralPath $manifestPath) {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $mustHave = @(
    $manifest.skills.PSObject.Properties |
      Where-Object { $_.Value.mirrorEverywhere -eq $true } |
      ForEach-Object { $_.Name } |
      Sort-Object
  )
} else {
  $mustHave = @(
    "skill-saas-factory",
    "skill-saas-security-scan",
    "skill-ai-orchestration",
    "skill-multiagent-orchestration",
    "skill-quality-gate",
    "skill-repo-health",
    "skill-preflight",
    "skill-systematic-debugging",
    "skill-verification-before-completion",
    "skill-webapp-testing",
    "skill-release-engineering",
    "skill-adr",
    "skill-research-and-synthesis",
    "skill-frontend-excellence"
  )
}

# OpenCode, Claude and the other routed clients also load the shared default
# skill from their global instruction files. Keep it in every mirror even
# though it is maintained with the Codex-native skill sources.
$mustHave = @("orquestrador-maestro") + @($mustHave | Where-Object { $_ -ne "orquestrador-maestro" })

$report = New-Object System.Collections.Generic.List[object]
$offloadStamp = Get-Date -Format "yyyyMMdd-HHmmss"

foreach ($target in ($targets | Sort-Object Program)) {
  if (-not (Test-ShouldSyncTarget -Program $target.Program)) { continue }
  $targetExists = Test-Path -LiteralPath $target.Root

  foreach ($skill in $mustHave) {
    $src = Get-SkillSource -Name $skill -Roots $canonicalSourceRoots
    $dest = Join-Path $target.Root $skill
    $exists = Test-Path -LiteralPath (Join-Path $dest "SKILL.md")
    $different = if ($src -and $targetExists -and $exists) { Test-DirectoryDifferent -SourceDir $src -DestDir $dest } else { $false }
    $action = if (-not $src) { "missing-source" } elseif (-not $targetExists) { "missing-target" } elseif (-not $exists) { "copy" } elseif ($different) { "update" } else { "ok" }

    if ($Apply -and $src -and ($action -in @("missing-target", "copy", "update"))) {
      New-Item -ItemType Directory -Force -Path $target.Root | Out-Null
      Copy-ManagedDirectory -SourceDir $src -DestDir $dest -TargetRoot $target.Root
      $targetExists = $true
      $action = "applied"
    }

    $report.Add([pscustomobject]@{
      Program = $target.Program
      Target = $target.Root
      Type = "canonical"
      Item = $skill
      Source = $src
      Action = $action
      Detail = $null
    })
  }

  if ($target.AllowDirectories.Count -gt 0) {
    $managedRoots = if ($target.Program -eq "codex") { $codexManagedSourceRoots } else { $canonicalSourceRoots }
    foreach ($name in ($target.AllowDirectories | Where-Object { $_ -notin $mustHave } | Sort-Object)) {
      $src = Get-DirectorySource -Name $name -Roots $managedRoots
      $dest = Join-Path $target.Root $name
      $exists = Test-Path -LiteralPath $dest
      $different = if ($src -and $targetExists -and $exists) { Test-DirectoryDifferent -SourceDir $src -DestDir $dest } else { $false }
      $action = if (-not $src) { "missing-source" } elseif (-not $targetExists) { "missing-target" } elseif (-not $exists) { "copy" } elseif ($different) { "update" } else { "ok" }

      if ($Apply -and $src -and ($action -in @("missing-target", "copy", "update"))) {
        New-Item -ItemType Directory -Force -Path $target.Root | Out-Null
        Copy-ManagedDirectory -SourceDir $src -DestDir $dest -TargetRoot $target.Root
        $targetExists = $true
        $action = "applied"
      }

      $report.Add([pscustomobject]@{
        Program = $target.Program
        Target = $target.Root
        Type = "native-compatibility"
        Item = $name
        Source = $src
        Action = $action
        Detail = $null
      })
    }
  }

  if (Test-Path -LiteralPath $target.Root) {
    $allowed = @{}
    foreach ($skill in $mustHave) { $allowed[$skill] = $true }
    foreach ($name in $target.AllowDirectories) { $allowed[$name] = $true }

    foreach ($dir in Get-ChildItem -LiteralPath $target.Root -Directory -Force | Sort-Object Name) {
      if ($allowed.ContainsKey($dir.Name)) { continue }

      $action = "extra-native"
      $detail = $null
      if ($Apply) {
        $detail = Move-NativeExtraDirectory `
          -SourceDir $dir.FullName `
          -TargetRoot $target.Root `
          -DisabledRoot $libraryRoots.DisabledNative `
          -Program $target.Program `
          -Stamp $offloadStamp
        $action = "offloaded"
      }

      $report.Add([pscustomobject]@{
        Program = $target.Program
        Target = $target.Root
        Type = "native-prune"
        Item = $dir.Name
        Source = $dir.FullName
        Action = $action
        Detail = $detail
      })
    }
  }
}

$report |
  Sort-Object Program, Type, Item |
  Format-Table Program, Type, Item, Action, Target, Detail -AutoSize
