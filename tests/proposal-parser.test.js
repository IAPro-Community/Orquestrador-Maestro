"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { parseRefinementProposal, StructuredOutputError } = require("../runtime/planner/proposal-parser");

test("Parses valid RefinementProposal from JSON", () => {
  const input = JSON.stringify({
    updates: { objective: "New objective" },
    addRequirements: ["Req 1"],
    addConstraints: [],
    detectedUnknowns: [],
    question: null,
    recommendation: null
  });

  const parsed = parseRefinementProposal(input);
  assert.strictEqual(parsed.updates.objective, "New objective");
  assert.strictEqual(parsed.addRequirements[0], "Req 1");
});

test("Parses valid RefinementProposal from Markdown block", () => {
  const input = `Here is my proposal:
\`\`\`json
{
  "addRequirements": ["Req 2"]
}
\`\`\`
Hope you like it!`;

  const parsed = parseRefinementProposal(input);
  assert.strictEqual(parsed.addRequirements[0], "Req 2");
});

test("Throws StructuredOutputError for invalid JSON", () => {
  const input = "This is just text, not JSON";
  assert.throws(() => {
    parseRefinementProposal(input);
  }, StructuredOutputError);
});

test("Throws StructuredOutputError for invalid schema", () => {
  const input = JSON.stringify({
    unknownKey: "value", // unexpected key could be ignored, but let's test a bad structure
    addRequirements: "Not an array" // invalid type
  });

  assert.throws(() => {
    parseRefinementProposal(input);
  }, StructuredOutputError);
});

test("Provider crash (empty or null string) fails clean", () => {
  assert.throws(() => {
    parseRefinementProposal("");
  }, StructuredOutputError);

  assert.throws(() => {
    parseRefinementProposal(null);
  }, StructuredOutputError);
});

test("Rejects provider transport error JSON instead of accepting an empty proposal", () => {
  const input = JSON.stringify({
    type: "error",
    timestamp: 1786744857116,
    sessionID: "ses_test",
    error: { name: "UnknownError", data: { message: "Unexpected server error" } }
  });

  assert.throws(() => {
    parseRefinementProposal(input);
  }, StructuredOutputError);
});

test("Parses a RefinementProposal embedded in an NDJSON event stream", () => {
  const input = [
    JSON.stringify({ type: "step_start", part: { type: "step-start" } }),
    JSON.stringify({ type: "text", part: { type: "text", text: "```json\n" + JSON.stringify({
      addRequirements: ["requisito do stream"],
      addConstraints: ["restricao do stream"],
      detectedUnknowns: []
    }) + "\n```" } }),
    JSON.stringify({ type: "step_finish", part: { type: "step-finish" } })
  ].join("\n");

  const parsed = parseRefinementProposal(input);
  assert.strictEqual(parsed.addRequirements[0], "requisito do stream");
  assert.strictEqual(parsed.addConstraints[0], "restricao do stream");
});
