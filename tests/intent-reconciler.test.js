"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { IntentReconciler } = require("../runtime/planner/intent-reconciler.js");

function makeFakeProvider(response) {
  return {
    detect: () => true,
    execute: async () => ({
      pid: "fake",
      cancel: () => {},
      result: Promise.resolve({
        stdout: JSON.stringify(response),
        stderr: "",
        exitCode: 0
      })
    })
  };
}

test("IntentReconciler: builds reconciliation prompt", async () => {
  let capturedPrompt = "";
  const provider = {
    detect: () => true,
    execute: async ({ prompt }) => {
      capturedPrompt = prompt;
      return {
        pid: "fake",
        cancel: () => {},
        result: Promise.resolve({
          stdout: JSON.stringify({
            objective: "refined",
            addRequirements: ["req1"],
            addConstraints: ["con1"],
            detectedUnknowns: [],
            question: null
          }),
          stderr: "",
          exitCode: 0
        })
      };
    }
  };
  const reconciler = new IntentReconciler({ provider });
  const intentSpec = { objective: "original", requirements: [], constraints: [], userDecisions: ["Decided scope: fullstack"], unknowns: [] };
  await reconciler.reconcile(intentSpec, [], {});
  assert.ok(capturedPrompt.includes("original"));
  assert.ok(capturedPrompt.includes("fullstack"));
});

test("IntentReconciler: returns proposal with updates", async () => {
  const response = {
    objective: "Build CRUD for products",
    addRequirements: ["Use TypeScript"],
    addConstraints: ["No GraphQL"],
    detectedUnknowns: [],
    question: null
  };
  const reconciler = new IntentReconciler({ provider: makeFakeProvider(response) });
  const intentSpec = { objective: "crud", requirements: [], constraints: [], userDecisions: [], unknowns: [] };
  const result = await reconciler.reconcile(intentSpec, [], {});
  assert.equal(result.proposal.objective, "Build CRUD for products");
  assert.deepEqual(result.proposal.addRequirements, ["Use TypeScript"]);
  assert.deepEqual(result.proposal.addConstraints, ["No GraphQL"]);
});

test("IntentReconciler: returns error on provider failure", async () => {
  const provider = {
    detect: () => true,
    execute: async () => ({
      pid: "fake",
      cancel: () => {},
      result: Promise.reject(new Error("crash"))
    })
  };
  const reconciler = new IntentReconciler({ provider });
  const result = await reconciler.reconcile({ objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [] }, [], {});
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test("IntentReconciler: returns no-op when provider not detected", async () => {
  const reconciler = new IntentReconciler({ provider: { detect: () => false } });
  const result = await reconciler.reconcile({ objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [] }, [], {});
  assert.equal(result.success, false);
});

test("IntentReconciler: tracks aiCalls", async () => {
  const reconciler = new IntentReconciler({ provider: makeFakeProvider({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null }) });
  await reconciler.reconcile({ objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [] }, [], {});
  assert.equal(reconciler.aiCalls, 1);
});
