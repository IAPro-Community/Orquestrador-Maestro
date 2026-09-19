import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Locate the canonical benchmark-harness root directory
 * regardless of where the script is executed from or whether it is
 * running from src/ or compiled dist/.
 */
function findHarnessRoot(): string {
  let curr = __dirname;
  while (curr && curr !== dirname(curr)) {
    const pkgPath = join(curr, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'benchmark-harness') {
          return curr;
        }
      } catch {
        // Ignore parse error and keep walking
      }
    }
    curr = dirname(curr);
  }
  // Fallback
  return resolve(__dirname, '..', '..');
}

/**
 * Locate the repo root containing orquestrador-maestro.
 */
function findRepoRoot(harnessRoot: string): string {
  let curr = harnessRoot;
  while (curr && curr !== dirname(curr)) {
    const pkgPath = join(curr, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.name === '@iapro/orquestrador-maestro-cli') {
          return curr;
        }
      } catch {
        // Ignore
      }
    }
    curr = dirname(curr);
  }
  return dirname(harnessRoot);
}

export const BENCHMARK_HARNESS_ROOT = findHarnessRoot();
export const REPO_ROOT = findRepoRoot(BENCHMARK_HARNESS_ROOT);

export const SCENARIOS_DIR = join(BENCHMARK_HARNESS_ROOT, 'scenarios');
export const FIXTURES_DIR = join(BENCHMARK_HARNESS_ROOT, 'fixtures');
export const EVALUATORS_DIR = join(BENCHMARK_HARNESS_ROOT, 'evaluators');
export const EVIDENCE_DIR = join(BENCHMARK_HARNESS_ROOT, 'evidence');
export const RESULTS_DIR = join(BENCHMARK_HARNESS_ROOT, 'results');

/**
 * Resolve a scenario path or ID to a canonical absolute file path.
 * Handles:
 * - Direct IDs: "bug-fix-auth" -> ".../benchmark-harness/scenarios/bug-fix-auth.json"
 * - Relative filenames: "bug-fix-auth.json"
 * - CWD-dependent paths: "benchmark-harness/scenarios/bug-fix-auth.json" from repo root or harness root
 * - Absolute paths
 */
export function resolveScenarioPath(input: string): string {
  if (!input || input === '-') return input;

  // 1. If it's already an existing absolute path
  if (existsSync(input) && resolve(input) === input) {
    return input;
  }

  // 2. If it exists relative to current working directory
  const cwdResolved = resolve(process.cwd(), input);
  if (existsSync(cwdResolved)) {
    return cwdResolved;
  }

  // 3. If input is formatted with benchmark-harness prefix, e.g. "benchmark-harness/scenarios/..."
  if (input.includes('benchmark-harness')) {
    const fromRepo = resolve(REPO_ROOT, input);
    if (existsSync(fromRepo)) return fromRepo;

    const stripped = input.replace(/^.*benchmark-harness[/\\]/, '');
    const fromHarness = resolve(BENCHMARK_HARNESS_ROOT, stripped);
    if (existsSync(fromHarness)) return fromHarness;
  }

  // 4. Try inside canonical SCENARIOS_DIR
  const asJson = input.endsWith('.json') ? input : `${input}.json`;
  const inScenarios = join(SCENARIOS_DIR, asJson);
  if (existsSync(inScenarios)) {
    return inScenarios;
  }

  // 5. Try basename in SCENARIOS_DIR
  const baseInScenarios = join(SCENARIOS_DIR, basename(asJson));
  if (existsSync(baseInScenarios)) {
    return baseInScenarios;
  }

  // Fallback to cwd-resolved
  return cwdResolved;
}

/**
 * Resolve directory path (scenarios, evidence, fixtures) independent of CWD.
 */
export function resolveDirectoryPath(dirInput: string | undefined, defaultDir: string): string {
  if (!dirInput || dirInput.trim() === '') {
    return defaultDir;
  }

  const trimmed = dirInput.trim();

  // If already absolute and exists
  if (existsSync(trimmed) && resolve(trimmed) === trimmed) {
    return trimmed;
  }

  // If exists relative to CWD
  const cwdResolved = resolve(process.cwd(), trimmed);
  if (existsSync(cwdResolved)) {
    return cwdResolved;
  }

  // If it has redundant benchmark-harness prefix while inside benchmark-harness
  if (trimmed.includes('benchmark-harness')) {
    const fromRepo = resolve(REPO_ROOT, trimmed);
    if (existsSync(fromRepo)) return fromRepo;

    const stripped = trimmed.replace(/^.*benchmark-harness[/\\]/, '');
    const fromHarness = resolve(BENCHMARK_HARNESS_ROOT, stripped);
    if (existsSync(fromHarness)) return fromHarness;
  }

  // Fallback: check if it exists as subfolder in BENCHMARK_HARNESS_ROOT
  const directInHarness = join(BENCHMARK_HARNESS_ROOT, trimmed);
  if (existsSync(directInHarness)) {
    return directInHarness;
  }

  return cwdResolved;
}
