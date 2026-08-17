# Compatibility Baseline

## Purpose

This baseline protects the public behavior of Orquestrador Maestro while an optional execution runtime is added. The runtime must be an additive consumer of existing contracts, never a prerequisite for them.

## Protected Public Behavior

| Area | Protected contract |
|---|---|
| Installation | `install`, `update`, `uninstall`, `dry-run`, `list-targets`, PowerShell/Bash installers, backups, component selection, and home-path support remain available. |
| Diagnostics | `verify` and `doctor` continue to validate installed files, minimal native roots, routing health, hooks, and tool profiles. |
| CLI | Existing commands, argument validation, exit codes, help, `version`, `changelog`, and opt-in telemetry retain their meaning. |
| Project context | `init-dev`, `compact-worklog`, `check-dev-gates`, and `context brief` preserve the current `DEV/` convention, including legacy-compatible layouts. |
| Skills | `SKILLS_MANIFEST`, `SKILLS_ROUTER`, aliases, chains, execution profiles, install policy, canonical skill roots, and `sync-skills` remain first-class. |
| Tool integrations | `PROGRAM_ENTRYPOINTS`, Codex, Claude, OpenCode, Cursor, Gemini, Windsurf, Antigravity, Grok, and workspace bootstraps retain their installed entrypoints. |
| Publication | The public snapshot remains sanitized; it must not contain local paths, secrets, logs, caches, backups, or user-private skill content. |

## Public Files and Schemas

The following are compatibility-sensitive contracts. Existing fields and semantics remain unchanged; additive fields must be optional and validated independently.

- `bin/orquestrador-maestro.js` and its existing command surface.
- `orquestrador/PROGRAM_ENTRYPOINTS.json`.
- `orquestrador/SKILLS_MANIFEST.json` and `SKILLS_MANIFEST_SCHEMA.json`.
- `orquestrador/SKILLS_ROUTER.json`, `SKILL_ALIASES.json`, `SKILL_CHAINS.json`, `SKILL_EXECUTION_PROFILES.json`, `SKILL_INSTALL_POLICY.json`, `SKILL_USAGE_SCHEMA.json`, and `WORKFLOW_SCHEMAS.json`.
- `orquestrador/rules.md`, `maestro.md`, `PERSISTENCE.md`, `PROJECT_DEV_HIERARCHY.md`, hooks, sync scripts, doctor, and DEV helpers.
- `scripts/install.*`, `scripts/verify-install.*`, `scripts/validate-public.ps1`, tool profiles, and workspace blueprints.

## Regression Risks and Strategy

- Do not replace existing CLI dispatch or installers; add new commands through the existing dispatcher and keep legacy paths independent from runtime initialization.
- Do not reinterpret legacy skill execution profiles as runtime profiles. Adapt their information when useful, while preserving the current `fast`, `standard`, `deep`, `multiagent`, `saas`, `security`, and `phase-loop` contracts.
- Do not move `DEV/` process memory into operational storage. A future Run Store complements it.
- Do not modify user skill roots, copy user skills, download skills, or infer trust from a self-declared field.
- Keep provider-specific translation behind adapters; the domain and legacy integration files must not branch on provider identity.
- Protect every behavior change with focused contract tests rather than fragile repository-wide snapshots.

## Compatibility Gate

Before any runtime phase is complete, run existing tests, the compatibility tests introduced in Phase 1, relevant CLI smoke tests, JSON/schema validation, public sanitization validation, and a diff review confirming that no protected behavior was removed or silently redefined.
