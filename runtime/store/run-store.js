"use strict";

class RunStore {
  constructor() {
    if (new.target === RunStore) throw new TypeError("RunStore is an abstract contract");
  }

  async initialize() { throw new Error("RunStore.initialize must be implemented"); }
  async createProject() { throw new Error("RunStore.createProject must be implemented"); }
  async saveMission() { throw new Error("RunStore.saveMission must be implemented"); }
  async saveTask() { throw new Error("RunStore.saveTask must be implemented"); }
  async saveRun() { throw new Error("RunStore.saveRun must be implemented"); }
  async saveStep() { throw new Error("RunStore.saveStep must be implemented"); }
  async saveExecution() { throw new Error("RunStore.saveExecution must be implemented"); }
  async appendEvent() { throw new Error("RunStore.appendEvent must be implemented"); }
  async saveArtifact() { throw new Error("RunStore.saveArtifact must be implemented"); }
  async saveVerification() { throw new Error("RunStore.saveVerification must be implemented"); }
  async saveTerminal() { throw new Error("RunStore.saveTerminal must be implemented"); }
  async saveProjectSnapshot() { throw new Error("RunStore.saveProjectSnapshot must be implemented"); }
  async saveIntentSession() { throw new Error("RunStore.saveIntentSession must be implemented"); }
  async saveMissionBrief() { throw new Error("RunStore.saveMissionBrief must be implemented"); }
  async saveTaskGraph() { throw new Error("RunStore.saveTaskGraph must be implemented"); }
  async listTaskGraphs() { throw new Error("RunStore.listTaskGraphs must be implemented"); }
  async saveAttention() { throw new Error("RunStore.saveAttention must be implemented"); }
  async getAttention() { throw new Error("RunStore.getAttention must be implemented"); }
  async listAttention() { throw new Error("RunStore.listAttention must be implemented"); }
  async getLatestProjectSnapshot() { throw new Error("RunStore.getLatestProjectSnapshot must be implemented"); }
  async getIntentSession() { throw new Error("RunStore.getIntentSession must be implemented"); }
  async getMissionBrief() { throw new Error("RunStore.getMissionBrief must be implemented"); }
  async getTaskGraph() { throw new Error("RunStore.getTaskGraph must be implemented"); }
}

module.exports = { RunStore };
