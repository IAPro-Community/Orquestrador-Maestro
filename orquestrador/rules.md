# Orquestrador Rules

Status: ativo
Local: `{{USER_HOME}}/.orquestrador\rules.md`

This is the compact global contract for agents on this machine.

## Non-Negotiable Rules

1. Do not auto-commit or auto-push. The human validates production changes.
2. Keep shared roots compatible. Do not remove `.agents`, `.opencode`, `.codex`, `.claude`, `.cursor`, `.gemini`, `.windsurf`, or `.antigravity-skills` unless explicitly requested.
3. Verify before claiming completion.
4. Prefer the smallest relevant context. Do not load full catalogs when a router/index is enough.
5. New reusable intelligence should be saved under `{{USER_HOME}}/.orquestrador` first, then synced outward.

## Command Hierarchy

1. `{{USER_HOME}}/.orquestrador\rules.md`
2. `{{USER_HOME}}/.orquestrador\maestro.md`
3. `{{USER_HOME}}/.orquestrador\PERSISTENCE.md`
4. `{{USER_HOME}}/AGENTS.md`
5. nearest project `AGENTS.md`
6. current project `DEV/` documentation, when present
7. selected task skill

## Project DEV Documentation

When the current project contains a `DEV/` directory, treat it as the canonical project documentation and operational memory root. Read only compact control files first, in this order when present: `DEV/AGENTS.md`, `DEV/README.md`, `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, `DEV/SPECS/ACTIVE.md`.

After that, load only task-relevant files under `DEV/`, such as `ARCHITECTURE.md`, `DECISIONS.md`, `ADR/`, `API.md`, `DATABASE.md`, `TESTING.md`, `RUNBOOK.md`, `ROADMAP.md`, or `TASKS.md`. Existing sub-hierarchies such as `DEV/LOGS/`, `DEV/SQL/`, `DEV/ARCH/`, `DEV/WORKFLOWS/`, `DEV/TESTS/`, `DEV/DOCUMENTATION/`, and `DEV/BACKLOG/` are also valid. Do not bulk-load the entire `DEV/` tree by default, and do not open `DEV/WORKLOG.md` before the handoff and active spec unless the compact files are insufficient.

Create durable project documentation under `DEV/` by default. After substantive work, append a compact entry to `DEV/WORKLOG.md`, refresh `DEV/VERIFY.md`, and refresh `DEV/HANDOFF.md`. Update `DEV/INDEX.md` when DEV docs change, `DEV/CONTEXT.md` when project state changes, and `DEV/SPECS/ACTIVE.md` when scope, acceptance, or status changes.

If project `AGENTS.md` conflicts with `DEV/` documentation, project `AGENTS.md` wins. `DEV/` documentation provides project context before global skills are applied.

Full convention: `{{USER_HOME}}/.orquestrador/PROJECT_DEV_HIERARCHY.md`.

## Optional Reference Packs

When the user points to a private library, Drive export, PDF bundle, or local study pack, use `{{USER_HOME}}/.orquestrador/REFERENCE_PACKS.md` as the contract.

Open the pack index first. Do not bulk-load the whole library by default. Treat those packs as local-only and never publish them through this repository.

## Quality Standards

- TypeScript: strict mode, avoid `any`, prefer explicit interfaces or `unknown` with guards.
- Imports: prefer configured absolute imports and stable grouping.
- Naming: components in PascalCase, hooks with `use` prefix, variables/functions in camelCase, constants in SCREAMING_SNAKE_CASE.
- Security: validate inputs, protect secrets, use least privilege, and keep Supabase RLS enabled when applicable.
- APIs: handle errors explicitly and avoid over-fetching.
- Frontend: keep UI responsive, readable, and consistent with the existing design system.

## Skill Discipline

Use `{{USER_HOME}}/.orquestrador\SKILLS_ROUTER.json` before opening skill files.

Load only the skill files needed for the task. Load long references only when the selected skill requires them.

For long-running work, prefer the combo `spec + worklog + verify + handoff + gate` over ad hoc chat history reconstruction:

- keep `DEV/SPECS/ACTIVE.md` current;
- keep `DEV/WORKLOG.md` short;
- archive older entries with `compact-worklog`;
- validate the structure with `check-dev-gates`.

## Maintenance

Health check:

Windows:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/doctor.ps1`

Linux/macOS: use the lightest available project validation; `doctor.ps1` is Windows-only unless PowerShell is installed.

Sync skills:

Windows:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/sync-skills.ps1 -Apply`

Linux/macOS:

`bash {{USER_HOME}}/.orquestrador/sync-skills.sh --apply`
