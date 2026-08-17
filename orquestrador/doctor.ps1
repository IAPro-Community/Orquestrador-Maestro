param(
  [string]$HomePath = [Environment]::GetFolderPath("UserProfile"),
  [switch]$RepairUi
)

$ErrorActionPreference = "Stop"

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
          "plan",
          "ralph",
          "security-review",
          "team",
          "ultrawork",
          "web-clone",
          "worker"
        )
      }
      opencode = [pscustomobject]@{ path = ".opencode/skills"; maxDirectories = 48; allowDirectories = @() }
      agents = [pscustomobject]@{ path = ".agents/skills"; maxDirectories = 48; allowDirectories = @() }
      claude = [pscustomobject]@{ path = ".claude/skills"; maxDirectories = 48; allowDirectories = @() }
      cursor = [pscustomobject]@{ path = ".cursor/skills"; maxDirectories = 48; allowDirectories = @() }
      gemini = [pscustomobject]@{ path = ".gemini/skills"; maxDirectories = 48; allowDirectories = @() }
      windsurf = [pscustomobject]@{ path = ".windsurf/skills"; maxDirectories = 48; allowDirectories = @() }
      antigravity = [pscustomobject]@{ path = ".antigravity-skills/skills"; maxDirectories = 48; allowDirectories = @() }
    }
  }
}

function Get-InstallPolicy {
  param([string]$HomePath)
  $path = Join-Path $HomePath ".orquestrador\SKILL_INSTALL_POLICY.json"
  if (Test-Path -LiteralPath $path) {
    try {
      return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
      return Get-DefaultInstallPolicy
    }
  }
  return Get-DefaultInstallPolicy
}

function Add-RoutingIssue {
  param([System.Collections.Generic.List[object]]$Issues, [string]$Kind, [string]$Name, [string]$Detail)
  $Issues.Add([pscustomobject]@{
    Kind = $Kind
    Name = $Name
    Detail = $Detail
  })
}

function Get-OrchestratorRoutingHealth {
  param([string]$HomePath, [string]$CanonicalSkillsRoot)
  $root = Join-Path $HomePath ".orquestrador"
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
        $canonicalPath = $prop.Value.canonicalPath -replace "/", "\"
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
    $logPath = $usageSchemaDoc.Value.logPath -replace "/", "\"
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
    @{ Program = "orquestrador"; Path = (Join-Path $HomePath ".orquestrador\hooks.md"); MaxLines = 80 },
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
  param([string]$HomePath, [object]$InstallPolicy, [string[]]$CanonicalSkills)
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

    [pscustomobject]@{
      Program = $program
      Path = $root
      Exists = Test-Path -LiteralPath $root
      DirectoryCount = $count
      MaxDirectories = [int]$prop.Value.maxDirectories
      ExtraDirectories = $extra
      ExtraCount = $extra.Count
      Healthy = (Test-Path -LiteralPath $root) -and ($count -le [int]$prop.Value.maxDirectories) -and ($extra.Count -eq 0)
      CommunityLibraryExists = Test-Path -LiteralPath $communityLibrary
      CodexLibraryExists = Test-Path -LiteralPath $codexLibrary
      DisabledNativeRootExists = Test-Path -LiteralPath $disabledNative
    }
  }
}

$entrypoints = Join-Path $HomePath ".orquestrador\PROGRAM_ENTRYPOINTS.json"
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

$canonicalSkillsRoot = Join-Path $HomePath ".orquestrador\skills"
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
$nativeSkillRootHealth = @(Get-NativeSkillRootHealth -HomePath $HomePath -InstallPolicy $installPolicy -CanonicalSkills $canonicalSkillNames)

$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
$versions = [ordered]@{}
try { $versions.codex = (codex --version 2>$null) } catch { $versions.codex = "unavailable" }
try { $versions.opencode = (opencode --version 2>$null) } catch { $versions.opencode = "unavailable" }
try { $versions.ohMyCodexInstalled = (npm list -g oh-my-codex --depth=0 2>$null | Select-String "oh-my-codex@").ToString().Trim() } catch { $versions.ohMyCodexInstalled = "unavailable" }
try { $versions.opencodeInstalled = (npm list -g opencode-ai --depth=0 2>$null | Select-String "opencode-ai@").ToString().Trim() } catch { $versions.opencodeInstalled = "unavailable" }
try { $versions.tmux = (tmux -V 2>$null) } catch { $versions.tmux = "unavailable (manual prerequisite for persistent Maestro terminal sessions)" }
try { $versions.bun = (bun --version 2>$null) } catch { $versions.bun = "unavailable (optional OpenTUI runtime)" }
try { $versions.openTui = (bun -e "console.log(require.resolve('@opentui/core'))" 2>$null) } catch { $versions.openTui = "unavailable (optional; install manually with Bun)" }
try { $versions.nodePty = (node -e "require('node-pty'); console.log('available')" 2>$null) } catch { $versions.nodePty = "unavailable (install build tools, then run npm rebuild node-pty)" }
if ($RepairUi -and $versions.nodePty -like "unavailable*") {
  Write-Host "Maestro Cockpit: node-pty precisa de ferramentas de compilação. Windows: Visual Studio Build Tools (Desktop development with C++). macOS: xcode-select --install. Debian/Ubuntu: sudo apt install build-essential python3. Depois execute npm rebuild node-pty."
}

[pscustomobject]@{
  GeneratedAt = (Get-Date).ToString("s")
  Entrypoints = $rows
  OmxMcpFiles = $omx
  CanonicalSkillQuality = $skillQuality
  SkillMirrorDrift = $skillMirrorDrift
  OrchestratorRoutingHealth = $routingHealth
  HookHealth = $hookHealth
  NativeSkillRootHealth = $nativeSkillRootHealth
  AntigravityPort3001Listening = ($null -ne $port3001)
  Versions = $versions
} | ConvertTo-Json -Depth 8
