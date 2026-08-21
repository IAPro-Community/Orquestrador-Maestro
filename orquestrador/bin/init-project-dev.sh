#!/usr/bin/env bash
set -euo pipefail

# Orquestrador Maestro - Project DEV initializer
# Usage: bash ~/.orquestrador/bin/init-project-dev.sh [--project-path PATH]

PROJECT_PATH="$(pwd)"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-path)
      if [ "$#" -lt 2 ]; then
        echo "Error: --project-path requires a value." >&2
        exit 1
      fi
      PROJECT_PATH="$2"
      shift
      ;;
    --help|-h)
      sed -n '2,4p' "$0"
      exit 0
      ;;
    --*)
      echo "Error: unknown option: $1" >&2
      exit 1
      ;;
    *)
      PROJECT_PATH="$1"
      ;;
  esac
  shift
done

mkdir -p "$PROJECT_PATH"
PROJECT_ROOT="$(CDPATH= cd -- "$PROJECT_PATH" && pwd -P)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
DEV_ROOT="$PROJECT_ROOT/DEV"
CREATED_COUNT=0
TOTAL_FILES=11

write_text_file_if_missing() {
  local path="$1"
  local content
  content="$(cat)"
  content="${content//\{\{PROJECT_NAME\}\}/$PROJECT_NAME}"

  if [ -e "$path" ]; then
    return 1
  fi

  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  return 0
}

mkdir -p "$DEV_ROOT"

SUBDIRS=(
  "ADR"
  "API"
  "DATABASE"
  "LOGS"
  "SQL"
  "ARCH"
  "WORKFLOWS"
  "TESTS"
  "DOCUMENTATION"
  "BACKLOG"
  "RUNBOOKS"
  "TASKS"
  "RESEARCH"
  "HANDOFFS"
  "SPECS"
)

for subdir in "${SUBDIRS[@]}"; do
  mkdir -p "$DEV_ROOT/$subdir"
done

if write_text_file_if_missing "$DEV_ROOT/README.md" <<'EOF'
# DEV - {{PROJECT_NAME}}

Compact operational documentation and project memory.

Recommended read order:

1. `INDEX.md`
2. `HANDOFF.md`
3. `CONTEXT.md`
4. `SPECS/ACTIVE.md`
5. The task-specific document

Keep `WORKLOG.md` short. Archive older entries with `compact-worklog` instead of turning `WORKLOG.md` into a long transcript.
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/INDEX.md" <<'EOF'
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
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/HANDOFF.md" <<'EOF'
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
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/CONTEXT.md" <<'EOF'
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
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/WORKLOG.md" <<'EOF'
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
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/VERIFY.md" <<'EOF'
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
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/ARCHITECTURE.md" <<'EOF'
# Architecture

Record the living project architecture, main components, integrations, and boundaries.
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/DECISIONS.md" <<'EOF'
# Decisions

Record consolidated technical decisions. Use `ADR/` for decisions that need more detail.
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/TESTING.md" <<'EOF'
# Testing And Verification

## Commands

-

## Strategy

-
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/ROADMAP.md" <<'EOF'
# Roadmap

Use this file for product or engineering direction when active planning exists.
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

if write_text_file_if_missing "$DEV_ROOT/SPECS/ACTIVE.md" <<'EOF'
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
EOF
then
  CREATED_COUNT=$((CREATED_COUNT + 1))
fi

echo "ProjectPath: $PROJECT_ROOT"
echo "DevPath: $DEV_ROOT"
echo "CreatedFiles: $CREATED_COUNT"
echo "ExistingFilesPreserved: $((TOTAL_FILES - CREATED_COUNT))"
