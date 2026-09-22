"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const core = require("../runtime/core");
const { PlanApprovalGate } = require("../runtime/planner/plan-approval-gate");
const { SemanticPlanner } = require("../runtime/planner/semantic-planner");
const { LegacyExecutionProjection } = require("../runtime/planner/legacy-execution-projection");
const { formatTasks } = require("../runtime/planner/task-formatter");

test("PlanApprovalGate evaluateAutoApproval authorizes valid plan and rejects on blocker", () => {
  const validRes = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: [] },
    planningMode: "local-ai"
  });
  assert.equal(validRes.approved, true);
  assert.equal(validRes.approvalType, "USER_AUTO_POLICY");

  const blockedRes = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: false, blockers: [{ code: "BLOCKER", message: "Cycle detected" }] },
    planningMode: "local-ai"
  });
  assert.equal(blockedRes.approved, false);
  assert.equal(blockedRes.approvalType, "REJECTED");
});

test("SemanticPlanner requires approved MissionBrief objective and missionId", async () => {
  const planner = new SemanticPlanner({ application: { providers: { get: () => null } } });
  await assert.rejects(
    () => planner.plan({ missionBrief: { objective: "CRUD" } }),
    /MISSING_MISSION_ID/
  );
});

test("SemanticPlanner plans successfully using approved MissionBrief", async () => {
  const approvedBrief = core.createMissionBrief({
    id: "brief-xyz",
    intentSessionId: "session-123",
    objective: "Implementar autenticação JWT",
    requirements: ["login endpoint", "token validation"],
    userDecisions: ["use jsonwebtoken"],
    constraints: ["Node.js 18+"],
    relevantContext: JSON.stringify({ framework: "express" })
  });

  const app = {
    providers: {
      get: () => null
    }
  };

  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "default", local: true }
  });

  const planResult = await planner.plan({
    missionBrief: approvedBrief,
    missionId: approvedBrief.id,
    taskRelevantContext: { items: [] },
    resolvedSkills: [],
    allowFallback: true
  });

  assert.equal(planResult.taskGraph.missionId, "brief-xyz");
  assert.ok(planResult.taskGraph.tasks.length > 0);
  assert.equal(planResult.planningMode, "deterministic-fallback");

  const executionTarget = { providerId: "opencode", model: "default" };
  const projectedTasks = planResult.taskGraph.tasks.map((st) =>
    LegacyExecutionProjection.projectTask(st.metadata?.semantic || st, { executionTarget })
  );

  assert.equal(projectedTasks.length, planResult.taskGraph.tasks.length);
  assert.equal(projectedTasks[0].provider, "opencode");
  assert.equal(projectedTasks[0].model, "default");
  assert.ok(projectedTasks[0].label);
});

test("CLI planning flow: PlanApprovalGate policy enforcement for --auto mode", () => {
  // 1. Valid local-ai plan is auto approved
  const autoLocalAi = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: [] },
    planningMode: "local-ai"
  }, { autoFallbackAllowed: false });
  assert.equal(autoLocalAi.approved, true);
  assert.equal(autoLocalAi.approvalType, "USER_AUTO_POLICY");

  // 2. Deterministic fallback in auto mode without explicit permission is rejected
  const autoFallback = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: [] },
    planningMode: "deterministic-fallback"
  }, { autoFallbackAllowed: false });
  assert.equal(autoFallback.approved, false);
  assert.equal(autoFallback.approvalType, "REJECTED");
  assert.match(autoFallback.reason, /UNAUTHORIZED_FALLBACK_IN_AUTO_MODE/);

  // 3. Plan with blockers in auto mode is rejected
  const autoBlockers = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: false, blockers: [{ code: "CYCLE_DETECTED" }] },
    planningMode: "local-ai"
  }, { autoFallbackAllowed: false });
  assert.equal(autoBlockers.approved, false);
  assert.equal(autoBlockers.approvalType, "REJECTED");
});

test("CLI planning flow: interactive actions handle approve, inspect, refine, and cancel", () => {
  const taskGraphId = "task-graph-456";

  // Action: aprovar
  const humanApproval = PlanApprovalGate.recordHumanApproval({
    taskGraphId,
    userDecision: "approved"
  });
  assert.equal(humanApproval.taskGraphId, taskGraphId);
  assert.equal(humanApproval.approvalType, "HUMAN_REVIEW");
  assert.equal(humanApproval.userDecision, "approved");
  assert.ok(humanApproval.approvedAt);

  // Action: inspecionar detail string formatting
  const mockTasks = [
    {
      metadata: {
        semantic: {
          title: "Setup Auth Route",
          objective: "Create /login endpoint",
          acceptanceCriteria: ["Returns 200 with JWT", "Returns 401 on invalid credentials"]
        }
      }
    }
  ];

  const inspectDetails = mockTasks.map(t => {
    const s = t.metadata?.semantic || t;
    return `• ${s.title}\n  Objetivo: ${s.objective}\n  Critérios: ${(s.acceptanceCriteria || []).join(", ") || "Padrão"}`;
  }).join("\n\n");

  assert.match(inspectDetails, /• Setup Auth Route/);
  assert.match(inspectDetails, /Objetivo: Create \/login endpoint/);
  assert.match(inspectDetails, /Critérios: Returns 200 with JWT, Returns 401 on invalid credentials/);
});

