#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  runBenchmark,
  loadScenario,
  listScenarios,
  generateReport,
  getRepoCommit,
} from "./harness";
import { getDriver } from "./harness/drivers";
import { validateScenario } from "./harness/schema";
import type { RunResult, BenchmarkCondition } from "./harness/types";

const BENCHMARKS_DIR = path.join(__dirname);

interface CliOptions {
  model?: string;
  driver?: string;
  runs?: number;
  conditions?: BenchmarkCondition[];
  outputDir?: string;
  timeoutMs?: number;
  verbose?: boolean;
  help?: boolean;
  scenarios?: string[];
  useContainer?: boolean;
  dryRun?: boolean;
  json?: boolean;
  benchmarkClass?: "ci" | "official";
  profile?: "official" | "ci";
  filter?: string;
  parallel?: number;
  resume?: string;
  format?: "markdown" | "json" | "csv";
}

function parseArgs(args: string[]): CliOptions {
  const parsed: CliOptions = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === "--model") {
      parsed.model = args[++i];
    } else if (arg === "--driver") {
      parsed.driver = args[++i];
    } else if (arg === "--runs") {
      parsed.runs = parseInt(args[++i], 10);
    } else if (arg === "--conditions") {
      parsed.conditions = args[++i].split(",") as BenchmarkCondition[];
    } else if (arg === "--output") {
      parsed.outputDir = args[++i];
    } else if (arg === "--timeout") {
      parsed.timeoutMs = parseInt(args[++i], 10);
    } else if (arg === "--verbose" || arg === "-v") {
      parsed.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--useContainer") {
      parsed.useContainer = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--benchmarkClass") {
      parsed.benchmarkClass = args[++i] as "ci" | "official";
    } else if (arg === "--profile") {
      parsed.profile = args[++i] as "official" | "ci";
    } else if (arg === "--filter") {
      parsed.filter = args[++i];
    } else if (arg === "--parallel") {
      parsed.parallel = parseInt(args[++i], 10);
    } else if (arg === "--resume") {
      parsed.resume = args[++i];
    } else if (arg === "--format") {
      parsed.format = args[++i] as "markdown" | "json" | "csv";
    } else if (!arg.startsWith("-")) {
      if (!parsed.scenarios) parsed.scenarios = [];
      parsed.scenarios.push(arg);
    }

    i++;
  }

  return parsed;
}

function printHelp(): void {
  console.log(`
Orquestrador Benchmark Harness v2

Usage:
  node benchmarks/cli.js <command> [options]

Commands:
  list                          List all available scenarios
  validate [scenario-id]        Validate scenario definitions
  run [scenario-id...]          Run benchmarks (all if none specified)
  compare <file1> <file2>       Compare two result files
  suite                         Run full scenario suite
  report <run-set>              Generate report from run results
  verify <run-id>               Show evidence gate status for a run
  inspect <run-id>              Show full evidence for a run
  preflight                     Validate environment before running

Run Options:
  --model <model>               Model to use (e.g., provider/model-name)
  --driver <driver>             Driver to use (default: opencode)
  --runs <n>                    Runs per scenario (default: 3)
  --conditions <c1,c2>          Conditions to test (default: vanilla,maestro-core)
  --output <dir>                Output directory for results
  --timeout <ms>                Timeout per run in milliseconds
  --useContainer                Use Docker isolation
  --dry-run                     Preview without executing
  --json                        Output JSON instead of text
  --benchmarkClass ci|official  Set benchmark class

Suite Options:
  --profile official|ci         Benchmark profile (default: official)
  --filter <type>               Filter scenarios by type
  --parallel <n>                Parallel execution count (default: 1)
  --resume <run-set>            Resume a previous suite run

Report Options:
  --format markdown|json|csv    Output format (default: markdown)

General Options:
  --verbose, -v                 Enable verbose output
  --help, -h                    Show this help

Examples:
  node benchmarks/cli.js list
  node benchmarks/cli.js validate bug-fix-auth
  node benchmarks/cli.js run bug-fix-auth --model anthropic/claude-sonnet-4-20250514 --runs 3
  node benchmarks/cli.js run --conditions vanilla,maestro-core --runs 5
  node benchmarks/cli.js compare results/bug-fix-auth_vanilla_run1.json results/bug-fix-auth_maestro-core_run1.json
  node benchmarks/cli.js suite --profile official --runs 10
  node benchmarks/cli.js report run-20260101 --format markdown
  node benchmarks/cli.js verify run-20260101-001
  node benchmarks/cli.js inspect run-20260101-001
  node benchmarks/cli.js preflight
`);
}

