"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { PlanArtifactStore } = require("../runtime/planner/plan-artifact-store");

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "plan-artifact-store-test-"));
}

test("PlanArtifactStore.writePlanArtifact creates PLAN.md in mission directory", async () => {
  const workspacePath = makeTmpDir();
  const missionId = "mission-abc-123";
  const content = "# Plan\n\n## Tasks\n\n- task-1\n";

  const store = new PlanArtifactStore({ workspacePath });
  const result = await store.writePlanArtifact(missionId, content);

  assert.ok(result.written);
  assert.ok(result.path);

  const readContent = fs.readFileSync(result.path, "utf8");
  assert.equal(readContent, content);

  fs.rmSync(workspacePath, { recursive: true, force: true });
});

test("PlanArtifactStore.readPlanArtifact reads PLAN.md from mission directory", async () => {
  const workspacePath = makeTmpDir();
  const missionId = "mission-xyz-456";
  const content = "# Plan\n\nTest content\n";

  const store = new PlanArtifactStore({ workspacePath });
  await store.writePlanArtifact(missionId, content);

  const read = await store.readPlanArtifact(missionId);
  assert.ok(read.exists);
  assert.equal(read.content, content);

  fs.rmSync(workspacePath, { recursive: true, force: true });
});

test("PlanArtifactStore.readPlanArtifact returns exists=false when PLAN.md missing", async () => {
  const workspacePath = makeTmpDir();
  const store = new PlanArtifactStore({ workspacePath });
  const read = await store.readPlanArtifact("mission-nonexistent");
  assert.equal(read.exists, false);
  assert.equal(read.content, "");
  fs.rmSync(workspacePath, { recursive: true, force: true });
});

test("PlanArtifactStore.planArtifactPath returns correct path", () => {
  const workspacePath = "/tmp/test-project";
  const store = new PlanArtifactStore({ workspacePath });
  const p = store.planArtifactPath("mission-123");
  assert.ok(p.includes("DEV"));
  assert.ok(p.includes("MISSIONS"));
  assert.ok(p.includes("mission-123"));
  assert.ok(p.includes("PLAN.md"));
});

test("PlanArtifactStore.writePlanArtifact creates DEV/MISSIONS structure", async () => {
  const workspacePath = makeTmpDir();
  const store = new PlanArtifactStore({ workspacePath });
  await store.writePlanArtifact("mission-test", "# Plan\n");

  const missionDir = path.join(workspacePath, "DEV", "MISSIONS", "mission-test");
  assert.ok(fs.existsSync(missionDir));
  assert.ok(fs.existsSync(path.join(missionDir, "PLAN.md")));

  fs.rmSync(workspacePath, { recursive: true, force: true });
});

test("PlanArtifactStore.writePlanArtifact overwrites existing PLAN.md", async () => {
  const workspacePath = makeTmpDir();
  const store = new PlanArtifactStore({ workspacePath });
  await store.writePlanArtifact("mission-overwrite", "# Plan v1\n");
  await store.writePlanArtifact("mission-overwrite", "# Plan v2\n");

  const read = await store.readPlanArtifact("mission-overwrite");
  assert.equal(read.content, "# Plan v2\n");

  fs.rmSync(workspacePath, { recursive: true, force: true });
});
