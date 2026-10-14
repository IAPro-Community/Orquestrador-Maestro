"use strict";

// 1.2.0 C2: cross-process mutual exclusion for the run store.
//
// The in-process promise chain serialised writes only within a single
// JsonFileRunStore instance. Two instances (two daemons, or two processes) on
// the same file could both read state, mutate their own copy and flush — the
// second flush silently discarding the first. _mutate now holds an exclusive
// lockfile across reload+operation, so concurrent writers serialise.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { JsonFileRunStore } = require("../runtime/store/json-file-run-store");
const { withLockAsync } = require("../orquestrador/lib/lock-async");

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-cas-"));
  return path.join(dir, "runtime", "runs.json");
}

test("two store instances on the same file do not lose each other's writes", async () => {
  const filePath = tempFile();
  const a = new JsonFileRunStore({ filePath });
  const b = new JsonFileRunStore({ filePath });
  await a.initialize();
  await b.initialize();

  // Sequential interleaving across two instances is the observable failure mode
  // of last-writer-wins: each instance holds its own stale copy.
  await a.saveRun({ id: "run-a", status: "completed" });
  await b.saveRun({ id: "run-b", status: "completed" });

  const reread = new JsonFileRunStore({ filePath });
  await reread.initialize();
  const runs = await reread.listRuns();
  const ids = runs.map((r) => r.id);
  assert.ok(ids.includes("run-a"), "run-a must be present");
  assert.ok(ids.includes("run-b"), "run-b must be present (no lost update)");
});

test("concurrent writes from two instances end with every run persisted", async () => {
  const filePath = tempFile();
  const a = new JsonFileRunStore({ filePath });
  const b = new JsonFileRunStore({ filePath });
  await a.initialize();
  await b.initialize();

  await Promise.all([
    a.saveRun({ id: "x1", status: "completed" }),
    b.saveRun({ id: "y1", status: "completed" }),
    a.saveRun({ id: "x2", status: "completed" }),
    b.saveRun({ id: "y2", status: "completed" })
  ]);

  const reread = new JsonFileRunStore({ filePath });
  await reread.initialize();
  const ids = (await reread.listRuns()).map((r) => r.id).sort();
  for (const id of ["x1", "x2", "y1", "y2"]) {
    assert.ok(ids.includes(id), `missing ${id} after concurrent writes (got ${ids.join(",")})`);
  }
});

test("withLockAsync serialises overlapping critical sections", async () => {
  const lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "maestro-lock-")), "x.lock");
  const order = [];
  const first = withLockAsync(lockPath, async () => {
    order.push("a-start");
    await new Promise((resolve) => setTimeout(resolve, 40));
    order.push("a-end");
  });
  const second = withLockAsync(lockPath, async () => {
    order.push("b-start");
    order.push("b-end");
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, ["a-start", "a-end", "b-start", "b-end"], "critical sections must not interleave");
});

test("withLockAsync releases the lock even when the callback throws", async () => {
  const lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "maestro-lock-")), "y.lock");
  await assert.rejects(
    withLockAsync(lockPath, async () => { throw new Error("boom"); }),
    /boom/
  );
  assert.equal(fs.existsSync(lockPath), false, "lock must be released after a throw");
  // A second acquisition must succeed immediately.
  await withLockAsync(lockPath, async () => {});
});