function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function outputText(data: string): void {
  console.log(data);
}

function cmdList(options: CliOptions): void {
  const scenarios = listScenarios();
  if (scenarios.length === 0) {
    if (options.json) {
      outputJson({ scenarios: [], count: 0 });
    } else {
      console.log("No scenarios found.");
    }
    return;
  }

  if (options.json) {
    const items = scenarios.map((id) => {
      const scenario = loadScenario(id);
      return { id, name: scenario.name, type: scenario.type, description: scenario.description };
    });
    outputJson({ scenarios: items, count: items.length });
    return;
  }

  console.log("Available scenarios:\n");
  for (const id of scenarios) {
    const scenario = loadScenario(id);
    console.log(`  ${id}`);
    console.log(`    Name: ${scenario.name}`);
    console.log(`    Type: ${scenario.type}`);
    console.log(`    Description: ${scenario.description}`);
    console.log();
  }
}

function cmdValidate(scenarioId: string | undefined, options: CliOptions = {}): void {
  const scenarioIds = scenarioId ? [scenarioId] : listScenarios();
  if (scenarioIds.length === 0) throw new Error("No scenarios found.");

  let valid = true;
  const results: Array<{ id: string; valid: boolean; errors: string[] }> = [];

  for (const id of scenarioIds) {
    try {
      const scenario = loadScenario(id);
      const result = validateScenario(scenario);
      results.push({ id, valid: result.valid, errors: result.errors });

      if (result.valid) {
        if (!options.json) console.log(`✓ Scenario "${id}" is valid.`);
      } else {
        valid = false;
        if (!options.json) {
          console.error(`✗ Scenario "${id}" has errors:`);
          for (const error of result.errors) console.error(`  - ${error}`);
        }
      }
    } catch (error) {
      valid = false;
      results.push({ id, valid: false, errors: [(error as Error).message] });
      if (!options.json) console.error(`Error: ${(error as Error).message}`);
    }
  }

  if (options.json) {
    outputJson({ valid, results });
  }

  if (!valid) process.exitCode = 1;
}

async function cmdRun(options: CliOptions): Promise<void> {
  const scenarios = options.scenarios || listScenarios();

  if (scenarios.length === 0) {
    console.error("No scenarios to run.");
    process.exit(1);
  }

  if (options.dryRun) {
    const dryOutput = {
      dryRun: true,
      scenarios,
      model: options.model || "unknown",
      driver: options.driver || "opencode",
      runs: options.runs || 3,
      conditions: options.conditions || ["vanilla", "maestro-core"],
      useContainer: options.useContainer || false,
      benchmarkClass: options.benchmarkClass || "official",
    };

    if (options.json) {
      outputJson(dryOutput);
    } else {
      console.log("Dry run — would execute:\n");
      console.log(`  Scenarios: ${scenarios.join(", ")}`);
      console.log(`  Model: ${dryOutput.model}`);
      console.log(`  Driver: ${dryOutput.driver}`);
      console.log(`  Runs per scenario: ${dryOutput.runs}`);
      console.log(`  Conditions: ${dryOutput.conditions.join(", ")}`);
      console.log(`  Container isolation: ${dryOutput.useContainer}`);
      console.log(`  Benchmark class: ${dryOutput.benchmarkClass}`);
    }
    return;
  }

  console.log(`Running ${scenarios.length} scenario(s)...\n`);

  try {
    const results = await runBenchmark(scenarios, options);

    console.log(`\nCompleted ${results.length} run(s).`);

    const report = generateReport(results, options);
    const outputDir = options.outputDir || path.join(BENCHMARKS_DIR, "results");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jsonPath = path.join(outputDir, `report-${timestamp}.json`);
    const mdPath = path.join(outputDir, `report-${timestamp}.md`);

    fs.writeFileSync(jsonPath, report.json, "utf8");
    fs.writeFileSync(mdPath, report.markdown, "utf8");

    if (options.json) {
      outputJson({
        completed: true,
        runCount: results.length,
        reports: { json: jsonPath, markdown: mdPath },
        evidenceSummary: report.evidenceSummary,
      });
    } else {
      console.log(`\nReports saved:`);
      console.log(`  JSON: ${jsonPath}`);
      console.log(`  MD:   ${mdPath}`);
    }
  } catch (error) {
    if (options.json) {
      outputJson({ error: (error as Error).message });
    } else {
      console.error(`Error running benchmark: ${(error as Error).message}`);
    }
    if (options.verbose) console.error((error as Error).stack);
    process.exit(1);
  }
}

