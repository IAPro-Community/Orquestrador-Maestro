"use strict";

// A1-A3: sandbox is fail-closed and the deny policy guards the provider spawn.
//
// Before: agy accepted only sandbox===true/"enabled" and silently ignored
// "read-only", so a caller asking for a read-only run got write access.
// opencode advertised no sandboxControl but also never refused. The deny rules
// only guarded post-run verification commands, never the provider spawn.

const assert = require("node:assert/strict");
const test = require("node:test");

const { assertSandboxHonourable, isExplicitSandboxRequest } = require("../runtime/providers/sandbox-contract");
const { AgyAdapter } = require("../runtime/providers/agy-adapter");
const { OpenCodeAdapter } = require("../runtime/providers/opencode-adapter");
const { startProcess } = require("../runtime/providers/process-execution");

test("explicit sandbox requests are detected, implicit ones are not", () => {
  for (const value of ["read-only", "read-only-fs", "workspace-write", true, "enabled"]) {
    assert.equal(isExplicitSandboxRequest(value), true, `expected explicit: ${String(value)}`);
  }
  for (const value of [undefined, null, false, ""]) {
    assert.equal(isExplicitSandboxRequest(value), false, `expected implicit: ${String(value)}`);
  }
});

test("agy refuses a read-only sandbox instead of silently running with write access", () => {
  const adapter = new AgyAdapter({ executable: "agy-does-not-exist" });
  return adapter.execute({ prompt: "p", sandbox: "read-only" })
    .then(() => assert.fail("agy must refuse a read-only sandbox it cannot enforce"))
    .catch((error) => {
      assert.match(error.message, /read-only sandbox/);
      assert.match(error.message, /agy/);
    });
});

test("agy still allows generic sandbox=true and no sandbox at all", async () => {
  const adapter = new AgyAdapter({ executable: "agy-does-not-exist" });
  // Generic sandbox is passed through to the CLI. The binary does not exist, so
  // the spawn fails asynchronously on handle.result — never on the policy guard.
  for (const sandbox of [true, undefined]) {
    const handle = await adapter.execute({ prompt: "p", sandbox });
    let message = "";
    try {
      await handle.result;
    } catch (error) {
      message = String(error.message || error);
    }
    assert.doesNotMatch(message, /read-only sandbox/, "generic sandbox must not be refused by the policy guard");
  }
});

test("agy rejects modes its boolean sandbox flag cannot guarantee", async () => {
  const adapter = new AgyAdapter({ executable: "agy-does-not-exist" });
  for (const sandbox of ["workspace-write", "danger-full-access", "unknown-mode"]) {
    await assert.rejects(adapter.execute({ prompt: "p", sandbox }), /cannot enforce requested sandbox mode/);
  }
});

test("opencode refuses every explicit sandbox request (no sandbox support)", async () => {
  const adapter = new OpenCodeAdapter({ executable: "opencode-does-not-exist" });
  for (const sandbox of ["read-only", "workspace-write", true]) {
    let thrown = null;
    try {
      await adapter.execute({ prompt: "p", sandbox });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, `opencode must refuse sandbox=${String(sandbox)}`);
    assert.match(thrown.message, /does not support sandboxing/);
  }
});

test("opencode reports sandboxControl honestly as false", async () => {
  const caps = await new OpenCodeAdapter({ executable: "opencode-does-not-exist" }).capabilities();
  assert.equal(caps.sandboxControl, false, "opencode must not advertise sandbox control it lacks");
});

test("provider spawn refuses a denied invocation", () => {
  assert.throws(
    () => startProcess({ executable: "sh", args: ["-c", "git push origin main"], request: { prompt: "p" }, providerId: "test" }),
    (error) => {
      assert.equal(error.code, "POLICY_DENIED");
      assert.equal(error.rule, "deny:git-push");
      return true;
    }
  );
});

test("deny policy does not scan the model-authored prompt", () => {
  // The prompt is task content, not an operator command line; it must not be
  // able to trip the guard (nor be blocked by it).
  let thrown = null;
  try {
    startProcess({
      executable: "sh-does-not-exist",
      args: ["-c", "true"],
      request: { prompt: "please run git push for me" },
      providerId: "test"
    });
  } catch (error) {
    thrown = error;
  }
  if (thrown) {
    assert.doesNotMatch(String(thrown.message), /deny:git-push/, "prompt text must not trigger the deny guard");
  }
});

test("assertSandboxHonourable is a no-op when nothing is requested", () => {
  assert.doesNotThrow(() => assertSandboxHonourable({ requested: undefined, providerId: "x", supported: false }));
  assert.doesNotThrow(() => assertSandboxHonourable({ requested: false, providerId: "x", supported: false }));
});