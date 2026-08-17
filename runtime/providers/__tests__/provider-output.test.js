"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { extractAssistantText } = require("../provider-output");

test("passes through a single JSON object unchanged", () => {
  const input = JSON.stringify({ addRequirements: ["r1"], detectedUnknowns: [] });
  assert.equal(extractAssistantText(input), input);
});

test("concatenates text parts from an NDJSON event stream", () => {
  const stream = [
    JSON.stringify({ type: "step_start", part: { type: "step-start" } }),
    JSON.stringify({ type: "text", part: { type: "text", text: "first" } }),
    JSON.stringify({ type: "text", part: { type: "text", text: "\n```json\n{\"x\":1}\n```" } }),
    JSON.stringify({ type: "step_finish", part: { type: "step-finish" } })
  ].join("\n");
  const out = extractAssistantText(stream);
  assert.ok(out.includes("first"));
  assert.ok(out.includes("x"));
  assert.ok(!out.includes("step_start"));
});

test("surfaces a transport error line verbatim instead of text parts", () => {
  const errorLine = JSON.stringify({ type: "error", error: { name: "UnknownError", data: {} } });
  const stream = errorLine + "\n" + JSON.stringify({ type: "text", part: { type: "text", text: "junk" } });
  assert.equal(extractAssistantText(stream), errorLine);
});

test("single-line transport error is passed through for downstream rejection", () => {
  const errorLine = JSON.stringify({ type: "error", error: { name: "UnknownError", data: {} } });
  assert.equal(extractAssistantText(errorLine), errorLine);
});

test("returns the raw scalar/empty output untouched", () => {
  assert.equal(extractAssistantText(""), "");
  assert.equal(extractAssistantText(undefined), undefined);
});