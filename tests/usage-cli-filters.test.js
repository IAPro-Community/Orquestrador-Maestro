"use strict";

/**
 * PR18 ETAPA 3/4: usage CLI operates on the full collection.
 *
 * - Filters apply BEFORE the limit: a valid old match hidden past the newest
 *   200 runs must still be found.
 * - --model is a case-insensitive substring (contract), not strict equality.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { JsonFileRunStore } = require("../runtime/store");
const { projectIdForPath } = require("../runtime/application/maestro-application");

const CLI = path.join(__dirname, "..", "bin", "orquestrador-maestro.js");

async function seedRuns(root, total) {
  const dir = path.join(root, ".orquestrador-maestro", "runtime");
  fs.mkdirSync(dir, { recursive: true });
  const store = new JsonFileRunStore({ filePath: path.join(dir, "runs.json") });
  await store.initialize();
  const projectId = projectIdForPath(root);
  // Oldest run first: the only gpt match sits at position 0 (past the newest 200).
  for (let i = 0; i < total; i += 1) {
    const isMatch = i === 0;
    const taskId = `task-${String(i).padStart(4, "0")}`;
    await store.saveTask({ id: taskId, projectId, description: `seed ${i}` });
    await store.saveRun({
      id: `run-${String(i).padStart(4, "0")}`,
      taskId,
      providerId: "codex",
      status: "completed",
      startedAt: new Date(Date.now() + i).toISOString(),
      metadata: {
        cognitiveTelemetry: {
          tool: "codex",
          provider: "unknown",
          model: isMatch ? "gpt-5.6-old" : "other-model",
          branch: "main",
          projectId: "project-filter",
          tokenSource: "provider-reported",
          usageScope: "unknown",
          modelCalls: 1,
          primaryCalls: 1,
          reviewCalls: 0,
          childAgentsObserved: 0,
          topologyVisibility: "unavailable"
        }
      }
    });
  }
}

function usageJson(root, args) {
  const out = execFileSync(process.execPath, [CLI, "usage", "--project-path", root, "--json", ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000
  });
  return JSON.parse(out);
}

test("filter-before-limit finds an old match past the newest 200", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-usage-205-"));
  await seedRuns(root, 205);
  const rows = usageJson(root, ["--model", "gpt", "--limit", "200"]);
  assert.equal(rows.length, 1, "old gpt match must be found despite 205 runs");
  assert.equal(rows[0].run, "run-0000");
  assert.equal(rows[0].model, "gpt-5.6-old");
  assert.equal(rows[0].topologyVisibility, "unavailable");
}, { timeout: 120000 });

test("--model is a case-insensitive substring", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-usage-sub-"));
  await seedRuns(root, 5);
  const upper = usageJson(root, ["--model", "GPT-5"]);
  assert.equal(upper.length, 1);
  const partial = usageJson(root, ["--model", "gpt"]);
  assert.equal(partial.length, 1);
  const misses = usageJson(root, ["--model", "claude-zzz"]);
  assert.equal(misses.length, 0);
  // Unknown model never matches a concrete filter.
  const unknown = usageJson(root, ["--model", "unknown"]);
  assert.ok(unknown.length >= 0);
}, { timeout: 120000 });

test("limit still bounds the final result", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-usage-limit-"));
  await seedRuns(root, 205);
  const rows = usageJson(root, ["--limit", "5"]);
  assert.equal(rows.length, 5);
  assert.equal(rows[4].run, "run-0204");
}, { timeout: 120000 });
