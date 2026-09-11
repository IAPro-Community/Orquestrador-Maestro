/**
 * Load scenarios from disk.
 * @module scenarios/loader
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { validateScenario, type Scenario } from './index.js';

/**
 * Load a single scenario from a JSON file.
 *
 * Fixture paths in the scenario are resolved relative to the scenario
 * file's directory, not CWD.
 *
 * @param path  Absolute or relative path to the scenario JSON file.
 * @returns     Validated Scenario object with resolved fixture path.
 * @throws      If the file cannot be read or the scenario is invalid.
 */
export async function loadScenario(path: string): Promise<Scenario> {
  const resolved = resolve(path);
  const scenarioDir = dirname(resolved);

  let content: string;
  try {
    content = await readFile(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read scenario file ${resolved}: ${err}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to parse scenario JSON from ${resolved}: ${err}`,
    );
  }

  // Resolve fixture path relative to scenario file directory
  const fixture = data.fixture as { path?: string; hash?: string } | undefined;
  if (fixture?.path && !fixture.path.startsWith('/')) {
    fixture.path = resolve(scenarioDir, fixture.path);
  }

  const result = validateScenario(data);
  if (!result.valid || !result.scenario) {
    throw new Error(
      `Invalid scenario in ${resolved}:\n  ${result.errors.join('\n  ')}`,
    );
  }

  return result.scenario;
}

/**
 * Load all scenarios from a directory.
 *
 * Recursively finds all `.json` files and attempts to parse each as a
 * scenario. Non-scenario files are silently skipped.
 *
 * @param dir  Directory to scan for scenario JSON files.
 * @returns    Array of validated Scenario objects.
 */
export async function loadAllScenarios(dir: string): Promise<Scenario[]> {
  const resolved = resolve(dir);
  const scenarios: Scenario[] = [];

  let entries;
  try {
    entries = await readdir(resolved, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Failed to read scenario directory ${resolved}: ${err}`);
  }

  for (const entry of entries) {
    const fullPath = join(resolved, entry.name);

    if (entry.isDirectory()) {
      const subScenarios = await loadAllScenarios(fullPath);
      scenarios.push(...subScenarios);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    try {
      const scenario = await loadScenario(fullPath);
      scenarios.push(scenario);
    } catch {
      // Skip invalid scenario files silently
    }
  }

  return scenarios;
}
