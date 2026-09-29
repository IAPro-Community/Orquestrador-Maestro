# OpenAI Desktop integration

The V1 line integrates Orquestrador Maestro with local Codex Desktop and hook-capable ChatGPT Work runtimes through the OpenAI plugin lifecycle.

## Beta 3 design

The Desktop integration is a thin governor over the canonical Maestro runtime. It does not create another daemon, planner, skill catalog, or terminal runtime.

The flow is:

```text
UserPromptSubmit
  -> Complexity Gate
  -> Router v3
  -> Context Ledger
  -> inject policy only when the effective policy changes

Tool call
  -> PreToolUse
  -> Tool Governor
  -> allow, warn, or deny broad expansion according to the current budget

Need more context
  -> maestro_context / maestro_skill over local stdio MCP
  -> ContextEngine / SkillRegistry on demand
```

Default mode is `optimize`.

Modes:

- `off`: no Maestro Desktop policy or state.
- `observe`: classify and record without changing model-visible context or tool decisions.
- `optimize`: deduplicate policy injection, prevent unnecessary subagent fan-out, and guard broad repository scans for small tasks.
- `strict`: enforce the same governor across all complexity levels where the hook can safely make a deterministic decision.

Set `MAESTRO_OPENAI_MODE` to change the mode.

## Context Ledger

Each plugin session keeps a small local ledger under `PLUGIN_DATA`. It stores routing metadata, selected skill IDs, the current policy digest, counters, and the latest compact capsule. It does not persist the conversation transcript.

When two turns resolve to the same effective policy — mode, complexity, profile, selected skills, and subagent authorization — the second turn injects **zero repeated Maestro policy tokens**.

## Hooks

- `SessionStart`: injects nothing on normal startup; after compaction it rehydrates only the compact Maestro capsule.
- `UserPromptSubmit`: runs Complexity Gate + Router v3, updates the Context Ledger, and injects a bounded policy only when its digest changes.
- `PreToolUse`: governs `Agent/spawn_agent`, Bash, patch/read/search tools and MCP calls matched by the plugin. MICRO/SIMPLE tasks reject obvious repository-wide scans and unauthorized fan-out; STANDARD warns before broad expansion.
- `SubagentStart`: keeps delegated work narrow.
- `PreCompact`: persists a compact capsule with complexity, selected skills, budget counters and the current policy digest.
- `PostCompact`: records compaction completion.
- `SessionEnd`: closes the local ledger.

The integration is fail-open if the Maestro CLI itself is unavailable. Deliberate budget denials from a running governor are not treated as runtime failures.

## Automatic policy budget

These limits apply only to **Maestro-added automatic policy context**. They are not provider context-window limits and do not include context that Codex/Work itself chooses to keep.

| Complexity | Beta 3 automatic policy ceiling |
| --- | ---: |
| MICRO | 100 tokens |
| SIMPLE | 140 tokens |
| STANDARD | 200 tokens |
| COMPLEX | 300 tokens |
| DEEP | 450 tokens |

Repository context is no longer pushed automatically. When needed, the model can request bounded context through the MCP tools.

## Progressive-disclosure MCP

The plugin packages one local stdio MCP server with exactly three tools:

- `maestro_route(intent)`: returns Complexity Gate + Router v3 selection and the context budget.
- `maestro_context(intent, maxTokens?)`: invokes the canonical ContextEngine and returns only bounded task-relevant local context.
- `maestro_skill(id, maxTokens?)`: loads one selected skill body on demand.

The MCP process is host-managed and ephemeral. It is not the removed `cli-novo` daemon/socket runtime.

## Bootstrap skill

The plugin exposes one bootstrap skill: `maestro-governor`.

It teaches the host to use progressive disclosure and the three MCP tools. The full Maestro skill catalog is **not duplicated into the plugin**, avoiding speculative skill metadata and instruction loading.

## Personal installation

Install the CLI first, then register the desktop plugin:

```bash
npm install -g @iapro/orquestrador-maestro-cli@1.0.0-beta.3
orquestrador-maestro desktop-plugin install
orquestrador-maestro desktop-plugin status
orquestrador-maestro desktop-plugin doctor
```

The installer copies the plugin to `~/.codex/plugins/orquestrador-maestro` and adds or replaces only the Maestro entry in `~/.agents/plugins/marketplace.json`; unrelated personal plugins are preserved.

Restart ChatGPT Desktop or Codex after installation. Plugin hooks still require the normal host trust review. The installer and doctor do not bypass or force that trust decision.

## Diagnostics

`desktop-plugin doctor` validates:

- plugin installation and marketplace registration;
- portable and Codex-compatible manifests;
- hooks and launch scripts;
- bootstrap skill;
- MCP manifests and the three-tool MCP contract;
- a synthetic `UserPromptSubmit` hook execution.

The host's hook trust approval cannot be forced or proven by the CLI; the doctor reports that boundary explicitly.

Runtime counters can be inspected when the plugin data directory is available:

```bash
orquestrador-maestro desktop-plugin stats --plugin-data <PLUGIN_DATA>
```

Counters include routed turns, policy injections/skips, approximate Maestro-injected tokens, tool calls, denials/warnings and compactions.

## Local repository installation

The repository publishes a local marketplace in `.agents/plugins/marketplace.json` and can enable the Maestro plugin from the repository checkout. Existing sessions should be restarted after plugin manifest, hook, skill or MCP changes.

## Boundaries

The Desktop governor controls only surfaces exposed by the host: Maestro-added context, selected skill loading, local MCP context requests, supported `PreToolUse` calls, subagent fan-out and compact rehydration.

It does **not** own or remove the host's system context, conversation history, project attachments, Work/browser state, or hosted tools that are not exposed to lifecycle hooks. Therefore Beta 3 aims to make Maestro's own overhead close to the CLI and to constrain avoidable exploration; it does not claim exact token equivalence between CLI, Codex Desktop and ChatGPT Work.

Local hook and stdio MCP scripts must exist in the execution environment. Web/cloud Work surfaces require a separately deployable integration path and are not claimed as equivalent in Beta 3.
