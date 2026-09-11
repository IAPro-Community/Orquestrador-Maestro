# Limitations

**SAME TASK | SAME MODEL | SAME FIXTURE | SAME RESOURCES | ISOLATED ENVIRONMENT | REAL AGENT EXECUTION | EXTERNAL ACCEPTANCE | RAW EVIDENCE | REPRODUCIBLE RESULTS**

## Core Principle

> We benchmark the workflow, not the prompt.

No benchmark is perfect. This document describes what the harness can and cannot measure, and where its results should be interpreted carefully.

## What the Harness Measures

The harness measures the **marginal effect of a workflow** on agent outcomes for a specific task, model, and set of conditions. Specifically:

- Whether the agent produces code that compiles and passes hidden tests.
- How long the agent takes to complete the task.
- What the agent does during execution (via transcripts).

## Known Limitations

### 1. Task Coverage

**The harness uses a small set of curated scenarios.** Results on `fibonacci-test` and `api-handler` do not automatically generalize to all coding tasks.

- **Mitigation:** Scenarios are designed to represent different complexity levels (simple function, API handler with validation). More scenarios are added over time.
- **Caveat:** Claims are scoped to the specific tasks tested. Do not extrapolate.

### 2. Model Specificity

**Results are model-specific.** A workflow that helps `claude-sonnet-4-20250514` may not help `gpt-4o` or `gemini-2.5-pro`.

- **Mitigation:** The scenario file specifies the model. Paired comparisons hold the model constant.
- **Caveat:** Claims are scoped to the model tested. Cross-model generalization requires separate evidence.

### 3. Non-Determinism

**Agent runs are not fully deterministic.** Even with the same model, task, and workflow, individual runs may produce different transcripts and outcomes.

- **Mitigation:** Paired comparison and sufficient sample size (N ≥ 20) account for variance. Confidence intervals quantify uncertainty.
- **Caveat:** Individual run results are not reliable. Aggregate statistics are.

### 4. Fixture Simplicity

**Fixtures are minimal stubs.** Real-world codebases have complex dependency graphs, existing code, and project conventions that the fixture does not capture.

- **Mitigation:** Fixtures are intentionally minimal to isolate the agent's behavior from inherited code.
- **Caveat:** The benchmark measures "build from scratch" performance, not "work within an existing codebase" performance.

### 5. Acceptance Depth

**Acceptance criteria are shallow.** Build checks and basic correctness tests do not cover code quality, maintainability, security, or edge cases.

- **Mitigation:** Acceptance criteria are designed to be deterministic and externally verifiable. Deeper evaluation introduces subjectivity.
- **Caveat:** A PASS means "compiles and passes basic tests," not "is production-ready code."

### 6. Workflow Scope

**The harness tests specific workflow configurations.** It does not test every possible combination of tools, skills, and settings.

- **Mitigation:** Workflows are chosen to represent meaningful differences (e.g., with/without code review, different toolchains).
- **Caveat:** Results apply to the tested workflow configuration, not to all possible configurations.

### 7. Environmental Drift

**Model providers update their models over time.** The model ID `claude-sonnet-4-20250514` may behave differently at different points in time due to provider-side changes.

- **Mitigation:** Evidence includes model version and timestamps. Historical runs can be compared against new runs.
- **Caveat:** Long-term comparisons may be affected by model drift. This is outside the harness's control.

### 8. Container Differences

**Container images and runtime environments evolve.** Dependency updates, base image changes, and OS patches can affect agent behavior.

- **Mitigation:** Container metadata is recorded in evidence. Fixture hashes verify starting conditions.
- **Caveat:** Cross-repo comparisons may be affected by different container environments.

### 9. Cost and Time

**Running many paired comparisons is expensive and slow.** Each run requires a model API call, container provisioning, and acceptance evaluation.

- **Mitigation:** The harness is designed for efficiency. Small, focused scenarios keep per-run cost low.
- **Caveat:** Large-scale studies (N ≥ 100) require significant resources.

### 10. Scope Exclusion

**The harness does not measure:**

- Prompt engineering quality
- User experience of the agent
- Agent reasoning quality (only output quality)
- Cost efficiency (only correctness and time)
- Long-running or multi-file tasks (currently limited to single-file scenarios)

These are valid research questions but are outside the current harness scope.

## How to Interpret Results

| Result | Interpretation |
|---|---|
| Workflow A passes more often than Workflow B on task X with model Y | The workflow has a marginal advantage for this specific combination |
| No significant difference between workflows | The workflow change does not measurably affect outcomes for this task/model |
| Workflow A is faster than Workflow B | The workflow reduces time-to-completion for this task/model |
| All workflows fail on task X | The task may be too difficult for the model, or the acceptance criteria may be too strict |

## What We Do NOT Claim

- "This workflow is universally better" — Results are scoped to the tested conditions.
- "This model is better than that model" — The model is held constant in comparisons.
- "This result applies to all coding tasks" — Only the tested scenarios are covered.
- "The benchmark is definitive" — It is one data point, not the final word.

## Summary

The harness is a tool for **controlled, reproducible comparison** of agent workflows. It is powerful within its scope but has real limitations. All claims should be interpreted in light of these limitations, and results should be treated as evidence, not proof.
