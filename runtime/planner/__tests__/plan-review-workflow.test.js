"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { PlanReviewWorkflow } = require("../plan-review-workflow");

test("a failed recompilation cannot leave an older revision pending for approval", async () => {
  const actions = ["recompilar", "editar", "recompilar", "aprovar"];
  const approvals = [];
  let compiles = 0;
  const prompts = {
    select: async () => actions.shift(),
    confirm: async () => true,
    isCancel: () => false,
    cancel() {},
    note() {},
    log: { info() {}, error() {}, warning() {}, success() {} }
  };
  const revisionService = {
    store: { readPlanArtifact: async () => ({ exists: true, content: "plan" }) },
    compileRevision: async () => {
      compiles += 1;
      return compiles === 1
        ? { changed: true, valid: true, tasks: [{}], revision: { revisionId: "graph:r2" }, revisedProposal: { tasks: [{ id: "new" }] } }
        : { changed: true, valid: false, tasks: [], errors: ["invalid plan"] };
    },
    openForReview: async () => ({ launched: true }),
    approveRevision: async (_missionId, _graphId, _decision, metadata) => { approvals.push(metadata); return { approvalType: "HUMAN_REVIEW" }; }
  };
  const workflow = new PlanReviewWorkflow({ revisionService, prompts });
  const result = await workflow.conductReview("mission-1", { id: "graph" });

  assert.equal(result.approved, true);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].revision, undefined);
  assert.equal(approvals[0].revisedProposal, undefined);
});
