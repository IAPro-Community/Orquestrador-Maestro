"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { WorkflowEngine } = require("../engine");

test("workflow executes sequentially with condition, retry, and approval gate", async () => {
  let attempts = 0;
  const engine = new WorkflowEngine();
  const workflow = { steps: [
    { id: "plan", execute: async () => "PLAN" },
    { id: "retry", retry: 1, execute: async () => { attempts += 1; if (attempts === 1) throw new Error("retry"); return "PATCH"; } },
    { id: "skip", condition: () => false, execute: async () => "no" },
    { id: "approve", approvalId: "release", execute: async () => "REVIEW" }
  ] };
  const pending = await engine.execute(workflow);
  assert.equal(pending.status, "awaiting_approval");
  engine.approve("release", "approved");
  const completed = await engine.execute(workflow);
  assert.equal(completed.status, "completed");
  assert.ok(attempts >= 2);
});
