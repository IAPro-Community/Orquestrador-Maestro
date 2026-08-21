[CmdletBinding()]
param(
  [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath($ProjectPath)
$projectName = Split-Path -Leaf $projectRoot
$devRoot = Join-Path $projectRoot "DEV"

function Write-TextFileIfMissing {
  param(
    [string]$Path,
    [string]$Content
  )

  if (Test-Path -LiteralPath $Path) { return $false }

  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
  return $true
}

New-Item -ItemType Directory -Force -Path $devRoot | Out-Null

$subdirs = @(
  "ADR",
  "API",
  "DATABASE",
  "LOGS",
  "SQL",
  "ARCH",
  "WORKFLOWS",
  "TESTS",
  "DOCUMENTATION",
  "BACKLOG",
  "RUNBOOKS",
  "TASKS",
  "RESEARCH",
  "HANDOFFS",
  "SPECS"
)

foreach ($subdir in $subdirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $devRoot $subdir) | Out-Null
}

$created = New-Object System.Collections.Generic.List[string]

$files = @(
  @{
    Name = "README.md"
    Content = @'
# DEV - {{PROJECT_NAME}}

Compact operational documentation and project memory.

Recommended read order:

1. `INDEX.md`
2. `HANDOFF.md`
3. `CONTEXT.md`
4. `SPECS/ACTIVE.md`
5. The task-specific document

Keep `WORKLOG.md` short. Archive older entries with `compact-worklog` instead of turning `WORKLOG.md` into a long transcript.
'@
  },
  @{
    Name = "INDEX.md"
    Content = @'
# DEV Index

| Path | Purpose |
|---|---|
| `README.md` | Short operational documentation entrypoint |
| `HANDOFF.md` | Current snapshot for the next AI or human |
| `CONTEXT.md` | Current state, constraints, commands, and risks |
| `SPECS/ACTIVE.md` | Active objective, scope, acceptance, and status |
| `WORKLOG.md` | Compact chronological hook of substantive work |
| `VERIFY.md` | Latest verification evidence and outcomes |
| `ARCHITECTURE.md` | Living project architecture |
| `DECISIONS.md` | Consolidated technical decisions |
| `ADR/` | Formal decision records |
| `API/` | API documentation |
| `DATABASE/` | Data model, migrations, and data notes |
| `TESTING.md` | Verification strategy and commands |
| `RUNBOOKS/` | Operational procedures |
| `TASKS/` | Active plans and task artifacts |
| `RESEARCH/` | Research and references |
| `HANDOFFS/` | Archived handoffs and compacted worklog history |
| `LOGS/` | Longer execution logs |
| `SQL/` | SQL scripts and database work |
| `ARCH/` | Existing architecture sub-hierarchy |
| `WORKFLOWS/` | Existing workflow artifacts |
| `TESTS/` | Existing testing sub-hierarchy |
| `DOCUMENTATION/` | Existing project documentation sub-hierarchy |
| `BACKLOG/` | Existing backlog and completed work archive |
'@
  },
  @{
    Name = "HANDOFF.md"
    Content = @'
# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated:
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Entry:
- Spec:
- Changed:
- Verified:
- Risks:
- Next context:

## Recent Entries

-
'@
  },
  @{
    Name = "CONTEXT.md"
    Content = @'
# Current Context

## State

- Project: `{{PROJECT_NAME}}`
- Active handoff: `HANDOFF.md`
- Active spec: `SPECS/ACTIVE.md`
- Update this file when commands, architecture, environment, risks, or active decisions change.

## Commands

- Install:
- Development:
- Tests:
- Build:

## Constraints And Risks

-

## Next Context

-
'@
  },
  @{
    Name = "WORKLOG.md"
    Content = @'
# Worklog

Record a short summary here after substantive work.

Use `HANDOFF.md` for the current snapshot and `HANDOFFS/WORKLOG_ARCHIVE.md` for older entries after compaction.

## Template

```text
## YYYY-MM-DD - Short task title

- Spec: `DEV/SPECS/ACTIVE.md` or equivalent task doc
- Changed: paths or areas touched
- Why: one sentence
- Verified: command or manual check
- Risks: only active risks
- Next context: only what the next AI needs
```
'@
  },
  @{
    Name = "VERIFY.md"
    Content = @'
# Verify

## Latest Verification

- Date:
- Scope:

## Commands

-

## Outcome

- Passed:
- Failed:
- Pending:
'@
  },
  @{
    Name = "ARCHITECTURE.md"
    Content = @'
# Architecture

Record the living project architecture, main components, integrations, and boundaries.
'@
  },
  @{
    Name = "DECISIONS.md"
    Content = @'
# Decisions

Record consolidated technical decisions. Use `ADR/` for decisions that need more detail.
'@
  },
  @{
    Name = "TESTING.md"
    Content = @'
# Testing And Verification

## Commands

-

## Strategy

-
'@
  },
  @{
    Name = "ROADMAP.md"
    Content = @'
# Roadmap

Use this file for product or engineering direction when active planning exists.
'@
  },
  @{
    Name = "SPECS/ACTIVE.md"
    Content = @'
# Active Spec - {{PROJECT_NAME}}

## Goal

-

## In Scope

-

## Out Of Scope

-

## Acceptance

-

## Structural Prevention

- Change class:
- Structural adjustment if this is a local remediation:

## Constraints

-

## Verification Plan

-

## Status

- State: draft
- Owner:
- Last updated:
'@
  }
)

foreach ($file in $files) {
  $path = Join-Path $devRoot $file.Name
  $content = $file.Content.Replace("{{PROJECT_NAME}}", $projectName)
  if (Write-TextFileIfMissing -Path $path -Content $content) {
    $created.Add($path)
  }
}

[pscustomobject]@{
  ProjectPath = $projectRoot
  DevPath = $devRoot
  CreatedFiles = $created.Count
  ExistingFilesPreserved = $files.Count - $created.Count
} | Format-List