function cmdCompare(file1: string | undefined, file2: string | undefined, options: CliOptions): void {
  if (!file1 || !file2) {
    console.error("Error: two result files required. Usage: compare <file1> <file2>");
    process.exit(1);
  }

  try {
    const r1: RunResult = JSON.parse(fs.readFileSync(file1, "utf8"));
    const r2: RunResult = JSON.parse(fs.readFileSync(file2, "utf8"));

    if (options.json) {
      outputJson({
        file1: path.basename(file1),
        file2: path.basename(file2),
        result1: r1,
        result2: r2,
      });
      return;
    }

    console.log(`Comparing:`);
    console.log(`  File 1: ${path.basename(file1)}`);
    console.log(`  File 2: ${path.basename(file2)}\n`);

    console.log(`Condition 1: ${r1.condition} (run ${r1.run})`);
    console.log(`Condition 2: ${r2.condition} (run ${r2.run})\n`);

    if (r1.evidence && r2.evidence) {
      console.log(`Evidence Gate:`);
      console.log(`  ${r1.condition}: ${r1.evidence.passed ? "PASS" : "FAIL"} (tests: ${r1.evidence.testsPassed}/${r1.evidence.testsTotal})`);
      console.log(`  ${r2.condition}: ${r2.evidence.passed ? "PASS" : "FAIL"} (tests: ${r2.evidence.testsPassed}/${r2.evidence.testsTotal})`);
    }

    if (r1.driverResult && r2.driverResult) {
      console.log(`\nPerformance:`);
      console.log(`  ${r1.condition}: ${r1.driverResult.durationMs}ms`);
      console.log(`  ${r2.condition}: ${r2.driverResult.durationMs}ms`);
    }
  } catch (error) {
    console.error(`Error comparing results: ${(error as Error).message}`);
    process.exit(1);
  }
}

function cmdSuite(options: CliOptions): Promise<void> {
  const profile = options.profile || "official";

  let scenarios = listScenarios();
  if (options.filter) {
    scenarios = scenarios.filter((id) => {
      const s = loadScenario(id);
      return s.type === options.filter;
    });
  }

  if (scenarios.length === 0) {
    console.error("No scenarios match the given filter.");
    process.exit(1);
  }

  const runs = profile === "ci" ? (options.runs || 3) : (options.runs || 10);
  const conditions: BenchmarkCondition[] = profile === "ci"
    ? ["vanilla", "maestro-core"]
    : ["vanilla", "maestro-core"];

  const suiteOptions: CliOptions = {
    ...options,
    runs,
    conditions,
    benchmarkClass: profile === "ci" ? "ci" : "official",
  };

  if (!options.json) {
    const label = options.resume ? `Resuming suite "${options.resume}"` : `Running suite (profile: ${profile})`;
    console.log(`${label}: ${scenarios.length} scenario(s), ${runs} run(s) each\n`);
  }

  return cmdRun({ ...suiteOptions, scenarios });
}

