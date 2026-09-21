# Adaptive Resolution Experiments

> **Historical / compatibility documentation.** The canonical production architecture is now the [Maestro Resolution Engine](maestro-resolution-engine.md) under `runtime/resolution/`. This document remains to preserve the V0–V4.6 experiment history, benchmark policy identities and reproducibility contracts. It is not a second Runtime or source of truth.

## Status

Historical experiment line retained for benchmark compatibility. No learned policy is active. Normal Runtime execution remains non-enforcing (`shadow` / `advisory`); `enforce` remains promotion-gated.

These experiments extend the current JavaScript Runtime. They do not introduce a second RunStore, cognitive-budget system, governance layer or Resolution lifecycle.

## Goal

Optimize **cost to a hard validated outcome**, not merely prompt size.

The current Maestro already owns execution, cognitive budgets, verification, evidence gates, provider telemetry, governance, and persistence. Adaptive Resolution consumes those contracts and adds two things:

1. advisory ranking of candidate evidence before future context expansion;
2. validated-outcome metrics attached to the existing `cognitiveTelemetry`.

V2 targets the real planning-context path. It fixes object token accounting in ContextBudget, removes DEV items already represented by context brief, compacts the brief object to the content and provenance actually consumed by planning, and adds an explicit control/treatment experiment for context-brief size. Normal execution keeps the existing 8,000-character brief baseline.

## Architecture

```text
Task
  |
  +--> existing evaluateCognitiveBudget()
  |       lean / standard / assurance
  |
  +--> Adaptive Resolution plan (shadow)
  |       targeted / balanced / deep
  |       evidence ranking only
  |
  +--> existing MaestroApplication execution
  |       provider -> verification -> completion/evidence gates
  |
  +--> existing cognitiveTelemetry
          |
          +--> resolution telemetry
               hardValidated
               observed provider tokens
               selected evidence estimate
               Maestro prompt manifest (hashes only)
               recommendation/prompt overlap
               budget overflow
```

There is intentionally no separate persistence engine. The plan is stored in Run metadata and the outcome metrics extend the existing `cognitiveTelemetry` object.

## Strategy Mapping

Adaptive Resolution uses the cognitive budget selected by existing governance as the source of truth.

| Existing cognitive budget | Shadow strategy |
|---|---|
| `lean` / `LEAN` | `targeted` |
| `standard` / `STANDARD` | `balanced` |
| `assurance` / `ASSURANCE` | `deep` |

The existing `contextTokens` limit remains authoritative. Adaptive Resolution does not create a second token budget.

## Evidence Ranking

Integrations may optionally provide `evidenceCandidates`. Candidate signals must be measured or deterministic; callers must not fabricate optimizer scores.

The V0 heuristic uses:

- relevance;
- reliability;
- freshness;
- relation to the observed failure;
- dependency proximity;
- estimated token cost.

Conceptually:

```text
information value =
  weighted evidence signals

cost factor =
  1 / (1 + estimated tokens / token scale)

priority =
  information value * cost factor
```

Candidates are deduplicated by `contentHash` when available. Required evidence is retained even when it exceeds the budget, and the overflow is reported. Optional evidence is selected by priority while it fits the existing context-token budget and strategy candidate limit.

For privacy, durable plan metadata contains IDs, hashes, scores, token estimates, and counts. It does not persist candidate source text or absolute paths.

## Maestro Prompt Manifest

V1 introduces an observable boundary around the prompt that **Maestro itself authors**. Each prompt section is represented durably only by:

- stable non-sensitive section ID and kind;
- SHA-256 digest of the semantic section payload;
- SHA-256 digest of the rendered prompt section;
- UTF-8 byte count of the rendered section;
- an explicitly estimated token count using `ceil(bytes / 4)`.

The manifest also records a hash and byte size for the complete Maestro-authored prompt. Raw prompt content, workspace paths, source code, secrets, and user text are not copied into the manifest.

This is not the full model context. Provider system prompts, CLI-added instructions, hidden tool context, cache behavior, and provider-side transformations remain outside Maestro visibility.

V1 compares selected evidence candidates that have SHA-256 content hashes against the semantic payload hash of each prompt section. Rendering prefixes such as `Task:` or `Workspace:` therefore do not create false mismatches. The resulting overlap is descriptive only:

