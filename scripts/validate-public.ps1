[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string[]]$ForbiddenLiteral = @(),
  [switch]$SkipJsonValidation
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

$issues = New-Object System.Collections.Generic.List[object]

function Add-Issue {
  param([string]$Kind, [string]$Path, [string]$Detail)
  $issues.Add([pscustomobject]@{
    Kind = $Kind
    Path = $Path
    Detail = $Detail
  })
}

function Get-RelativePath {
  param([string]$BasePath, [string]$Path)
  $baseFull = [System.IO.Path]::GetFullPath($BasePath)
  $pathFull = [System.IO.Path]::GetFullPath($Path)

  # Path.GetRelativePath is available on modern .NET runtimes. Windows
  # PowerShell 5.1 ships an older runtime, so keep a URI fallback for that
  # supported host while preserving correct behavior on Unix runners.
  $relativePathMethod = [System.IO.Path].GetMethods() |
    Where-Object { $_.Name -eq "GetRelativePath" } |
    Select-Object -First 1
  if ($null -ne $relativePathMethod) {
    return [System.IO.Path]::GetRelativePath($baseFull, $pathFull)
  }

  $baseUri = New-Object System.Uri(($baseFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar))
  $pathUri = New-Object System.Uri($pathFull)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}

function Test-ExcludedScanPath {
  param([string]$RelativePath)
  $rel = $RelativePath.Replace("\", "/")
  if ($rel -match "(^|/)(\.git|\.local|\.omx|DEV|node_modules|dist|build)(/|$)") { return $true }
  if ($rel -match "^orquestrador/runtime/worktrees(/|$)") { return $true }
  return $false
}

function Test-TextFile {
  param([string]$Path)
  $leaf = Split-Path -Leaf $Path
  $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($ext)) { return $true }
  if ($leaf -eq ".gitignore") { return $true }
  return $ext -in @(
    ".md", ".json", ".ps1", ".cmd", ".yml", ".yaml", ".template", ".tsx",
    ".ts", ".js", ".txt", ".toml", ".patch", ".sh", ".py", ".rb", ".go",
    ".rs", ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".hpp", ".cs",
    ".html", ".css", ".scss", ".svg", ".xsd", ".xml", ".csv", ".ini",
    ".rules",
    ".cfg", ".conf", ".sql", ".jsonl"
  )
}

$compactHookLimits = @{
  "orquestrador/hooks.md" = 80
  "tool-profiles/opencode/hooks.md" = 30
  "tool-profiles/claude/hooks.md" = 20
  "tool-profiles/cursor/hooks.md" = 20
  "tool-profiles/gemini/hooks.md" = 20
  "tool-profiles/windsurf/hooks.md" = 20
}

$legacyHookCatalogMarkers = @(
  "GLOBAL SKILLS HOOKS",
  "Complete Skill Reference with Descriptions"
)

$repoRootFull = [System.IO.Path]::GetFullPath($RepoRoot)
$defaultForbidden = @()
$homeName = Split-Path -Leaf ([Environment]::GetFolderPath("UserProfile"))
$genericCiHomeNames = @("runner", "runneradmin", "github-actions", "buildkite", "jenkins")
if (-not [string]::IsNullOrWhiteSpace($homeName) -and $homeName -notin $genericCiHomeNames) {
  $defaultForbidden += $homeName
}
$allForbidden = @($defaultForbidden + $ForbiddenLiteral) |
  Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
  Select-Object -Unique

$forbiddenDirs = @(
  "orquestrador\logs",
  "orquestrador\backups",
  "tool-profiles\codex\rules"
)
$git = Get-Command git -ErrorAction SilentlyContinue
foreach ($dir in $forbiddenDirs) {
  $path = Join-Path $repoRootFull $dir
  $trackedFiles = @()
  if ($git) {
    $trackedFiles = @(& git -C $repoRootFull ls-files -- $dir 2>$null)
  }
  if ((Test-Path -LiteralPath $path) -and $trackedFiles.Count -gt 0) {
    Add-Issue -Kind "forbidden-dir" -Path $dir -Detail "Local runtime directory must not be published."
  }
}

