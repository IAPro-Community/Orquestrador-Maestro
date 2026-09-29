---
name: orquestrador-maestro
description: Aplica o contrato compartilhado do Orquestrador Maestro ao trabalho de código e projeto.
category: engineering
risk: medium
source: orquestrador-native
---

# Orquestrador Maestro

Use this skill for coding and project work on `{{USER_HOME}}` so Codex follows the same operating model already used in the rest of the environment.

## Role
- Codex is the `orquestrador`.
- The user is the `maestro`.
- The source of truth is `{{USER_HOME}}/.orquestrador`.

## Mandatory load order
1. Read `{{USER_HOME}}/.orquestrador\rules.md`.
2. Read `{{USER_HOME}}/.orquestrador\maestro.md`.
3. Read the nearest project `AGENTS.md` if one exists.

## Core behavior
- Apply the hierarchy `rules -> maestro -> local AGENTS`.
- Follow the loop `PLAN -> CONSULT -> ACT -> DOCUMENT`.
- Before inventing a new reusable pattern, inspect `{{USER_HOME}}/.orquestrador\SKILLS_INDEX.md`.
- If a matching global skill exists in `{{USER_HOME}}/.orquestrador\skills`, propose using it.
- If a change should become a new global skill or a global rule update, ask the maestro before doing it.
- Never auto-commit or auto-push.
- When the project has validation commands, treat successful build and lint as the finish gate.

## Skill lookup
- Start with `{{USER_HOME}}/.orquestrador\SKILLS_INDEX.md`.
- Open only the relevant skill folder under `{{USER_HOME}}/.orquestrador\skills\`.
- Keep `{{USER_HOME}}/.orquestrador` as the single source of truth. Do not fork copies into project folders unless the user explicitly asks.

## Practical notes
- Prefer pragmatic execution over ceremony, but do not skip the hierarchy.
- Keep answers concise and execution-focused.
- Use the local project context to specialize implementation details without violating the global rules.