- `selectedAlreadyPresent`: recommended evidence already represented by an observed Maestro prompt section;
- `selectedNovel`: comparable recommended evidence not represented there;
- `recommendationOverlapRate`: overlap among selected candidates that supplied hashes;
- `promptCoverageRate`: observed prompt sections matched by selected evidence.

Zero overlap is not automatically bad; it may mean the optimizer found useful evidence that the current prompt never included.

## V2 Context Budget Experiment

The existing ContextEngine had two measurable sources of avoidable token cost:

1. object-valued context items were charged as a fixed 25-token estimate even when JSON serialization contained thousands of characters;
2. `context.brief` and raw `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, and `DEV/SPECS/ACTIVE.md` could travel together even when the brief manifest already proved that the same DEV source was represented.

V2 fixes both. ContextBudget now evaluates the serialized `{ intent, items }` envelope that SemanticPlanner actually receives, so ordinary selected context stays within the configured token estimate (critical/user-decision items retain the existing override behavior). ContextEngine prefers the compact `context.brief`; DEV items covered by its manifest are removed. If the brief itself cannot fit the requested token budget, ContextEngine falls back to the raw DEV items instead of silently dropping both representations.

The persisted/forwarded brief object is also reduced to `task`, `content`, and minimal manifest provenance. Budget/state/files metadata that duplicated the briefing content is no longer sent to the semantic planner.

For benchmark experiments, ContextEngine accepts an explicit authorized contract with `control` or `treatment`, an opaque `pairId`, and a strategy:

- `targeted`: 4,000 briefing characters;
- `balanced`: 8,000 characters (current baseline);
- `deep`: 12,000 characters.

These are experiment envelopes, not claims of optimality. For treatment runs, Maestro first builds the current 8,000-character baseline locally, then builds the candidate envelope. A treatment is accepted only when the authority entries that exist in the project — DEV state summary, `AGENTS.md`, `DEV/HANDOFF.md`, and `DEV/SPECS/ACTIVE.md` — keep the same selected-content digest as the baseline. Missing or changed authority evidence causes an immediate fallback to the already-built baseline.

Use:

```bash
node scripts/adaptive-context-benchmark.js --project-path . --task "current objective" --strategy targeted
```

The report compares deterministic serialized-token estimates and authority coverage. Fallback runs retain attempted missing/changed-authority counts separately from the final baseline coverage, so failed experiments remain diagnosable. Provider-reported input/output tokens and hard validated outcomes remain the higher-level metric for later stages.

## V3 Progressive Planning

V3 moves the decision boundary from "how much context exists" to "when is more context worth another model call."

The current SemanticPlanner keeps its normal compatibility behavior, including its configured retry limit. V3 adds an experimental one-attempt diagnostic mode and a separate progressive controller:

```text
targeted context
   |
 one planner call
   |
   +-- valid graph --------------------------> stop
   |
   +-- validation failure --> balanced context
                                  |
                              one planner call
                                  |
                                  +-- valid --> stop
                                  |
                                  +-- validation failure --> deep context
                                                               |
                                                           one planner call
                                                               |
                                                         valid / fallback
```

The controller does **not** escalate context for malformed JSON/structure or provider/transport failures. Those failures provide no evidence that a larger context would help. It can fall back deterministically instead.

Each ContextEngine result now exposes a SHA-256 `contextDigest`. If a targeted experiment already fell back to the 8,000-character baseline, the balanced step has the same digest and is skipped, preventing a duplicate model call with effectively identical context.

For context reduction, required authority entries must keep the same digest as the 8k baseline. For `deep` expansion, the gate requires required authority paths to remain present but permits their digest to change because additional selected content is expected.

SemanticPlanner planning telemetry contains only hashes/counts/timing/usage: prompt hash/bytes, estimated prompt tokens, provider-reported tokens when available, blocker codes, and outcome class. It does not store provider response content.

A live paired benchmark is available but intentionally requires explicit execution because it calls a real model:

```bash
node scripts/adaptive-planning-benchmark.js \
  --project-path . \
  --task "current objective" \
  --provider opencode \
  --model default \
  --start-strategy targeted \
  --execute
