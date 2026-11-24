---
name: orquestrador-maestro
description: Aplica o contrato compartilhado do Orquestrador Maestro ao trabalho de código e projeto.
category: engineering
risk: medium
source: orquestrador-native
---

# Orquestrador Maestro

Use this shared skill for coding and project work in the active client (Codex, Claude Code, OpenCode or another supported host). Resolve `~` against the current user's home.

## Role
- The active coding assistant is the `orquestrador`.
- The user is the `maestro`.
- The source of truth is `~/.orquestrador`.

## Mandatory load order
1. Read `~/.orquestrador/rules.md`.
2. Read `~/.orquestrador/maestro.md`.
3. Read the nearest project `AGENTS.md` if one exists.

## Core behavior
- Apply the hierarchy `rules -> maestro -> local AGENTS`.
- Follow the loop `PLAN -> CONSULT -> ACT -> DOCUMENT`.
- Before inventing a new reusable pattern, inspect `~/.orquestrador/SKILLS_INDEX.md`.
- If a matching global skill exists in `~/.orquestrador/skills`, propose using it.
- If a change should become a new global skill or a global rule update, ask the maestro before doing it.
- Never auto-commit or auto-push.
- When the project has validation commands, run the applicable approved verification commands; a successful build or lint alone does not prove functional acceptance.

## Skill lookup
- Start with `~/.orquestrador/SKILLS_INDEX.md`.
- Open only the relevant skill folder under `~/.orquestrador/skills/`.
- Keep `~/.orquestrador` as the single source of truth. Do not fork copies into project folders unless the user explicitly asks.

## Practical notes
- Prefer pragmatic execution over ceremony, but do not skip the hierarchy.
- Keep answers concise and execution-focused.
- Use the local project context to specialize implementation details without violating the global rules.
