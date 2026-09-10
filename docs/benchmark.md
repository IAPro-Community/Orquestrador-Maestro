# Orquestrador Maestro Benchmark — Methodology

This document specifies the methodology for the Orquestrador Maestro benchmark harness. It is a reference for reproducible comparison of agent harnesses, not a leaderboard.

---

## 1. Purpose

The benchmark harness answers a single question: *When two agent harnesses run the same task on the same codebase with the same model, which one produces correct output more efficiently?*

Design principles:

- **Reproducibility.** A fresh clone, `npm ci`, and a single command should reproduce any reported result.
- **Honesty.** Results pass an evidence gate before the harness allows claims.
- **Isolation.** Each run operates in an ephemeral workspace; no state leaks between runs.
- **Transparency.** Raw evidence (stdout, stderr, NDJSON events, session data) is retained alongside processed metrics.

---

## 2. Validity Threats

The following factors can invalidate results if uncontrolled.

| Threat | Impact | Mitigation |
|--------|--------|------------|
| **Model nondeterminism** | Same prompt produces different outputs across runs | Multiple runs per scenario; median-based comparison; significance testing (Mann-Whitney U, n ≥ 5) |
| **Provider API changes** | Model behavior shifts between benchmark dates | Pin model version in scenario config; record `MODEL` env var and commit hash |
| **Model aliases** | `claude-sonnet-4` resolves to different snapshots over time | Use full versioned model IDs (e.g., `anthropic/claude-sonnet-4-20250514`); record in result metadata |
| **Rate limiting** | Queued requests add latency that does not reflect model capability | Record `durationMs` separately from token metrics; flag runs where timeout was approached |
| **Prompt/runtime changes** | Harness updates alter what the agent sees | Pin prompt hash (`promptHash` field); lock benchmark version per report |
| **Network variation** | Round-trip time affects wall-clock duration | Container isolation with fixed resource limits; report duration as secondary metric |
| **Sample size** | Small n produces unstable estimates | Require n ≥ 5 for significance claims; report 95% confidence intervals |
| **Fixture representativeness** | Fixtures may not reflect real-world codebases | Use multi-file, realistic mini-projects; document fixture limitations explicitly |
| **Cache effects** | Prompt caching reduces token cost on repeat runs | Record `cachedTokens` separately; report cache hit rate |
| **Token accounting differences** | Providers count tokens differently | Hierarchical source attribution (§11); never mix sources in a single comparison |

---

## 3. Experimental Conditions

A benchmark run compares two conditions on identical task prompts.

| Condition | Agent sees | Purpose |
|-----------|-----------|---------|
| `vanilla` | Raw prompt only — no Maestro workflow, no `AGENTS.md`, no skill routing | Baseline: model performance without orchestration |
| `maestro-core` | Prompt prefixed with Maestro rules (observe → route → select → act → verify → report) | Workflow-augmented: model performance with structured orchestration |

The `maestro-core` condition prepends the following preamble to the scenario prompt (see `benchmark-harness/src/drivers/opencode-driver.js:72-86`):

```
You are working with the Orquestrador Maestro.

Rules:
- Use minimal sufficient context
- Verify results before declaring completion
- Do not commit without authorization

Flow: Observe → Route → Select → Act → Verify → Report

Task: <scenario prompt>
```

Both conditions use the same model, the same fixture codebase, and the same hidden tests. The only variable is the workflow preamble.

---

## 4. Isolation

Each benchmark run is isolated at three levels.

### 4.1 Workspace Isolation

The harness creates an ephemeral copy of the fixture directory in the system temp folder (`benchmark-harness/src/index.js:55-66`):

```
/tmp/bench-v2-<random>/
```

The fixture is copied recursively. After the run completes (pass or fail), the workspace is deleted. No two runs share a workspace.

### 4.2 Container Isolation (Planned)

Future runs will execute agent processes inside Docker containers with:

- No host network access (only the provider API endpoint)
- CPU limits (2 vCPU)
- Memory limits (4 GB)
- Ephemeral filesystem (no persistent volumes)
- Verifier runs in a separate container from the agent

The `RunOptions` type already declares `useContainer: boolean` (`benchmark-harness/src/types.js:38`). The container runtime is a planned extension.

### 4.3 Verifier Isolation

The hidden test runner (`benchmark-harness/src/verifier.js`) executes `node --test` in the agent's workspace directory, with `NODE_ENV=test` set. It does not share state with the agent process. The verifier parses TAP output (`# pass N` / `# fail N` or `ok`/`not ok` lines) to determine pass/fail counts.

