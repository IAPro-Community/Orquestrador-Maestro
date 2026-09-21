"use strict";

const { deriveMissionResolutionFromTaskStates } = require("../resolution-state");

function sortByTime(values = []) {
  return [...values].sort((a, b) => String(a.createdAt || a.startedAt || a.completedAt || "").localeCompare(String(b.createdAt || b.startedAt || b.completedAt || "")));
}

async function buildTaskProofBundle({ store, taskId } = {}) {
  if (!store || typeof store.getTask !== "function") throw new TypeError("RunStore is required");
  if (typeof taskId !== "string" || !taskId.trim()) throw new TypeError("taskId is required");

  const task = await store.getTask(taskId);
  if (!task) return null;
  const runs = sortByTime(await store.listRuns({ taskId }));
  const evidence = sortByTime(await store.listEvidence({ taskId }));
  const runBundles = [];

  for (const run of runs) {
    const [executions, artifacts, verifications, events] = await Promise.all([
      store.listExecutions({ runId: run.id }),
      store.listArtifacts({ runId: run.id }),
      store.listVerifications({ runId: run.id }),
      store.listEvents({ runId: run.id })
    ]);
    runBundles.push(Object.freeze({
      runId: run.id,
      status: run.status,
      providerId: run.providerId || null,
      resolution: run.metadata?.resolution || null,
      executions: Object.freeze(sortByTime(executions).map((item) => Object.freeze({
        id: item.id,
        providerId: item.providerId,
        status: item.status,
        role: item.metadata?.role || "executor",
        startedAt: item.startedAt || null,
        completedAt: item.completedAt || null
      }))),
      artifacts: Object.freeze(sortByTime(artifacts).map((item) => Object.freeze({
        id: item.id,
        type: item.type,
        name: item.name || null,
        stepId: item.stepId || null,
        metadata: item.metadata || {}
      }))),
      verifications: Object.freeze(sortByTime(verifications).map((item) => Object.freeze({
        id: item.id,
        status: item.status,
        checks: item.checks || [],
        completedAt: item.completedAt || null
      }))),
      evidence: Object.freeze(evidence.filter((item) => item.runId === run.id)),
      outcomeEvents: Object.freeze(events.filter((event) => String(event.type || "").startsWith("outcome.")).map((event) => Object.freeze({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        data: event.data || {}
      })))
    }));
  }

  const semanticTask = task.metadata?.semanticTask || {};
  const definitionOfDone = runs.slice().reverse().find((run) => run.metadata?.resolution?.outcome?.definitionOfDone)
    ?.metadata?.resolution?.outcome?.definitionOfDone || null;

  return Object.freeze({
    schemaVersion: 1,
    kind: "task-proof-bundle",
    task: Object.freeze({
      id: task.id,
      description: task.description,
      objective: semanticTask.objective || definitionOfDone?.intent || task.description,
      acceptanceCriteria: Object.freeze([...(semanticTask.acceptanceCriteria || definitionOfDone?.acceptanceConditions || [])]),
      evidenceRequirements: Object.freeze([...(semanticTask.evidenceRequirements || definitionOfDone?.evidenceRequirements || [])])
    }),
    runs: Object.freeze(runBundles),
    evidence: Object.freeze(evidence),
    latestOutcome: runs.length ? runs[runs.length - 1].metadata?.resolution?.outcome || null : null
  });
}

async function buildMissionProofBundle({ store, missionId } = {}) {
  if (!store || typeof store.getMission !== "function") throw new TypeError("RunStore is required");
  if (typeof missionId !== "string" || !missionId.trim()) throw new TypeError("missionId is required");
  const mission = await store.getMission(missionId);
  if (!mission) return null;
  const tasks = (await store.listTasks({})).filter((task) => task.metadata?.missionId === missionId);
  const bundles = [];
  for (const task of tasks) {
    const bundle = await buildTaskProofBundle({ store, taskId: task.id });
    if (bundle) bundles.push(bundle);
  }
  const derivedResolution = deriveMissionResolutionFromTaskStates(
    bundles.map((bundle) => ({
      taskId: bundle.task.id,
      state: bundle.latestOutcome?.state || "needs_attention"
    })),
    { objective: mission.objective }
  );
  const missionResolution = mission.metadata?.resolution?.scope === "mission"
    ? mission.metadata.resolution
    : derivedResolution;
  return Object.freeze({
    schemaVersion: 1,
    kind: "mission-proof-bundle",
    mission: Object.freeze({
      id: mission.id,
      objective: mission.objective,
      status: mission.status,
      resolution: missionResolution
    }),
    tasks: Object.freeze(bundles),
    summary: Object.freeze({
      ...missionResolution.summary,
      validated: missionResolution.state === "validated"
    })
  });
}

module.exports = { buildTaskProofBundle, buildMissionProofBundle };
