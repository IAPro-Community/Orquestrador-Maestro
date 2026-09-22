import test from "node:test";
import assert from "node:assert/strict";
import { createTuiStore } from "../state/store.ts";
import { normalizeEvent } from "../state/events.ts";
import { selectActiveProjectId, selectPendingAttention, selectBusyOperations } from "../state/selectors.ts";

const runtimeEvent = (type: string, payload: Record<string, unknown>, seq = 1) => normalizeEvent({
  version: 2, epoch: "e1", seq, type, timestamp: new Date(0).toISOString(), payload
});

test("T1.3–T1.5 store usa canal único, dedupe e selectors puros", () => {
  const store = createTuiStore();
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  store.dispatch({ source: "user-action", type: "ui.activeProject", payload: { projectId: "p1" } });
  store.dispatch(runtimeEvent("attention.created", { id: "a1", projectId: "p1", status: "pending" }));
  store.dispatch(runtimeEvent("attention.created", { id: "a1", projectId: "p1", status: "pending" }));
  assert.equal(selectActiveProjectId(store.getState()), "p1");
  const pending = selectPendingAttention(store.getState(), "p1");
  assert.equal(pending.length, 1);
  assert.strictEqual(selectPendingAttention(store.getState(), "p1"), pending);
  assert.equal(notifications, 2, "evento duplicado não notifica");
  assert.ok(Object.isFrozen(store.getState()));
});

test("T1.3 busy incrementa/decrementa e slices alheias permanecem estáveis", () => {
  const store = createTuiStore();
  const beforeProjects = store.getState().projectsById;
  store.dispatch({ source: "user-action", type: "ui.busy.start", payload: { operation: "load" } });
  assert.deepEqual(selectBusyOperations(store.getState()), ["load"]);
  assert.strictEqual(store.getState().projectsById, beforeProjects);
  store.dispatch({ source: "user-action", type: "ui.busy.end", payload: { operation: "load" } });
  assert.deepEqual(selectBusyOperations(store.getState()), []);
});

test("T1.3 connection e entidades reagem às famílias corretas", () => {
  const store = createTuiStore();
  store.dispatch(runtimeEvent("runtime.status", { status: "ok" }));
  store.dispatch(runtimeEvent("project.updated", { id: "p1", name: "Projeto" }, 2));
  store.dispatch(runtimeEvent("mission.updated", { id: "m1", projectId: "p1" }, 3));
  assert.equal(store.getState().connection.kind, "Success");
  assert.equal(store.getState().projectsById.ids.length, 1);
  assert.equal(store.getState().missionsById.ids.length, 1);
});
