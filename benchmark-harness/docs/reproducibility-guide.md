# Reproducibility Guide

**SAME TASK | SAME MODEL | SAME FIXTURE | SAME RESOURCES | ISOLATED ENVIRONMENT | REAL AGENT EXECUTION | EXTERNAL ACCEPTANCE | RAW EVIDENCE | REPRODUCIBLE RESULTS**

## Core Principle

> We benchmark the workflow, not the prompt.

Anyone should be able to reproduce any benchmark result using the raw evidence and this guide. Reproducibility is not optional — it is the mechanism that keeps claims honest.

## Prerequisites

- Docker (for container isolation)
- Node.js 18+ (for acceptance criteria)
- The AI Manager repository (this repo)
- Access to the model provider specified in the scenario (e.g., Anthropic API key for `claude-sonnet-4-20250514`)

## Step-by-Step Reproduction

### 1. Identify the Run

From the claim you want to reproduce, find the evidence directory:

```
evidence/<run-id>/
```

This directory contains:
- `transcript.json` — Full agent interaction
- `acceptance.json` — Build and test results
- `timing.json` — Wall-clock timestamps
- `container.json` — Container metadata (image, resources, env)
- `scenario.json` — The scenario file used for this run

### 2. Read the Scenario

Open `evidence/<run-id>/scenario.json` to see:
- The task description
- The fixture path
- The acceptance criteria
- The model, limits, and tags

Verify that the scenario matches what the claim describes.

### 3. Set Up the Environment

```bash
# Clone the repo
git clone <repo-url>
cd ai-manager/benchmark-harness

# Install dependencies
npm install

# Set up the model provider API key
export ANTHROPIC_API_KEY=<your-key>  # or whichever provider the scenario uses
```

### 4. Run the Benchmark

Use the harness to execute the same scenario:

```bash
# Run the specific scenario with the same configuration
node dist/index.js run \
  --scenario scenarios/fibonacci.json \
  --runs 20 \
  --output evidence/repro-<your-run-id>/
```

Ensure the following match the original run:
- **Scenario file** — Same file, same content (check the hash)
- **Model** — Same model ID as specified in the scenario
- **Fixture** — Same fixture directory (check the hash)
- **Resources** — Same timeout, retry budget, and container spec

### 5. Compare Results

Compare your raw evidence against the original:

| Check | What to compare |
|---|---|
| Pass/fail rates | Count of PASS vs FAIL in `acceptance.json` |
| Timing | Wall-clock time in `timing.json` |
| Transcripts | Agent behavior in `transcript.json` (may differ due to non-determinism) |
| Acceptance output | Verbatim output of build and test commands |

### 6. Report Discrepancies

If your results differ from the original:

1. **Check environmental factors** — Model provider changes, dependency versions, container image updates.
2. **Check for non-determinism** — Some variation is expected. Focus on aggregate pass rates, not individual runs.
3. **Open an issue** — If the discrepancy is systematic and unexplained, file an issue with both the original and reproduction evidence attached.

## What Makes a Reproduction Successful

A reproduction is **successful** if:
- The same scenario, model, and fixture were used.
- The aggregate pass rate is within the 95% confidence interval of the original claim.
- The raw evidence is preserved and available for comparison.

A reproduction is **unsuccessful** if:
- The pass rate falls outside the confidence interval AND the discrepancy cannot be explained by environmental factors.
- The evidence was not preserved or the run was not containerized.

## Hashing for Integrity

To verify that scenario and fixture files have not changed:

```bash
# Scenario hash
sha256sum scenarios/fibonacci.json

# Fixture hash
find fixtures/fibonacci-stub -type f -exec sha256sum {} \; | sort
```

Compare these against the hashes recorded in the original `evidence/<run-id>/scenario.json` and `evidence/<run-id>/fixture.json`.

## Non-Determinism

Agent runs are not fully deterministic. The same scenario with the same model may produce different transcripts and even different pass/fail outcomes on individual runs. This is why:

- **Paired comparison** matters — We compare workflows, not individual runs.
- **Sample size matters** — Aggregate pass rates over N runs are more stable than single-run results.
- **Confidence intervals matter** — They quantify the uncertainty from non-determinism.

Do not expect exact match on individual runs. Expect agreement on aggregate statistics.

## Summary

| Step | Action |
|---|---|
| 1 | Identify the run from evidence directory |
| 2 | Read the scenario to understand the task and conditions |
| 3 | Set up the environment (Docker, Node.js, API keys) |
| 4 | Run the benchmark with identical configuration |
| 5 | Compare aggregate results against the original claim |
| 6 | Report discrepancies with evidence |
