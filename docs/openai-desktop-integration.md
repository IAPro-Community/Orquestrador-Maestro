# OpenAI Desktop integration

The V1 line integrates Orquestrador Maestro with Codex Desktop and hook-capable ChatGPT Work runtimes through the OpenAI plugin lifecycle.

## Design

The plugin is deliberately thin. It forwards lifecycle events to the installed Maestro CLI using the internal `desktop-hook` command. Router v3, Complexity Gate, skill selection, session state and policy stay in the canonical Maestro runtime.

Default mode is `optimize`.

Modes:

- `off`: no policy or state.
- `observe`: classify and record without injecting model-visible context.
- `optimize`: inject a compact turn budget and prevent unrequested subagent fan-out for MICRO/SIMPLE turns.
- `strict`: enforce the current subagent budget for every complexity level.

Set `MAESTRO_OPENAI_MODE` to change the mode.

## Hooks

- `SessionStart`: bootstrap or rehydrate only the compact Maestro policy.
- `UserPromptSubmit`: run Complexity Gate + Router v3 and inject a bounded developer-context policy.
- `PreToolUse`: guard `Agent`/`spawn_agent` against unnecessary fan-out.
- `SubagentStart`: keep delegated work narrow.
- `PreCompact` / `PostCompact`: persist compaction counters; the following `SessionStart(source=compact)` performs rehydration.
- `SessionEnd`: mark session state closed.

The integration fails open: if the Maestro CLI is unavailable, the hook exits successfully without blocking Codex or Work.

## Context policy

The OpenAI integration uses a smaller injection budget than the core task budget:

| Complexity | Max injected context |
| --- | ---: |
| MICRO | 220 tokens |
| SIMPLE | 350 tokens |
| STANDARD | 600 tokens |
| COMPLEX | 900 tokens |
| DEEP | 1200 tokens |

These are ceilings for Maestro-added context, not provider token limits.

## Local repository installation

The repository publishes a local marketplace in `.agents/plugins/marketplace.json` and enables `orquestrador-maestro@maestro-repo` in `.codex/config.toml`.

Plugin hooks still require the normal Codex trust review. Changing a hook changes its trust hash and requires review again.

## Boundaries

The integration does not attempt to intercept hidden model reasoning or claim exact token savings. It controls what Maestro can control: injected context, skill loading guidance, task scope and avoidable subagent fan-out.
