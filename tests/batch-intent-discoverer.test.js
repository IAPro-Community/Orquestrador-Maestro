"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { BatchIntentDiscoverer } = require("../runtime/planner/batch-intent-discoverer.js");
const { validateQuestionSet } = require("../runtime/planner/question-set-validator.js");

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

function makeFakeProviderRaw(text) {
  return {
    detect: () => true,
    execute: async () => ({
      pid: "fake",
      cancel: () => {},
      result: Promise.resolve({
        stdout: text,
        stderr: "",
        exitCode: 0
      })
    })
  };
}

test("BatchIntentDiscoverer: builds discovery prompt with context", async () => {
  let capturedPrompt = "";
  const provider = {
    detect: () => true,
    execute: async ({ prompt }) => {
      capturedPrompt = prompt;
      return {
        pid: "fake",
        cancel: () => {},
        result: Promise.resolve({
          stdout: JSON.stringify({ questions: [] }),
          stderr: "",
          exitCode: 0
        })
      };
    }
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  await discoverer.discover("quero crud", { requirements: [], constraints: [] }, [], {});
  assert.ok(capturedPrompt.includes("quero crud"));
  assert.ok(capturedPrompt.includes("questions"));
});

test("BatchIntentDiscoverer: parses questions from AI response", async () => {
  const response = {
    questions: [
      {
        id: "q1",
        unknownId: "u1",
        dimension: "scope",
        group: "scope",
        text: "Qual o escopo?",
        answerType: "single-choice",
        options: [
          { value: "backend", label: "Backend" },
          { value: "fullstack", label: "Fullstack" }
        ],
        blocking: true,
        priority: 1,
        reason: "Define camadas"
      }
    ]
  };
  const discoverer = new BatchIntentDiscoverer({ provider: makeFakeProvider(response) });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].id, "q1");
  assert.equal(result.questions[0].dimension, "scope");
});

test("BatchIntentDiscoverer: validates question set", async () => {
  const response = {
    questions: [
      { id: "q1", dimension: "scope", text: "Escopo?", answerType: "boolean", blocking: true },
      { id: "q1", dimension: "scope2", text: "Escopo2?", answerType: "boolean", blocking: true }
    ]
  };
  const discoverer = new BatchIntentDiscoverer({ provider: makeFakeProvider(response) });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result.valid, false);
  assert.ok(result.validationErrors.some((e) => e.includes("q1")));
});

test("BatchIntentDiscoverer: returns empty questions on provider failure", async () => {
  const provider = {
    detect: () => true,
    execute: async () => ({
      pid: "fake",
      cancel: () => {},
      result: Promise.reject(new Error("provider crash"))
    })
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result.questions.length, 0);
  assert.ok(result.error);
});

test("BatchIntentDiscoverer: returns empty when provider not detected", async () => {
  const provider = { detect: () => false };
  const discoverer = new BatchIntentDiscoverer({ provider });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result.questions.length, 0);
});

test("BatchIntentDiscoverer: includes activation conditions", async () => {
  const response = {
    questions: [
      { id: "q1", dimension: "scope", text: "Escopo?", answerType: "single-choice",
        options: [{ value: "backend", label: "Backend" }, { value: "fullstack", label: "Fullstack" }],
        blocking: true },
      { id: "q2", dimension: "fw", text: "Framework?", answerType: "boolean",
        activation: { all: [{ questionId: "q1", operator: "in", values: ["fullstack"] }] },
        blocking: true }
    ]
  };
  const discoverer = new BatchIntentDiscoverer({ provider: makeFakeProvider(response) });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result.questions.length, 2);
  assert.ok(result.questions[1].activation);
});

test("BatchIntentDiscoverer: questionCount and discoveryRound tracking", async () => {
  const response = {
    questions: [
      { id: "q1", dimension: "scope", text: "Escopo?", answerType: "boolean", blocking: true },
      { id: "q2", dimension: "data", text: "Dados?", answerType: "boolean", blocking: true }
    ]
  };
  const discoverer = new BatchIntentDiscoverer({ provider: makeFakeProvider(response) });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result.questionCount, 2);
  assert.equal(result.discoveryRound, 1);
});

test("BatchIntentDiscoverer: increments discoveryRound", async () => {
  const response = {
    questions: [{ id: "q1", dimension: "scope", text: "Escopo?", answerType: "boolean", blocking: true }]
  };
  const discoverer = new BatchIntentDiscoverer({ provider: makeFakeProvider(response) });
  await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  const result2 = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result2.discoveryRound, 2);
});

