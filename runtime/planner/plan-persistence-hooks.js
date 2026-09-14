"use strict";

class PlanPersistenceHooks {
  constructor({ graphs, getGraphInput } = {}) {
    if (!graphs || typeof graphs.upsertGraph !== "function") throw new TypeError("graphs.upsertGraph is required");
    if (typeof getGraphInput !== "function") throw new TypeError("getGraphInput is required");
    this.graphs = graphs;
    this.getGraphInput = getGraphInput;
  }

  async _persist(status, { missionId, taskGraphId, approval, revision, revisedProposal }) {
    const input = await this.getGraphInput({ missionId, taskGraphId, approval, status, revision });
    const revisedTasks = revisedProposal?.tasks || revision?.tasks;
    const graph = await this.graphs.upsertGraph({
      ...input,
      ...(Array.isArray(revisedTasks) ? { tasks: revisedTasks } : {}),
      graphId: input.graphId || taskGraphId,
      missionId,
      status,
      approvalProvenance: approval
    });
    if (typeof this.graphs.persistTaskLinks === "function") await this.graphs.persistTaskLinks(graph);
    return graph;
  }
  onApproved(context) { return this._persist("approved", context); }
  // A rejected proposal must never replace the active task graph or task links.
  async onRejected() { return undefined; }
}

module.exports = { PlanPersistenceHooks };