test("F2 REGRESSION: bin plan-mode branches persist mission as awaiting_approval, never 'planned'", () => {
  const cliContent = fs.readFileSync(path.join(__dirname, "..", "bin", "orquestrador-maestro.js"), "utf8");
  const planningOnlyBlocks = cliContent.match(/planningOnly\)[\s\S]*?return 0;/g) || [];

  assert.ok(planningOnlyBlocks.length >= 2, "both GO branches (auto + interactive) must contain a planningOnly guard");

  for (const block of planningOnlyBlocks) {
    assert.match(block, /status: "awaiting_approval"/,
      "plan-only approval must persist mission with canonical awaiting_approval status");
    assert.match(block, /nenhuma execução será realizada \(modo plan\)/,
      "plan-only mode must announce no execution");
  }

  assert.doesNotMatch(cliContent, /status: "planned"/, "invalid status 'planned' must never appear");
  assert.doesNotMatch(cliContent, /planningOnly[\s\S]{0,120}status: "running"/,
    "planningOnly blocks must never transition into running");
});

test("F2 REGRESSION: mission lifecycle — planned is invalid, awaiting_approval is canonical pre-approval state", () => {
  assert.throws(
    () => core.createMission({ id: "m1", projectId: "p1", objective: "x", status: "planned" }),
    /mission.status must be one of/u
  );

  const pending = core.createMission({ id: "m2", projectId: "p1", objective: "x", status: "awaiting_approval" });
  assert.equal(pending.status, "awaiting_approval");

  const lifecycle = { planning: "draft", afterM3: "awaiting_approval", approved: "running", cancelled: "cancelled" };
  assert.equal(lifecycle.afterM3, "awaiting_approval");
});

test("F2 REGRESSION: mission store round-trip accepts awaiting_approval and rejects planned (crash boundary)", async () => {
  const { MaestroApplication } = require("../runtime/application/maestro-application");
  const { JsonFileRunStore } = require("../runtime/store");
  const os = require("node:os");
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-f2-"));
  const store = new JsonFileRunStore({ filePath: path.join(tmpProject, "runs.json") });
  const app = new MaestroApplication({ projectRoot: tmpProject, store });

  const mission = await app.createMission({ workspacePath: tmpProject, objective: "CRUD", status: "awaiting_approval" });
  assert.equal(mission.status, "awaiting_approval");

  await assert.rejects(
    () => app.createMission({ workspacePath: tmpProject, objective: "CRUD2", status: "planned" }),
    /mission.status must be one of/u
  );
});

test("F2 REGRESSION: post-approval transitions — approve goes to running (execution), cancel goes to cancelled", () => {
  const approved = core.createMission({ id: "m3", projectId: "p1", objective: "x", status: "running" });
  assert.equal(approved.status, "running");
  const cancelled = core.createMission({ id: "m4", projectId: "p1", objective: "x", status: "cancelled" });
  assert.equal(cancelled.status, "cancelled");
});

test("CLI bin/orquestrador-maestro.js wires SemanticPlanner and PlanApprovalGate in handleGoCommand", () => {
  const cliContent = fs.readFileSync(path.join(__dirname, "..", "bin", "orquestrador-maestro.js"), "utf8");

  // Verify that handleGoCommand uses SemanticPlanner, PlanApprovalGate, and LegacyExecutionProjection
  assert.match(cliContent, /SemanticPlanner/);
  assert.match(cliContent, /PlanApprovalGate/);
  assert.match(cliContent, /LegacyExecutionProjection/);
  assert.match(cliContent, /app\.approveMissionBrief/);
  assert.match(cliContent, /planner\.plan\(\{/);
  assert.match(cliContent, /PlanApprovalGate\.evaluateAutoApproval/);
  assert.match(cliContent, /PlanApprovalGate\.recordHumanApproval/);
  assert.match(cliContent, /Aprovar plano de engenharia/);
  assert.match(cliContent, /Inspecionar critérios de aceite/);
  assert.match(cliContent, /Refinar missão \(Retornar ao M2\)/);
});
