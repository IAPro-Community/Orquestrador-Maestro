"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MISSIONS_DIR = "DEV";
const MISSIONS_SUBDIR = "MISSIONS";
const PLAN_FILENAME = "PLAN.md";

class PlanArtifactStore {
  constructor({ workspacePath } = {}) {
    if (!workspacePath || typeof workspacePath !== "string") {
      throw new TypeError("workspacePath is required");
    }
    this.workspacePath = path.resolve(workspacePath);
  }

  missionDir(missionId) {
    if (!missionId || typeof missionId !== "string") {
      throw new TypeError("missionId is required");
    }
    return path.join(this.workspacePath, MISSIONS_DIR, MISSIONS_SUBDIR, missionId);
  }

  planArtifactPath(missionId) {
    return path.join(this.missionDir(missionId), PLAN_FILENAME);
  }

  async writePlanArtifact(missionId, content) {
    if (!missionId || typeof missionId !== "string") {
      throw new TypeError("missionId is required");
    }
    if (typeof content !== "string") {
      throw new TypeError("content must be a string");
    }

    const dir = this.missionDir(missionId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, PLAN_FILENAME);
    fs.writeFileSync(filePath, content, "utf8");
    return Object.freeze({ written: true, path: filePath, missionId });
  }

  async readPlanArtifact(missionId) {
    if (!missionId || typeof missionId !== "string") {
      throw new TypeError("missionId is required");
    }

    const filePath = this.planArtifactPath(missionId);
    if (!fs.existsSync(filePath)) {
      return Object.freeze({ exists: false, content: "", path: filePath, missionId });
    }

    const content = fs.readFileSync(filePath, "utf8");
    return Object.freeze({ exists: true, content, path: filePath, missionId });
  }
}

module.exports = { PlanArtifactStore };