---

## 5. Agent Driver

### 5.1 OpenCode CLI Driver

The primary (and currently only) driver is `OpenCodeDriver` (`benchmark-harness/src/drivers/opencode-driver.js`).

It invokes the real `opencode` CLI — not a mock, not an API wrapper. This ensures measured token usage and behavior reflect the actual tool the user would experience.

The driver:

1. Checks availability via `which opencode`
2. Builds the prompt with the condition preamble
3. Invokes `opencode run <message> --format json --model <model> --dir <workDir> --auto`
4. Parses the last line of stdout as JSON to extract `usage`, `tools`, and `session` data
5. Returns a `DriverResult` with `success`, `usage`, `durationMs`, `tools`, `evidence`, and `stdout`

### 5.2 Driver Extensibility

The driver registry (`benchmark-harness/src/drivers/index.js`) supports multiple drivers. To add a driver:

1. Implement the `AgentDriver` interface (`benchmark-harness/src/types.js:142-146`):
   - `get name()` — unique driver identifier
   - `async isAvailable()` — check if the driver can execute
   - `async execute(scenario, options)` — run the agent and return a `DriverResult`
2. Register it in `drivers/index.js` via `registerDriver(new YourDriver())`

### 5.3 Evidence Metadata

Every driver must populate `evidence` on its result:

| Field | Type | Description |
|-------|------|-------------|
| `executionType` | `"real-execution"` | Only real CLI invocations are valid |
| `reproducible` | `boolean` | Whether the same inputs produce comparable outputs |
| `isolated` | `boolean` | Whether the run was isolated from other runs |

---

## 6. Model Configuration

The model is specified via the `--model` CLI flag or the `MODEL` environment variable.

**Format:** `<provider>/<model-name>` (e.g., `anthropic/claude-sonnet-4-20250514`)

**Reproducibility requirement:** Use a full versioned model ID. Alias names (e.g., `claude-sonnet-4`) may resolve to different snapshots over time and produce non-reproducible results.

The model string is recorded in every `RunResult` object and included in all reports.

### Supported Providers

Any provider supported by OpenCode CLI. The harness itself is provider-agnostic; it delegates to the CLI driver.

---

## 7. Fixtures

Fixtures are realistic mini-projects located under `benchmark-harness/_fixtures/`. They are not toy examples.

### 7.1 Fixture Structure

Each fixture contains:

```
_fixtures/<scenario-name>/
├── package.json              # Node.js project with test scripts
├── src/                      # Source code with the bug/feature/refactor target
│   └── <files>
└── test/
    ├── <visible-test>.js     # Tests the agent can see (part of acceptance criteria display)
    └── hidden.test.js        # Verification tests the agent cannot see
```

### 7.2 Current Fixtures

| Scenario | Fixture | Files | Complexity |
|----------|---------|-------|------------|
| `bug-fix-auth` | Token rotation bug in `TokenService.js` | 3 source + 2 test | Medium — security-critical single-file fix |
| `feature-add-button` | Extend `Button.js` with variants/sizes | 2 source + 2 test | Medium — UI component with CSS classes |
| `refactor-extract-util` | Extract duplicated date logic from `ReportService.js` | 3 source + 2 test | Medium — multi-file refactoring |
| `investigate-performance` | Analyze `dataService.js` for inefficiencies | 2 source + 2 test | Hard — open-ended investigation + fix |
| `resume-auth-feature` | Complete `AuthService.js` TODOs | 1 source + 2 test | Medium — feature completion from stubs |
| `cross-session-migration` | Complete `TaskStore.js` TODOs | 1 source + 2 test | Medium — feature completion with edge cases |

### 7.3 Fixture Integrity

Fixtures are deterministic. The harness records `promptHash` (SHA-256 of the prompt) and `repoCommit` (git HEAD at benchmark time) in every result. Any modification to a fixture changes the hash, making tampering detectable.

Protected files are defined by the scenario's `expectedInvariants` array. After execution, invariant checks verify that protected properties still hold.

---

## 8. Scenarios

Scenarios are defined as JSON files under `benchmark-harness/`.

### 8.1 Scenario Types

