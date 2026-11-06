"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { buildBrief } = require("../../orquestrador/bin/context-brief");
const { SemanticPlanner } = require("../planner/semantic-planner");
const { validatePlanPreview } = require("./plan-validation");

const SAFE_ID = /^[a-zA-Z0-9._:-]{1,128}$/;
const SAFE_MODEL = /^[a-zA-Z0-9._:/+-]{1,128}$/;
function invalid(message) {
  const error = new TypeError(message);
  error.code = -32602;
  return error;
}

function createComposePreview({ projectRoot, application }) {
  const root = path.resolve(projectRoot || process.cwd());
  async function compose(params = {}) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw invalid("params must be a non-array object");
    }
    const allowed = new Set(["projectPath", "artifact", "approvedModelUse", "providerId", "model"]);
    for (const key of Object.keys(params)) {
      if (!allowed.has(key)) throw invalid("unsupported composition input: " + key);
    }
    if (params.projectPath !== undefined &&
        (typeof params.projectPath !== "string" || path.resolve(params.projectPath) !== root)) {
      throw invalid("projectPath must match the active Maestro root");
    }
    const artifact = params.artifact;
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact) ||
        !SAFE_ID.test(artifact.id || "") ||
        !Number.isInteger(artifact.version) || artifact.version < 1 ||
        typeof artifact.content !== "string" || artifact.content.trim().length < 8 ||
        artifact.content.length > 64000 ||
        typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(artifact.sha256)) {
      throw invalid("approved PromptArtifact id/version/content/sha256 is required");
    }
    const digest = crypto.createHash("sha256").update(artifact.content, "utf8").digest("hex");
    if (digest !== artifact.sha256.toLowerCase()) {
      throw invalid("PromptArtifact digest mismatch");
    }
    if (artifact.approved !== true || params.approvedModelUse !== true) {
      throw invalid("approved PromptArtifact and explicit provider-use consent are required");
    }
    // Codex is the only currently supported adapter with a demonstrable
    // sandbox flag. Other Maestro providers cannot promise read-only here.
    if (params.providerId !== "codex") {
      throw invalid("project.compose preview requires an explicit codex provider");
    }
    const model = params.model ?? "default";
    if (typeof model !== "string" || !SAFE_MODEL.test(model) || model.includes("..")) {
      throw invalid("model must be a bounded provider identifier");
    }
    if (!application?.providers?.get || !application.providers.get("codex")) {
      throw invalid("Maestro Codex adapter unavailable; no provider fallback");
    }

    const canonical = buildBrief({ projectPath: root, task: "", maxChars: 8000 });
    if (!canonical?.manifest?.contentDigest || !canonical?.content) {
      throw new Error("Canonical Maestro project context unavailable");
    }
    const missionId = "preview-" + digest.slice(0,24);
    const planner = new SemanticPlanner({
      application,
      plannerTarget: { providerId: "codex", model, local: false },
      localOnly: false,
      maxRetries: 1
    });
    // NOTE: This calls an explicitly approved external model and may incur
    // provider cost. Codex must enforce a read-only sandbox. No local plan
    // generator, provider fallback, executeTask, or RunStore writes.
    const output = await planner.plan({
      missionId,
      missionBrief: {
        id: missionId,
        objective: artifact.content,
        requirements: [],
        constraints: ["Do not modify files or execute implementation tasks"]
      },
      taskRelevantContext: {
        canonicalBrief: canonical.content,
        canonicalManifest: canonical.manifest
      },
      allowFallback: false,
      maxAttempts: 1,
      workspacePath: root,
      providerOptions: { sandbox: "read-only", timeoutMs: 120000 }
    });
    const validation = validatePlanPreview({
      projectPath: root, artifact, proposal: output.proposal
    }, root);
    // The model planned against the context captured before its (potentially
    // long-running) call. Do not return an approvable DAG if the canonical
    // Maestro project context changed while the provider was working.
    // The regular plan validator already re-reads the authoritative context.
    if (validation.context?.contentDigest !== canonical.manifest.contentDigest) {
      throw invalid("canonical project context changed during composition; regenerate the preview");
    }
    if (!validation.validation.valid || !validation.tasks) {
      return Object.freeze({
        ...validation,
        source: "maestro-semantic-planner",
        planningMode: "explicit-external-cli-model",
        providerId: "codex"
      });
    }
    return Object.freeze({
      ...validation,
      source: "maestro-semantic-planner",
      planningMode: "explicit-external-cli-model",
      providerId: "codex",
      // The client must revalidate manifest digest before approval.
      planningTelemetry: output.planningTelemetry || null
    });
  }
  return Object.freeze({ compose });
}

module.exports = { createComposePreview };
