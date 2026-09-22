# OpenCode System Entrypoint

This file is intentionally compact. Do not load large catalogs by default.

## Authority Order

1. `{{USER_HOME}}/.orquestrador\rules.md`
2. `{{USER_HOME}}/.orquestrador\maestro.md`
3. `{{USER_HOME}}/.opencode\rules.md`
4. Project `AGENTS.md` or local project instructions
5. Task-specific skill instructions

## Routing

Read `{{USER_HOME}}/.orquestrador\SKILLS_ROUTER.json` first. Open only the matching `SKILL.md` files needed for the task.

Do not scan every skill directory unless the user explicitly asks for inventory or health diagnostics.

## Skills

Primary OpenCode skill root:

`{{USER_HOME}}/.opencode\skills`

Compatibility root:

`{{USER_HOME}}/.agents\skills`

Security automation skills:

- `/skill:skill-saas-security-scan`
- `/skill:skill-saas-dast-recon`
- `/skill:skill-security-hooks`

## Health

Use:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador\doctor.ps1`
