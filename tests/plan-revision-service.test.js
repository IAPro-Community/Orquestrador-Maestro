"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PlanRevisionService } = require("../runtime/planner/plan-revision-service");

function makeTask(id, title, objective, dependsOn = [], opts = {}) {
  return {
    id,
    title,
    objective,
    type: opts.type || "other",
    dependsOn,
    acceptanceCriteria: opts.acceptanceCriteria || [],
    requiredSkills: [],
    requiredCapabilities: opts.requiredCapabilities || [],
    complexity: opts.complexity || "medium",
    risk: opts.risk || "low",
    sourceRequirements: [],
    planningReason: "",
    dependencyReasons: {}
  };
}

const sampleProposal = {
  planningMode: "local-ai",
  tasks: [
    makeTask("task-1", "Analyze schema", "Inspect DB schema"),
    makeTask("task-2", "Implement API", "Create endpoint", ["task-1"])
  ],
  assumptions: [],
  warnings: [],
  blockers: [],
  rationale: "Sequential plan"
};

function makeService(overrides = {}) {
  const store = {
    writePlanArtifact: async (missionId, content) => ({ written: true, path: `/tmp/${missionId}/PLAN.md`, missionId }),
    readPlanArtifact: async (missionId) => ({ exists: false, content: "", path: `/tmp/${missionId}/PLAN.md`, missionId }),
    planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`,
    ...overrides._store
  };
  return new PlanRevisionService({ store, ...overrides });
}

test("PlanRevisionService.createPlan writes PLAN.md via store", async () => {
  const written = [];
  const service = makeService({
    _store: {
      writePlanArtifact: async (missionId, content) => {
        written.push({ missionId, content });
        return { written: true, path: `/tmp/${missionId}/PLAN.md`, missionId };
      },
      readPlanArtifact: async () => ({ exists: false, content: "" }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`
    }
  });
  await service.createPlan("mission-1", sampleProposal);
  assert.equal(written.length, 1);
  assert.equal(written[0].missionId, "mission-1");
  assert.ok(written[0].content.includes("# Plan"));
});