| Type | Description | Example |
|------|-------------|---------|
| `bug` | Fix a defect in existing code | `bug-fix-auth` — refresh token reuse |
| `feature` | Add new functionality | `feature-add-button` — component variants |
| `refactor` | Restructure without changing behavior | `refactor-extract-util` — extract shared utility |
| `investigation` | Analyze and document findings, then fix | `investigate-performance` — query patterns |
| `resume` | Complete partial implementation | `resume-auth-feature` — fill TODO stubs |
| `migration` | Cross-file structural change | `cross-session-migration` — task store migration |

### 8.2 Scenario Schema

Defined in `benchmark-harness/src/types.js:11-22` and validated in `benchmark-harness/src/schema.js:57-86`:

```json
{
  "id": "kebab-case-unique-id",
  "name": "Human-readable name",
  "type": "bug|feature|refactor|investigation|resume|migration",
  "description": "What the scenario tests",
  "prompt": "Exact instructions sent to the agent (minimum 20 characters)",
  "fixtureDir": "_fixtures/<directory-name>",
  "hiddenTests": "test/hidden.test.js",
  "acceptance": ["Criteria 1", "Criteria 2"],
  "validation": {
    "command": "node --test test/hidden.test.js",
    "expectedExitCode": 0,
    "timeoutMs": 30000
  },
  "expectedInvariants": ["Invariant 1", "Invariant 2"]
}
```

**Validation rules:**
- `id` must be kebab-case (`/^[a-z0-9]+(-[a-z0-9]+)*$/`)
- `prompt` must be at least 20 characters
- `validation.command` is required
- `validation.expectedExitCode` must be a number

### 8.3 Adding a Scenario

1. Create a fixture directory under `benchmark-harness/_fixtures/<your-scenario>/`
2. Populate it with realistic source code and a `package.json` with test scripts
3. Create `test/hidden.test.js` using Node.js built-in test runner (`node:test`)
4. Create `benchmark-harness/<your-scenario>.json` following the schema
5. Validate: `node npm run bench:validate <your-scenario>`

### 8.4 Design Principles

- **Real code, not stubs.** Fixtures should be realistic enough that a model unfamiliar with the codebase would need to read and understand the source.
- **Hidden tests verify behavior, not implementation.** Tests assert outcomes (e.g., "old token is invalid") not internal state (e.g., "Set.delete was called").
- **Clear prompts.** Instructions should be unambiguous. If the agent needs to make design decisions, those decisions should be testable.
- **Acceptance criteria are observable.** Each criterion maps to a verifiable outcome.

---

## 9. Acceptance Criteria

Each scenario defines an `acceptance` array of human-readable criteria and a `validation` object with automated verification.

### 9.1 Hidden Tests

Hidden tests run via `node --test` (Node.js built-in test runner). The verifier (`benchmark-harness/src/verifier.js`) executes the test command in the agent's workspace directory and parses TAP output.

**TAP parsing:** The verifier handles two formats:
- Summary lines: `# pass N` / `# fail N`
- Individual results: `ok N` / `not ok N` (counted by line matching)

### 9.2 Build Verification

When a fixture includes a build step (e.g., TypeScript compilation), the hidden test suite should include a build assertion. The agent is expected to produce code that compiles without errors.

### 9.3 Type Checking

For TypeScript fixtures, hidden tests should include `tsc --noEmit` or equivalent. This is scenario-specific and not enforced globally.

### 9.4 Linting

For fixtures with ESLint or similar, hidden tests may include lint assertions. This is scenario-specific.

### 9.5 Evidence Gate

A run passes the evidence gate when all of the following are true (`benchmark-harness/src/evidence.js:3-33`):

1. **Hidden tests pass** — `testsPassed === testsTotal && testsTotal > 0`
2. **Exit code matches** — `validationExitCode === expectedExitCode`
3. **Driver exit code matches** — `driverResult.exitCode === expectedExitCode`

Runs that fail the evidence gate are flagged with `publicClaimEligible: false`.

---

## 10. Evidence

Evidence is the raw and processed data that supports benchmark claims.

### 10.1 Raw Evidence

Each `RunResult` contains:

| Field | Description |
|-------|-------------|
| `driverResult.stdout` | Last 5,000 characters of agent stdout |
| `driverResult.usage` | Token counts (input, output, cached, reasoning, total) |
| `driverResult.tools` | Tool usage statistics (calls, files read/modified/created/deleted) |
| `driverResult.session` | Session metadata from the agent driver |
| `validation.output` | Last 2,000 characters of test output |
| `environment` | OS, Node version, platform, architecture, timestamp |
| `promptHash` | SHA-256 of the exact prompt sent to the agent |
| `repoCommit` | Git HEAD hash at benchmark time |

