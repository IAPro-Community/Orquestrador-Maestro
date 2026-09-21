# Adaptive Resolution Runtime

## Status

Experimental V1, shadow-only.

This branch extends the current JavaScript Runtime. It does not introduce a second RunStore, a second cognitive-budget system, or a competing governance layer.

## Goal

Optimize **cost to a hard validated outcome**, not merely prompt size.

The current Maestro already owns execution, cognitive budgets, verification, evidence gates, provider telemetry, governance, and persistence. Adaptive Resolution consumes those contracts and adds two things:

1. advisory ranking of candidate evidence before future context expansion;
2. validated-outcome metrics attached to the existing `cognitiveTelemetry`.

V1 still never changes which context the provider actually receives. It measures first. In addition to V0 outcome telemetry, it now records a hash-only manifest of the prompt authored by Maestro and compares candidate evidence against that observable prompt surface.

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

## Shadow Contract

V1 remains deliberately non-enforcing:

- it cannot be switched to an enforce mode;
- it does not block an existing Run;
- it does not replace current context construction;
- it does not change provider prompts;
- it records only advisory evidence selection and outcome telemetry.

Promotion beyond shadow mode requires paired benchmark evidence that the new policy improves validated outcomes without unacceptable regression in latency, quality, or reliability.

## Validated Outcome

A V0 outcome is considered hard validated only when:

- the Run completes;
- deterministic verification passes;
- the existing completion/evidence gate is eligible;
- an independent review, when present, is not rejected, inconclusive, or unavailable.

This deliberately reuses current Maestro semantics instead of creating a second definition of success.

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
- `runtime/resolution/adaptive-resolution.js`: budget mapping, shadow plan, outcome telemetry, aggregation.
- `runtime/resolution/__tests__/adaptive-resolution.test.js`: deterministic unit tests.
- `runtime/resolution/__tests__/application-integration.test.js`: integration contract with the existing application/runtime.
- `runtime/application/maestro-application.js`: lifecycle integration.
- `orquestrador/hooks.md`: compact shadow-mode operating rule.

## Rollout

1. **V0 — shadow:** implemented; collect validated outcome telemetry without changing execution.
2. **V1 — evidence evaluation:** implemented for the Maestro-authored prompt surface; compare ranked evidence hashes against prompt manifests and validated outcomes.
3. **V2 — progressive context experiment:** next; allow advisory-selected context in controlled benchmark scenarios.
4. **V3 — progressive escalation:** evaluate targeted -> balanced -> deep using validation failures and evidence gaps.
5. **V4 — learned policy:** only after enough validated, privacy-safe runs exist to beat deterministic baselines.

A learned model is not the starting point. The dataset and rollback criteria come first.
