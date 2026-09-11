# Claims Policy

**SAME TASK | SAME MODEL | SAME FIXTURE | SAME RESOURCES | ISOLATED ENVIRONMENT | REAL AGENT EXECUTION | EXTERNAL ACCEPTANCE | RAW EVIDENCE | REPRODUCIBLE RESULTS**

## Core Principle

> We benchmark the workflow, not the prompt.

Claims about benchmark results must be grounded in raw evidence, statistically sound, and honestly reported. This policy defines how claims are made, what statistical rigor is required, and what practices are prohibited.

## How Claims Are Made

A benchmark claim follows this structure:

1. **Observation** — "In N paired runs with task X, workflow A produced Y passes and workflow B produced Z passes."
2. **Statistical basis** — The test used, the p-value, the confidence interval, and the sample size.
3. **Scope** — The specific task, model, and conditions under which the claim holds.
4. **Evidence pointer** — The `evidence/<run-id>/` directories that support the claim.

### Example Claim

> "In 20 paired runs of the `fibonacci-test` scenario with `claude-sonnet-4-20250514`, the workflow with the `code-review` skill produced 19/20 passes (95%) versus 14/20 passes (70%) for the baseline. McNemar's test: p = 0.003. 95% CI for the difference: [12%, 63%]. Evidence: `evidence/fib-run-001/` through `evidence/fib-run-040/`."

## Statistical Requirements

### Minimum Sample Size

- **N ≥ 20** paired runs per comparison for initial claims.
- **N ≥ 50** paired runs for high-confidence claims (p < 0.01).
- Smaller samples are reported with explicit caveats and are not used for strong claims.

### Tests Used

| Comparison | Test |
|---|---|
| Pass/fail rates (binary) | McNemar's test (paired binary) |
| Time-to-completion (continuous) | Paired t-test or Wilcoxon signed-rank (if non-normal) |
| Multiple workflows | Bonferroni correction for multiple comparisons |

### Confidence Intervals

- All claims include 95% confidence intervals for the effect size.
- Point estimates without confidence intervals are not accepted as claims.

### Effect Size

- Report absolute difference (e.g., "95% vs 70% = +25 percentage points").
- Report relative difference only as supplementary (e.g., "1.36× the pass rate").
- Never report relative difference alone without absolute.

## What Is Prohibited

### Optimization for Either Condition

- **No prompt tuning** to favor the experimental condition.
- **No fixture manipulation** to make one workflow look better.
- **No cherry-picking** — All runs in the sample must be included. No run may be excluded after the fact without documented, pre-registered justification.
- **No stopping rules** — Do not stop collecting data when the result "looks significant." Sample size must be determined before the run begins.

### Honest Reporting

- **Report failures** — If a workflow fails more often, say so.
- **Report null results** — If there is no significant difference, say so.
- **Report limitations** — If the sample is small, the task is narrow, or the model is specific, say so.
- **No spin** — Do not frame a null result as "no evidence of harm" or a small effect as "promising."

### Framing

- **No absolute claims** — Never say "Workflow A is better." Say "Workflow A produced higher pass rates on task X with model Y in N runs."
- **No generalization beyond scope** — Do not claim results apply to other tasks, models, or conditions without separate evidence.

## Claim Lifecycle

```
1. Design: Define task, model, sample size, and success criteria BEFORE running.
2. Execute: Run all N paired comparisons. No skipping, no re-runs.
3. Analyze: Apply statistical tests. Compute confidence intervals.
4. Report: State observations, statistics, scope, and evidence pointers.
5. Challenge: Others may reproduce and challenge. Resolve by raw evidence.
```

## Retraction

If a claim is found to be based on flawed evidence (e.g., a bug in the harness, an environmental artifact), the claim is retracted and the evidence is flagged. The retraction is published alongside the original claim.

## Summary

| Requirement | Rule |
|---|---|
| Sample size | ≥ 20 paired runs (≥ 50 for high-confidence) |
| Statistical test | McNemar's (binary) or paired t-test/Wilcoxon (continuous) |
| Confidence intervals | 95% CI required for all effect sizes |
| Cherry-picking | Prohibited |
| Optimization for either condition | Prohibited |
| Null results | Must be reported |
| Scope | Claims limited to the specific task, model, and conditions tested |
