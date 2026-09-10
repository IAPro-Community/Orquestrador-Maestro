# Orquestrador Benchmark Harness v2

A reproducible, auditable benchmark harness for measuring the effectiveness of the Orquestrador Maestro coding workflow compared to vanilla AI coding.

## Quick Start

```bash
# List available scenarios
node benchmarks/cli.js list

# Validate a scenario
node benchmarks/cli.js validate bug-fix-auth

# Run a single scenario
node benchmarks/cli.js run bug-fix-auth --model anthropic/claude-sonnet-4-20250514

# Run all scenarios with 5 runs each
node benchmarks/cli.js run --runs 5 --model anthropic/claude-sonnet-4-20250514

# Compare two result files
node benchmarks/cli.js compare results/bug-fix-auth_vanilla_run1.json results/bug-fix-auth_maestro-core_run1.json
```

## Prerequisites

- **Node.js** ≥ 20.0.0
- **OpenCode CLI** installed and in PATH (`opencode --version`)
- **API key** configured for your chosen model provider (e.g., `ANTHROPIC_API_KEY`)
- **Docker** (optional, for container-isolated runs — planned)

## What It Measures

The harness runs identical task prompts under two conditions and compares outcomes:

| Condition | What the agent sees |
|-----------|-------------------|
| `vanilla` | Raw prompt only — no workflow orchestration |
| `maestro-core` | Prompt + Maestro workflow preamble (observe → route → select → act → verify → report) |

Both conditions use the same model, same fixture codebase, and same hidden tests. The only variable is the workflow preamble.

### Key Metrics

- **tokensToSuccess** — total tokens consumed in runs passing the evidence gate
- **retryTax** — tokens wasted on failed attempts
- **Median, mean, stddev, percentiles (p50, p95)** — statistical summary
- **95% confidence interval** — bounds on the true median
- **Success rate** — proportion of runs passing hidden tests

## Architecture

```
benchmarks/
├── cli.js                        # CLI entry point (list, validate, run, compare)
├── harness/
│   ├── index.js                  # Orchestrator — setup, execute, verify, report
│   ├── types.js                  # JSDoc interfaces + AgentDriver base class
│   ├── metrics.js                # Statistical functions (median, percentile, CI, etc.)
│   ├── evidence.js               # Evidence gate — claim eligibility logic
│   ├── verifier.js               # Hidden test runner (TAP output parsing)
│   ├── schema.js                 # Runtime validation of scenarios and results
│   ├── reporter.js               # Markdown + JSON report generation
│   └── drivers/
│       ├── index.js              # Driver registry
│       └── opencode-driver.js    # OpenCode CLI driver (real CLI invocation)
├── scenarios/
│   ├── bug-fix-auth.json         # Scenario definitions (one per file)
│   ├── feature-add-button.json
│   ├── refactor-extract-util.json
│   ├── investigate-performance.json
│   ├── resume-auth-feature.json
│   ├── cross-session-migration.json
│   └── _fixtures/                # Real project code (copied per run)
│       ├── bug-fix-auth/
│       ├── feature-add-button/
│       ├── refactor-extract-util/
│       ├── investigate-performance/
│       ├── resume-auth-feature/
│       └── cross-session-migration/
└── results/                      # Generated reports (JSON + Markdown)
```

### Execution Flow

1. **Setup** — Copy fixture to ephemeral temp workspace (`/tmp/bench-v2-*`)
2. **Execute** — Driver invokes `opencode run` with the scenario prompt
3. **Verify** — Run `node --test` against hidden tests in the modified workspace
4. **Evidence** — Evaluate the evidence gate (tests pass + exit code match)
5. **Report** — Generate Markdown + JSON reports with statistical comparisons

### Evidence Gate

A result passes the evidence gate when:

1. All hidden tests pass (exit code 0)
2. The validation exit code matches the expected value
3. The driver exit code matches the expected value

Only runs passing the gate are eligible for public claims (`publicClaimEligible: true`).

## Running Benchmarks

### Full Benchmark Run

```bash
node benchmarks/cli.js run \
  --model anthropic/claude-sonnet-4-20250514 \
  --runs 5 \
  --conditions vanilla,maestro-core \
  --output benchmarks/results
```

### Single Scenario

```bash
node benchmarks/cli.js run bug-fix-auth \
  --model anthropic/claude-sonnet-4-20250514 \
  --runs 3
```

### npm Scripts

```bash
npm run bench:list           # List scenarios
npm run bench:validate       # Validate all scenarios
npm run bench:run            # Run benchmarks
npm run bench:compare        # Compare two result files
```

## Interpreting Results

Results are saved in `benchmarks/results/`:

- `report-YYYY-MM-DD.json` — machine-readable with full run details
- `report-YYYY-MM-DD.md` — human-readable with comparison tables

### Reading a Comparison Table

| Metric | Vanilla | Maestro | Delta |
|--------|---------|---------|-------|
| Runs (n) | 5 | 5 | - |
| Success Rate | 60% | 100% | +40pp |
| Tokens (median) | 15,200 | 12,500 | -17.8% |
| Duration (median) | 52,000ms | 45,000ms | -13.5% |

**Interpretation:** Maestro used 17.8% fewer tokens at the median and had a 40 percentage-point higher success rate. The comparison is based on 5 runs per condition.

### Statistical Notes

- **n < 5:** Results are "directional" — not statistically significant
- **n ≥ 5:** Mann-Whitney U test can be applied for significance
- **CI 95%:** If the confidence interval does not include 0, the difference is likely real

## Adding Scenarios

1. Create a fixture directory under `benchmarks/scenarios/_fixtures/<your-scenario>/`
2. Include realistic source code and a `package.json` with test scripts
3. Create `test/hidden.test.js` using Node.js built-in test runner (`node:test`)
4. Create `benchmarks/scenarios/<your-scenario>.json`:

```json
{
  "id": "your-scenario",
  "name": "Human-Readable Name",
  "type": "bug|feature|refactor|investigation|resume|migration",
  "description": "What the scenario tests",
  "prompt": "Instructions given to the agent (minimum 20 characters)",
  "fixtureDir": "_fixtures/your-scenario",
  "hiddenTests": "test/hidden.test.js",
  "acceptance": ["Criterion 1", "Criterion 2"],
  "validation": {
    "command": "node --test test/hidden.test.js",
    "expectedExitCode": 0,
    "timeoutMs": 30000
  },
  "expectedInvariants": ["Invariant 1"]
}
```

5. Validate: `node benchmarks/cli.js validate your-scenario`

### Best Practices

- **Real code** — Fixtures should be realistic mini-projects, not toy examples
- **Hidden tests** — Test behavior, not implementation details
- **Clear prompts** — Instructions should be unambiguous
- **Acceptance criteria** — Observable, testable outcomes
- **Invariants** — Properties that must hold regardless of approach

## Full Methodology

For the complete benchmark methodology — including validity threats, isolation model, token accounting hierarchy, claims policy, anti-gaming mechanisms, and CI integration — see:

**[docs/benchmark.md](../docs/benchmark.md)**

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Agent times out | Increase timeout: `--timeout 180000` (3 minutes) |
| `opencode` not found | Ensure it is in PATH or use full path in driver config |
| Tests fail but code looks correct | Check if hidden tests have bugs, or if the scenario needs adjustment |
| No token data reported | Verify your API key is configured and the model supports usage reporting |

## Version History

- **v2.0.0** — Complete rewrite with real agent execution via OpenCode CLI
- **v1.x** — Synthetic benchmarks (deprecated, removed)