### 10.2 Normalized Evidence

Processed metrics derived from raw evidence:

| Metric | Source |
|--------|--------|
| `tokensToSuccess` | `driverResult.usage.totalTokens` for runs passing the evidence gate |
| `retryTax` | Token cost of failed attempts before a successful run |
| `durationMs` | Wall-clock time from agent start to completion |
| `tools.calls` | Total tool invocations by the agent |

### 10.3 Immutability

Evidence is written to disk immediately after each run (`benchmark-harness/src/index.js:90-99`) and never modified. Results are saved as:

```
evidence/<benchmark>_<condition>_run<N>.json
```

### 10.4 Sanitization

Before publication, evidence must be sanitized:
- Remove API keys, tokens, and credentials from stdout/stderr
- Remove file paths containing usernames or home directories
- Redact any PII found in agent output

---

## 11. Token Accounting

Token counting is the most contested metric in AI benchmarks. This harness uses a hierarchical source attribution system.

### 11.1 Source Hierarchy

| Priority | Source | Trust | Description |
|----------|--------|-------|-------------|
| 1 | `provider-reported` | High | Direct from API response (`usage` field) |
| 2 | `tokenizer-exact` | Medium | Local tokenization with provider's tokenizer |
| 3 | `tokenizer-estimated` | Low | Approximate tokenization (e.g., tiktoken for non-OpenAI models) |
| 4 | `not-applicable` | — | No token data available (e.g., mock/dry runs) |
| 5 | `unknown` | None | Source unspecified |

The `tokenSource` field on `TokenUsage` (`benchmark-harness/src/types.js:49`) records which source was used.

### 11.2 Reconciliation

When provider-reported and tokenizer-estimated values diverge by more than 15%, the result is flagged with a `measurementAnomaly` note in metadata. This typically indicates:

- Provider uses a non-standard tokenizer
- Prompt caching is active but not reflected in the estimate
- The model counts reasoning tokens differently

### 11.3 Cache Awareness

Token usage distinguishes:

| Field | Description |
|-------|-------------|
| `inputTokens` | Tokens in the prompt sent to the model |
| `outputTokens` | Tokens generated by the model |
| `cachedTokens` | Input tokens served from cache (reduced cost) |
| `reasoningTokens` | Tokens used for chain-of-thought (model-dependent) |
| `totalTokens` | Sum of input + output (provider-specific formula) |

Cache hit rate is reported alongside token metrics: `cachedTokens / inputTokens`.

---

## 12. Metrics

### 12.1 Primary Metric: tokensToSuccess

The total tokens consumed in runs that passed the evidence gate. This is the primary comparison metric because it captures both the efficiency of the harness (fewer tokens needed) and the correctness of the output (only successful runs count).

### 12.2 Retry Tax

Tokens consumed on failed attempts before the first success. High retry tax indicates the harness or model struggles with the task, requiring multiple attempts.

### 12.3 Statistical Functions

Implemented in `benchmark-harness/src/metrics.js`:

