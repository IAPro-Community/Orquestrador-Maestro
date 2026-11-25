# Harness tranche — custo, memória, homologação e quality profiles (2026-11-24)

This tranche implements the parts of #44/#41/#48/#82 that do not depend on
publishing, on a Nexus push, or on hardware owned by the maintainer. It does
not close any of those issues.

## 1. Measured cost (#48/#67)

- `runtime/telemetry/provider-usage.js` keeps the provider's own billed number
  (`total_cost_usd` for Claude-like CLIs, `part.cost` per `step_finish` for
  OpenCode, forward-compatible fields for Codex). Cost is never derived from a
  token count here.
- `runtime/telemetry/cost-estimator.js` multiplies provider-reported tokens by
  an operator-maintained, versioned price table
  (`docs/product/PROVIDER_PRICING.json`). The shipped table has no models: a
  price the repository cannot cite is not published. Matching is exact
  (`provider/model`, then `model`).
- Totals are all-or-nothing. A run with missing usage, a missing price, a
  missing cache rate or an incomplete invocation stays `null` with an explicit
  reason, so a partial sum can never look cheaper than the real spend.
- `runtime/runs/goal-loop-driver.js` records `usage.totalCostUSD` (cumulative),
  `usage.iterationCostUSD` (this iteration) and `usage.costBasis`; the
  validator rejects a record where the iteration exceeds the total.

## 2. Memory contract (#41)

- `runtime/bridge/memory-contract.js` is the single source of truth for the
  Bridge memory surface. `createBridge` validates it at construction time, so
  adding, renaming or dropping a memory method is a hard failure instead of a
  silent capability drift.
- `scripts/check-memory-contract.js` (`npm run memory:contract`) checks the
  code and the integration document together. It runs as step 12 of
  `npm run verify:pr`.

## 3. Reproducible homologation (#44)

- `scripts/homologate-linux-claude.sh` and
  `scripts/homologate-windows-claude.ps1` run the acceptance items against a
  throwaway home and write `EVIDENCE.json` (SHA, branch, package version, OS,
  architecture, Node, PowerShell, Claude version, per-case status).
- Without a real Claude Code CLI the scripts use a stub only when the operator
  opts in, and the evidence says `stub (...)`. A case that cannot run on the
  current host is reported as `SKIP`, never as a pass.
- The `homologation` job in `.github/workflows/test.yml` runs both scripts on
  ubuntu, windows and macOS runners.

## 4. Harness surfaces (#82, partial)

- `runtime/config/feature-flags.js`: closed registry, every flag OFF by
  default, strict validation on writes, tolerant fail-closed reads and a
  non-destructive rollback (turn the flag off; no stored data is removed).
- `runtime/planner/spec-traceability.js`: short spec `criterion → verifier →
  source → task`. Coverage exists only through an explicit `covers` anchored to
  the `taskId`; a criterion without a verifier is reported as `unverified`, and
  duplicate coverage is reported as a smell.
- `runtime/quality-profiles/` (consumed through `runtime/profiles/index.js`):
  per-stack requirements for functional, responsive and accessibility
  verification. A green build never satisfies a functional or UI requirement,
  an unknown stack blocks with `UNKNOWN_STACK`, and operator-added requirements
  are validated instead of being silently dropped.
- `tests/cli-durable-worker-real-provider.test.js` is the opt-in certification
  matrix for real provider CLIs (`MAESTRO_REAL_PROVIDER_E2E=1`). It records
  versions, OS and architecture, proves the persisted Run kept the selected
  provider (no silent fallback), and exercises queued cancellation and stale
  claim recovery on the same RunStore. See
  `docs/product/REAL_PROVIDER_CERTIFICATION.md`.

## Explicit limits

- No provider is certified by this document. macOS arm64, Windows amd64 and a
  second host are still unverified.
- The quality profiles describe what evidence is required; they do not run
  commands and they do not certify a UI.
- The harness surfaces are opt-in and default OFF. Turning them on does not
  change the durable admission, approval or reconciliation contracts.