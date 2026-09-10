import { execSync } from "node:child_process";
import type { Scenario, ValidationResult } from "./types";

function parseTestOutput(output: string): { passed: number; failed: number } {
  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);

  if (passMatch || failMatch) {
    return {
      passed: parseInt(passMatch?.[1] || "0", 10),
      failed: parseInt(failMatch?.[1] || "0", 10),
    };
  }

  const okLines = (output.match(/^ok \d+/gm) || []).length;
  const notOkLines = (output.match(/^not ok \d+/gm) || []).length;

  return { passed: okLines, failed: notOkLines };
}

async function runHiddenTests(workDir: string, scenario: Scenario): Promise<ValidationResult> {
  if (!scenario.validation || !scenario.validation.command) {
    return { passed: true, exitCode: 0, testsPassed: 0, testsFailed: 0, testsTotal: 0, output: "" };
  }

  const timeoutMs = scenario.validation.timeoutMs || 60000;
  const expectedExitCode = scenario.validation.expectedExitCode ?? 0;

  try {
    const output = execSync(scenario.validation.command, {
      cwd: workDir,
      encoding: "utf8",
      stdio: "pipe",
      timeout: timeoutMs,
      env: { ...process.env, NODE_ENV: "test" },
    });

    const { passed, failed } = parseTestOutput(output);

    return {
      passed: true,
      exitCode: 0,
      testsPassed: passed,
      testsFailed: failed,
      testsTotal: passed + failed,
      output: output.slice(-2000),
    };
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    const exitCode = err.status ?? 1;
    const output = (err.stdout || "") + (err.stderr || "");
    const { passed, failed } = parseTestOutput(output);

    return {
      passed: exitCode === expectedExitCode,
      exitCode,
      testsPassed: passed,
      testsFailed: failed,
      testsTotal: passed + failed,
      output: output.slice(-2000),
    };
  }
}

export { runHiddenTests, parseTestOutput };
