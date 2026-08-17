"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { IntentRefiner } = require("../runtime/planner/intent-refiner");
const { SemanticPlanner } = require("../runtime/planner/semantic-planner");
const { createIntentSpec } = require("../runtime/planner/intent-spec");

/**
 * Real provider contract fake, matching process-execution/startProcess exactly:
 *
 *   provider.execute(opts) => Promise<Handle>
 *   Handle = { providerId, pid, result: Promise<ExecutionResult>, cancel() }
 *   ExecutionResult = { providerId, pid, command, args, stdout, stderr, cancelled,
 *                       timedOut, durationMs, exitCode, signal, error }
 *
 * The handle intentionally does NOT expose stdout at the top level,
 * so legacy consumers reading result.stdout on the handle see undefined.
 */
function handleContractProvider({ output }) {
  const executeCalls = [];
  return {
    executeCalls,
    detect: async () => ({ installed: true, executable: "opencode" }),
    execute: async (opts) => {
      executeCalls.push({ ...opts });
      const stdout = typeof output === "function" ? output(executeCalls.length) : output;
      const result = Promise.resolve({
        providerId: "opencode",
        pid: 1234,
        command: "opencode",
        args: ["run", "--format", "json"],
        stdout,
        stderr: "",
        cancelled: false,
        timedOut: false,
        durationMs: 10,
        exitCode: 0,
        signal: null,
        error: undefined
      });
      return {
        providerId: "opencode",
        pid: 1234,
        result,
        cancel() {}
      };
    }
  };
}

function handleApp(provider) {
  return {
    providers: {
      get: () => provider
    }
  };
}

test("P1 IntentRefiner consumes handle.result rather than the raw handle", async () => {
  const refinementJson = JSON.stringify({
    updates: { objective: "CRUD de produtos com Express e MongoDB" },
    addRequirements: ["listar produtos", "criar produto"],
    addConstraints: ["usar mongodb"],
    detectedUnknowns: [],
    question: null,
    recommendation: null
  });

  const provider = handleContractProvider({ output: refinementJson });
  const refiner = new IntentRefiner({
    aiProvider: "opencode",
    application: handleApp(provider),
    taskRelevantContext: { items: [] }
  });

  const spec = createIntentSpec("quero criar um crud de produtos", { status: "REFINING" });
  const refined = await refiner.refine(spec);

  assert.equal(refined.objective, "CRUD de produtos com Express e MongoDB");
  assert.ok(refined.requirements.includes("criar produto"));
  assert.ok(refined.requirements.includes("listar produtos"));
  assert.ok(refined.constraints.includes("usar mongodb"));
});

test("P1 SemanticPlanner consumes handle.result and produces a local-ai plan", async () => {
  const validJson = JSON.stringify({
    tasks: [
      { id: "t1", title: "Analyze Codebase", objective: "Read patterns", type: "analyze", dependsOn: [] },
      { id: "t2", title: "Build Repository", objective: "Create data layer", type: "persistence", dependsOn: ["t1"] }
    ],
    assumptions: [],
    rationale: "Clean separation"
  });

  const provider = handleContractProvider({ output: validJson });
  const planner = new SemanticPlanner({
    application: handleApp(provider),
    plannerTarget: { providerId: "opencode", model: "default", local: true }
  });

  const res = await planner.plan({
    missionBrief: { id: "brief-contract", objective: "CRUD de produtos", requirements: [] },
    missionId: "brief-contract",
    taskRelevantContext: { items: [] },
    allowFallback: false
  });

  assert.equal(res.planningMode, "local-ai");
  assert.equal(res.taskGraph.missionId, "brief-contract");
  assert.equal(res.taskGraph.tasks.length, 2);
  assert.equal(res.taskGraph.tasks[0].id, "t1");
  assert.equal(res.taskGraph.tasks[1].id, "t2");
});