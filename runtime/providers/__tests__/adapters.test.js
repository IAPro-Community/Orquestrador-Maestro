"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { AgyAdapter, CodexAdapter, ClaudeAdapter, OpenCodeAdapter } = require("..");
const { makeTempDir, writeFile } = require("../../../tests/test-helpers");

function fakeCli(root) {
  return writeFile(root, "fake-provider.js", `
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("fake-provider 1.0.0"); process.exit(0); }
const prompt = args.at(-1);
console.log(JSON.stringify({ args, cwd: process.cwd(), prompt }));
console.error("provider stderr");
if (prompt === "wait") setTimeout(() => console.log("late output"), 5000);
else setTimeout(() => process.exit(prompt === "fail" ? 3 : 0), 15);
`);
}

test("CodexAdapter detects, translates supported options, and streams process output", async () => {
  const root = makeTempDir("maestro-provider-");
  const script = fakeCli(root);
  const adapter = new CodexAdapter({ executable: process.execPath, commandPrefixArgs: [script] });
  const installation = await adapter.detect();
  assert.equal(installation.installed, true);
  assert.match(installation.version, /fake-provider/u);
  assert.deepEqual(await adapter.capabilities(), {
    headless: true, structuredEvents: true, streaming: true, sessionResume: true,
    toolApproval: false, sandboxControl: true, modelSelection: true, mcp: false
  });

  const events = [];
  const handle = await adapter.execute({ prompt: "implement", workspacePath: root, model: "gpt-test", sandbox: "workspace-write", onEvent: (event) => events.push(event) });
  const result = await handle.result;
  assert.equal(result.exitCode, 0);
  assert.equal(result.pid, handle.pid);
  assert.match(result.stderr, /provider stderr/u);
  assert.ok(events.some((event) => event.type === "provider.started"));
  assert.ok(events.some((event) => event.type === "provider.output" && event.stream === "stdout"));
  assert.ok(events.some((event) => event.type === "provider.completed"));
  const received = JSON.parse(result.stdout.trim());
  assert.deepEqual(received.args.slice(0, 7), ["exec", "--json", "--color", "never", "--model", "gpt-test", "--sandbox"]);
  assert.ok(received.args.includes("workspace-write"));
  assert.ok(received.args.includes("--cd"));
  assert.equal(received.cwd, root);
});

test("ClaudeAdapter uses print stream-json and lets the spawn cwd carry workspace isolation", async () => {
  const root = makeTempDir("maestro-provider-");
  const script = fakeCli(root);
  const adapter = new ClaudeAdapter({ executable: process.execPath, commandPrefixArgs: [script] });
  const handle = await adapter.execute({ prompt: "review", workspacePath: root, model: "sonnet", permissionMode: "default" });
  const result = await handle.result;
  const received = JSON.parse(result.stdout.trim());
  assert.equal(result.exitCode, 0);
  assert.deepEqual(received.args.slice(0, 6), ["--print", "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--model"]);
  assert.ok(received.args.includes("--permission-mode"));
  assert.equal(received.cwd, root);
  assert.equal((await adapter.capabilities()).mcp, true);
});

test("provider handles support cancellation, timeouts, and non-zero exits without spawnSync", async () => {
  const root = makeTempDir("maestro-provider-");
  const script = fakeCli(root);
  const adapter = new CodexAdapter({ executable: process.execPath, commandPrefixArgs: [script] });

  const cancelled = await adapter.execute({ prompt: "wait" });
  cancelled.cancel();
  const cancelledResult = await cancelled.result;
  assert.equal(cancelledResult.cancelled, true);

  const timedOut = await adapter.execute({ prompt: "wait", timeoutMs: 20 });
  const timeoutResult = await timedOut.result;
  assert.equal(timeoutResult.timedOut, true);

  const failed = await adapter.execute({ prompt: "fail" });
  assert.equal((await failed.result).exitCode, 3);
});

test("provider detection reports an unavailable executable without throwing", async () => {
  const adapter = new ClaudeAdapter({ executable: path.join(makeTempDir("maestro-provider-"), "missing-claude") });
  const installation = await adapter.detect();
  assert.equal(installation.installed, false);
  assert.equal(installation.id, "claude");
  assert.ok(installation.error);
});

test("AgyAdapter uses documented print stream-json, model, mode, and sandbox flags", async () => {
  const root = makeTempDir("maestro-provider-");
  const script = fakeCli(root);
  const adapter = new AgyAdapter({ executable: process.execPath, commandPrefixArgs: [script] });
  const result = await (await adapter.execute({ prompt: "review", model: "agy-model", mode: "plan", sandbox: "enabled" })).result;
  const received = JSON.parse(result.stdout.trim());
  assert.equal(result.exitCode, 0);
  assert.deepEqual(received.args.slice(0, 9), ["--print", "--output-format", "stream-json", "--model", "agy-model", "--mode", "plan", "--sandbox", "review"]);
  assert.equal((await adapter.capabilities()).sandboxControl, true);
});

test("OpenCodeAdapter uses documented run JSON, model, agent, session, and workspace flags", async () => {
  const root = makeTempDir("maestro-provider-");
  const script = fakeCli(root);
  const adapter = new OpenCodeAdapter({ executable: process.execPath, commandPrefixArgs: [script] });
  const result = await (await adapter.execute({ prompt: "review", workspacePath: root, model: "provider/model", agent: "reviewer", sessionId: "session-1" })).result;
  const received = JSON.parse(result.stdout.trim());
  assert.equal(result.exitCode, 0);
  assert.deepEqual(received.args.slice(0, 11), ["run", "--format", "json", "--model", "provider/model", "--agent", "reviewer", "--session", "session-1", "--dir", root]);
  assert.equal((await adapter.capabilities()).mcp, true);
  assert.equal((await adapter.capabilities()).sandboxControl, false);
});

test("adapters skip the --model flag when model is the \"default\" sentinel", async () => {
  const root = makeTempDir("maestro-provider-");
  const script = fakeCli(root);
  const cases = [
    { Adapter: OpenCodeAdapter, expectedPrefix: ["run", "--format", "json"] },
    { Adapter: CodexAdapter, expectedPrefix: ["exec", "--json", "--color", "never"] },
    { Adapter: ClaudeAdapter, expectedPrefix: ["--print", "--output-format", "stream-json", "--include-partial-messages"] },
    { Adapter: AgyAdapter, expectedPrefix: ["--print", "--output-format", "stream-json"] }
  ];
  for (const { Adapter, expectedPrefix } of cases) {
    const adapter = new Adapter({ executable: process.execPath, commandPrefixArgs: [script] });
    const result = await (await adapter.execute({ prompt: "review", workspacePath: root, model: "default" })).result;
    const received = JSON.parse(result.stdout.trim());
    assert.deepEqual(received.args.slice(0, expectedPrefix.length), expectedPrefix, `${Adapter.name} must not translate --model default`);
    assert.ok(!received.args.includes("--model"), `${Adapter.name} must not emit --model` );
  }
});
