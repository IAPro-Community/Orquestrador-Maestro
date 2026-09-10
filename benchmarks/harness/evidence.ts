import type { DriverResult, RunResult } from "./types";

interface EvaluateEvidenceOptions {
  expectedExitCode?: number;
}

interface EvidenceResult {
  passed: boolean;
  testsPassed: number;
  testsTotal: number;
  errors: string[];
  publicClaimEligible: boolean;
}

interface EvidenceSummary {
  totalRuns: number;
  claimEligibleRuns: number;
  hasMixedEvidence: boolean;
  publicClaimEligible: boolean;
}

function evaluateEvidence(
  driverResult: DriverResult,
  validationResult: { testsPassed?: number; testsFailed?: number; testsTotal?: number; exitCode?: number } | null | undefined,
  runOptions: EvaluateEvidenceOptions = {}
): EvidenceResult {
  const testsPassed = validationResult?.testsPassed ?? 0;
  const testsFailed = validationResult?.testsFailed ?? 0;
  const testsTotal = validationResult?.testsTotal ?? (testsPassed + testsFailed);
  const validationExitCode = validationResult?.exitCode ?? 1;
  const expectedExitCode = runOptions.expectedExitCode ?? 0;

  const hiddenTestsPass = testsPassed === testsTotal && testsTotal > 0;
  const exitCodeMatches = validationExitCode === expectedExitCode;
  const driverExitCodeOk = ((driverResult as unknown as { exitCode?: number })?.exitCode ?? 0) === expectedExitCode;

  const passed = hiddenTestsPass && exitCodeMatches && driverExitCodeOk;

  const errors: string[] = [];
  if (!hiddenTestsPass) {
    errors.push(`Hidden tests failed: ${testsPassed}/${testsTotal} passed`);
  }
  if (!exitCodeMatches) {
    errors.push(`Exit code mismatch: expected ${expectedExitCode}, got ${validationExitCode}`);
  }
  if (!driverExitCodeOk) {
    errors.push(`Driver exit code mismatch: expected ${expectedExitCode}, got ${(driverResult as unknown as { exitCode?: number })?.exitCode}`);
  }

  return {
    passed,
    testsPassed,
    testsTotal,
    errors,
    publicClaimEligible: passed,
  };
}

function summarizeEvidence(results: RunResult[]): EvidenceSummary {
  const totalRuns = results.length;
  const claimEligibleRuns = results.filter((r) => isClaimEligibleRun(r)).length;
  const hasMixedEvidence = claimEligibleRuns > 0 && claimEligibleRuns < totalRuns;

  return {
    totalRuns,
    claimEligibleRuns,
    hasMixedEvidence,
    publicClaimEligible: !hasMixedEvidence && claimEligibleRuns > 0,
  };
}

interface ClaimEligibleInput {
  evidence?: {
    publicClaimEligible?: boolean;
    executionType?: string;
    reproducible?: boolean;
    isolated?: boolean;
  } | null;
  usage?: { tokenSource?: string } | null;
  driverResult?: { usage?: { tokenSource?: string } | null } | null;
  validation?: { passed?: boolean } | null;
}

function isClaimEligibleRun(run: ClaimEligibleInput): boolean {
  if (!run?.evidence?.publicClaimEligible) return false;
  if (run.evidence.executionType !== "real-execution") return false;
  const tokenSource = run.usage?.tokenSource ?? run.driverResult?.usage?.tokenSource;
  if (tokenSource !== "provider-reported") return false;
  if (run.evidence.reproducible !== true) return false;
  if (run.evidence.isolated !== true) return false;
  if (run.validation?.passed !== true) return false;
  return true;
}

export { evaluateEvidence, summarizeEvidence, isClaimEligibleRun };
