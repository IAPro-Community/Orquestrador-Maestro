# Benchmark Methodology

**SAME TASK | SAME MODEL | SAME FIXTURE | SAME RESOURCES | ISOLATED ENVIRONMENT | REAL AGENT EXECUTION | EXTERNAL ACCEPTANCE | RAW EVIDENCE | REPRODUCIBLE RESULTS**

## Core Principle

> We benchmark the workflow, not the prompt.

The AI Manager benchmark harness measures how different configurations, workflows, and toolchains affect agent outcomes — not how cleverly a prompt is worded. Every comparison holds the task constant and varies only the workflow under test.

## Paired Comparison Design

Each benchmark run follows a strict paired-comparison protocol:

1. **Identical task** — The same scenario file (e.g., `fibonacci.json`) is used for both conditions.
2. **Identical model** — The same model ID is specified in the scenario. No model swapping between conditions.
3. **Identical fixture** — The same stub directory is mounted. No fixture manipulation.
4. **Identical resources** — Same timeout, same retry budget, same container spec.
5. **Vary only the workflow** — The single variable is the workflow configuration (e.g., skill loaded vs. no skill, toolchain A vs. toolchain B).

This design isolates the workflow as the sole causal factor in any observed difference.

## Container Isolation

Every agent run executes inside an isolated container:

- **Clean filesystem** — The fixture is copied fresh. No cross-contamination between runs.
- **Network isolation** — Runs cannot access other runs or shared state.
- **Deterministic resources** — CPU, memory, and time limits are fixed per scenario.
- **Ephemeral** — The container is destroyed after the run. No persistent side effects.

Isolation ensures that results reflect the agent's behavior, not environmental artifacts.

## Golden Fixtures

Each scenario references a **fixture directory** that defines the starting state:

- **Stub files** — Minimal scaffolding (e.g., `package.json`, `tsconfig.json`) that the agent inherits.
- **No implementation** — Fixtures never contain the solution. The agent must produce the code.
- **Versioned** — Fixtures are committed to the repository. Changes to fixtures require a version bump.

Fixtures are the contract between the benchmark and the agent's starting point.

## External Acceptance

Agent output is evaluated by **external acceptance criteria**, not by the agent itself:

- **Build checks** — TypeScript compilation (`npx tsc --noEmit`) verifies the code is valid.
- **Hidden tests** — Deterministic test commands verify correctness. The agent never sees these tests.
- **No self-evaluation** — The agent cannot grade its own work. Acceptance is binary: PASS or FAIL.

External acceptance eliminates subjective scoring and self-serving evaluation.

## Raw Evidence

Every run produces raw evidence that is preserved verbatim:

- **Full transcript** — The complete agent interaction, including tool calls and outputs.
- **Acceptance results** — The output of each acceptance criterion.
- **Timing data** — Wall-clock time for the run and each acceptance step.
- **Container metadata** — Image, resources, environment variables.

Evidence is never summarized, redacted, or post-processed before storage. Summaries may be generated later, but the raw evidence remains the ground truth.

## Why These Choices Matter

| Choice | Reason |
|---|---|
| Paired comparison | Isolates the workflow as the only variable |
| Container isolation | Eliminates environmental contamination |
| Golden fixtures | Ensures identical starting conditions |
| External acceptance | Prevents self-serving evaluation |
| Raw evidence | Enables independent verification |
| Reproducibility | Allows anyone to replicate and challenge results |

## What We Do NOT Benchmark

- **Prompt engineering** — We do not optimize prompts to favor one condition.
- **Model capability** — We hold the model constant. Differences in model capability are not the subject.
- **Infrastructure performance** — Container startup, network latency, etc. are not measured.
- **Synthetic difficulty** — We do not artificially inflate or deflate task difficulty.

The harness measures the **marginal value of the workflow** on a fixed task with a fixed model.
