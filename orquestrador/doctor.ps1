param(
  [string]$HomePath = [Environment]::GetFolderPath("UserProfile"),
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$canonicalMaestroRoot = Join-Path $HomePath ".orquestrador"
$legacyMaestroRoot = Join-Path $HomePath ".orquestrador-maestro"
$script:MaestroRoot = if (Test-Path -LiteralPath $canonicalMaestroRoot) { $canonicalMaestroRoot } else { $legacyMaestroRoot }

function Test-FileMojibake {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
  if ($null -eq $text) { return 0 }
  $patterns = @(
    'Ã[\u0080-\u00BF]',
    'â[\u0080-\u00BF]{1,2}',
    'ð[\u0080-\u00BF]{1,3}',
    [regex]::Escape([string][char]0xFFFD)
  )
  $count = 0
  foreach ($pattern in $patterns) {
    $count += ([regex]::Matches($text, $pattern)).Count
  }
  return $count
}

function Get-SkillFrontmatterValue {
  param([string]$Text, [string]$Key)
  $pattern = "(?m)^" + [regex]::Escape($Key) + ":\s*(.+?)\s*$"
  $match = [regex]::Match($Text, $pattern)
  if ($match.Success) { return $match.Groups[1].Value.Trim() }
  return $null
}

function Get-CanonicalSkillQuality {
  param([string]$Root)
  if (-not (Test-Path -LiteralPath $Root)) { return @() }
  Get-ChildItem -LiteralPath $Root -Directory | ForEach-Object {
    $skillPath = Join-Path $_.FullName "SKILL.md"
    $exists = Test-Path -LiteralPath $skillPath
    $text = if ($exists) { Get-Content -LiteralPath $skillPath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue } else { "" }
    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($key in @("name", "description", "category", "risk", "source")) {
      if (-not (Get-SkillFrontmatterValue -Text $text -Key $key)) {
        $missing.Add($key)
      }
    }
    $hasTodo = $text -match "(?i)\b(todo|stub|placeholder|a preencher)\b"
    [pscustomobject]@{
      Skill = $_.Name
      Path = $skillPath
      Exists = $exists
      MissingMetadata = @($missing)
      HasTodoMarker = [bool]$hasTodo
      MojibakeHits = if ($exists) { Test-FileMojibake -Path $skillPath } else { $null }
    }
  }
}

function Get-SkillMirrorDrift {
  param([string]$CanonicalRoot, [object[]]$Targets)
  if (-not (Test-Path -LiteralPath $CanonicalRoot)) { return @() }
  $skills = Get-ChildItem -LiteralPath $CanonicalRoot -Directory
  foreach ($target in $Targets) {
    $syncState = $null
    $syncHelper = Join-Path $script:MaestroRoot "bin\sync-managed-skill.js"
    if ((Test-Path -LiteralPath $syncHelper) -and (Get-Command node -ErrorAction SilentlyContinue)) {
      try {
        $stateRaw = & node $syncHelper inspect-root $target 2>$null
        if ($LASTEXITCODE -eq 0 -and $stateRaw) { $syncState = $stateRaw | ConvertFrom-Json }
      } catch { $syncState = $null }
    }
    foreach ($skill in $skills) {
      $targetDir = Join-Path $target $skill.Name
      $targetSkill = Join-Path $targetDir "SKILL.md"
      $exists = Test-Path -LiteralPath $targetSkill
      $different = $false
      if ((Test-Path -LiteralPath $skill.FullName) -and (Test-Path -LiteralPath $targetDir)) {
        $sourceRoot = [System.IO.Path]::GetFullPath($skill.FullName)
        $targetRoot = [System.IO.Path]::GetFullPath($targetDir)
        $sourceFiles = Get-ChildItem -LiteralPath $skill.FullName -File -Recurse -Force | ForEach-Object {
          [pscustomobject]@{
            Relative = [System.IO.Path]::GetFullPath($_.FullName).Substring($sourceRoot.Length).TrimStart("\")
            Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
          }
        }
        $targetFiles = Get-ChildItem -LiteralPath $targetDir -File -Recurse -Force | ForEach-Object {
          [pscustomobject]@{
            Relative = [System.IO.Path]::GetFullPath($_.FullName).Substring($targetRoot.Length).TrimStart("\")
            Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
          }
        }
        $sourceMap = @{}
        foreach ($file in $sourceFiles) { $sourceMap[$file.Relative] = $file.Hash }
        $targetMap = @{}
        foreach ($file in $targetFiles) { $targetMap[$file.Relative] = $file.Hash }
        if ($sourceMap.Count -ne $targetMap.Count) {
          $different = $true
        } else {
          foreach ($key in $sourceMap.Keys) {
            if ((-not $targetMap.ContainsKey($key)) -or ($targetMap[$key] -ne $sourceMap[$key])) {
              $different = $true
              break
            }
          }
        }
      }
      [pscustomobject]@{
        Target = $target
        Skill = $skill.Name
        Exists = $exists
        Different = $different
        KnownCustomization = [bool]($syncState -and ($syncState.Customizations -contains $skill.Name))
      }
    }
  }
}

function Read-JsonDocument {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{ Name = $Name; Path = $Path; Exists = $false; Parsed = $false; Value = $null; Error = "missing" }
  }
  try {
    $value = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    return [pscustomobject]@{ Name = $Name; Path = $Path; Exists = $true; Parsed = $true; Value = $value; Error = $null }
  } catch {
    return [pscustomobject]@{ Name = $Name; Path = $Path; Exists = $true; Parsed = $false; Value = $null; Error = $_.Exception.Message }
  }
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
          "worker",
        "skill-open-code-review",
        "skill-open-code-delegate"
        )
        }
      opencode = [pscustomobject]@{ path = ".opencode/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "code-review", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker", "skill-open-code-review", "skill-open-code-delegate") }
      agents = [pscustomobject]@{ path = ".agents/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker", "skill-open-code-review", "skill-open-code-delegate") }
      claude = [pscustomobject]@{ path = ".claude/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker", "skill-open-code-review", "skill-open-code-delegate") }
      cursor = [pscustomobject]@{ path = ".cursor/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker", "skill-open-code-review", "skill-open-code-delegate") }
      gemini = [pscustomobject]@{ path = ".gemini/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker", "skill-open-code-review", "skill-open-code-delegate") }
      windsurf = [pscustomobject]@{ path = ".windsurf/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker", "skill-open-code-review", "skill-open-code-delegate") }
      antigravity = [pscustomobject]@{ path = ".antigravity-skills/skills"; maxDirectories = 64; allowDirectories = @("orquestrador-maestro", "plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview", "security-review", "web-clone", "worker", "skill-open-code-review", "skill-open-code-delegate") }
    }
  }
}

