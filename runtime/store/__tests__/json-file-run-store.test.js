"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("..");
const { makeTempDir } = require("../../../tests/test-helpers");

test("JsonFileRunStore persists operational entities and provides run-centric queries", async () => {
  const filePath = path.join(makeTempDir("maestro-store-"), "runtime", "runs.json");
  const store = new JsonFileRunStore({ filePath });
  await store.initialize();
  await store.createProject({ id: "project-1", name: "Example" });
  await store.saveTask({ id: "task-1", projectId: "project-1", description: "Fix validation" });
  await store.saveRun({ id: "run-1", taskId: "task-1", providerId: "codex", status: "running" });
  await store.saveStep({ id: "step-1", runId: "run-1", status: "running" });
  await store.saveExecution({ id: "execution-1", runId: "run-1", stepId: "step-1", providerId: "codex", status: "running" });
  await store.appendEvent({ id: "event-1", runId: "run-1", type: "run.started" });
  await store.saveArtifact({ id: "artifact-1", runId: "run-1", type: "DIFF" });
  await store.saveVerification({ id: "verification-1", runId: "run-1", status: "passed" });

  assert.equal((await store.getRun("run-1")).providerId, "codex");
  assert.deepEqual((await store.listRuns({ projectId: "project-1", status: "running" })).map((run) => run.id), ["run-1"]);
  assert.equal((await store.listEvents({ runId: "run-1" }))[0].type, "run.started");
  assert.equal((await store.listArtifacts({ runId: "run-1" }))[0].type, "DIFF");
  assert.equal((await store.listVerifications({ runId: "run-1" }))[0].status, "passed");

  const restored = new JsonFileRunStore({ filePath });
  assert.equal((await restored.getExecution("execution-1")).stepId, "step-1");
  const mode = (await fs.stat(filePath)).mode & 0o777;
  assert.equal(mode & 0o077, 0);
});

test("JsonFileRunStore serializes concurrent writes, replaces saved records, and returns defensive copies", async () => {
  const store = new JsonFileRunStore({ filePath: path.join(makeTempDir("maestro-store-"), "runs.json") });
  await Promise.all(Array.from({ length: 20 }, (_, index) => store.appendEvent({ id: `event-${index}`, runId: "run-1", type: "provider.output" })));
  assert.equal((await store.listEvents({ runId: "run-1" })).length, 20);
  await store.saveRun({ id: "run-1", taskId: "task-1", status: "pending" });
  await store.saveRun({ id: "run-1", taskId: "task-1", status: "completed" });
  const run = await store.getRun("run-1");
  run.status = "tampered";
  assert.equal((await store.getRun("run-1")).status, "completed");
});

test("JsonFileRunStore rejects malformed records and invalid on-disk state", async () => {
  const root = makeTempDir("maestro-store-");
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") });
  await assert.rejects(store.saveTask({ id: "" }), /non-empty string/u);
  await fs.writeFile(path.join(root, "invalid.json"), "{ nope", "utf8");
  await assert.rejects(new JsonFileRunStore({ filePath: path.join(root, "invalid.json") }).initialize(), /invalid JSON/u);
});

test("JsonFileRunStore persists intent sessions and mission briefs", async () => {
  const filePath = path.join(makeTempDir("maestro-store-"), "runtime", "runs.json");
  const store = new JsonFileRunStore({ filePath });
  await store.initialize();
  await store.createProject({ id: "project-1", workspaceRoot: "/tmp", name: "Example" });

  await store.saveProjectSnapshot({
    projectId: "project-1",
    frameworks: ["react"],
    packageManagers: ["npm"]
  });

  await store.saveIntentSession({
    id: "session-1",
    projectId: "project-1",
    rawIntent: "Criar app",
    readinessScore: 50
  });

  await store.saveMissionBrief({
    id: "brief-1",
    intentSessionId: "session-1",
    objective: "App de locacao"
  });

  await store.saveTaskGraph({
    id: "graph-1",
    missionId: "mission-1",
    tasks: [],
    dependencies: {}
  });

  const snapshot = await store.getLatestProjectSnapshot("project-1");
  assert.equal(snapshot.frameworks[0], "react");

  const session = await store.getIntentSession("session-1");
  assert.equal(session.readinessScore, 50);

  const brief = await store.getMissionBrief("brief-1");
  assert.equal(brief.objective, "App de locacao");

  const graph = await store.getTaskGraph("graph-1");
  assert.equal(graph.missionId, "mission-1");
});

test("JsonFileRunStore maintains backward compatibility with legacy intent session strings vs relevantContext", async () => {
  const filePath = path.join(makeTempDir("maestro-store-legacy-"), "runtime", "runs.json");
  const store = new JsonFileRunStore({ filePath });
  await store.initialize();
  await store.createProject({ id: "project-1", workspaceRoot: "/tmp", name: "Example" });

  // Salva uma session usando arrays de string apenas (legado)
  await store.saveIntentSession({
    id: "session-legacy",
    projectId: "project-1",
    rawIntent: "intent antiga",
    facts: ["fato string"],
    assumptions: ["assumpcao string"]
  });

  const legacySession = await store.getIntentSession("session-legacy");
  assert.equal(legacySession.facts[0], "fato string");
  assert.equal(legacySession.assumptions[0], "assumpcao string");
  assert.strictEqual(legacySession.relevantContext, undefined);

  // Salva uma session usando o novo relevantContext (novo M1)
  await store.saveIntentSession({
    id: "session-m1",
    projectId: "project-1",
    rawIntent: "intent nova",
    facts: ["fato intocado"], // mantém legados tb
    relevantContext: {
      intent: "intent nova",
      items: [
        { key: "auth", value: "ok", kind: "FACT", confidence: 1, relevance: 1, sources: [] }
      ]
    }
  });

  const newSession = await store.getIntentSession("session-m1");
  assert.equal(newSession.facts[0], "fato intocado");
  assert.equal(newSession.relevantContext.items[0].kind, "FACT");
  assert.equal(newSession.relevantContext.items[0].key, "auth");
});
