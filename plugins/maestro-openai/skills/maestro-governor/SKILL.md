---
name: maestro-governor
description: Keep Codex Desktop and ChatGPT Work scoped with Maestro progressive context, selected skills, and bounded tool exploration.
---

# Maestro Governor

Use the Maestro policy already injected for the current turn. Do not load broad repository context or multiple skills speculatively.

- Always pass the current project workspace absolute `cwd` to Maestro MCP tools.
- Use `maestro_route` only when routing is missing or the task materially changes.
- Use `maestro_context` only when the current working set is insufficient.
- Use `maestro_skill` only for a skill selected by Maestro routing.
- Respect the current complexity context budget and subagent authorization.
- Prefer narrow file reads and targeted searches before expanding scope.
- Preserve native Codex/Work behavior for trivial requests; do not create a Mission unless the task actually needs orchestration.
- If the tool governor rejects a repository-wide scan, narrow the scope instead of bypassing the governor.