test("F1 RED: invalid question set (operator: undefined) triggers structured retry, not terminal failure", async () => {
  let callCount = 0;
  const invalidResponse = {
    questions: [
      { id: "q1", dimension: "scope", text: "Escopo?", answerType: "boolean", blocking: true },
      {
        id: "q2",
        dimension: "fw",
        text: "Framework?",
        answerType: "boolean",
        blocking: true,
        activation: { all: [{ questionId: "q1", values: ["fullstack"] }] }
      }
    ]
  };
  const validResponse = {
    questions: [{ id: "q1", dimension: "scope", text: "Escopo?", answerType: "boolean", blocking: true }]
  };
  const provider = {
    detect: () => true,
    execute: async () => {
      callCount++;
      return {
        pid: "fake",
        cancel: () => {},
        result: Promise.resolve({
          stdout: JSON.stringify(callCount === 1 ? invalidResponse : validResponse),
          stderr: "",
          exitCode: 0
        })
      };
    }
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(callCount, 2, "first invalid structured output must retry");
  assert.equal(result.valid, true);
  assert.ok(result.questions.length > 0, "retry must yield a usable question set");
  assert.equal(result.structuredRetries, 1);
});

test("F1 RED: exhaustion of structured retries returns explicit failure, never silent empty-as-success", async () => {
  let callCount = 0;
  const alwaysInvalid = {
    questions: [
      { id: "q1", dimension: "scope", text: "Escopo?", answerType: "boolean", blocking: true },
      {
        id: "q2",
        dimension: "fw",
        text: "Framework?",
        answerType: "boolean",
        blocking: true,
        activation: { all: [{ questionId: "q1", values: ["fullstack"] }] }
      }
    ]
  };
  const provider = {
    detect: () => true,
    execute: async () => {
      callCount++;
      return {
        pid: "fake",
        cancel: () => {},
        result: Promise.resolve({
          stdout: JSON.stringify(alwaysInvalid),
          stderr: "",
          exitCode: 0
        })
      };
    }
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(callCount, 3, "must respect MAX_RETRIES without infinite loop");
  assert.equal(result.valid, false);
  assert.equal(result.questions.length, 0, "invalid exhausted set must not leak questions");
  assert.ok(result.validationErrors.some((e) => e.includes("unsupported operator")), "must expose explicit validation failure");
});

test("F1 RED: provider execution failure is NOT a structured retry", async () => {
  let callCount = 0;
  const provider = {
    detect: () => true,
    execute: async () => {
      callCount++;
      return {
        pid: "fake",
        cancel: () => {},
        result: Promise.reject(new Error("connection refused"))
      };
    }
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result.valid, false);
  assert.equal(result.questions.length, 0);
  assert.ok(result.error instanceof Error, "provider failure must surface as provider error, not schema error");
  assert.ok(!result.validationErrors.some((e) => e.includes("unsupported operator")), "must not be misclassified");
  assert.equal(result.structuredRetries, 0);
});

test("F1 RED: real failed payload shape (G scenario) retries into a valid set", async () => {
  let callCount = 0;
  const gShape = {
    questions: [
      { id: "q2", dimension: "scope", text: "Qual escopo?", answerType: "single-choice", options: [{ value: "fullstack", label: "Fullstack" }], blocking: true },
      { id: "q5", dimension: "db", text: "Qual banco?", answerType: "single-choice", options: [{ value: "postgres", label: "Postgres" }], blocking: true, activation: { all: [{ questionId: "q2", values: ["fullstack"] }] } },
      { id: "q6", dimension: "auth", text: "Requer auth?", answerType: "boolean", blocking: false, activation: { all: [{ questionId: "q5", values: ["postgres"] }] } },
      { id: "q7", dimension: "deploy", text: "Onde deploy?", answerType: "boolean", blocking: false, activation: { all: [{ questionId: "q6", values: [true] }] } },
      { id: "q8", dimension: "cache", text: "Usa cache?", answerType: "boolean", blocking: false, activation: { all: [{ questionId: "q7", values: [true] }] } }
    ]
  };
  const valid = {
    questions: [{ id: "q1", dimension: "scope", text: "Escopo?", answerType: "boolean", blocking: true }]
  };
  const provider = {
    detect: () => true,
    execute: async () => {
      callCount++;
      return {
        pid: "fake",
        cancel: () => {},
        result: Promise.resolve({
          stdout: JSON.stringify(callCount === 1 ? gShape : valid),
          stderr: "",
          exitCode: 0
        })
      };
    }
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(callCount, 2);
  assert.equal(result.valid, true);
});

test("BatchIntentDiscoverer: retry on parse failure", async () => {
  let callCount = 0;
  const provider = {
    detect: () => true,
    execute: async () => {
      callCount++;
      if (callCount === 1) {
        return { pid: "fake", cancel: () => {}, result: Promise.resolve({ stdout: "not json", stderr: "", exitCode: 0 }) };
      }
      return { pid: "fake", cancel: () => {}, result: Promise.resolve({
        stdout: JSON.stringify({ questions: [{ id: "q1", dimension: "scope", text: "x", answerType: "boolean", blocking: true }] }),
        stderr: "", exitCode: 0
      })};
    }
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(result.questions.length, 1);
  assert.equal(callCount, 2);
});

test("REGRESSION: opencode NDJSON stream — must not retry 3x and lose questions", async () => {
  const ndjson = [
    { type: "step_start", timestamp: 1, sessionID: "s1", part: { type: "step-start" } },
    {
      type: "text",
      timestamp: 2,
      sessionID: "s1",
      part: {
        type: "text",
        text: JSON.stringify({
          questions: [
            { id: "q1", unknownId: "u1", dimension: "scope", text: "Escopo?", answerType: "single-choice", options: [{ value: "fullstack", label: "Fullstack" }], blocking: true },
            { id: "q2", unknownId: "u2", dimension: "data", text: "Dados?", answerType: "text", blocking: true }
          ],
          detectedUnknowns: [
            { id: "u1", dimension: "scope", description: "scope", status: "OPEN", blocking: true },
            { id: "u2", dimension: "data", description: "data", status: "OPEN", blocking: true }
          ]
        })
      }
    },
    { type: "step_finish", timestamp: 3, sessionID: "s1", part: { type: "step-finish", reason: "stop" } }
  ].map((line) => JSON.stringify(line)).join("\n");

  let callCount = 0;
  const provider = {
    detect: () => true,
    execute: async () => {
      callCount++;
      return { pid: "fake", cancel: () => {}, result: Promise.resolve({ stdout: ndjson, stderr: "", exitCode: 0 }) };
    }
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  const result = await discoverer.discover("crud", { requirements: [], constraints: [] }, [], {});
  assert.equal(callCount, 1, "NDJSON must be parsed on first attempt — no retry storm");
  assert.equal(result.questions.length, 2, "questions must be extracted from NDJSON text event");
  assert.equal(result.valid, true);
});