$forbiddenFiles = @(
  "orquestrador\doctor-last-report.json",
  "orquestrador\memoria.md"
)
foreach ($file in $forbiddenFiles) {
  $path = Join-Path $repoRootFull $file
  if (Test-Path -LiteralPath $path) {
    Add-Issue -Kind "forbidden-file" -Path $file -Detail "Local runtime file must not be published."
  }
}

if ($git) {
  foreach ($privateRoot in @(".omx", ".local", "DEV")) {
    $tracked = @(& git -C $repoRootFull ls-files -- $privateRoot 2>$null)
    if ($LASTEXITCODE -eq 0 -and $tracked.Count -gt 0) {
      foreach ($trackedPath in $tracked) {
        Add-Issue -Kind "tracked-private-root" -Path $trackedPath -Detail "Private local runtime roots must not be tracked."
      }
    }
  }
}

$secretPatterns = [ordered]@{
  "github-token" = "(?i)(ghp_|github_pat_)[A-Za-z0-9_]{20,}";
  "openai-key" = "(?i)(sk-proj-[A-Za-z0-9_-]{48,}|sk-svcacct-[A-Za-z0-9_-]{48,}|sk-[A-Za-z0-9]{32,})";
  "aws-access-key" = "AKIA[0-9A-Z]{16}";
  "slack-token" = "xox[baprs]-[A-Za-z0-9-]{20,}";
  "assigned-secret" = "(?i)(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*['""]?(?!(process\.env|import\.meta\.env|os\.environ|Deno\.env|env\.|settings\.|config\.|<|\$\{|\{))[A-Za-z0-9_./+=-]{24,}"
}

$operationalLeakPatterns = [ordered]@{
  "plink-password-cli" = '(?i)\bplink(\.exe)?\b[^\r\n]{0,300}\s-pw\s+[''"][^''"]+[''"]';
  "sshpass-password-cli" = '(?i)\bsshpass\b[^\r\n]{0,300}(-p|--password)\s+[''"]?[^''"\s]+';
  "password-cli-arg" = '(?i)(^|\s)(-pw|--password|/password)\s+[''"][^''"]+[''"]'
}