test("PlanRevisionService.createPlan includes mission context in rendered plan", async () => {
  let capturedContent = "";
  const service = makeService({
    _store: {
      writePlanArtifact: async (missionId, content) => {
        capturedContent = content;
        return { written: true, path: `/tmp/${missionId}/PLAN.md`, missionId };
      },
      readPlanArtifact: async () => ({ exists: false, content: "" }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`
    }
  });
  const missionBrief = { id: "brief-1", objective: "Build API", requirements: [], constraints: [], relevantContext: "{}" };
  await service.createPlan("mission-1", sampleProposal, { missionBrief });
  assert.ok(capturedContent.includes("Build API"));
});

test("PlanRevisionService.openForReview opens editor with plan path", async () => {
  let openedPath = "";
  const editor = { launch: async (filePath) => { openedPath = filePath; return { success: true }; } };
  const service = makeService({ editor });
  const result = await service.openForReview("mission-1");
  assert.equal(openedPath, "/tmp/mission-1/PLAN.md");
  assert.equal(result.launched, true);
});

test("PlanRevisionService.compileRevision detects unchanged file", async () => {
  const { PlanArtifactRenderer: Renderer } = require("../runtime/planner/plan-artifact-renderer");
  const originalContent = Renderer.render(sampleProposal);
  const service = makeService({
    _store: {
      readPlanArtifact: async () => ({ exists: true, content: originalContent }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`
    }
  });
  const result = await service.compileRevision("mission-1", sampleProposal);
  assert.equal(result.changed, false);
  assert.equal(result.valid, true);
});

test("PlanRevisionService.compileRevision validates against original proposal", async () => {
  const { PlanArtifactRenderer: Renderer } = require("../runtime/planner/plan-artifact-renderer");
  const proposalWithTwoTasks = {
    ...sampleProposal,
    tasks: [...sampleProposal.tasks]
  };
  const originalContent = Renderer.render(proposalWithTwoTasks);
  const service = makeService({
    _store: {
      readPlanArtifact: async () => ({ exists: true, content: originalContent }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`
    }
  });
  const result = await service.compileRevision("mission-1", proposalWithTwoTasks);
  assert.equal(result.changed, false);
  assert.equal(result.valid, true);
  assert.ok(result.tasks.length === 0);
});

test("PlanRevisionService.compileRevision allows task removal (tracked by semantic diff)", async () => {
  const service = makeService({
    _store: {
      readPlanArtifact: async () => ({
        exists: true,
        content: `# Plan\n\n## Tasks\n\n### 01. Task A\n\n- **id**: task-1\n- **type**: other\n- **objective**: Test\n`
      }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`
    }
  });
  const result = await service.compileRevision("mission-1", sampleProposal);
  assert.equal(result.changed, true);
  assert.equal(result.valid, true);
  assert.equal(result.tasks.length, 1);
});

test("PlanRevisionService.compileRevision detects mission constraint contradiction", async () => {
  const service = makeService({
    _store: {
      readPlanArtifact: async () => ({
        exists: true,
        content: `# Plan\n\n## Tasks\n\n### 01. Use GraphQL\n\n- **id**: task-1\n- **type**: api\n- **objective**: Implement GraphQL endpoint\n`
      }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`
    }
  });
  const proposal = {
    ...sampleProposal,
    tasks: [makeTask("task-1", "Use GraphQL", "Implement GraphQL endpoint")]
  };
  const missionBrief = {
    id: "brief-1",
    objective: "Build REST API",
    requirements: [],
    constraints: ["No GraphQL allowed"],
    relevantContext: "{}"
  };
  const result = await service.compileRevision("mission-1", proposal, { missionBrief });
  assert.equal(result.changed, true);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("GraphQL") || e.includes("constraint")));
});

test("PlanRevisionService.approveRevision creates HUMAN_REVIEW approval", async () => {
  let savedApproval = null;
  const service = makeService({
    _store: {
      readPlanArtifact: async () => ({ exists: false, content: "" }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`,
      saveApproval: async (approval) => { savedApproval = approval; return approval; }
    }
  });
  const result = await service.approveRevision("mission-1", "task-graph-1", "approved");
  assert.equal(result.approvalType, "HUMAN_REVIEW");
  assert.equal(result.taskGraphId, "task-graph-1");
  assert.equal(result.userDecision, "approved");
  assert.ok(result.approvedAt);
  assert.ok(savedApproval);
});

test("PlanRevisionService.cancel returns cancelled status", async () => {
  const service = makeService();
  const result = await service.cancel("mission-1");
  assert.equal(result.cancelled, true);
});

test("PlanRevisionService.autoApprove uses USER_AUTO_POLICY", async () => {
  let savedApproval = null;
  const service = makeService({
    _store: {
      readPlanArtifact: async () => ({ exists: false, content: "" }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`,
      saveApproval: async (approval) => { savedApproval = approval; return approval; }
    }
  });
  const result = await service.autoApprove("mission-1", "task-graph-1", {
    validationResult: { valid: true, blockers: [] },
    planningMode: "local-ai"
  });
  assert.equal(result.approved, true);
  assert.equal(result.approvalType, "USER_AUTO_POLICY");
  assert.ok(savedApproval);
});

test("PlanRevisionService.autoApprove rejects when validation has blockers", async () => {
  const service = makeService();
  const result = await service.autoApprove("mission-1", "task-graph-1", {
    validationResult: { valid: false, blockers: ["Cycle detected"] },
    planningMode: "local-ai"
  });
  assert.equal(result.approved, false);
  assert.equal(result.approvalType, "REJECTED");
});

test("PlanRevisionService.approveRevision records approval event", async () => {
  const events = [];
  const service = makeService({
    _store: {
      readPlanArtifact: async () => ({ exists: false, content: "" }),
      planArtifactPath: (missionId) => `/tmp/${missionId}/PLAN.md`,
      saveApproval: async (a) => a,
      appendEvent: async (event) => { events.push(event); return event; }
    }
  });
  await service.approveRevision("mission-1", "task-graph-1", "approved");
  assert.ok(events.some((e) => e.type === "plan.approved"));
});
