"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { JsonFileRunStore } = require("../runtime/store/json-file-run-store");
const { TaskGraphPersistence } = require("../runtime/planner/task-graph-persistence");

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-r3-"));
  return new JsonFileRunStore({ filePath: path.join(dir, "runs.json") });
}

const task = { id: "t1", title: "Implementar", objective: "Entregar feature", dependsOn: [] };

test("F4.1 persiste grafo puro, incrementa revisão e resolve vínculo de task", async () => {
  const store = tempStore();
  const graphs = new TaskGraphPersistence({ store });
  const base = { graphId: "g1", projectId: "p1", missionId: "m1", planningMode: "local-ai", tasks: [task], status: "proposed" };
  const first = await graphs.upsertGraph(base);
  const second = await graphs.upsertGraph({ ...base, status: "approved" });
  assert.equal(first.metadata.revision, 1);
  assert.equal(second.metadata.revision, 2);
  assert.equal((await store.listTaskGraphs({ missionId: "m1" })).length, 1);
  assert.equal((await graphs.getGraph("m1")).metadata.status, "approved");
  await graphs.persistTaskLinks(second);
  assert.deepEqual(await graphs.missionForTask("t1"), { missionId: "m1", projectId: "p1", graphId: "g1" });
});

test("F4.1 rejeita contaminação de roteamento antes de escrever", async () => {
  const store = tempStore();
  const graphs = new TaskGraphPersistence({ store });
  await assert.rejects(
    graphs.upsertGraph({ graphId: "g2", projectId: "p", missionId: "m", planningMode: "local-ai", tasks: [{ ...task, provider: "codex" }] }),
    /ROUTING_CONTAMINATION/
  );
  assert.equal((await store.listTaskGraphs()).length, 0);
});
