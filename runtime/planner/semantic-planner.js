"use strict";

const crypto = require("node:crypto");
const { GraphValidator } = require("./graph-validator");
const { DeterministicFallbackPlanner } = require("./deterministic-fallback-planner");
const { createTaskGraphProposal, toCoreTaskGraph } = require("./task-graph-proposal");
const { extractAssistantText } = require("../providers/provider-output");
const { parseProviderUsage } = require("../telemetry/provider-usage");

function promptTelemetry(prompt) {
  const bytes = Buffer.byteLength(String(prompt || ""), "utf8");
  return Object.freeze({
    promptBytes: bytes,
    estimatedPromptTokens: Math.ceil(bytes / 4),
    promptHash: crypto.createHash("sha256").update(String(prompt || ""), "utf8").digest("hex")
  });
}

function safeUsage(providerId, result, model) {
  try {
    return parseProviderUsage({ providerId, stdout: result?.stdout, stderr: result?.stderr, model });
  } catch {
    return Object.freeze({ tokenInput: null, tokenOutput: null, cachedInputTokens: null, tokenSource: "unavailable", usageScope: "unknown" });
  }
}

function buildPlanningAttempt({ attempt, prompt, providerId, model, result, outcome, failureKind = null, blockerCodes = [] }) {
  const usage = safeUsage(providerId, result, model);
  const promptInfo = promptTelemetry(prompt);
  return Object.freeze({
    attempt,
    outcome,
    failureKind,
    blockerCodes: Object.freeze([...blockerCodes]),
    ...promptInfo,
    durationMs: Number.isFinite(result?.durationMs) ? result.durationMs : null,
    tokenInput: usage.tokenInput ?? null,
    tokenOutput: usage.tokenOutput ?? null,
    cachedInputTokens: usage.cachedInputTokens ?? null,
    tokenSource: usage.tokenSource || "unavailable",
    usageScope: usage.usageScope || "unknown",
    provider: usage.provider || "unknown",
    model: usage.model || (model && model !== "default" ? model : "unknown")
  });
}

function sumIfComplete(attempts, field) {
  if (attempts.length === 0 || !attempts.every((item) => Number.isFinite(item[field]))) return null;
  return attempts.reduce((sum, item) => sum + item[field], 0);
}

function summarizePlanningAttempts(attempts = [], { fallbackUsed = false, terminalReason = null } = {}) {
  const rows = Array.isArray(attempts) ? attempts : [];
  const tokenInput = sumIfComplete(rows, "tokenInput");
  const tokenOutput = sumIfComplete(rows, "tokenOutput");
  const providerTokens = tokenInput !== null && tokenOutput !== null ? tokenInput + tokenOutput : null;
  const reported = rows.filter((item) => item.tokenSource === "provider-reported").length;
  const durationMs = sumIfComplete(rows, "durationMs");
  return Object.freeze({
    version: 1,
    modelCalls: rows.length,
    estimatedPromptTokens: rows.reduce((sum, item) => sum + (Number.isFinite(item.estimatedPromptTokens) ? item.estimatedPromptTokens : 0), 0),
    tokenInput,
    tokenOutput,
    providerTokens,
    tokenCompleteness: rows.length === 0 ? "none" : providerTokens !== null ? "complete" : reported > 0 ? "partial" : "unavailable",
    durationMs,
    fallbackUsed: fallbackUsed === true,
    terminalReason,
    attempts: Object.freeze([...rows])
  });
}

function planningError(message, { code, failureKind, blockerCodes = [], attempts = [] } = {}) {
  const error = new Error(message);
  if (code) error.code = code;
  error.failureKind = failureKind || "unknown";
  error.blockerCodes = Object.freeze([...blockerCodes]);
  error.planningTelemetry = summarizePlanningAttempts(attempts, { terminalReason: failureKind || code || "failed" });
  return error;
}

