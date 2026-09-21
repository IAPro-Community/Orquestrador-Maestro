# Maestro Resolution Engine

## Status

Canonical runtime architecture for resolution lifecycle on `feature/adaptive-resolution-runtime`.

The Resolution Engine extends the existing Maestro Runtime. It does not create a second RunStore, Task model, verification engine, governance system, skill catalog, or telemetry store.

Automatic `enforce` remains gated. Normal CLI execution accepts `shadow` and `advisory`; promotion to enforcement requires policy-bound hard benchmark evidence.

## Purpose

A provider process finishing is not sufficient proof that a Task is done.

The canonical flow is:

```text
Mission
  ↓
Task
  ↓
Resolution Contract
  ↓
Resolution Policy
  ├─ Context acquisition
  ├─ Capability selection
  ├─ Budget
  ├─ Strategy
  └─ Escalation
  ↓
Execution
  ↓
Verification
  ↓
Review
  ↓
Definition of Done
  ↓
Validated Outcome
  ↓
Evidence + Telemetry + Memory
```

The engine answers one operational question: **is there enough deterministic evidence to consider the requested outcome resolved?**

## Source of truth

The product truth hierarchy is:

```text
Runtime code
  ↓
Tests
  ↓
docs/product/CAPABILITY_MATRIX.json
  ↓
docs/product/PRODUCT_SPEC.md
  ↓
README / public claims
```

Canonical implementation lives under `runtime/resolution/`.

The historical `runtime/resolution/adaptive-resolution.js` module is a compatibility facade for experiments and older callers. It is not a second Resolution runtime.

## Resolution Contract

Each Run stores one canonical contract in `run.metadata.resolution`.

The contract contains:

- policy and mode;
- strategy (`targeted`, `balanced`, or `deep`);
- the existing cognitive budget plus its reservation;
- evidence candidates, selected evidence and rejection reasons;
- bounded escalation history;
- validators;
- Definition of Done;
- Validated Outcome.

The Definition of Done reuses Maestro governance contracts through `deriveOutcomeContract()`; completion eligibility reuses `isTaskCompletionEligible()`.

## Outcome states

Canonical Task outcome states are:

- `running`
- `verifying`
- `needs_attention`
- `blocked`
- `validated`
- `failed`

A completed process does not imply a validated Task.

A Task reaches `validated` only when its applicable verification, completion/evidence requirements and review gates are satisfied.

Outcome history is append-only at the event level:

- `outcome.validated`
- `outcome.revoked`
- `outcome.revalidated`

A later failing Run never erases evidence that an earlier Run had once validated the same semantic Task.

## Mission Definition of Done

Mission completion is derived from canonical Task outcomes, not from Promise resolution or the absence of thrown exceptions.

The Mission rule is:

```text
all planned Tasks validated
→ Mission resolution = validated
→ Mission status = completed
```

If Tasks require attention or are blocked, the Mission entity status is `blocked` and the more precise state remains in `mission.metadata.resolution.state`. Any definitive Task failure makes the Mission failed.

An empty Task set never validates a Mission.

## Evidence and Proof Bundle

Produced evidence is persisted only when it is actually supplied by the request/provider/runtime integration. Maestro does not invent criterion coverage.

Evidence can link:

- Task
- Run
- Artifact
- Verification
- acceptance criterion
- producer and confidence

`proof.task` projects the full Task chain across Runs, Executions, Artifacts, Verifications, Evidence and outcome events.

`proof.mission` aggregates Task Proof Bundles and includes the derived Mission resolution.

These are projections over the existing RunStore, not a second persistence graph.

## Context and evidence ranking

Context responsibilities are:

```text
Collectors
  ↓
Signals
  ↓
Evidence Ranker
  ↓
ContextBudget
```

Signals are deterministic or measured and retain provenance:

- relevance
- reliability
- freshness
- failure relation
- dependency proximity

`ContextBudget` remains the hard limit.

In `shadow` and `advisory`, ranking is calculated and exposed but does not silently replace normal context selection.

Automatic context behavior remains behind the promotion boundary.

## Escalation semantics

Canonical failure classes are:

- `insufficient-context`
- `provider-failure`
- `validation-failure`
- `tool-failure`
- `policy-block`
- `human-required`

Only `insufficient-context` is evidence that buying more context may help.

A provider/transport failure can trigger provider handoff but must not enlarge context.

A deterministic validation failure must not buy more reasoning/context automatically.

Escalation is bounded by the Resolution Contract.

## Provider handoff

Provider fallback is explicit and bounded.

A provider failure can create a provider-neutral checkpoint containing:

- Task identity and objective;
- requirements and decisions;
- files changed;
- Evidence references;
- Verification and Review summaries;
- remaining budget;
- failure reason and hash.

The next provider starts a fresh Run for the same semantic Task.

Fallback provider model selection is provider-safe:

- the primary attempt keeps its explicitly requested model;
- a fallback specified only by provider ID uses that provider's default model;
- a fallback may explicitly provide `{ providerId, model }`.

Validation failure, policy block or human-required outcomes do not trigger arbitrary provider switching.

## Budget lifecycle

Resolution budget accounting uses:

```text
reserve → commit
reserve → release
```

Observed dimensions are kept separate:

- provider tokens;
- estimated Maestro context tokens;
- calls;
- observed agents;
- retries;
- escalations;
- duration.

Unknown values remain `null`; they are never converted to zero.

No monetary cost is asserted without a trusted pricing source.

## Telemetry and TTVO

Mission instrumentation observes the shared provider boundary used by interview, planning, execution and review.

When observation is incomplete, total token usage is unavailable rather than partial data being presented as complete.

For a validated Mission with complete usage, Maestro records Tokens To Validated Outcome (TTVO).

Benchmark-only authenticated output additionally exposes non-sensitive Mission resolution counters:

- task count;
- validated tasks;
- first-pass validated tasks;
- automatic retries;
- escalations;
- provider switches;
- TTVO.

The derived evidence report may calculate mission validation rate, first-pass Task validation rate, retry Mission rate, escalation Mission rate and provider-switch Mission rate. These metrics are descriptive and do not by themselves activate enforcement.

## Concurrency

The JSON RunStore serializes independent Maestro processes with an OS-visible lock file.

Every mutation reloads the latest committed file inside the critical section and persists through atomic temporary-file rename.

This prevents stale in-memory writers from silently overwriting concurrent committed state while retaining the existing portable JSON store.

## Surfaces

The existing surfaces consume Resolution projections; no parallel UI is introduced.

Bridge / Protocol:

- `resolution.get`
- `evidence.list`
- `evidence.get`
- `proof.task`
- `proof.mission`

Cockpit/TUI and the VS Code client expose the existing Task/Run state with Resolution fields such as state, strategy, budget, evidence, escalation and verification.

## Rollout modes

### shadow

Collect and expose Resolution decisions and telemetry without changing normal selection behavior.

### advisory

Expose recommendations and projections while keeping automatic policy changes disabled.

### enforce

Implemented as a guarded policy mode but intentionally unavailable from normal CLI execution until the promotion gate is satisfied and an explicit authorization is provided.

The default promotion evidence gate requires policy-bound, isolated, hard-validated paired benchmark evidence with no acceptance regression and trusted comparable token measurements.

A `PROMOTION_READY` result is evidence readiness only. It does not flip Runtime defaults.

## Non-goals

This work does not add:

- a learned/ML policy;
- a second skill registry;
- a second Mission/Task/Run model;
- another verification engine;
- a graph database;
- autonomous monetary FinOps;
- unbounded agent loops;
- implicit provider/model routing.

Those require separate evidence and product decisions.
