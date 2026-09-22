"use strict";

const EventEmitter = require("node:events");
const { isScopeExecutionEligible } = require("../governance/change-governance");
const { classifyResolutionFailure } = require("../resolution");

/**
 * Executa tarefas paralelamente respeitando restrições de dependências
 * e limites de concorrência.
 *
 * Se uma dependência falha, as tarefas que dependem dela são marcadas como
 * failed (BLOCKED) em vez de ficarem pendentes para sempre; o executor
 * conclui quando não há mais tarefas pendentes nem em execução.
 */
class LaneExecutor extends EventEmitter {
  constructor({ application, maxParallel = 3, interactionProfile, executionProfile, resolutionMode = "shadow" } = {}) {
    super();
    this.app = application;
    this.maxParallel = maxParallel;
    this.interactionProfile = interactionProfile;
    this.executionProfile = executionProfile;
    this.resolutionMode = resolutionMode;
  }

  async execute(tasks, missionId) {
    const results = {};
    const pending = [...tasks];
    const running = new Set();
    const completed = new Set();
    const failed = new Set();

    let projectId = missionId;
    try {
      const mission = await this.app.getMission(missionId);
      if (mission && typeof mission.projectId === "string" && mission.projectId.trim() !== "") {
        projectId = mission.projectId;
      }
    } catch {
      // Mission lookup is best-effort; fall back to the mission id.
    }

    const markFailed = (task, errorMessage, details = {}) => {
      results[task.id] = {
        status: "failed",
        error: errorMessage,
        ...(details.result ? { result: details.result } : {}),
        ...(details.resolutionState ? { resolutionState: details.resolutionState } : {}),
        ...(details.failureClass ? { failureClass: details.failureClass } : {})
      };
      failed.add(task.id);
      this.emit("task.failed", { ...task, error: errorMessage, resolutionState: details.resolutionState || null });
    };

    return new Promise((resolve, reject) => {
      const checkNext = () => {
        if (pending.length === 0 && running.size === 0) return resolve(results);

        for (let i = pending.length - 1; i >= 0; i--) {
          const task = pending[i];
          const deps = task.dependsOn || [];
          const blockingFailures = deps.filter((dep) => failed.has(dep));
          if (blockingFailures.length === 0) continue;
          pending.splice(i, 1);
          markFailed(task, `blocked by failed dependency: ${blockingFailures.join(", ")}`, { resolutionState: "blocked" });
        }

        while (running.size < this.maxParallel) {
          const nextIndex = pending.findIndex((t) =>
            (t.dependsOn || []).every((dep) => completed.has(dep))
          );

          if (nextIndex === -1) break; // No tasks ready

          const task = pending.splice(nextIndex, 1)[0];
          const semanticTask = task.semanticMetadata && typeof task.semanticMetadata === "object"
            ? task.semanticMetadata
            : task;
          if (!isScopeExecutionEligible(semanticTask)) {
            markFailed(task, `blocked by scope classification: ${semanticTask.scopeClassification || "unknown"}`, { resolutionState: "blocked", failureClass: "policy-block" });
            continue;
          }
          running.add(task.id);

          this.emit("task.started", task);

          const executionOptions = ["fast", "standard", "deep", "security", "multiagent"].includes(this.executionProfile)
            ? { policyId: this.executionProfile }
            : this.executionProfile ? { profileId: this.executionProfile } : {};
          const execute = typeof this.app.executeTaskWithHandoff === "function"
            ? this.app.executeTaskWithHandoff.bind(this.app)
            : this.app.executeRun.bind(this.app);
          execute({
            description: task.description,
            providerId: task.provider,
            providerFallbacks: task.providerFallbacks || [],
            model: task.model,
            skills: task.skills,
            projectId,
            missionId,
            semanticTaskId: task.id,
            semanticTask,
            resolutionMode: this.resolutionMode,
            ...executionOptions,
            interactionProfile: this.interactionProfile
          })
            .then((result) => {
              const runStatus = result?.run?.status;
              const resolutionState = result?.run?.metadata?.resolution?.outcome?.state;
              if (runStatus !== "completed" || (resolutionState && resolutionState !== "validated")) {
                const reason = result?.run?.metadata?.preflightBlock
                  || result?.review?.reason
                  || result?.governanceBlocking?.[0]
                  || (resolutionState && resolutionState !== "validated" ? `resolution outcome: ${resolutionState}` : null)
                  || `run finished with status: ${runStatus || "unknown"}`;
                markFailed(task, reason, {
                  result,
                  resolutionState: resolutionState || (runStatus === "blocked" ? "blocked" : "failed"),
                  failureClass: result?.failureClass || null
                });
                return;
              }
              results[task.id] = { status: "completed", result };
              completed.add(task.id);
              this.emit("task.completed", task);
            })
            .catch((error) => {
              const failureClass = classifyResolutionFailure({
                code: error?.code,
                reason: error?.message,
                failureKind: error?.failureKind,
                blockerCodes: error?.blockerCodes
              });
              markFailed(task, error.message, { resolutionState: "failed", failureClass });
            })
            .finally(() => {
              running.delete(task.id);
              try { checkNext(); } catch (err) { reject(err); }
          });
        }

        if (pending.length > 0 && running.size === 0) {
          const hasFailedDependency = pending.some((task) =>
            (task.dependsOn || []).some((dep) => failed.has(dep))
          );
          if (hasFailedDependency) return checkNext();

          for (const task of pending.splice(0)) {
            markFailed(task, `blocked by unresolved dependency: ${(task.dependsOn || []).join(", ") || "unknown"}`, { resolutionState: "blocked" });
          }
        }

        if (pending.length === 0 && running.size === 0) resolve(results);
      };

      checkNext();
    });
  }
}

module.exports = { LaneExecutor };
