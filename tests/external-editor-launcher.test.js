"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ExternalEditorLauncher } = require("../runtime/planner/external-editor-launcher");

test("ExternalEditorLauncher.detect resolves to an editor name", async () => {
  const launcher = new ExternalEditorLauncher();
  const editor = await launcher.detect();
  assert.ok(typeof editor === "string");
  assert.ok(editor.length > 0);
});

test("ExternalEditorLauncher.launch returns success or clear error", async () => {
  const launcher = new ExternalEditorLauncher({ editor: "true" });
  const result = await launcher.launch("/dev/null");
  assert.ok(typeof result === "object");
  assert.ok(typeof result.success === "boolean");
  if (!result.success) {
    assert.ok(typeof result.reason === "string");
  }
});

test("ExternalEditorLauncher.launch rejects non-string path", async () => {
  const launcher = new ExternalEditorLauncher({ editor: "true" });
  await assert.rejects(() => launcher.launch(null), /filePath/);
  await assert.rejects(() => launcher.launch(123), /filePath/);
});

test("ExternalEditorLauncher.launch rejects non-existent file when requireExisting=true", async () => {
  const launcher = new ExternalEditorLauncher({ editor: "true" });
  const result = await launcher.launch("/nonexistent/path/file.md", { requireExisting: true });
  assert.equal(result.success, false);
  assert.ok(result.reason.includes("ENOENT") || result.reason.includes("not found") || result.reason.includes("exist"));
});
