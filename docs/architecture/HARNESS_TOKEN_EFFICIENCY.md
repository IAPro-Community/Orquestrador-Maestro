# Harness-first token efficiency (1.2.0)

Primary workflow: native interactive harnesses, not Maestro go/run. Keep host session, tool permissions and continuation ownership. No additional LLM call for routing.

## Deterministic baseline
- OpenCode automatic instructions use the compact shared contract, not the full router.
- Native entrypoints point to one shared contract; DEV hydration is proportional, required project rules and durable evidence remain authoritative.
- `route explain --compact --json "task summary"` projects selected skills and budgets from Router V3 without echoing raw intent, rejected candidates or the workspace diff. Native routing ignores unrelated working-tree changes.
- Skill context estimates report their actual heuristic sum, not a clipped value. They are not measured provider tokens.
- Existing managed OpenCode JSON migrates exact legacy paths while preserving custom instructions and provider settings. JSONC, custom paths and managed overrides require inspection.

## Release evidence
Use same harness/version/model/effort and fixed fixtures for vanilla, v0.3.5, v1.1.1, pre-fix RC and corrected RC. Compare hard-validated outcomes, failed runs, input/output/cache/reasoning separately, calls, cost and latency. Include fresh and resumed sessions, cold/warm cache, clean and upgraded installs, rollback, all supported OSes. No percentage claims without real paired provider-reported evidence (see existing benchmark gate).

The OpenAI plugin retains its existing ledger and governor. Do not reuse ledger deduplication in hosts that rebuild system context per request without evidence of policy retention. Claude and Gemini prompt hooks reuse the same local router for bounded advisory context when selected skills or high complexity warrant it. Generic turns receive no extra policy; the hook never blocks, calls a provider or claims Goal state. Set MAESTRO_HARNESS_ROUTING=off for rollback. OpenCode's context hook is request-scoped and its admission is concurrent; retain the compact static route fallback until per-message association and retention are certified. All Goal lifecycle observations remain non-authoritative. No adaptive-policy promotion or managed-runtime rewrite is required for this baseline.


## Codex retention and tool semantics
The default optimize mode advises narrower shell scans without changing commands, output semantics, exit codes, or host permissions. Strict mode can explicitly deny broad scans; no shell rewrite grants approval. The local ledger suppresses repeated policies only after emission in the same workspace and invalidates the assumption at session start, compaction and end. This is conservative local bookkeeping, not proof of host context retention. Real interactive benchmark evidence is still required.