function Get-InstallPolicy {
  param([string]$HomePath)
  $path = Join-Path $script:MaestroRoot "SKILL_INSTALL_POLICY.json"
  if (Test-Path -LiteralPath $path) {
    try {
      return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
      return Get-DefaultInstallPolicy
    }
  }
  return Get-DefaultInstallPolicy
}

function Get-ManagedFilesHealth {
  param([string]$Root)
  $manifestPath = Join-Path $Root "MANAGED_FILES.json"
  $missing = New-Object System.Collections.Generic.List[string]
  $modified = New-Object System.Collections.Generic.List[string]
  $customizations = New-Object System.Collections.Generic.List[string]
  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$manifest.version -lt 2 -or -not $manifest.files) {
      throw "unsupported manifest"
    }
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    foreach ($entry in $manifest.files.PSObject.Properties) {
      $relative = [string]$entry.Name
      $parts = $relative -split "/"
      $invalidPart = @($parts | Where-Object { $_ -in @("", ".", "..") }).Count -gt 0
      if ([string]::IsNullOrWhiteSpace($relative) -or $relative.Contains("\") -or $relative.Contains(":") -or
          $invalidPart) {
        $modified.Add($relative)
        continue
      }
      $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root ($relative -replace "/", "\")))
      if (-not $candidate.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        $modified.Add($relative)
        continue
      }
      if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $missing.Add($relative)
        continue
      }
      $item = Get-Item -LiteralPath $candidate -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        $modified.Add($relative)
        continue
      }
      $digest = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
      $expected = if ([int]$manifest.version -ge 3) { [string]$entry.Value.sourceSha256 } else { [string]$entry.Value.sha256 }
      if (-not $expected) { $expected = [string]$entry.Value.sha256 }
      if ($expected -notmatch "^[a-fA-F0-9]{64}$") {
        $modified.Add($relative)
        continue
      }
      if ($digest -ne $expected.ToLowerInvariant()) {
        $override = $null
        if ($manifest.overrides) {
          $override = $manifest.overrides.PSObject.Properties | Where-Object { $_.Name -ceq $relative } | Select-Object -First 1
        }
        if ([int]$manifest.version -ge 3 -and $override -and ([string]$override.Value.installedSha256).ToLowerInvariant() -eq $digest) {
          $customizations.Add($relative)
        } else {
          $modified.Add($relative)
        }
      }
    }
    return [pscustomobject]@{
      Version = [int]$manifest.version
      Supported = $true
      Missing = @($missing | Sort-Object -Unique)
      Modified = @($modified | Sort-Object -Unique)
      Customizations = @($customizations | Sort-Object -Unique)
    }
  } catch {
    return [pscustomobject]@{ Version = $null; Supported = $false; Missing = @(); Modified = @(); Customizations = @(); Error = $_.Exception.Message }
  }
}

