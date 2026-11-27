# Orquestrador Maestro — Persistence Contract

Chat history is not durable project memory. Every supported software must recover and persist work through the same files and protocol.

## Rehydrate before work

For substantive, resumed or uncertain work, read the relevant existing `DEV/` control files in this order. Reuse valid session context; mechanical tasks need no broad hydration unless project instructions require it:

1. `DEV/README.md` or `DEV/INDEX.md`
2. `DEV/HANDOFF.md`
3. `DEV/CONTEXT.md`
4. `DEV/SPECS/ACTIVE.md`
5. only the task-relevant detail files

Do not infer missing context from an old chat, another tool, or memory. If the compact files conflict, follow the nearest project instructions and record the decision in the project memory.

## Persist after substantive work

Before ending a session, switching tools, or handing work to another agent after substantive work:

- update `DEV/WORKLOG.md` with a short entry containing change, reason, verification, and next context;
- refresh `DEV/VERIFY.md` with the checks and their results;
- refresh `DEV/HANDOFF.md` with current state, remaining work, risks, and exact next action;
- update `DEV/CONTEXT.md`, `DEV/INDEX.md`, or `DEV/SPECS/ACTIVE.md` when their state changes.

If the project has no `DEV/`, initialize it with `orquestrador-maestro init-dev --project-path <project>` before substantive work when the user or repository allows project documentation changes.

## One operating contract

Codex, OpenCode, Claude, Cursor, Gemini, Windsurf, Antigravity, and compatible agents must treat `AGENTS.md`, `.orquestrador/rules.md`, `.orquestrador/maestro.md`, and this file as the shared source of truth. Tool-specific memories, commands, and hooks may accelerate recovery, but must not replace these files.