```

The script requests read-only provider execution and reports control versus progressive model calls, provider tokens when exposed, estimated prompt tokens, strategy reached, and fallback use. These metrics are descriptive; a valid TaskGraph is not proof of equivalent downstream implementation quality.

## V4 Evidence Dataset and Promotion Gate

V4 deliberately does **not** train a model yet. It first creates a reproducible evidence boundary for any future learned policy.

Three evidence levels are normalized into one privacy-safe dataset:

- `context-estimate`: V2 context-size experiments. Useful for budget behavior, never sufficient for production promotion.
- `planner-validated`: V3 progressive-planning experiments. Useful for retry/escalation behavior, never sufficient for production promotion.
- `hard-validated`: paired benchmark runs evaluated by the external verifier. This is the only evidence level eligible for promotion.

Dataset rows contain hashes, policy fingerprints, conditions, acceptance booleans, token/duration measurements, strategy metadata, and integrity diagnostics. Raw task text, provider output, source code, absolute paths, git diffs, and verifier output are not copied into the dataset.

Promotion evidence is also **policy-bound**. A generic Maestro benchmark cannot prove Adaptive Resolution V3. Each known policy has a human-readable `policyId` and a SHA-256 `policyFingerprint` computed from a canonical policy contract (strategy sequence, escalation rules, budget envelopes, authority gates, and fallback semantics). The treatment run must carry that fingerprint; otherwise the hard-validated pair remains useful benchmark evidence but cannot promote that policy. The normalized dataset itself also receives a deterministic SHA-256 fingerprint, so a gate decision can be tied to the exact evidence rows evaluated.

The default promotion gate is conservative:

- at least 20 policy-bound hard-validated pairs, matching the repository's planned official benchmark sample floor;
- at least 20 pairs where both sides passed and provider token totals are comparable;
- no aggregate acceptance-rate regression;
- positive median token savings;
- no integrity-invalid pairs.

The gate only emits `PROMOTION_READY` or `HOLD`. It never changes Runtime configuration.

V2/V3 benchmark reports can now be persisted explicitly with `--out`; their report objects omit raw task text and store only `taskHash` plus byte count. Example:

```bash
node scripts/adaptive-planning-benchmark.js \
  --project-path . \
  --task "current objective" \
  --provider opencode \
  --execute \
  --out .maestro/adaptive/planning-pair.json
```

To build/evaluate a derived dataset without model calls:

```bash
node scripts/adaptive-resolution-evaluate.js \
  --report .maestro/adaptive/planning-pair.json \
  --benchmark-evidence benchmark-harness/evidence \
  --candidate-policy adaptive-progressive-planning-v3 \
  --out .maestro/adaptive/evaluation.json
```

The evaluator accepts a known policy ID as an alias but resolves it to the contract SHA-256 before gating. Hard validated V3 quality evidence is produced with `orquestrador-maestro benchmark adaptive-pair`, which runs only the `maestro` control and `maestro-adaptive` treatment through the real `go --auto` path and requires runtime confirmation of the canonical policy fingerprint. End-to-end Maestro token totals are accepted only when the MissionUsageMeter observes every provider invocation completely; otherwise the total remains `null`. The authenticated benchmark marker also carries Mission resolution counters used for descriptive first-pass/retry/escalation/provider-switch metrics. Local `adaptive-pair` runs remain analysis-only until executed in a policy-matching isolated image. The promotion gate therefore remains `HOLD` unless evidence is policy-bound, isolated, verifier-valid, token-comparable, and large enough.

## Experimental Boundary

Normal Maestro execution remains non-enforcing:

- there is no general `enforce` mode for Adaptive Resolution;
- ordinary Runtime runs do not replace the existing execution/context policy;
- V0/V1 observation remains advisory and hash/count based;
- V2 context-budget changes and V3 progressive planning require explicit experiment authorization;
- live V3 benchmark execution additionally requires `--execute`.

No V2/V3 experiment is promoted into default behavior solely because it reduces estimated tokens or model calls. Promotion requires paired evidence that hard validated outcomes, reliability, and latency remain acceptable.

## Validated Outcome

A V0 outcome is considered hard validated only when:

- the Run completes;
- deterministic verification passes;
- the existing completion/evidence gate is eligible;
- an independent review, when present, is not rejected, inconclusive, or unavailable.

This deliberately reuses current Maestro semantics instead of creating a second definition of success.

## V4.6 Mission Usage Meter

V4.6 instruments the shared provider boundary used by interview, planning, execution and review. Each fresh `provider.execute()` invocation must leave exactly one ledger record before a mission total can be considered complete.

Completeness is fail-closed:

- a provider call that throws before returning a handle makes the mission incomplete;
- a handle without an observable result promise makes the mission incomplete;
- a rejected provider result makes the mission incomplete;
- resumed/continued sessions are not blindly added to fresh-session totals;
- OpenCode `task` subagents make root-session usage incomplete unless step usage for each child session is explicitly present in the observed stream;
- repeated instrumentation of the same provider registry is idempotent;
- a mission with zero provider invocations is an exact zero-token mission, not an unavailable measurement.

Observed partial counters remain available for diagnosis, but `totalTokens` stays `null` whenever any invocation is incomplete. This prevents root-session OpenCode tokens from being presented as end-to-end mission cost when an unobserved child agent may have consumed additional tokens.

## Token Metric

When provider usage is explicitly reported or safely derived, the Resolution telemetry records:

```text
observedTokensToValidatedOutcome =
  provider input tokens + provider output tokens