function Add-RoutingIssue {
  param([System.Collections.Generic.List[object]]$Issues, [string]$Kind, [string]$Name, [string]$Detail)
  $Issues.Add([pscustomobject]@{
    Kind = $Kind
    Name = $Name
    Detail = $Detail
  })
}

function Convert-MaestroPathForHost {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $Value }
  if ($env:OS -eq "Windows_NT") {
    if ($Value -match "^/mnt/([A-Za-z])/(.*)$") { return "$($Matches[1]):\$($Matches[2] -replace '/', '\')" }
    if ($Value -match "^/([A-Za-z])/(.*)$") { return "$($Matches[1]):\$($Matches[2] -replace '/', '\')" }
  }
  return $Value -replace "/", "\"
}

function Get-OrchestratorRoutingHealth {
  param([string]$HomePath, [string]$CanonicalSkillsRoot)
  $root = $script:MaestroRoot
  $docs = @(
    (Read-JsonDocument -Path (Join-Path $root "SKILLS_ROUTER.json") -Name "router"),
    (Read-JsonDocument -Path (Join-Path $root "SKILL_ALIASES.json") -Name "aliases"),
    (Read-JsonDocument -Path (Join-Path $root "SKILL_CHAINS.json") -Name "chains"),
    (Read-JsonDocument -Path (Join-Path $root "SKILL_EXECUTION_PROFILES.json") -Name "profiles"),
    (Read-JsonDocument -Path (Join-Path $root "SKILL_USAGE_SCHEMA.json") -Name "usageSchema")
  )
  $issues = New-Object System.Collections.Generic.List[object]
  foreach ($doc in $docs) {
    if (-not $doc.Exists) { Add-RoutingIssue -Issues $issues -Kind "json-missing" -Name $doc.Name -Detail $doc.Path }
    elseif (-not $doc.Parsed) { Add-RoutingIssue -Issues $issues -Kind "json-invalid" -Name $doc.Name -Detail $doc.Error }
  }

  $skillNames = @()
  if (Test-Path -LiteralPath $CanonicalSkillsRoot) {
    $skillNames = @(Get-ChildItem -LiteralPath $CanonicalSkillsRoot -Directory | Where-Object {
      Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md")
    } | Select-Object -ExpandProperty Name)
  }
  $skillSet = @{}
  foreach ($name in $skillNames) { $skillSet[$name] = $true }

  $routerDoc = $docs | Where-Object { $_.Name -eq "router" }
  $routerNames = @()
  $routerSet = @{}
  if ($routerDoc.Parsed -and $routerDoc.Value.skills) {
    foreach ($prop in $routerDoc.Value.skills.PSObject.Properties) {
      $routerNames += $prop.Name
      $routerSet[$prop.Name] = $true
      if (-not $skillSet.ContainsKey($prop.Name)) {
        Add-RoutingIssue -Issues $issues -Kind "router-unknown-skill" -Name $prop.Name -Detail "No canonical skill directory with SKILL.md"
      }
      foreach ($field in @("description","triggers","canonicalPath","codexPath","cost","safety")) {
        if (-not $prop.Value.PSObject.Properties[$field]) {
          Add-RoutingIssue -Issues $issues -Kind "router-missing-field" -Name $prop.Name -Detail $field
        }
      }
      if ($prop.Value.canonicalPath) {
        $canonicalPath = Convert-MaestroPathForHost ([string]$prop.Value.canonicalPath)
        if (-not (Test-Path -LiteralPath $canonicalPath)) {
          Add-RoutingIssue -Issues $issues -Kind "router-bad-path" -Name $prop.Name -Detail $prop.Value.canonicalPath
        }
      }
    }
  }
  foreach ($name in $skillNames) {
    if (-not $routerSet.ContainsKey($name)) {
      Add-RoutingIssue -Issues $issues -Kind "canonical-skill-unrouted" -Name $name -Detail "Missing from SKILLS_ROUTER.json"
    }
  }

  $aliasesDoc = $docs | Where-Object { $_.Name -eq "aliases" }
  $aliasCount = 0
  if ($aliasesDoc.Parsed -and $aliasesDoc.Value.aliases) {
    foreach ($prop in $aliasesDoc.Value.aliases.PSObject.Properties) {
      $aliasCount++
      if (-not $routerSet.ContainsKey([string]$prop.Value)) {
        Add-RoutingIssue -Issues $issues -Kind "alias-bad-target" -Name $prop.Name -Detail ([string]$prop.Value)
      }
    }
  }

  $chainsDoc = $docs | Where-Object { $_.Name -eq "chains" }
  $chainCount = 0
  if ($chainsDoc.Parsed -and $chainsDoc.Value.chains) {
    foreach ($prop in $chainsDoc.Value.chains.PSObject.Properties) {
      $chainCount++
      if (-not $routerSet.ContainsKey($prop.Name)) {
        Add-RoutingIssue -Issues $issues -Kind "chain-unknown-primary" -Name $prop.Name -Detail "Primary skill is not in router"
      }
      foreach ($target in @($prop.Value.mayInvoke)) {
        if (-not $routerSet.ContainsKey([string]$target)) {
          Add-RoutingIssue -Issues $issues -Kind "chain-bad-target" -Name $prop.Name -Detail ([string]$target)
        }
      }
    }
  }

  $profilesDoc = $docs | Where-Object { $_.Name -eq "profiles" }
  $profileCount = 0
  if ($profilesDoc.Parsed -and $profilesDoc.Value.profiles) {
    # Profiles may start with a native Codex/OMX workflow skill that is
    # intentionally outside the canonical Orquestrador router.
    $nativeStartSkills = @(
      "orquestrador-maestro", "autopilot", "code-review", "deep-interview",
      "plan", "ralph", "ralplan", "security-review", "team", "ultrawork",
      "web-clone"
    )
    foreach ($prop in $profilesDoc.Value.profiles.PSObject.Properties) {
      $profileCount++
      $maxSkills = $prop.Value.maxSkills
      if (($null -eq $maxSkills) -or ([int]$maxSkills -lt 1) -or ([int]$maxSkills -gt 8)) {
        Add-RoutingIssue -Issues $issues -Kind "profile-bad-maxSkills" -Name $prop.Name -Detail ([string]$maxSkills)
      }
      if ($prop.Value.startSkill -and
          (-not $routerSet.ContainsKey([string]$prop.Value.startSkill)) -and
          ([string]$prop.Value.startSkill -notin $nativeStartSkills)) {
        Add-RoutingIssue -Issues $issues -Kind "profile-bad-startSkill" -Name $prop.Name -Detail ([string]$prop.Value.startSkill)
      }
    }
  }

  $usageSchemaDoc = $docs | Where-Object { $_.Name -eq "usageSchema" }
  if ($usageSchemaDoc.Parsed -and $usageSchemaDoc.Value.logPath) {
    $logPath = Convert-MaestroPathForHost ([string]$usageSchemaDoc.Value.logPath)
    $logDir = Split-Path -Parent $logPath
    if (-not (Test-Path -LiteralPath $logDir)) {
      Add-RoutingIssue -Issues $issues -Kind "usage-log-dir-missing" -Name "skill-usage" -Detail $logDir
    }
  }

  $jsonDocuments = @()
  foreach ($doc in $docs) {
    $jsonDocuments += [pscustomobject]@{
      Name = $doc.Name
      Path = $doc.Path
      Exists = $doc.Exists
      Parsed = $doc.Parsed
      Error = $doc.Error
    }
  }

  $issueItems = @()
  foreach ($issue in $issues) {
    $issueItems += $issue
  }

  return [pscustomobject]@{
    JsonDocuments = $jsonDocuments
    CanonicalSkillCount = $skillNames.Count
    RouterSkillCount = $routerNames.Count
    AliasCount = $aliasCount
    ChainCount = $chainCount
    ProfileCount = $profileCount
    IssueCount = $issues.Count
    Issues = $issueItems
  }
}

