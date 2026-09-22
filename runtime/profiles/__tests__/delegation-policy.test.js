"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { deriveDelegationContract } = require("..");

test("standard and deep execution stay solo by default", () => {
  assert.equal(deriveDelegationContract({ description: "fix a local bug", policyId: "standard" }).allowSubagents, false);
  assert.equal(deriveDelegationContract({ description: "analyze a difficult architecture problem", policyId: "deep" }).allowSubagents, false);
});

test("multiagent is an explicit execution policy", () => {
  const contract = deriveDelegationContract({
    description: "implement independent backend and frontend lanes",
    policyId: "multiagent"
  });
  assert.equal(contract.allowSubagents, true);
  assert.equal(contract.maxSubagents, 4);
});

test("routine git operations remain solo even under multiagent policy", () => {
  for (const description of [
    "git commit -m fix",
    "faça um commit dessas alterações",
    "git status",
    "commit these changes",
    "faça o commit",
    "faz o commit",
    "commita essas alterações",
    "commitar as mudanças",
    "suba o push"
  ]) {
    const contract = deriveDelegationContract({ description, policyId: "multiagent" });
    assert.equal(contract.allowSubagents, false, description);
    assert.equal(contract.reason, "routine-git-operation", description);
  }
});