function cmdReport(runSet: string | undefined, options: CliOptions): void {
  if (!runSet) {
    console.error("Error: run-set required. Usage: report <run-set>");
    process.exit(1);
  }

  const outputDir = options.outputDir || path.join(BENCHMARKS_DIR, "results");
  const format = options.format || "markdown";

  try {
    const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".json") && f.startsWith(`report-${runSet}`));
    if (files.length === 0) {
      console.error(`No report files found for run-set "${runSet}" in ${outputDir}`);
      process.exit(1);
    }

    const allResults: RunResult[] = [];
    for (const file of files) {
      const report = JSON.parse(fs.readFileSync(path.join(outputDir, file), "utf8"));
      if (report.results) {
        allResults.push(...report.results);
      } else if (report.benchmark) {
        allResults.push(report);
      }
    }

    if (allResults.length === 0) {
      console.error(`No run results found in report files for "${runSet}"`);
      process.exit(1);
    }

    const report = generateReport(allResults, options);

    if (format === "json") {
      outputJson(JSON.parse(report.json));
    } else if (format === "csv") {
      const header = "scenario,condition,run,model,tokens,durationMs,passed,claimEligible";
      const rows = allResults.map((r) =>
        [
          r.benchmark,
          r.condition,
          r.run,
          r.model,
          r.driverResult?.usage?.totalTokens ?? "",
          r.metadata?.durationMs ?? "",
          r.validation?.passed ?? false,
          r.evidence?.publicClaimEligible ?? false,
        ].join(",")
      );
      console.log([header, ...rows].join("\n"));
    } else {
      outputText(report.markdown);
    }
  } catch (error) {
    console.error(`Error generating report: ${(error as Error).message}`);
    process.exit(1);
  }
}

function cmdVerify(runId: string | undefined, options: CliOptions): void {
  if (!runId) {
    console.error("Error: run-id required. Usage: verify <run-id>");
    process.exit(1);
  }

  const resultsDir = options.outputDir || path.join(BENCHMARKS_DIR, "results");

  try {
    const result = loadRunById(resultsDir, runId);
    if (!result) {
      console.error(`Run not found: ${runId}`);
      process.exit(1);
    }

    const gate = {
      runId,
      benchmark: result.benchmark,
      condition: result.condition,
      run: result.run,
      evidence: {
        passed: result.evidence?.passed ?? false,
        publicClaimEligible: result.evidence?.publicClaimEligible ?? false,
        executionType: result.evidence?.executionType ?? "unknown",
        reproducible: result.evidence?.reproducible ?? false,
        isolated: result.evidence?.isolated ?? false,
      },
      validation: {
        passed: result.validation?.passed ?? false,
        testsPassed: result.validation?.testsPassed ?? 0,
        testsTotal: result.validation?.testsTotal ?? 0,
        exitCode: result.validation?.exitCode ?? null,
      },
      tokenSource: result.driverResult?.usage?.tokenSource ?? "unknown",
      claimEligible: result.evidence?.publicClaimEligible ?? false,
    };

    if (options.json) {
      outputJson(gate);
      return;
    }

    console.log(`Evidence Gate: ${gate.runId}\n`);
    console.log(`  Benchmark:    ${gate.benchmark}`);
    console.log(`  Condition:    ${gate.condition}`);
    console.log(`  Run:          ${gate.run}`);
    console.log();
    console.log(`  Execution:    ${gate.evidence.executionType}`);
    console.log(`  Reproducible: ${gate.evidence.reproducible}`);
    console.log(`  Isolated:     ${gate.evidence.isolated}`);
    console.log(`  Token source: ${gate.tokenSource}`);
    console.log();
    console.log(`  Tests:        ${gate.validation.testsPassed}/${gate.validation.testsTotal} passed`);
    console.log(`  Exit code:    ${gate.validation.exitCode}`);
    console.log(`  Validation:   ${gate.validation.passed ? "PASS" : "FAIL"}`);
    console.log();
    console.log(`  Evidence:     ${gate.evidence.passed ? "PASS" : "FAIL"}`);
    console.log(`  Claim eligible: ${gate.claimEligible ? "YES" : "NO"}`);
  } catch (error) {
    console.error(`Error verifying run: ${(error as Error).message}`);
    process.exit(1);
  }
}

