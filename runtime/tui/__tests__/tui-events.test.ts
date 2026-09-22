import test from "node:test";
import assert from "node:assert/strict";
import { isUnknownEvent, normalizeEvent } from "../state/events.ts";

function event(type: string, payload: Record<string, unknown> = {}) {
  return { version: 2, epoch: "ep-1", seq: 1, type, timestamp: new Date(0).toISOString(), payload };
}

test("T1.2 normaliza todas as famílias canônicas", () => {
  const fixtures = [
    event("runtime.status", { status: "ok" }), event("project.updated", { id: "p" }),
    event("mission.updated", { id: "m" }), event("plan.approved", { id: "g" }),
    event("task.started", { taskId: "t" }), event("agent.active", { id: "a" }),
    event("terminal.output", { id: "term", text: "x" }), event("verification.completed", { id: "v" }),
    event("attention.created", { id: "att" }), event("skill.activated", { id: "s" })
  ];
  for (const raw of fixtures) {
    const action = normalizeEvent(raw);
    assert.equal(action.source, "runtime-event");
    assert.equal(action.family, raw.type.split(".")[0]);
  }
});

test("T1.2 desconhecido é drop e payload task inválido vira failure sem crash", () => {
  assert.ok(isUnknownEvent(normalizeEvent(event("mystery.changed"))));
  const invalid = normalizeEvent(event("task.started", {}));
  assert.equal(invalid.kind, "normalization-failure");
  assert.equal(normalizeEvent({ ...event("project.updated", { id: "p" }), seq: 0 }).nonMonotonic, true);
});

test("T1.2 aceita envelope RuntimeEvent v2 real com payload.data e contexto no topo", () => {
  const action = normalizeEvent({ version: 2, epoch: 1, seq: 7, type: "mission.updated", projectId: "p1", missionId: "m1", timestamp: new Date(0).toISOString(), payload: { data: { id: "m1", status: "running" }, legacyId: "e1" } });
  assert.equal(action.kind, undefined);
  assert.equal(action.payload.id, "m1");
  assert.equal(action.payload.projectId, "p1");
});
