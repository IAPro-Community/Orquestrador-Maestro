"use strict";

const crypto = require("node:crypto");
const { GraphValidator } = require("./graph-validator");
const { DeterministicFallbackPlanner } = require("./deterministic-fallback-planner");
const { createTaskGraphProposal, toCoreTaskGraph } = require("./task-graph-proposal");
const { extractAssistantText } = require("../providers/provider-output");

class SemanticPlanner {
  constructor({
    application,
    plannerTarget = { providerId: "opencode", model: "llama3.3", local: true },
    localOnly = true,
    maxRetries = 3
  } = {}) {
    this.app = application;
    this.plannerTarget = plannerTarget;
    this.localOnly = localOnly;
    this.maxRetries = maxRetries;
  }

  async plan({ missionBrief, taskRelevantContext, resolvedSkills = [], missionId, allowFallback = true }) {
    const resolvedMissionId = missionId || missionBrief?.id;
    if (!resolvedMissionId || typeof resolvedMissionId !== "string" || resolvedMissionId.trim() === "") {
      throw new Error("MISSING_MISSION_ID: missionId is required for semantic planning");
    }

    if (this.localOnly && this.plannerTarget && this.plannerTarget.local === false) {
      throw new Error("LOCAL_ONLY_VIOLATION: Remote provider/model not permitted under localOnly policy");
    }

    const providerId = this.plannerTarget?.providerId;
    const provider = this.app?.providers?.get ? this.app.providers.get(providerId) : null;
    let providerAvailable = false;

    if (provider) {
      try {
        const detected = await provider.detect();
        providerAvailable = Boolean(detected && detected.installed);
      } catch {
        providerAvailable = false;
      }
    }

    if (!providerAvailable) {
      if (allowFallback) {
        const fallbackProposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext, resolvedSkills });
        const validated = GraphValidator.validate(fallbackProposal, { missionBrief, taskRelevantContext });
        if (!validated.valid) {
          throw new Error(`Fallback validation failed: ${validated.blockers.map((b) => b.message).join("; ")}`);
        }
        const taskGraph = toCoreTaskGraph({
          id: `task-graph-${crypto.randomUUID()}`,
          missionId: resolvedMissionId,
          semanticTasks: validated.normalizedProposal.tasks,
          metadata: { planningMode: "deterministic-fallback" }
        });
        return { taskGraph, proposal: validated.normalizedProposal, planningMode: "deterministic-fallback" };
      }
      throw new Error(`AI Provider ${providerId} is unavailable and fallback is disabled.`);
    }

    const prompt = this._buildPrompt(missionBrief, taskRelevantContext, resolvedSkills);
    let lastError = null;
    let validProposal = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      let result;
      try {
        const handle = await provider.execute({
          prompt,
          model: this.plannerTarget.model,
          workspacePath: process.cwd()
        });
        result = await handle.result;
      } catch (err) {
        throw new Error(`Provider execution failed: ${err.message}`);
      }

      try {
        const parsed = this._parseOutput(result?.stdout || "");
        const proposal = createTaskGraphProposal({ ...parsed, planningMode: "local-ai" });
        const validation = GraphValidator.validate(proposal, { missionBrief, taskRelevantContext });
        if (!validation.valid) {
          lastError = new Error(`Validation blockers: ${validation.blockers.map((b) => b.message).join("; ")}`);
          continue;
        }
        validProposal = validation.normalizedProposal;
        break;
      } catch (parseErr) {
        lastError = parseErr;
      }
    }

    if (!validProposal) {
      if (allowFallback) {
        const fallbackProposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext, resolvedSkills });
        const validated = GraphValidator.validate(fallbackProposal, { missionBrief, taskRelevantContext });
        if (!validated.valid) {
          throw new Error(`Fallback validation failed: ${validated.blockers.map((b) => b.message).join("; ")}`);
        }
        const taskGraph = toCoreTaskGraph({
          id: `task-graph-${crypto.randomUUID()}`,
          missionId: resolvedMissionId,
          semanticTasks: validated.normalizedProposal.tasks,
          metadata: { planningMode: "deterministic-fallback" }
        });
        return { taskGraph, proposal: validated.normalizedProposal, planningMode: "deterministic-fallback" };
      }
      throw new Error(`STRUCTURED_OUTPUT_FAILED: ${lastError ? lastError.message : "Exhausted retries"}`);
    }

    const taskGraph = toCoreTaskGraph({
      id: `task-graph-${crypto.randomUUID()}`,
      missionId: resolvedMissionId,
      semanticTasks: validProposal.tasks,
      metadata: { planningMode: "local-ai" }
    });

    return { taskGraph, proposal: validProposal, planningMode: "local-ai" };
  }

  _buildPrompt(missionBrief = {}, taskRelevantContext = {}, resolvedSkills = []) {
    return `You are a Senior Software Architect. Decompose the approved MissionBrief into a cohesive engineering TaskGraph.
Mission: ${missionBrief?.objective || ""}
Requirements: ${JSON.stringify(missionBrief?.requirements || [])}
Constraints: ${JSON.stringify(missionBrief?.constraints || [])}
Context: ${JSON.stringify(taskRelevantContext || {})}
Skills: ${JSON.stringify(resolvedSkills || [])}

Return ONLY a JSON object:
{
  "tasks": [
    {
      "id": "task-1",
      "title": "Descriptive engineering action",
      "objective": "Detailed objective",
      "type": "analyze|domain|persistence|api|ui|test|documentation",
      "dependsOn": [],
      "acceptanceCriteria": ["criterion 1"],
      "requiredSkills": [],
      "requiredCapabilities": ["backend"],
      "complexity": "simple|medium|complex",
      "risk": "low|medium|high|critical",
      "sourceRequirements": []
    }
  ],
  "assumptions": [],
  "rationale": "High-level reason"
}`;
  }

  _parseOutput(stdout) {
    if (typeof stdout !== "string") {
      throw new TypeError("Provider output stdout must be a string");
    }
    const trimmed = extractAssistantText(stdout).trim();
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonText = (match ? match[1] : trimmed).trim();
    return JSON.parse(jsonText);
  }
}

module.exports = { SemanticPlanner };
