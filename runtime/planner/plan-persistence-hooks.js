"use strict";

class PlanPersistenceHooks {
  constructor({ graphs, getGraphInput } = {}) {
    if (!graphs || typeof graphs.upsertGraph !== "function") throw new TypeError("graphs.upsertGraph is required");
    if (typeof getGraphInput !== "function") throw new TypeError("getGraphInput is required");
    this.graphs = graphs;
    this.getGraphInput = getGraphInput;
  }

  async _persist(status, { missionId, taskGraphId, approval }) {
    const input = await this.getGraphInput({ missionId, taskGraphId, approval, status });
    const graph = await this.graphs.upsertGraph({ ...input, graphId: input.graphId || taskGraphId, missionId, status, approvalProvenance: approval });
    if (typeof this.graphs.persistTaskLinks === "function") await this.graphs.persistTaskLinks(graph);
    return graph;
  }
  onApproved(context) { return this._persist("approved", context); }
  onRejected(context) { return this._persist("rejected", context); }
}

module.exports = { PlanPersistenceHooks };
