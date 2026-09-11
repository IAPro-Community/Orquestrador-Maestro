# Evidence Policy

**SAME TASK | SAME MODEL | SAME FIXTURE | SAME RESOURCES | ISOLATED ENVIRONMENT | REAL AGENT EXECUTION | EXTERNAL ACCEPTANCE | RAW EVIDENCE | REPRODUCIBLE RESULTS**

## Core Principle

> We benchmark the workflow, not the prompt.

Evidence is the foundation of benchmark claims. This policy defines what counts as valid evidence, what is excluded, and how raw evidence is preserved.

## What Counts as Valid Evidence

Valid evidence must satisfy **all** of the following:

1. **Real agent execution** — The evidence comes from an actual agent run, not a simulation, mock, or synthetic generation.
2. **External acceptance** — Acceptance criteria are evaluated by commands outside the agent (e.g., `npx tsc`, `node -e`). The agent does not grade itself.
3. **Raw and unprocessed** — The evidence is the verbatim output of the run. No summarization, scoring, or interpretation is applied before storage.
4. **Containerized** — The run executed in an isolated container with deterministic resources.
5. **Paired** — The evidence belongs to a run that can be compared against another run with identical task, model, fixture, and resources.

### Valid Evidence Types

| Type | Description |
|---|---|
| Full transcript | Complete agent interaction log, including tool calls, file writes, and outputs |
| Build output | Verbatim output of compilation checks (e.g., `npx tsc --noEmit`) |
| Test output | Verbatim output of acceptance test commands |
| Timing data | Wall-clock timestamps for run start, run end, and each acceptance step |
| Container metadata | Image ID, resource limits, environment variables, exit code |

## What is Excluded

The following are **never** treated as valid benchmark evidence:

### Synthetic Evidence

- **LLM-generated summaries** of agent performance
- **Simulated runs** or mocked agent outputs
- **Hypothetical scenarios** ("if the agent had done X, it would have...")
- **Post-hoc reinterpretation** of raw evidence

### Infrastructure Evidence

- **Container startup time** — Not a measure of agent or workflow quality
- **Network latency** — Variable and irrelevant to workflow comparison
- **Provider API latency** — Outside the workflow being tested
- **Provisioning artifacts** — Image pulls, dependency installation (unless they are the workflow under test)

### Provider Smoke Evidence

- **API health checks** — "Can the model provider respond?" is not a benchmark question
- **Model availability tests** — Provider uptime is not workflow quality
- **Rate limit behavior** — Unless rate limiting is the specific workflow under test
- **Token count comparisons** — Without paired context, token counts are not meaningful evidence

### Subjective Evidence

- **Agent self-evaluation** — "I think I did well" is not evidence
- **Human preference scoring** — Unless blinded and paired
- **Qualitative impressions** — "The code looks cleaner" is not a benchmark claim

## Raw Evidence Preservation

Raw evidence must be preserved in its original form:

### Storage

- Evidence is stored in `evidence/<run-id>/` as raw files.
- Files are never modified after creation.
- Evidence directories are listed in `.gitignore` — they are not committed to the repository.

### Format

- Transcripts are stored as-is (typically JSON or structured text).
- Build and test output are stored as raw stdout/stderr.
- Timing data is stored as structured JSON with timestamps.

### Immutability

- Once written, evidence files are read-only.
- Any re-analysis produces **new** files (e.g., `analysis/<run-id>.json`), never modifies the original evidence.
- The chain from raw evidence to any claim must be traceable and reproducible.

## Evidence Lifecycle

```
Run initiated
  → Container created (clean filesystem, fixed resources)
  → Agent executes (full transcript captured)
  → Acceptance criteria evaluated (raw output captured)
  → Container destroyed
  → Raw evidence written to evidence/<run-id>/
  → Evidence is immutable from this point
```

## Challenging Evidence

Any party may challenge evidence by:

1. Reproducing the run using the reproducibility guide.
2. Comparing the new raw evidence against the original.
3. If the results differ, the original evidence is flagged and the reproducibility issue is investigated.

Challenges are resolved by raw evidence, not by authority or argument.
