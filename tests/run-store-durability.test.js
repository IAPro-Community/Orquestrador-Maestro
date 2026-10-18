"use strict";

// 1.2.0 C1: durability. _flush must fsync the temp file before rename and
// fsync the parent directory after it, so a power loss cannot leave a
// renamed-but-empty runs.json (rename is atomic but was never durable).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { JsonFileRunStore } = require("../runtime/store/json-file-run-store");

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-durability-"));
  return { dir, filePath: path.join(dir, "runtime", "runs.json") };
}

test("flush fsyncs the temp file and the parent directory", { skip: process.platform === "win32" ? "Windows does not expose POSIX directory handles for fsync" : false }, async (t) => {
  const { filePath } = tempStore();
  const store = new JsonFileRunStore({ filePath });
  await store.initialize();

  const opened = [];
  const synced = [];
  const realOpen = fsp.open;
  t.mock.method(fsp, "open", async (...args) => {
    const handle = await realOpen(...args);
    opened.push({ path: String(args[0]), flags: args[1] });
    const realSync = handle.sync.bind(handle);
    t.mock.method(handle, "sync", async () => {
      synced.push(String(args[0]));
      return realSync();
    });
    return handle;
  });

  await store.saveRun({ id: "r1", status: "completed" });

  const tempOpens = opened.filter((o) => o.path.endsWith(".tmp"));
  assert.ok(tempOpens.length > 0, "temp file must be opened before rename");
  assert.ok(
    synced.some((p) => p.endsWith(".tmp")),
    "temp file must be fsynced before rename"
  );

  const dirOpens = opened.filter((o) => o.path.endsWith(path.join("runtime")));
  assert.ok(dirOpens.length > 0, "parent directory must be opened for fsync after rename");
  assert.ok(
    synced.some((p) => p.endsWith(path.join("runtime"))),
    "parent directory must be fsynced after rename"
  );
});

test("store content survives a reopen and is valid JSON", async () => {
  const { filePath } = tempStore();
  const first = new JsonFileRunStore({ filePath });
  await first.initialize();
  await first.saveRun({ id: "r1", status: "completed" });

  const raw = await fsp.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  assert.ok(parsed.runs.some((r) => r.id === "r1"), "run must be on disk");

  const second = new JsonFileRunStore({ filePath });
  await second.initialize();
  const runs = await second.listRuns();
  assert.ok(runs.some((r) => r.id === "r1"), "reopened store must see the run");
});

test("no leftover temp files after successful flush", async () => {
  const { dir, filePath } = tempStore();
  const store = new JsonFileRunStore({ filePath });
  await store.initialize();
  await store.saveRun({ id: "r1", status: "completed" });

  const runtimeDir = path.dirname(filePath);
  const entries = await fsp.readdir(runtimeDir);
  const leftovers = entries.filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, [], "temp files must be renamed away, not orphaned");
});