| Function | Description |
|----------|-------------|
| `median(arr)` | Middle value of sorted array |
| `percentile(arr, p)` | Value at percentile p (0–100) |
| `mean(arr)` | Arithmetic average |
| `stddev(arr)` | Sample standard deviation (Bessel's correction) |
| `confidenceInterval95(arr)` | 95% CI half-width using z = 1.96 |
| `aggregateResults(results)` | Combined statistics for a set of runs |
| `compareConditions(vanilla, maestro)` | Side-by-side comparison with deltas |

### 12.4 Aggregated Output

`aggregateResults()` returns:

```json
{
  "n": 5,
  "successRate": 0.8,
  "tokens": {
    "median": 12500,
    "mean": 13200,
    "p50": 12500,
    "p95": 18000,
    "min": 9800,
    "max": 18000,
    "ci95": { "lower": 10100, "upper": 16300 },
    "stddev": 3200
  },
  "duration": {
    "median": 45000,
    "mean": 47000,
    "p50": 45000,
    "p95": 62000,
    "min": 38000,
    "max": 62000,
    "ci95": { "lower": 39000, "upper": 55000 },
    "stddev": 8500
  }
}
```

### 12.5 Significance Testing

For n ≥ 5 per condition, the harness supports Mann-Whitney U test for non-parametric comparison of token distributions. This is appropriate because token counts are typically non-normal.

For n < 5, results are reported as "directional" with a note: "Insufficient runs for statistical significance (need >=3 per condition)."

### 12.6 Outlier Detection

Outliers are identified using the IQR method:
- Q1 = 25th percentile, Q3 = 75th percentile
- IQR = Q3 - Q1
- Outlier threshold: values below Q1 - 1.5×IQR or above Q3 + 1.5×IQR

Outliers are flagged in reports but not excluded from calculations.

---

## 13. Anti-Gaming

The harness includes multiple mechanisms to prevent agents from optimizing for visible criteria rather than actual correctness.

### 13.1 Hidden Tests

Agents cannot see `test/hidden.test.js`. The scenario definition references the file path, but the agent's prompt does not include the test contents. This prevents agents from writing code that satisfies the test harness without actually solving the problem.

### 13.2 Test Integrity Checking

Hidden tests are loaded from the fixture directory and executed against the agent's modified code. If an agent modifies the test file itself, the test will likely fail because it no longer tests the intended behavior.

### 13.3 Fixture Tampering Detection

The harness records `promptHash` (SHA-256 of the prompt) and `repoCommit` (git HEAD). If fixtures are modified between the benchmark setup and execution, the commit hash will not match the expected baseline.

### 13.4 Protected File Hash Verification (Planned)

Future versions will compute SHA-256 hashes of protected fixture files before and after execution. Files not expected to change (e.g., `test/hidden.test.js`, `package.json`) will be verified for integrity.

### 13.5 Gaming Pattern Detection (Planned)

Planned heuristics to detect gaming:
- Agent modifies hidden test files
- Agent creates mock implementations that pass tests but are not real solutions
- Agent deletes the entire codebase and recreates from scratch

---

## 14. Claims Policy

This section defines what can and cannot be claimed based on benchmark results.

### 14.1 Permitted Claims

A claim must reference all of the following:

- Benchmark version (e.g., `v2.3.0`)
- Dataset (e.g., "6 scenarios, 5 runs each")
- Model and version (e.g., `anthropic/claude-sonnet-4-20250514`)
- Sample size (e.g., `n = 30`)
- Date of execution
- Repository commit hash

**Example of a permitted claim:**

> "In the v2.3.0 benchmark suite (6 scenarios, 5 runs each, n = 30), on model `anthropic/claude-sonnet-4-20250514`, Maestro reduced median tokens-to-success by 23% compared to vanilla, with 95% CI [18%, 28%]. Executed 2026-09-01, commit `abc1234`."

### 14.2 Prohibited Claims

- "Maestro always uses 30% fewer tokens" — absolute claims without dataset/model/version qualification
- "Maestro is faster" — unqualified speed claims without duration data
- "Maestro has no bugs" — false; benchmarks measure specific scenarios
- Claims based on `synthetic` or `infrastructure` evidence types
- Claims based on tokenizer-estimated data without provider-reported validation

### 14.3 Marketing Guidelines

| Claim Type | Requirement |
|------------|-------------|
| Quantitative ("X% fewer tokens") | Provider-reported data, sample size, CI, baseline, timestamp |
| Qualitative ("Maestro organizes context") | Must be verifiable, must not exaggerate, must reflect actual behavior |
| Feature claims ("Maestro supports episodic memory") | Must be demonstrable in the product |

---

## 15. Reproducibility

### 15.1 Quick Start

```bash
git clone https://github.com/IAPro-Community/Orquestrador-Maestro.git
cd Orquestrador-Maestro
npm ci
node npm run bench:run --model anthropic/claude-sonnet-4-20250514 --runs 5
```

### 15.2 What's Fixed

| Parameter | How |
|-----------|-----|
| Model version | `--model` flag with full versioned ID |
| Prompt text | Stored in scenario JSON; hash recorded per run |
| Fixture code | Deterministic files in `_fixtures/`; commit tracked |
| Harness version | `package.json` version + git commit |
| Test expectations | `hidden.test.js` in fixture directory |
| Execution environment | OS, Node version, platform, architecture recorded |

### 15.3 What Varies

| Parameter | Impact |
|-----------|--------|
| Network latency | Affects `durationMs` only, not token counts |
| Provider load | May affect response time; mitigated by multiple runs |
| Model nondeterminism | Mitigated by median-based comparison with CI |

---

## 16. CI Integration

### 16.1 PR Validation

On every pull request, the CI pipeline runs:

```bash
npm run bench:validate          # Schema validation for all scenarios
npm run bench:test              # Unit tests for harness code
docker build -t bench-harness . # Verify Docker build (when container support is ready)
```

This ensures scenarios are well-formed and harness code is correct before merge.

### 16.2 Official Benchmark

Scheduled runs (weekly or on-demand) execute the full suite:

```bash
node npm run bench:run \
  --model anthropic/claude-sonnet-4-20250514 \
  --runs 5 \
  --conditions vanilla,maestro-core \
  --output evidence
```

Results are stored as artifacts and compared against previous runs for regression detection.

### 16.3 CI Benchmark (Free Model)

A lightweight CI benchmark uses a free-tier model to verify harness correctness without incurring API costs:

```bash
node npm run bench:run \
  --model <free-model-id> \
  --runs 1 \
  --conditions vanilla,maestro-core
```

This catches harness regressions (broken fixtures, schema changes) without burning budget.

### 16.4 npm Scripts

| Script | Command |
|--------|---------|
| `npm run bench:list` | List available scenarios |
| `npm run bench:validate` | Validate all scenario definitions |
| `npm run bench:run` | Run benchmarks (pass scenario IDs as arguments) |
| `npm run bench:compare` | Compare two result files |
| `npm run bench:help` | Show CLI help |

---

## Appendix A: Result Schema

Every `RunResult` written to disk follows this structure:

```json
{
  "benchmark": "bug-fix-auth",
  "condition": "maestro-core",
  "run": 1,
  "model": "anthropic/claude-sonnet-4-20250514",
  "driver": "opencode",
  "repoCommit": "abc1234def5678",
  "promptHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "environment": {
    "os": "Linux 6.1.0",
    "nodeVersion": "v20.11.0",
    "platform": "linux",
    "arch": "x64",
    "timestamp": "2026-09-10T14:30:00.000Z"
  },
  "driverResult": {
    "success": true,
    "error": null,
    "usage": {
      "inputTokens": 8500,
      "outputTokens": 4200,
      "cachedTokens": 1200,
      "reasoningTokens": null,
      "totalTokens": 12700,
      "tokenSource": "provider-reported",
      "confidence": 1.0
    },
    "durationMs": 45000,
    "evidence": {
      "executionType": "real-execution",
      "reproducible": true,
      "isolated": true
    },
    "tools": {
      "calls": 12,
      "filesRead": 5,
      "filesModified": 1,
      "filesCreated": 0,
      "filesDeleted": 0
    },
    "stdout": "...",
    "session": null
  },
  "validation": {
    "passed": true,
    "exitCode": 0,
    "testsPassed": 3,
    "testsFailed": 0,
    "testsTotal": 3,
    "output": "..."
  },
  "evidence": {
    "passed": true,
    "testsPassed": 3,
    "testsTotal": 3,
    "errors": [],
    "publicClaimEligible": true
  },
  "metadata": {
    "durationMs": 45000,
    "retries": 0,
    "notes": ""
  }
}
```

## Appendix B: Comparison Schema

`compareConditions()` returns:

```json
{
  "scenarioId": "bug-fix-auth",
  "vanilla": {
    "n": 5,
    "successRate": 0.6,
    "tokens": { "median": 15200, "mean": 16100, "p50": 15200, "p95": 22000, "min": 11000, "max": 22000, "ci95": { "lower": 12800, "upper": 19400 }, "stddev": 4100 },
    "duration": { "median": 52000, "mean": 55000, "p50": 52000, "p95": 71000, "min": 42000, "max": 71000, "ci95": { "lower": 46000, "upper": 64000 }, "stddev": 9200 }
  },
  "maestro": {
    "n": 5,
    "successRate": 1.0,
    "tokens": { "median": 12500, "mean": 13200, "p50": 12500, "p95": 18000, "min": 9800, "max": 18000, "ci95": { "lower": 10100, "upper": 16300 }, "stddev": 3200 },
    "duration": { "median": 45000, "mean": 47000, "p50": 45000, "p95": 62000, "min": 38000, "max": 62000, "ci95": { "lower": 39000, "upper": 55000 }, "stddev": 8500 }
  },
  "delta": {
    "tokensMedianDelta": -2700,
    "tokensMedianPctChange": -17.8,
    "durationMedianDelta": -7000,
    "durationMedianPctChange": -13.5,
    "successRateDelta": 0.4
  },
  "note": "Adequate sample size for directional comparison"
}
```
