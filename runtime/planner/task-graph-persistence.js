"use strict";

const { runtimeTaskId } = require("../core/task-identity");
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
    return graphs
      .filter((graph) => graph.metadata?.status !== "rejected")
      .sort((a, b) => (b.metadata?.revision || 0) - (a.metadata?.revision || 0))[0];
  }

  getGraphById(graphId) { return this.store.getTaskGraph(graphId); }

  async persistTaskLinks(graph) {
    for (const task of graph.tasks || []) {
      const semanticTask = task.metadata?.semantic || task.metadata?.semanticTask || null;
      const semanticTaskId = semanticTask?.id || task.metadata?.semanticTaskId || task.id;
      const persistedTaskId = runtimeTaskId({ missionId: graph.missionId, semanticTaskId }) || task.id;
      await this.store.saveTask({
        ...task,
        id: persistedTaskId,
        projectId: graph.metadata.projectId,
        metadata: {
          ...(task.metadata || {}),
          semanticTaskId,
          ...(semanticTask ? { semanticTask } : {}),
          missionId: graph.missionId,
          graphId: graph.id,
          ancestry: {
            goalId: graph.missionId,
            ...(task.metadata?.ancestry || {})
          }
        }
      });
    }
    return graph;
  }

  async _resolveTask(taskId, missionId = null) {
    const direct = await this.store.getTask(taskId);
    if (direct) return direct;
    if (typeof this.store.listTasks !== "function") return undefined;
    const matches = (await this.store.listTasks({})).filter((task) =>
      task.metadata?.semanticTaskId === taskId
      && (!missionId || task.metadata?.missionId === missionId));
    return matches.length === 1 ? matches[0] : undefined;
  }

  async missionForTask(taskId, options = {}) {
    const task = await this._resolveTask(taskId, options.missionId || null);
    if (!task?.metadata?.missionId) return undefined;
    return {
      missionId: task.metadata.missionId,
      projectId: task.projectId,
      graphId: task.metadata.graphId
    };
  }

  async ancestryForTask(taskId, options = {}) {
    const task = await this._resolveTask(taskId, options.missionId || null);
    const ancestry = task?.metadata?.ancestry;
    if (!task?.metadata?.missionId && !ancestry) return undefined;
    return {
      goalId: ancestry?.goalId || task?.metadata?.missionId,
      ...(ancestry?.parentTaskId ? { parentTaskId: ancestry.parentTaskId } : {}),
      ...(ancestry?.causedByDecisionId ? { causedByDecisionId: ancestry.causedByDecisionId } : {}),
      ...(ancestry?.outcomeId ? { outcomeId: ancestry.outcomeId } : {}),
      missionId: task?.metadata?.missionId,
      graphId: task?.metadata?.graphId
    };
  }
}

module.exports = { GRAPH_STATUSES, TaskGraphPersistence, assertNoRoutingContamination };