function normalizedProviderOptions(providerOptions = {}) {
  if (!providerOptions || typeof providerOptions !== "object" || Array.isArray(providerOptions)) return {};
  const allowed = ["sandbox", "permissionMode", "mode", "agent", "sessionId", "continue"];
  return Object.fromEntries(allowed.filter((key) => providerOptions[key] !== undefined).map((key) => [key, providerOptions[key]]));
}

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

  buildFallback({ missionBrief, taskRelevantContext, resolvedSkills = [], missionId, planningTelemetry = null, terminalReason = "deterministic-fallback" }) {
    const resolvedMissionId = missionId || missionBrief?.id;
    if (!resolvedMissionId || typeof resolvedMissionId !== "string" || resolvedMissionId.trim() === "") {
      throw new Error("MISSING_MISSION_ID: missionId is required for semantic planning");
    }
    const fallbackProposal = DeterministicFallbackPlanner.plan({ missionBrief, taskRelevantContext, resolvedSkills });
    const validated = GraphValidator.validate(fallbackProposal, { missionBrief, taskRelevantContext });
    if (!validated.valid) {
      const error = new Error(`Fallback validation failed: ${validated.blockers.map((b) => b.message).join("; ")}`);
      error.code = "FALLBACK_VALIDATION_FAILED";
      error.blockerCodes = Object.freeze(validated.blockers.map((blocker) => blocker.code));
      throw error;
    }
    const taskGraph = toCoreTaskGraph({
      id: `task-graph-${crypto.randomUUID()}`,
      missionId: resolvedMissionId,
      semanticTasks: validated.normalizedProposal.tasks,
      metadata: { planningMode: "deterministic-fallback" }
    });
    const telemetry = planningTelemetry
      ? Object.freeze({ ...planningTelemetry, fallbackUsed: true, terminalReason })
      : summarizePlanningAttempts([], { fallbackUsed: true, terminalReason });
    return { taskGraph, proposal: validated.normalizedProposal, planningMode: "deterministic-fallback", planningTelemetry: telemetry };
  }

  async plan({
    missionBrief,
    taskRelevantContext,
    resolvedSkills = [],
    missionId,
    allowFallback = true,
    maxAttempts,
    workspacePath = process.cwd(),
    providerOptions = {}
  }) {
    const resolvedMissionId = missionId || missionBrief?.id;
    if (!resolvedMissionId || typeof resolvedMissionId !== "string" || resolvedMissionId.trim() === "") {
      throw new Error("MISSING_MISSION_ID: missionId is required for semantic planning");
    }

    const attemptLimit = maxAttempts === undefined ? this.maxRetries : maxAttempts;
    if (!Number.isInteger(attemptLimit) || attemptLimit < 1 || attemptLimit > 10) {
      throw new TypeError("maxAttempts must be an integer between 1 and 10");
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
        return this.buildFallback({
          missionBrief,
          taskRelevantContext,
          resolvedSkills,
          missionId: resolvedMissionId,
          terminalReason: "provider-unavailable"
        });
      }
      const error = new Error(`AI Provider ${providerId} is unavailable and fallback is disabled.`);
      error.code = "PROVIDER_UNAVAILABLE";
      throw error;
    }

    const prompt = this._buildPrompt(missionBrief, taskRelevantContext, resolvedSkills);
    const attempts = [];
    let lastError = null;
    let lastFailureKind = "unknown";
    let lastBlockerCodes = [];

    for (let attempt = 1; attempt <= attemptLimit; attempt++) {
      let result;
      try {
        const handle = await provider.execute({
          prompt,
          model: this.plannerTarget.model,
          workspacePath,
          ...normalizedProviderOptions(providerOptions)
        });
        result = await handle.result;
      } catch (err) {
        attempts.push(buildPlanningAttempt({
          attempt, prompt, providerId, model: this.plannerTarget.model, result: null,
          outcome: "provider-error", failureKind: "provider"
        }));
        throw planningError(`Provider execution failed: ${err.message}`, {
          code: "PROVIDER_EXECUTION_FAILED",
          failureKind: "provider",
          attempts
        });
      }

      let parsed;
      let proposal;
      try {
        parsed = this._parseOutput(result?.stdout || "");
        proposal = createTaskGraphProposal({ ...parsed, planningMode: "local-ai" });
      } catch (error) {
        lastError = error;
        lastFailureKind = error instanceof SyntaxError ? "parse" : "structure";
        lastBlockerCodes = [];
        attempts.push(buildPlanningAttempt({
          attempt, prompt, providerId, model: this.plannerTarget.model, result,
          outcome: "invalid-structure", failureKind: lastFailureKind
        }));
        continue;
      }

      const validation = GraphValidator.validate(proposal, { missionBrief, taskRelevantContext });
      if (!validation.valid) {
        lastBlockerCodes = validation.blockers.map((blocker) => blocker.code);
        lastFailureKind = "validation";
        lastError = new Error(`Validation blockers: ${validation.blockers.map((b) => b.message).join("; ")}`);
        attempts.push(buildPlanningAttempt({
          attempt, prompt, providerId, model: this.plannerTarget.model, result,
          outcome: "validation-failed", failureKind: "validation", blockerCodes: lastBlockerCodes
        }));
        continue;
      }

      attempts.push(buildPlanningAttempt({
        attempt, prompt, providerId, model: this.plannerTarget.model, result,
        outcome: "validated"
      }));
      const taskGraph = toCoreTaskGraph({
        id: `task-graph-${crypto.randomUUID()}`,
        missionId: resolvedMissionId,
        semanticTasks: validation.normalizedProposal.tasks,
        metadata: { planningMode: "local-ai" }
      });
      return {
        taskGraph,
        proposal: validation.normalizedProposal,
        planningMode: "local-ai",
        planningTelemetry: summarizePlanningAttempts(attempts, { terminalReason: "validated" })
      };
    }

    const telemetry = summarizePlanningAttempts(attempts, { terminalReason: `${lastFailureKind}-exhausted` });
    if (allowFallback) {
      return this.buildFallback({
        missionBrief,
        taskRelevantContext,
        resolvedSkills,
        missionId: resolvedMissionId,
        planningTelemetry: telemetry,
        terminalReason: `${lastFailureKind}-exhausted`
      });
    }

    throw planningError(
      `STRUCTURED_OUTPUT_FAILED: ${lastError ? lastError.message : "Exhausted retries"}`,
      {
        code: "STRUCTURED_OUTPUT_FAILED",
        failureKind: lastFailureKind,
        blockerCodes: lastBlockerCodes,
        attempts
      }
    );
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

module.exports = {
  SemanticPlanner,
  buildPlanningAttempt,
  summarizePlanningAttempts,
  promptTelemetry
};
