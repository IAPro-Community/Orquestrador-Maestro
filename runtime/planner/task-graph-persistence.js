"use strict";

const {
  PLANNING_MODES,
  createSemanticTask,
  toCoreTaskGraph
} = require("./task-graph-proposal");

const GRAPH_STATUSES = Object.freeze(["proposed", "approved", "rejected"]);

function assertNoRoutingContamination(value) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (["provider", "model", "estimatedCost"].includes(key)) {
      throw new TypeError("ROUTING_CONTAMINATION: TaskGraph cannot contain routing fields");
    }
    assertNoRoutingContamination(value[key]);
  }
}

class TaskGraphPersistence {
  constructor({ store }) {
    if (!store) throw new TypeError("store is required");
    this.store = store;
  }

  async upsertGraph(input) {
    assertNoRoutingContamination(input);
    if (!PLANNING_MODES.includes(input?.planningMode)) throw new TypeError("unknown planningMode");
    if (!GRAPH_STATUSES.includes(input?.status || "proposed")) throw new TypeError("unknown graph status");
    if (!Array.isArray(input.tasks) || input.tasks.length === 0) throw new TypeError("TaskGraph requires tasks");
    const semanticTasks = input.tasks.map(createSemanticTask);
    const prior = await this.store.getTaskGraph(input.graphId);
    const revision = Number(prior?.metadata?.revision || 0) + 1;
    const metadata = {
      graphId: input.graphId,
      projectId: input.projectId,
      revision,
      planningMode: input.planningMode,
      approvalProvenance: input.approvalProvenance || null,
      status: input.status || "proposed",
      recordedAt: new Date().toISOString(),
      semantic: true
    };
    const graph = toCoreTaskGraph({ id: input.graphId, missionId: input.missionId, semanticTasks, metadata });
    return this.store.saveTaskGraph(graph);
  }

  async getGraph(missionId) {
    const graphs = await this.store.listTaskGraphs({ missionId });
    return graphs.sort((a, b) => (b.metadata?.revision || 0) - (a.metadata?.revision || 0))[0];
  }

  getGraphById(graphId) { return this.store.getTaskGraph(graphId); }

  async persistTaskLinks(graph) {
    for (const task of graph.tasks || []) {
      await this.store.saveTask({
        ...task,
        projectId: graph.metadata.projectId,
        metadata: {
          ...(task.metadata || {}),
          missionId: graph.missionId,
          graphId: graph.id
        }
      });
    }
    return graph;
  }

  async missionForTask(taskId) {
    const task = await this.store.getTask(taskId);
    if (!task?.metadata?.missionId) return undefined;
    return {
      missionId: task.metadata.missionId,
      projectId: task.projectId,
      graphId: task.metadata.graphId
    };
  }
}

module.exports = { GRAPH_STATUSES, TaskGraphPersistence, assertNoRoutingContamination };
