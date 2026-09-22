"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { compactContext } = require("../context-compactor");

test("execution-selected skills survive compaction for normal tasks", () => {
  const skills = [{ identity: "maestro/testing", path: "/skills/testing" }];
  const result = compactContext(
    { description: "Run tests", metadata: { semanticTask: { complexity: "medium" } } },
    { files: ["src/a.js"], skills }
  );
  assert.deepEqual(result.skills, skills);
  assert.deepEqual(result.files, ["src/a.js"]);
});

test("simple tasks drop file context but never explicit resolved skills", () => {
  const skills = [{ identity: "maestro/security", path: "/skills/security" }];
  const result = compactContext(
    { description: "Check auth", metadata: { semanticTask: { complexity: "simple" } } },
    { files: ["src/auth.js"], skills }
  );
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.skills, skills);
});

test("legacy task.skills remains a fallback when execution context omits skills", () => {
  const legacy = [{ identity: "project/legacy", path: "/legacy" }];
  const result = compactContext({ description: "Legacy", skills: legacy }, {});
  assert.deepEqual(result.skills, legacy);
});
