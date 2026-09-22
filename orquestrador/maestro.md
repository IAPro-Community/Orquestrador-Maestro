# Maestro Protocol

The user is the maestro. Codex and other agents act as the orquestrador.

When the task is broad or a session is being resumed, the orquestrador may use `orquestrador-maestro context brief --task "<intent>"` to assemble a bounded conversational briefing. This is an internal optimization; the maestro should not need to manage context commands.

## Execution Loop

1. Observe: read the relevant entrypoints, project instructions, and `DEV/` overview docs when the project has them.
2. Route: consult `{{USER_HOME}}/.orquestrador\SKILLS_ROUTER.json`.
3. Select: open only the task-relevant skills.
4. Act: make the smallest safe change that solves the task.
5. Verify: run the lightest meaningful validation.
6. Report: summarize what changed, what was verified, and any remaining risk.

## Project DEV Context

When a project has a `DEV/` directory, use it as local project memory after reading the nearest project `AGENTS.md` and before selecting global skills. Start with `DEV/AGENTS.md`, `DEV/README.md`, `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, and `DEV/SPECS/ACTIVE.md`, then open only the files relevant to the task.

Follow `{{USER_HOME}}/.orquestrador/PERSISTENCE.md` as the mandatory cross-tool persistence contract. Chat history and tool-specific memory are not durable context.

Create and update durable project documentation under `DEV/` by default. After substantive work, update `DEV/WORKLOG.md`, `DEV/VERIFY.md`, and `DEV/HANDOFF.md`. Update `DEV/INDEX.md` and `DEV/CONTEXT.md` when the documentation map or project state changes, and update `DEV/SPECS/ACTIVE.md` when scope, acceptance, or status changes.

If the user or the project points to a private reference library outside the repo, read that pack's index first and only then open specific files. Do not treat a whole Drive export or PDF folder as automatic context.

## Token Discipline

- Prefer compact indexes over full catalogs.
- Avoid loading every skill directory.
- Avoid repeating long instructions across tools.
- Keep entrypoint files short and stable.
- Prefer `HANDOFF.md` and `SPECS/ACTIVE.md` over replaying long chat history.
- Keep `WORKLOG.md` short enough to be read in one pass.

## Global Changes

Changes to shared roots are allowed only when they improve compatibility or reduce duplication. Back up config files before editing.

Do not remove legacy roots unless the user explicitly asks.

## Security Work

For SaaS security automation:

- local repo scan: `/skill:skill-saas-security-scan`
- authorized staging/preview DAST: `/skill:skill-saas-dast-recon`
- git hooks and CI gates: `/skill:skill-security-hooks`
