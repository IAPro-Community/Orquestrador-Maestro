"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSkillContract } = require("../contract-v2");
const { validateSkillContracts } = require("../contract-validator");

function validContract(overrides = {}) {
  return createSkillContract({
    id: "skill-example",
    version: "1.0.0",
    origin: "maestro-core",
    maturity: "stable",
    description: "Example",
    category: "developer",
    risk: "low",
    capabilities: [],
    routing: {
      useWhen: ["example"],
      doNotUseWhen: []
    },
    context: {
      required: [],
      useful: [],
      avoid: []
    },
    outputs: [],
    verification: {
      level: "light",
      requirements: []
    },
    costProfile: {
      context: "minimal"
    },
    compatibility: {
      legacyProjected: false
    },
    ...overrides
  });
}

function record(identity, contract) {
  return { identity, id: contract.id, contract };
}

test("validator rejects duplicate effective skill ids", () => {
  const contract = validContract({
    id: "skill-git-workflow",
    description: "Git",
    routing: {
      useWhen: ["git commit"],
      doNotUseWhen: []
    }
  });

  const result = validateSkillContracts([
    record("maestro/skill-git-workflow", contract),
    record("project/skill-git-workflow", contract)
  ]);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_SKILL_ID"));
});

test("validator surfaces missing positive routing and unknown verification on projected contracts", () => {
  const contract = createSkillContract({
    id: "skill-example",
    version: "legacy",
    origin: "maestro-core",
    maturity: "stable",
    description: "Example",
    category: "developer",
    risk: "low",
    capabilities: [],
    routing: {
      useWhen: [],
      doNotUseWhen: []
    },
    context: {
      required: [],
      useful: [],
      avoid: []
    },
    outputs: [],
    verification: {
      level: "unknown",
      requirements: []
    },
    costProfile: {
      context: "unknown"
    },
    compatibility: {
      legacyProjected: true
    }
  });

  const result = validateSkillContracts([record("maestro/skill-example", contract)]);

  assert.deepEqual(result.issues.map((issue) => issue.code).sort(), [
    "MISSING_POSITIVE_ROUTING",
    "MISSING_VERIFICATION_CONTRACT"
  ]);
});

test("validator rejects duplicate ids even when identity metadata is absent", () => {
  const contract = validContract({ id: "skill-duplicate" });
  const result = validateSkillContracts([
    { id: contract.id, contract },
    { id: contract.id, contract }
  ]);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_SKILL_ID"));
});