function Get-HookHealth {
  param([string]$HomePath)
  $specs = @(
    @{ Program = "orquestrador"; Path = (Join-Path $script:MaestroRoot "hooks.md"); MaxLines = 80 },
    @{ Program = "opencode"; Path = (Join-Path $HomePath ".opencode\hooks.md"); MaxLines = 30 },
    @{ Program = "claude"; Path = (Join-Path $HomePath ".claude\hooks.md"); MaxLines = 20 },
    @{ Program = "cursor"; Path = (Join-Path $HomePath ".cursor\hooks.md"); MaxLines = 20 },
    @{ Program = "gemini"; Path = (Join-Path $HomePath ".gemini\hooks.md"); MaxLines = 20 },
    @{ Program = "windsurf"; Path = (Join-Path $HomePath ".windsurf\hooks.md"); MaxLines = 20 }
  )

  foreach ($spec in $specs) {
    $exists = Test-Path -LiteralPath $spec.Path
    $text = if ($exists) { Get-Content -LiteralPath $spec.Path -Raw -Encoding UTF8 -ErrorAction SilentlyContinue } else { $null }
    $lineCount = if ([string]::IsNullOrEmpty($text)) { 0 } elseif ($exists) { ([regex]::Matches($text, "(`r`n|`n)")).Count + 1 } else { $null }
    $containsRouter = if ($exists) { $text -match "SKILLS_ROUTER\.json" } else { $false }
    $legacyCatalogMarker = if ($exists) { $text -match "(?i)(GLOBAL SKILLS HOOKS|Complete Skill Reference with Descriptions)" } else { $false }
    $healthy = $exists -and $containsRouter -and (-not $legacyCatalogMarker) -and ($lineCount -le [int]$spec.MaxLines)

    [pscustomobject]@{
      Program = $spec.Program
      Path = $spec.Path
      Exists = $exists
      LineCount = $lineCount
      MaxLines = [int]$spec.MaxLines
      ContainsRouter = [bool]$containsRouter
      LegacyCatalogMarker = [bool]$legacyCatalogMarker
      Healthy = [bool]$healthy
      MojibakeHits = if ($exists) { Test-FileMojibake -Path $spec.Path } else { $null }
    }
  }
}

