---
name: maestro-governance
description: Keep Codex or ChatGPT Work tasks scoped, context-efficient, and aligned with Orquestrador Maestro routing decisions.
---

# Maestro governance

Use the Maestro hook-provided turn policy as a budget, not as a replacement for the user's request.

- Prefer the smallest useful working set of files and context.
- Load only the skill IDs selected by Maestro when those skills are available.
- Do not turn a trivial request into a Mission or multi-step orchestration flow.
- Do not spawn subagents unless the user explicitly requests parallel/multi-agent work or Maestro explicitly allows fan-out.
- Preserve Codex/Work native behavior; Maestro guidance is additive and should not force a different interface.
- If Maestro is unavailable, continue normally rather than blocking the user's task.
- Never invent token counts. Treat provider usage as unknown unless the runtime reports it.
