const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

test("orchestration contracts are versioned and descriptive-only", () => {
  const workflow = readJson("orquestrador/WORKFLOW_SCHEMAS.json");
  const task = readJson("orquestrador/TASK_SCHEMA.json");
  const workspace = readJson("orquestrador/WORKSPACE_SCHEMA.json");

  assert.equal(workflow.version, 2);
  assert.equal(workflow.compatibility.execution, "descriptive-only");
  assert.equal(task.execution, "descriptive-only");
  assert.equal(workspace.execution, "descriptive-only");
});

test("workflow v2 preserves legacy phases and adds handoff metadata", () => {
  const workflow = readJson("orquestrador/WORKFLOW_SCHEMAS.json").workflows["plan-build-verify"];

  assert.deepEqual(workflow.phases.map((phase) => phase.id), ["discuss", "plan", "execute", "verify", "ship"]);
  assert.deepEqual(workflow.steps.map((step) => step.phase), ["discuss", "plan", "execute", "verify", "ship"]);
  assert.equal(workflow.steps[1].humanGate.approval, "plan");
  assert.equal(workflow.steps[2].workspace, "task-default");
  assert.equal(workflow.steps[3].onFailure, "return-to-execute");
});

test("task and workspace contracts protect dependency and isolation invariants", () => {
  const task = readJson("orquestrador/TASK_SCHEMA.json");
  const workspace = readJson("orquestrador/WORKSPACE_SCHEMA.json");

  assert.deepEqual(task.required, ["id", "title", "status", "workflow", "createdAt", "updatedAt"]);
  assert.ok(task.fields.dependencies.fields.blockedBy);
  assert.ok(task.fields.artifacts.items.fields.path.relative);
  assert.ok(workspace.fields.repositories.items.fields.worktree.relative);
  assert.ok(workspace.invariants.some((rule) => rule.includes("Concurrent tasks")));
});


test("execution profiles keep fan-out explicit and separate from depth", () => {
  const config = readJson("orquestrador/SKILL_EXECUTION_PROFILES.json");
  for (const [name, profile] of Object.entries(config.profiles)) {
    if (name === "multiagent") {
      assert.equal(profile.allowSubagents, true);
      assert.ok(profile.maxSubagents > 0);
    } else {
      assert.equal(profile.allowSubagents, false, name);
      assert.equal(profile.maxSubagents, 0, name);
    }
  }
  assert.equal(config.profiles.deep.allowSubagents, false);
});