function Get-NativeSkillRootHealth {
  param([string]$HomePath, [object]$InstallPolicy, [string[]]$CanonicalSkills, [string[]]$RequiredSkills)
  $communityLibrary = Join-Path $HomePath (($InstallPolicy.libraryRoots.community -replace "/", "\"))
  $codexLibrary = Join-Path $HomePath (($InstallPolicy.libraryRoots.codex -replace "/", "\"))
  $disabledNative = Join-Path $HomePath (($InstallPolicy.libraryRoots.disabledNative -replace "/", "\"))

  foreach ($prop in $InstallPolicy.nativeRoots.PSObject.Properties) {
    $program = $prop.Name
    $root = Join-Path $HomePath (($prop.Value.path -replace "/", "\"))
    $allow = @($CanonicalSkills + @($prop.Value.allowDirectories))
    $allowSet = @{}
    foreach ($name in $allow) { $allowSet[$name] = $true }

    $extra = @()
    $missingRequired = @()
    $count = 0
    if (Test-Path -LiteralPath $root) {
      $dirs = @(Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue)
      $count = $dirs.Count
      foreach ($dir in $dirs) {
        if (-not $allowSet.ContainsKey($dir.Name)) {
          $extra += $dir.Name
        }
      }
    }
    foreach ($skill in $RequiredSkills) {
      if (-not (Test-Path -LiteralPath (Join-Path $root "$skill\SKILL.md") -PathType Leaf)) {
        $missingRequired += $skill
      }
    }

    [pscustomobject]@{
      Program = $program
      Path = $root
      Exists = Test-Path -LiteralPath $root
      DirectoryCount = $count
      MaxDirectories = [int]$prop.Value.maxDirectories
      ExtraDirectories = $extra
      ExtraCount = $extra.Count
      MissingRequiredSkills = $missingRequired
      MissingRequiredSkillCount = $missingRequired.Count
      Healthy = (Test-Path -LiteralPath $root) -and ($count -le [int]$prop.Value.maxDirectories) -and ($missingRequired.Count -eq 0)
      CommunityLibraryExists = Test-Path -LiteralPath $communityLibrary
      CodexLibraryExists = Test-Path -LiteralPath $codexLibrary
      DisabledNativeRootExists = Test-Path -LiteralPath $disabledNative
    }
  }
}

$entrypoints = Join-Path $script:MaestroRoot "PROGRAM_ENTRYPOINTS.json"
$map = Get-Content -LiteralPath $entrypoints -Raw -Encoding UTF8 | ConvertFrom-Json

$rows = New-Object System.Collections.Generic.List[object]
foreach ($program in $map.programs.PSObject.Properties) {
  $name = $program.Name
  $value = $program.Value
  foreach ($p in @($value.primary)) {
    if ($p) {
      $win = $p -replace "/", "\"
      $rows.Add([pscustomobject]@{
        Program = $name
        Kind = "primary"
        Path = $win
        Exists = Test-Path -LiteralPath $win
        SkillCount = $null
        MojibakeHits = Test-FileMojibake -Path $win
      })
    }
  }
  foreach ($rootProp in @("skillsRoot", "standardsRoot")) {
    $root = $value.$rootProp
    if ($root) {
      $winRoot = $root -replace "/", "\"
      $count = $null
      if (Test-Path -LiteralPath $winRoot) {
        $count = (Get-ChildItem -LiteralPath $winRoot -Recurse -Filter SKILL.md -ErrorAction SilentlyContinue | Measure-Object).Count
      }
      $rows.Add([pscustomobject]@{
        Program = $name
        Kind = $rootProp
        Path = $winRoot
        Exists = Test-Path -LiteralPath $winRoot
        SkillCount = $count
        MojibakeHits = $null
      })
    }
  }
}

$omxRoot = Join-Path $HomePath "AppData\Roaming\npm\node_modules\oh-my-codex\dist\mcp"
$omx = @("state-server.js","memory-server.js","code-intel-server.js","trace-server.js","wiki-server.js") | ForEach-Object {
  [pscustomobject]@{ Component = "omx"; Name = $_; Exists = Test-Path -LiteralPath (Join-Path $omxRoot $_) }
}

$canonicalSkillsRoot = Join-Path $script:MaestroRoot "skills"
$skillMirrorTargets = @(
  (Join-Path $HomePath ".codex\skills"),
  (Join-Path $HomePath ".opencode\skills"),
  (Join-Path $HomePath ".agents\skills"),
  (Join-Path $HomePath ".claude\skills"),
  (Join-Path $HomePath ".cursor\skills"),
  (Join-Path $HomePath ".gemini\skills"),
  (Join-Path $HomePath ".windsurf\skills"),
  (Join-Path $HomePath ".antigravity-skills\skills")
)
$skillQuality = @(Get-CanonicalSkillQuality -Root $canonicalSkillsRoot)
$skillMirrorDrift = @(Get-SkillMirrorDrift -CanonicalRoot $canonicalSkillsRoot -Targets $skillMirrorTargets)
$routingHealth = Get-OrchestratorRoutingHealth -HomePath $HomePath -CanonicalSkillsRoot $canonicalSkillsRoot
$hookHealth = @(Get-HookHealth -HomePath $HomePath)
$canonicalSkillNames = @($skillQuality | Where-Object { $_.Exists } | Select-Object -ExpandProperty Skill)
$installPolicy = Get-InstallPolicy -HomePath $HomePath
$requiredNativeSkills = @("orquestrador-maestro", "skill-open-code-review", "skill-open-code-delegate")
try {
  $skillManifest = Get-Content -LiteralPath (Join-Path $script:MaestroRoot "SKILLS_MANIFEST.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $requiredNativeSkills += @($skillManifest.skills.PSObject.Properties | Where-Object { $_.Value.mirrorEverywhere -eq $true } | ForEach-Object { $_.Name })
} catch { }
$requiredNativeSkills = @($requiredNativeSkills | Sort-Object -Unique)
$nativeSkillRootHealth = @(Get-NativeSkillRootHealth -HomePath $HomePath -InstallPolicy $installPolicy -CanonicalSkills $canonicalSkillNames -RequiredSkills $requiredNativeSkills)
$managedFilesHealth = Get-ManagedFilesHealth -Root $script:MaestroRoot

# Get-NetTCPConnection is Windows-only. On POSIX pwsh it throws under
# $ErrorActionPreference="Stop", which would abort the whole report.
$port3001 = $null
try {
  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
  }
} catch { $port3001 = $null }
if (-not $port3001 -and (Get-Command ss -ErrorAction SilentlyContinue)) {
  try { $port3001 = @(ss -ltn 2>$null | Select-String ":3001\b") } catch { $port3001 = $null }
}
$versions = [ordered]@{}
try { $versions.codex = (codex --version 2>$null) } catch { $versions.codex = "unavailable" }
try { $versions.opencode = (opencode --version 2>$null) } catch { $versions.opencode = "unavailable" }
try { $versions.ohMyCodexInstalled = (npm list -g oh-my-codex --depth=0 2>$null | Select-String "oh-my-codex@").ToString().Trim() } catch { $versions.ohMyCodexInstalled = "unavailable" }
try { $versions.opencodeInstalled = (npm list -g opencode-ai --depth=0 2>$null | Select-String "opencode-ai@").ToString().Trim() } catch { $versions.opencodeInstalled = "unavailable" }

# 1.1.0: Codex home parity. The Codex CLI, IDE extension and the ChatGPT
# desktop app (Codex mode) all read $CODEX_HOME (default ~/.codex). Maestro
# installs into ~/.codex, so a divergent CODEX_HOME means the desktop app
# silently never sees the installed skills. Reported, never auto-fixed.
$codexHomeScript = Join-Path $PSScriptRoot "lib\codex-home.js"
$codexHome = $null
if (Get-Command node -ErrorAction SilentlyContinue) {
  try {
    $raw = & node -e "const m=require(process.argv[1]); const r=m.resolveCodexHome({home:process.argv[2]}); process.stdout.write(JSON.stringify({...r, platformSupport: m.desktopAppSupport()}));" $codexHomeScript $HomePath 2>$null
    if ($LASTEXITCODE -eq 0 -and $raw) { $codexHome = $raw | ConvertFrom-Json }
  } catch { $codexHome = $null }
}
if (-not $codexHome) { $codexHome = [pscustomobject]@{ divergent = $false; message = "codex-home check unavailable (node not found)"; platformSupport = $null; codexHome = $null } }

$report = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString("s")
  Entrypoints = $rows
  OmxMcpFiles = $omx
  CanonicalSkillQuality = $skillQuality
  SkillMirrorDrift = $skillMirrorDrift
  OrchestratorRoutingHealth = $routingHealth
  HookHealth = $hookHealth
  NativeSkillRootHealth = $nativeSkillRootHealth
  ManagedFilesHealth = $managedFilesHealth
  AntigravityPort3001Listening = ($null -ne $port3001)
  CodexHome = $codexHome
  Versions = $versions
}
$report | ConvertTo-Json -Depth 8

# 1.1.0: --strict fails on real loss signals only.
# Drift semantics: Different=true means an INSTALLED mirror diverges from its
# canonical source (corruption/partial copy). Exists=false is NOT loss by
# itself — SKILL_INSTALL_POLICY.allowDirectories deliberately keeps different
# skill subsets per native root, and only mirrorEverywhere skills go everywhere
# (that absence is covered by `verify --strict`, not by doctor).
if ($Strict) {
  $routingIssueCount = 0
  if ($routingHealth -and $routingHealth.IssueCount) { $routingIssueCount = [int]$routingHealth.IssueCount }
  $drifted = @($skillMirrorDrift | Where-Object { $_.Different -eq $true -and $_.KnownCustomization -ne $true })
  $unhealthyRoots = @($nativeSkillRootHealth | Where-Object { -not $_.Healthy })
  $managedFilesUnhealthy = (-not $managedFilesHealth.Supported) -or ($managedFilesHealth.Missing.Count -gt 0) -or ($managedFilesHealth.Modified.Count -gt 0)
  # Divergent CODEX_HOME means the ChatGPT desktop app / Codex CLI read a
  # different directory than the one Maestro installed into: the skills exist
  # on disk but no Codex client will load them. That is real loss.
  $codexHomeDivergent = if ($codexHome -and $codexHome.divergent) { 1 } else { 0 }
  if ($routingIssueCount -gt 0 -or $drifted.Count -gt 0 -or $unhealthyRoots.Count -gt 0 -or $codexHomeDivergent -gt 0 -or $managedFilesUnhealthy) {
    Write-Error "doctor --strict: $routingIssueCount routing issues, $($drifted.Count) mirror drifts, $($unhealthyRoots.Count) unhealthy roots, managed-files unhealthy=$managedFilesUnhealthy, $codexHomeDivergent codex home divergence."
    exit 1
  }
}
