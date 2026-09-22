"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { familyOf } = require("../event-families");
const { toRuntimeEvent } = require("../runtime-event");

test("resolution lifecycle events remain valid protocol v2 task-family events", () => {
  for (const type of [
    "resolution.planned",
    "budget.reserved",
    "budget.committed",
    "budget.released",
    "evidence.created",
    "provider.handoff",
    "outcome.validated",
    "outcome.revoked",
    "outcome.revalidated"
  ]) {
    assert.equal(familyOf(type), "task.*", type);
  }
});


test("protocol v2 conversion preserves the canonical runId on task-family events", async () => {
  const event = await toRuntimeEvent({
    id: "legacy-1",
    runId: "run-1",
    type: "outcome.validated",
    occurredAt: "2026-09-21T00:00:00.000Z",
    data: { taskId: "task-1", state: "validated" }
  }, {
    epoch: 1,
    seq: 1,
    resolveContext: async () => ({ projectId: "project-1", missionId: "mission-1", taskId: "task-1" })
  });

  assert.equal(event.runId, "run-1");
  assert.equal(event.taskId, "task-1");
  assert.equal(event.projectId, "project-1");
  assert.equal(event.payload.data.state, "validated");
});


test("blocked runs remain valid protocol v2 task-family events", () => {
  assert.equal(familyOf("run.blocked"), "task.*");
});
