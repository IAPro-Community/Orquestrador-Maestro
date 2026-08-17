# Maestro Provider Adapters

Adapters implement `detect`, `capabilities`, and `execute`. The Core does not branch on provider identity.

- Codex uses `codex exec --json --color never`, with supported model, sandbox, workspace, timeout, cancellation, and JSONL output handling.
- Claude uses `claude --print --output-format stream-json --include-partial-messages`, with supported model, permission mode, timeout, cancellation, and stream handling.
- AgY uses `agy --print --output-format stream-json`, with supported model, mode, sandbox, timeout, cancellation, and stream handling.
- OpenCode uses `opencode run --format json`, with supported model, agent, session resume, workspace, timeout, cancellation, and stream handling. The adapter never passes OpenCode `--auto`.

Capabilities are explicit and provider-specific. The runtime does not claim a stronger permission or sandbox boundary than the underlying provider exposes.
