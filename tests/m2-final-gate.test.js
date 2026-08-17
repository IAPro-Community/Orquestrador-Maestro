"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { AiInterviewer } = require("../runtime/planner/ai-interviewer");
const { StructuredOutputError } = require("../runtime/planner/proposal-parser");

test("M2 Final Gate: --auto with parser failure throws and preserves spec", async () => {
  let callCount = 0;

  const mockApp = {
    providers: {
      get: (id) => ({
        detect: async () => ({ installed: true }),
        execute: async () => {
          callCount++;
          return {
            providerId: "opencode",
            pid: 1,
            result: Promise.resolve({
              providerId: "opencode",
              pid: 1,
              stdout: "invalid json response",
              stderr: "",
              exitCode: 0,
              signal: null,
              cancelled: false,
              timedOut: false
            }),
            cancel() {}
          };
        }
      })
    }
  };

  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: {},
    application: mockApp,
    intent: "crud",
    aiProvider: "opencode"
  });

  try {
    await interviewer.runBatch();
    assert.fail("Should have thrown");
  } catch (err) {
    assert.ok(err instanceof StructuredOutputError);
    assert.ok(callCount >= 3, "Should have retried at least 3 times");

    // Spec is preserved, but evaluateReadiness should say false due to incomplete dimensions
    const spec = interviewer.intentSpec;
    assert.strictEqual(spec.objective, "crud"); // Intact
    assert.strictEqual(spec.unknowns.length, 0); // Intact
  }
});

test("M2 Final Gate: --auto with provider crash throws immediately", async () => {
  const mockApp = {
    providers: {
      get: (id) => ({
        detect: async () => ({ installed: true }),
        execute: async () => {
          throw new Error("Provider crashed!");
        }
      })
    }
  };

  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: {},
    application: mockApp,
    intent: "crud",
    aiProvider: "opencode"
  });

  try {
    await interviewer.runBatch();
    assert.fail("Should have thrown");
  } catch (err) {
    assert.strictEqual(err.message, "Provider crashed!");
  }
});

test("M2 Final Gate: --auto passes if sufficient dimensions and no blockers", async () => {
  const mockApp = {
    providers: {
      get: (id) => ({
        detect: async () => ({ installed: true }),
        execute: async () => ({
          providerId: "opencode",
          pid: 1,
          result: Promise.resolve({
            providerId: "opencode",
            pid: 1,
            stdout: JSON.stringify({
              objective: "CRUD completo",
              addRequirements: ["Req 1"],
              addConstraints: ["Escopo restrito a CRUD"],
              questions: [],
              detectedUnknowns: [],
              requirementsToAdd: [],
              constraintsToAdd: []
            }),
            stderr: "",
            exitCode: 0,
            signal: null,
            cancelled: false,
            timedOut: false
          }),
          cancel() {}
        })
      })
    }
  };

  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: {},
    application: mockApp,
    intent: "crud",
    aiProvider: "opencode"
  });

  const brief = await interviewer.runBatch();
  assert.strictEqual(brief.ambiguity, 0);
  assert.strictEqual(brief.answers.intent, "CRUD completo");
});

// Phase 11: Legacy fallback characterization — provider unavailable → legacy refine, auto+insufficient throws
test("M2 Final Gate: provider not installed → legacy refine, execute never called, auto aborts on insufficient spec", async () => {
  let executeCalls = 0;
  const mockApp = {
    providers: {
      get: (id) => ({
        detect: async () => ({ installed: false }),
        execute: async () => {
          executeCalls++;
          throw new Error("must not be called");
        }
      })
    }
  };

  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: {},
    application: mockApp,
    intent: "crud",
    aiProvider: "opencode"
  });

  try {
    await interviewer.runBatch();
    assert.fail("Should have thrown on insufficient dimensions");
  } catch (err) {
    assert.match(err.message, /Falta informacao bloqueante/);
    assert.equal(executeCalls, 0, "no provider call when not installed");
  }
});

// Phase 11: Legacy-schema provider is completed by batch itself — the reconciler understands
// the legacy `updates.objective` wrapper, so NO legacy refine is needed (backward compatible).
test("M2 Final Gate: batch completes legacy-schema provider — 4 AI calls, no legacy refine", async () => {
  let callCount = 0;
  const mockApp = {
    providers: {
      get: (id) => ({
        detect: async () => ({ installed: true }),
        execute: async () => {
          callCount++;
          const body =
            callCount <= 3
              ? { objective: null, addRequirements: [], addConstraints: [], detectedUnknowns: [], questions: [] }
              : {
                  updates: { objective: "CRUD completo" },
                  addRequirements: ["Req 1"],
                  addConstraints: ["Escopo CRUD"],
                  detectedUnknowns: []
                };
          return {
            providerId: "opencode",
            pid: 1,
            result: Promise.resolve({
              providerId: "opencode",
              pid: 1,
              stdout: JSON.stringify(body),
              stderr: "",
              exitCode: 0,
              signal: null,
              cancelled: false,
              timedOut: false
            }),
            cancel() {}
          };
        }
      })
    }
  };

  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: {},
    application: mockApp,
    intent: "crud",
    aiProvider: "opencode"
  });

  const brief = await interviewer.runBatch();
  assert.strictEqual(brief.ambiguity, 0);
  assert.strictEqual(brief.answers.intent, "CRUD completo");
  assert.equal(callCount, 4, "3 discovery retries + 1 reconciliation; legacy refine must NOT be called");
});
