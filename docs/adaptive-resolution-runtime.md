# Adaptive Resolution Runtime

## Status

Experimental V2, context-budget experiment; normal Runtime execution remains shadow-only.

This branch extends the current JavaScript Runtime. It does not introduce a second RunStore, a second cognitive-budget system, or a competing governance layer.

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
- `runtime/resolution/context-experiment.js`: explicit context-brief control/treatment policy, authority-coverage gate, and paired metrics.
- `runtime/context/context-budget.js`: serialization-aware token estimation.
- `runtime/context/context-engine.js`: brief compaction, DEV deduplication, fallback, and experiment metrics.
- `scripts/adaptive-context-benchmark.js`: deterministic paired benchmark for a real project.
- `runtime/resolution/adaptive-resolution.js`: budget mapping, shadow plan, outcome telemetry, aggregation.
- `runtime/resolution/__tests__/adaptive-resolution.test.js`: deterministic unit tests.
- `runtime/resolution/__tests__/application-integration.test.js`: integration contract with the existing application/runtime.
- `runtime/application/maestro-application.js`: lifecycle integration.
- `orquestrador/hooks.md`: compact shadow-mode operating rule.

## Rollout

1. **V0 — shadow:** implemented; collect validated outcome telemetry without changing execution.
2. **V1 — evidence evaluation:** implemented for the Maestro-authored prompt surface; compare ranked evidence hashes against prompt manifests and validated outcomes.
3. **V2 — progressive context experiment:** implemented on ContextEngine with real serialization accounting, manifest-based deduplication, authority gates, and paired brief budgets.
4. **V3 — progressive escalation:** next; escalate targeted -> balanced -> deep when planning/validation evidence shows the smaller context was insufficient.
5. **V4 — learned policy:** only after enough validated, privacy-safe runs exist to beat deterministic baselines.

A learned model is not the starting point. The dataset and rollback criteria come first.
