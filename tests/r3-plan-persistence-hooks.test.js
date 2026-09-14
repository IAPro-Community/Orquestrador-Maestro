"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PlanRevisionService } = require("../runtime/planner/plan-revision-service");
const { PlanPersistenceHooks } = require("../runtime/planner/plan-persistence-hooks");

test("F4.3 aprovações persistem o grafo e rejeições ficam apenas na trilha de auditoria", async () => {
  const writes = [], events = [];
  const graphs = { upsertGraph: async (input) => { writes.push(input); return input; } };
  const hooks = new PlanPersistenceHooks({ graphs, getGraphInput: async ({ missionId, taskGraphId }) => ({ graphId: taskGraphId, missionId, projectId: "p1", planningMode: "local-ai", tasks: [{ id: "t", title: "T", objective: "O" }] }) });
  const store = { saveApproval: async () => {}, appendEvent: async (event) => events.push(event) };
  const service = new PlanRevisionService({ store, persistenceHooks: hooks });
  await service.approveRevision("m1", "g1", "approved", { actor: "user" });
  await service.autoApprove("m1", "g1", { validationResult: { valid: true, blockers: [] }, planningMode: "local-ai" });
  await service.autoApprove("m1", "g1", { validationResult: { valid: false, blockers: ["x"] }, planningMode: "deterministic-fallback" });
  assert.deepEqual(writes.map((write) => write.status), ["approved", "approved"]);
  assert.equal(writes[0].approvalProvenance.approvalType, "HUMAN_REVIEW");
  assert.ok(events.some((event) => event.type === "plan.approved"));
  assert.ok(events.some((event) => event.type === "plan.rejected"));
});
