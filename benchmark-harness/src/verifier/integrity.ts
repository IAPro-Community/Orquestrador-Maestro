/**
 * Benchmark integrity checker.
 *
 * Detects tampering with hidden tests, verifier code, scenario definitions,
 * and suspicious script patterns that could compromise benchmark validity.
 * @module integrity
 */

import { readFile, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

/** Result of a single integrity check. */
export interface IntegrityCheck {
  /** Name of the check performed. */
  name: string;
  /** Whether the check passed (no violation). */
  passed: boolean;
  /** Human-readable description of the violation. */
  message: string;
}

/** Aggregated integrity result. */
export interface IntegrityResult {
  /** Overall validity — true only if all checks pass. */
  valid: boolean;
  /** List of violation descriptions. */
  violations: string[];
  /** Individual check results. */
  checks: IntegrityCheck[];
}

/** Input parameters for the integrity check. */
export interface IntegrityOptions {
  /** SHA-256 hash of the scenario definition file. */
  scenarioHash?: string;
  /** SHA-256 hash of the hidden test directory. */
  hiddenTestsHash?: string;
  /** SHA-256 hash of the verifier script. */
  verifierHash?: string;
  /** Workspace directory to scan. */
  workspace: string;
}

/**
 * Compute SHA-256 hash of a file's contents.
 * Returns the hex-encoded hash string.
 */
async function sha256File(filePath: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const { readFile: read } = await import('node:fs/promises');
  const content = await read(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively read all files under a directory.
 */
async function readAllFiles(dir: string): Promise<string[]> {
  const { readdir, stat } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readAllFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Compute SHA-256 hash of all files in a directory (sorted for determinism).
 */
async function sha256Dir(dir: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const files = await readAllFiles(dir);
  files.sort();
  const hash = createHash('sha256');
  for (const f of files) {
    const content = await readFile(f);
    hash.update(f);
    hash.update(content);
  }
  return hash.digest('hex');
}

/**
 * Scan workspace files for suspicious script patterns.
 */
async function scanScriptsForCheats(
  workspace: string,
): Promise<IntegrityCheck[]> {
  const checks: IntegrityCheck[] = [];

  let files: string[];
  try {
    files = await readAllFiles(workspace);
  } catch {
    return checks;
  }

  // Filter to likely script/config files, excluding node_modules.
  const scriptExts = new Set([
    '.sh',
    '.js',
    '.ts',
    '.mjs',
    '.cjs',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
  ]);
  const scriptFiles = files.filter((f) => {
    if (f.includes('node_modules/')) return false;
    const ext = '.' + f.split('.').pop()?.toLowerCase();
    return scriptExts.has(ext);
  });

  for (const filePath of scriptFiles) {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const relPath = filePath.replace(workspace + '/', '');

    // Check for test.skip / test.only / describe.skip
    const skipOnlyPatterns = [
      { pattern: /\.skip\s*\(/g, label: 'test/suite skip' },
      { pattern: /\.only\s*\(/g, label: 'test/suite only' },
      { pattern: /describe\.skip\s*\(/g, label: 'describe.skip' },
      { pattern: /it\.skip\s*\(/g, label: 'it.skip' },
      { pattern: /xit\s*\(/g, label: 'xit' },
      { pattern: /xdescribe\s*\(/g, label: 'xdescribe' },
      { pattern: /pending\s*\(\s*["'].*?["']\s*\)/g, label: 'test pending' },
      { pattern: /test\.only\s*\(/g, label: 'test.only (hardcoded focus)' },
    ];

    for (const { pattern, label } of skipOnlyPatterns) {
      if (pattern.test(content)) {
        checks.push({
          name: `cheat:${label}`,
          passed: false,
          message: `Found ${label} in ${relPath}`,
        });
      }
    }

    // Check for `|| true` which suppresses failures
    if (/\|\|\s*true/.test(content)) {
      checks.push({
        name: 'cheat:or-true',
        passed: false,
        message: `Found "|| true" in ${relPath}`,
      });
    }

    // Check for process.exit(0) which forces success
    if (/process\.exit\s*\(\s*0\s*\)/.test(content)) {
      checks.push({
        name: 'cheat:process-exit',
        passed: false,
        message: `Found "process.exit(0)" in ${relPath}`,
      });
    }
  }

  if (checks.length === 0) {
    checks.push({
      name: 'cheat:scan',
      passed: true,
      message: 'No suspicious script patterns found',
    });
  }

  return checks;
}

/**
 * Check if a hidden test file was modified relative to expected content.
 */
async function checkHiddenTestIntegrity(
  workspace: string,
  expectedHash?: string,
): Promise<IntegrityCheck> {
  if (!expectedHash) {
    return {
      name: 'hidden-tests-hash',
      passed: true,
      message: 'No expected hash provided — skipped',
    };
  }

  // Search for hidden test directories.
  const { readdir } = await import('node:fs/promises');
  let entries: string[];
  try {
    entries = await readdir(workspace);
  } catch {
    return {
      name: 'hidden-tests-hash',
      passed: false,
      message: `Cannot read workspace: ${workspace}`,
    };
  }

  const hiddenDirs = entries.filter(
    (e) =>
      e === 'hidden-tests' ||
      e === '__hidden__' ||
      e === '.hidden-tests' ||
      e === 'hidden',
  );

  if (hiddenDirs.length === 0) {
    return {
      name: 'hidden-tests-hash',
      passed: true,
      message: 'No hidden test directory found in workspace',
    };
  }

  for (const dir of hiddenDirs) {
    const dirPath = resolve(workspace, dir);
    const actualHash = await sha256Dir(dirPath);
    if (actualHash !== expectedHash) {
      return {
        name: 'hidden-tests-hash',
        passed: false,
        message: `Hidden tests in ${dir} have been modified (expected ${expectedHash}, got ${actualHash})`,
      };
    }
  }

  return {
    name: 'hidden-tests-hash',
    passed: true,
    message: 'Hidden tests match expected hash',
  };
}

/**
 * Check if the verifier script itself has been modified.
 */
async function checkVerifierIntegrity(
  workspace: string,
  expectedHash?: string,
): Promise<IntegrityCheck> {
  if (!expectedHash) {
    return {
      name: 'verifier-hash',
      passed: true,
      message: 'No expected verifier hash provided — skipped',
    };
  }

  const { readdir } = await import('node:fs/promises');
  let entries: string[];
  try {
    entries = await readdir(workspace);
  } catch {
    return {
      name: 'verifier-hash',
      passed: false,
      message: `Cannot read workspace: ${workspace}`,
    };
  }

  const verifierFiles = entries.filter(
    (e) =>
      e === 'verifier.js' ||
      e === 'verifier.ts' ||
      e === 'verify.sh' ||
      e === 'verify.js' ||
      basename(e).startsWith('verifier'),
  );

  if (verifierFiles.length === 0) {
    return {
      name: 'verifier-hash',
      passed: true,
      message: 'No verifier script found in workspace',
    };
  }

  for (const file of verifierFiles) {
    const filePath = resolve(workspace, file);
    const actualHash = await sha256File(filePath);
    if (actualHash !== expectedHash) {
      return {
        name: 'verifier-hash',
        passed: false,
        message: `Verifier ${file} has been modified (expected ${expectedHash}, got ${actualHash})`,
      };
    }
  }

  return {
    name: 'verifier-hash',
    passed: true,
    message: 'Verifier matches expected hash',
  };
}

/**
 * Check if the scenario definition was tampered with.
 */
async function checkScenarioIntegrity(
  workspace: string,
  expectedHash?: string,
): Promise<IntegrityCheck> {
  if (!expectedHash) {
    return {
      name: 'scenario-hash',
      passed: true,
      message: 'No expected scenario hash provided — skipped',
    };
  }

  const { readdir } = await import('node:fs/promises');
  let entries: string[];
  try {
    entries = await readdir(workspace);
  } catch {
    return {
      name: 'scenario-hash',
      passed: false,
      message: `Cannot read workspace: ${workspace}`,
    };
  }

  const scenarioFiles = entries.filter(
    (e) =>
      e.endsWith('.json') &&
      (e.includes('scenario') || e.includes('benchmark')),
  );

  if (scenarioFiles.length === 0) {
    return {
      name: 'scenario-hash',
      passed: true,
      message: 'No scenario file found in workspace',
    };
  }

  for (const file of scenarioFiles) {
    const filePath = resolve(workspace, file);
    const actualHash = await sha256File(filePath);
    if (actualHash !== expectedHash) {
      return {
        name: 'scenario-hash',
        passed: false,
        message: `Scenario ${file} has been modified (expected ${expectedHash}, got ${actualHash})`,
      };
    }
  }

  return {
    name: 'scenario-hash',
    passed: true,
    message: 'Scenario matches expected hash',
  };
}

/**
 * Run full integrity verification on a benchmark scenario.
 *
 * @param options  Hash expectations and workspace path.
 * @returns        IntegrityResult with per-check details and violations.
 */
export async function checkBenchmarkIntegrity(
  options: IntegrityOptions,
): Promise<IntegrityResult> {
  const checks: IntegrityCheck[] = [];

  // 1. Scan scripts for cheat patterns.
  const cheatChecks = await scanScriptsForCheats(options.workspace);
  checks.push(...cheatChecks);

  // 2. Check hidden test integrity.
  const hiddenCheck = await checkHiddenTestIntegrity(
    options.workspace,
    options.hiddenTestsHash,
  );
  checks.push(hiddenCheck);

  // 3. Check verifier integrity.
  const verifierCheck = await checkVerifierIntegrity(
    options.workspace,
    options.verifierHash,
  );
  checks.push(verifierCheck);

  // 4. Check scenario integrity.
  const scenarioCheck = await checkScenarioIntegrity(
    options.workspace,
    options.scenarioHash,
  );
  checks.push(scenarioCheck);

  const violations = checks
    .filter((c) => !c.passed)
    .map((c) => `${c.name}: ${c.message}`);

  return {
    valid: violations.length === 0,
    violations,
    checks,
  };
}