function cmdInspect(runId: string | undefined, options: CliOptions): void {
  if (!runId) {
    console.error("Error: run-id required. Usage: inspect <run-id>");
    process.exit(1);
  }

  const resultsDir = options.outputDir || path.join(BENCHMARKS_DIR, "results");

  try {
    const result = loadRunById(resultsDir, runId);
    if (!result) {
      console.error(`Run not found: ${runId}`);
      process.exit(1);
    }

    if (options.json) {
      outputJson(result);
      return;
    }

    console.log(`Run: ${runId}\n`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Error inspecting run: ${(error as Error).message}`);
    process.exit(1);
  }
}

function cmdPreflight(options: CliOptions): void {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  // Docker
  try {
    execSync("docker --version", { encoding: "utf8", stdio: "pipe" });
    checks.push({ name: "Docker", ok: true, detail: "available" });
  } catch {
    checks.push({ name: "Docker", ok: false, detail: "not found in PATH" });
  }

  // OpenCode
  try {
    const ver = execSync("opencode --version", { encoding: "utf8", stdio: "pipe" }).trim();
    checks.push({ name: "OpenCode", ok: true, detail: ver });
  } catch {
    checks.push({ name: "OpenCode", ok: false, detail: "not found in PATH" });
  }

  // Model configured (check env var)
  const model = options.model || "anthropic/claude-sonnet-4-20250514";
  const provider = model.split("/")[0];
  const envKey = provider.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY";
  if (process.env[envKey]) {
    checks.push({ name: "API Key", ok: true, detail: `${envKey} set` });
  } else {
    const altKeys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"];
    const found = altKeys.find((k) => process.env[k]);
    if (found) {
      checks.push({ name: "API Key", ok: true, detail: `${found} set` });
    } else {
      checks.push({ name: "API Key", ok: false, detail: `no key found for ${provider} (checked ${envKey})` });
    }
  }

  // Node.js
  checks.push({ name: "Node.js", ok: true, detail: process.version });

  // Git
  try {
    const gitVer = execSync("git --version", { encoding: "utf8", stdio: "pipe" }).trim();
    checks.push({ name: "Git", ok: true, detail: gitVer });
  } catch {
    checks.push({ name: "Git", ok: false, detail: "not found in PATH" });
  }

  if (options.json) {
    outputJson({
      allPassed: checks.every((c) => c.ok),
      checks,
    });
    return;
  }

  console.log("Preflight checks:\n");
  for (const check of checks) {
    const mark = check.ok ? "✓" : "✗";
    console.log(`  ${mark} ${check.name}: ${check.detail}`);
  }
  console.log();

  const allPassed = checks.every((c) => c.ok);
  console.log(allPassed ? "All checks passed." : "Some checks failed.");
  if (!allPassed) process.exitCode = 1;
}

function loadRunById(resultsDir: string, runId: string): RunResult | null {
  if (!fs.existsSync(resultsDir)) return null;

  const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const report = JSON.parse(fs.readFileSync(path.join(resultsDir, file), "utf8"));
    const results: RunResult[] = report.results || [];

    for (const r of results) {
      const id = `${r.benchmark}_${r.condition}_run${r.run}`;
      if (id === runId) return r;
    }

    if (report.benchmark) {
      const r = report as unknown as RunResult;
      const id = `${r.benchmark}_${r.condition}_run${r.run}`;
      if (id === runId) return r;
    }
  }

  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const options = parseArgs(args.slice(1));

  switch (command) {
    case "list":
      cmdList(options);
      break;
    case "validate":
      cmdValidate(options.scenarios?.[0], options);
      break;
    case "run":
      await cmdRun(options);
      break;
    case "compare":
      cmdCompare(options.scenarios?.[0], options.scenarios?.[1], options);
      break;
    case "suite":
      await cmdSuite(options);
      break;
    case "report":
      cmdReport(options.scenarios?.[0], options);
      break;
    case "verify":
      cmdVerify(options.scenarios?.[0], options);
      break;
    case "inspect":
      cmdInspect(options.scenarios?.[0], options);
      break;
    case "preflight":
      cmdPreflight(options);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

export { parseArgs, printHelp, cmdList, cmdValidate, cmdRun, cmdCompare, cmdSuite, cmdReport, cmdVerify, cmdInspect, cmdPreflight };