```

When usage is unavailable, the value remains `null`. Zero is never used as a substitute for unknown.

The evidence ranker separately records **estimated selected context tokens**. V1 also records an estimated token count for the Maestro-authored prompt. Neither estimate is added to provider-reported input tokens because that could double-count context already represented in provider usage.

Exact end-to-end TTVO still requires instrumentation at the real context acquisition/provider boundary. Until that exists, the metric is intentionally labeled `provider-only`.

## Files

- `runtime/resolution/evidence-ranker.js`: deterministic evidence ranking and deduplication.
- `runtime/resolution/prompt-manifest.js`: privacy-safe observation of Maestro-authored prompt sections and recommendation overlap.
- `runtime/resolution/context-experiment.js`: explicit context-brief control/treatment policy, authority-coverage gate, and paired metrics.
- `runtime/context/context-budget.js`: serialization-aware token estimation.
- `runtime/context/context-engine.js`: brief compaction, DEV deduplication, fallback, and experiment metrics.
- `scripts/adaptive-context-benchmark.js`: deterministic paired benchmark for a real project.
- `runtime/resolution/progressive-planning.js`: validation-driven context escalation and paired planning metrics.
- `scripts/adaptive-planning-benchmark.js`: opt-in live control/treatment planner benchmark.
- `runtime/planner/semantic-planner.js`: bounded-attempt diagnostics and privacy-safe planning usage telemetry.
- `runtime/resolution/policy-identity.js`: canonical policy descriptors, IDs, and SHA-256 policy fingerprints.
- `runtime/resolution/experiment-dataset.js`: privacy-safe normalization of V2/V3 and hard benchmark evidence plus a deterministic dataset fingerprint.
- `runtime/resolution/promotion-gate.js`: policy-bound hard-evidence promotion readiness.
- `scripts/adaptive-resolution-evaluate.js`: offline dataset/gate evaluator; no provider calls.
- `runtime/resolution/adaptive-resolution.js`: budget mapping, shadow plan, outcome telemetry, aggregation.
- `runtime/resolution/__tests__/adaptive-resolution.test.js`: deterministic unit tests.
- `runtime/resolution/__tests__/application-integration.test.js`: integration contract with the existing application/runtime.
- `runtime/application/maestro-application.js`: lifecycle integration.
- `orquestrador/hooks.md`: compact shadow-mode operating rule.

## Rollout

1. **V0 — shadow:** implemented; collect validated outcome telemetry without changing execution.
2. **V1 — evidence evaluation:** implemented for the Maestro-authored prompt surface; compare ranked evidence hashes against prompt manifests and validated outcomes.
3. **V2 — progressive context experiment:** implemented on ContextEngine with real serialization accounting, manifest-based deduplication, authority gates, and paired brief budgets.
4. **V3 — progressive escalation:** implemented as an explicit experiment: one planning call per unique context, validation-driven escalation, duplicate-context skipping, and deterministic fallback.
5. **V4 — evidence dataset + promotion gate:** implemented; weak evidence is retained for analysis but only policy-bound hard-validated pairs can make a candidate promotion-ready.
6. **V4.5 — hard-evidence benchmark boundary:** implemented: real `go --auto` execution, dedicated `maestro-adaptive` treatment, runtime policy confirmation, and policy-bound evidence.
7. **V4.6 — mission usage completeness:** implemented conservatively; unobserved subagents or provider invocations invalidate the mission total instead of being silently omitted.
8. **V5 — learned policy:** not started. Training begins only after the V4 gate has enough policy-bound evidence to define labels and rollback criteria without guessing.

A learned model is intentionally not the current Runtime dependency.