foreach ($file in Get-ChildItem -LiteralPath $repoRootFull -Recurse -File -Force) {
  $relative = Get-RelativePath -BasePath $repoRootFull -Path $file.FullName
  if (Test-ExcludedScanPath -RelativePath $relative) { continue }

  $leaf = Split-Path -Leaf $relative
  $rel = $relative.Replace("\", "/")

  if ($rel -match "(^|/)benchmarks/results(/|$)") {
    Add-Issue -Kind "generated-benchmark-results" -Path $relative -Detail "Benchmark result artifacts must not be published."
  }
  if ($rel -match "(^|/)demo/recordings(/|$)") {
    Add-Issue -Kind "generated-recording" -Path $relative -Detail "Generated recordings must not be published."
  }
  if ($leaf -like "*.db" -or $leaf -like "*.db-shm" -or $leaf -like "*.db-wal") {
    Add-Issue -Kind "generated-database" -Path $relative -Detail "Generated databases must not be published."
  }

  if ($leaf -like "*.bak*" -or $leaf -like "*.log" -or $leaf -like ".temp-*") {
    Add-Issue -Kind "forbidden-file-kind" -Path $relative -Detail "Backup/log/temp files must not be published."
  }

  if (-not (Test-TextFile -Path $file.FullName)) { continue }

  $text = ""
  try {
    $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  } catch {
    continue
  }

  if ($text -match "C:\\Users\\[A-Za-z0-9._-]+") {
    Add-Issue -Kind "concrete-windows-home" -Path $relative -Detail "Use {{USER_HOME}} or %USERPROFILE% instead of a concrete user path."
  }
  if ($text -match "C:/Users/[A-Za-z0-9._-]+") {
    Add-Issue -Kind "concrete-windows-home" -Path $relative -Detail "Use {{USER_HOME}} or %USERPROFILE% instead of a concrete user path."
  }

  foreach ($literal in $allForbidden) {
    if ($literal -in @("Public", "Default", "User")) { continue }
    if ($text.IndexOf($literal, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      Add-Issue -Kind "forbidden-literal" -Path $relative -Detail "Found forbidden literal: $literal"
    }
  }

  if ($compactHookLimits.Contains($rel)) {
    $lineCount = if ([string]::IsNullOrEmpty($text)) { 0 } else { ([regex]::Matches($text, "(`r`n|`n)")).Count + 1 }
    if ($lineCount -gt [int]$compactHookLimits[$rel]) {
      Add-Issue -Kind "oversized-hook" -Path $relative -Detail "Hook has $lineCount lines; limit is $($compactHookLimits[$rel])."
    }
    foreach ($marker in $legacyHookCatalogMarkers) {
      if ($text.IndexOf($marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        Add-Issue -Kind "legacy-hook-catalog" -Path $relative -Detail $marker
      }
    }
  }

  foreach ($name in $secretPatterns.Keys) {
    if ([regex]::IsMatch($text, $secretPatterns[$name])) {
      Add-Issue -Kind "possible-secret" -Path $relative -Detail $name
    }
  }

  foreach ($name in $operationalLeakPatterns.Keys) {
    if ([regex]::IsMatch($text, $operationalLeakPatterns[$name])) {
      Add-Issue -Kind "possible-operational-secret" -Path $relative -Detail $name
    }
  }

  $mojibakeSequenceCodePoints = @(
    "00C3,00A1", "00C3,00A0", "00C3,00A2", "00C3,00A3", "00C3,00A4", "00C3,00A9", "00C3,00AA", "00C3,00AD", "00C3,00B3", "00C3,00B4", "00C3,00B5", "00C3,00BA", "00C3,00BC", "00C3,00A7",
    "00C2,00BA", "00C2,00AA", "00C2,00A9", "00C2,00AE", "00C2,00B7", "00C2,00AB", "00C2,00BB",
    "00E2,20AC,201C", "00E2,20AC,201D", "00E2,20AC,02DC", "00E2,20AC,2122", "00E2,20AC,0153", "00E2,20AC,00A6", "00E2,20AC,00A2", "00E2,201E,00A2"
  )
  foreach ($encodedSequence in $mojibakeSequenceCodePoints) {
    $sequence = -join ($encodedSequence.Split(",") | ForEach-Object { [string][char][Convert]::ToInt32($_, 16) })
    if ($text.Contains($sequence) -and ($relative -notmatch "validate-public\.ps1$")) {
      Add-Issue -Kind "possible-mojibake" -Path $relative -Detail "Text contains common mojibake markers."
      break
    }
  }
}

if (-not $SkipJsonValidation) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  foreach ($json in Get-ChildItem -LiteralPath (Join-Path $repoRootFull "orquestrador") -Recurse -Filter "*.json" -File -ErrorAction SilentlyContinue) {
    $relative = Get-RelativePath -BasePath $repoRootFull -Path $json.FullName
    if (Test-ExcludedScanPath -RelativePath $relative) { continue }
    if ($node) {
      & $node.Source -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" $json.FullName 2>$null
      if ($LASTEXITCODE -ne 0) {
        Add-Issue -Kind "invalid-json" -Path $relative -Detail "Node.js JSON.parse failed."
      }
    } else {
      try {
        Get-Content -LiteralPath $json.FullName -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
      } catch {
        Add-Issue -Kind "invalid-json" -Path $relative -Detail $_.Exception.Message
      }
    }
  }
}

if ($issues.Count -gt 0) {
  "Public validation failed:"
  $issues | Sort-Object Kind, Path | Format-Table -AutoSize
  exit 1
}

"Public validation passed for $repoRootFull"
