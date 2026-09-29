"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { toRuntimeEvent } = require("../runtime/events/runtime-event");
const { familyOf } = require("../runtime/events/event-families");

test("F3 materializa eventos reais F7/F8 e preserva contexto sem run", async () => {
  const occurredAt = "2026-08-16T12:00:00.000Z";
  const inputs = [
    { type: "mission.created", data: { missionId: "m1", projectId: "p1" } },
    { type: "attention.created", data: { id: "a1", projectId: "p1", missionId: "m1" } },
    { type: "run.output", runId: "r1", data: { chunk: "ok" } },
    { type: "provider.output", runId: "r1", data: { chunk: "ok" } }
  ];
  for (let index = 0; index < inputs.length; index += 1) {
    const legacy = { id: `e${index}`, occurredAt, ...inputs[index] };
    const event = await toRuntimeEvent(legacy, { epoch: 1, seq: index + 1, resolveContext: async () => ({ projectId: "p1", missionId: "m1", taskId: "task1" }) });
    assert.equal(typeof familyOf(event.type), "string");
    if (event.type === "mission.created") assert.deepEqual([event.projectId, event.missionId], ["p1", "m1"]);
  }
});
