"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DeterministicFallbackPlanner } = require("../runtime/planner/deterministic-fallback-planner");
const { GraphValidator } = require("../runtime/planner/graph-validator");

test("documentation-only mission produces doc/guide tasks and no API/persistence", () => {
  const missionBrief = {
    objective: "Write developer setup documentation",
    requirements: ["Document prerequisites", "Document install steps"]
  };
  const context = { items: [] };

  const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: context });
  assert.equal(proposal.planningMode, "deterministic-fallback");
  assert.ok(proposal.tasks.every((t) => !t.requiredCapabilities.includes("database")));
  assert.ok(proposal.tasks.every((t) => !t.requiredCapabilities.includes("backend")));
  assert.ok(proposal.tasks.some((t) => t.requiredCapabilities.includes("documentation")));
  const validated = GraphValidator.validate(proposal);
  assert.equal(validated.valid, true);
});

test("frontend-only mission produces UI tasks without persistence/backend API", () => {
  const missionBrief = {
    objective: "Build landing page hero section",
    requirements: ["Create responsive banner", "Add CTA button"]
  };
  const context = {
    items: [
      { key: "frontend.framework", value: "react", kind: "FACT" }
    ]
  };
  const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: context });
  assert.ok(proposal.tasks.every((t) => !t.requiredCapabilities.includes("database")));
  assert.ok(proposal.tasks.some((t) => t.requiredCapabilities.includes("frontend")));
  const validated = GraphValidator.validate(proposal, { taskRelevantContext: context });
  assert.equal(validated.valid, true);
});

test("test-only mission produces test tasks without domain/persistence/API invented", () => {
  const missionBrief = {
    objective: "Add unit tests for existing utility functions",
    requirements: ["Cover string helpers", "Cover date parser"]
  };
  const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: { items: [] } });
  assert.ok(proposal.tasks.every((t) => t.requiredCapabilities.includes("testing") || t.requiredCapabilities.includes("architecture")));
  assert.ok(proposal.tasks.every((t) => !t.title.toLowerCase().includes("implement persistence")));
  const validated = GraphValidator.validate(proposal);
  assert.equal(validated.valid, true);
});

test("backend-only CRUD produces domain, persistence, API tasks without UI", () => {
  const missionBrief = {
    objective: "Create product CRUD",
    requirements: ["Create product", "List products"]
  };
  const context = {
    items: [
      { key: "project.frontend", value: null, kind: "FACT" },
      { key: "backend.framework", value: "Node.js", kind: "FACT" },
      { key: "database.type", value: "postgresql", kind: "FACT" }
    ]
  };

  const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: context });
  assert.ok(proposal.tasks.every((t) => !t.requiredCapabilities.includes("frontend")));
  assert.ok(proposal.tasks.some((t) => t.title.toLowerCase().includes("persistence")));
  assert.ok(proposal.tasks.some((t) => t.title.toLowerCase().includes("api")));
  const validated = GraphValidator.validate(proposal, { taskRelevantContext: context });
  assert.equal(validated.valid, true);
});

test("dangerous operations derive high/critical risk", () => {
  const missionBrief = {
    objective: "Drop legacy database tables and purge customer records",
    requirements: ["Drop customer_archive table"]
  };
  const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: { items: [] } });
  assert.ok(proposal.tasks.some((t) => t.risk === "high" || t.risk === "critical"));
  const validated = GraphValidator.validate(proposal);
  assert.equal(validated.valid, true);
});

test("insufficient mission information generates PlanningBlocker", () => {
  const missionBrief = {
    objective: "   ",
    requirements: []
  };
  assert.throws(
    () => DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: { items: [] } }),
    /INSUFFICIENT_MISSION_BRIEF/
  );
  assert.throws(
    () => DeterministicFallbackPlanner.plan({ missionBrief: null, taskRelevantContext: { items: [] } }),
    /INSUFFICIENT_MISSION_BRIEF/
  );
  assert.throws(
    () => DeterministicFallbackPlanner.plan({}),
    /INSUFFICIENT_MISSION_BRIEF/
  );
});

test("fallback plan has planningMode: deterministic-fallback and passes GraphValidator.validate()", () => {
  const missionBrief = {
    objective: "Implement authentication service",
    requirements: ["Login with email/password", "Issue JWT tokens"]
  };
  const proposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext: { items: [] } });
  assert.equal(proposal.planningMode, "deterministic-fallback");
  assert.ok(proposal.warnings.some((w) => w.code === "DETERMINISTIC_FALLBACK_USED"));
  const validated = GraphValidator.validate(proposal);
  assert.equal(validated.valid, true);
  assert.ok(validated.normalizedProposal);
  assert.equal(validated.normalizedProposal.planningMode, "deterministic-fallback");
});
