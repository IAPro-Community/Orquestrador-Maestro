"use strict";

const { runtimeTaskId } = require("../core/task-identity");

class TaskLifecycleMonitor {
  static attach({ executor, app, graphs, store, missionId = null, projectId = null, graphId = null }) {
    if (!executor || !app || !graphs) throw new TypeError("executor, app and graphs are required");
    const listeners = [];
    let pending = Promise.resolve();
    const persist = async (type, task, extra = {}) => {
      try {
        const graphLink = await graphs.missionForTask(task.id);
        const link = missionId
          ? {
              ...(projectId ? { projectId } : graphLink?.projectId ? { projectId: graphLink.projectId } : {}),
              missionId,
              ...(graphId ? { graphId } : {})
            }
          : graphLink;
        if (!link?.missionId) return;
        const persistedTaskId = missionId
          ? runtimeTaskId({ missionId, semanticTaskId: task.id }) || task.id
          : task.id;
        const normalizedExtra = Array.isArray(extra.blockedBy) && missionId
          ? { ...extra, blockedBy: extra.blockedBy.map((id) => runtimeTaskId({ missionId, semanticTaskId: id }) || id) }
          : extra;
        await app.record(null, type, { taskId: persistedTaskId, ...link, ...normalizedExtra });
      } catch { /* observability must not interrupt execution */ }
    };
    const enqueue = (operation) => { pending = pending.then(operation).catch(() => undefined); return pending; };
    const listen = (type, handler) => { executor.on(type, handler); listeners.push(() => executor.off(type, handler)); };
    listen("task.started", (task) => { void enqueue(async () => { await persist("task.ready", task); await persist("task.started", task); }); });
    listen("task.completed", (task) => { void enqueue(() => persist("task.completed", task)); });
    listen("task.failed", (task) => {
      const match = String(task.error || "").match(/blocked by failed dependency:\s*(.+)$/i);
      void enqueue(() => persist(match ? "task.blocked" : "task.failed", task, match ? { reason: "FAILED_DEPENDENCY", blockedBy: match[1].split(",").map((id) => id.trim()).filter(Boolean) } : { error: task.error }));
    });
    const unsubscribe = app.subscribe?.((event) => {
      if (event?.type !== "provider.completed" || !event.runId) return;
      void enqueue(async () => {
        const run = await store?.getRun?.(event.runId);
        if (!run?.taskId) return;
        const task = await store?.getTask?.(run.taskId);
        const semanticTaskId = task?.metadata?.semanticTaskId || task?.metadata?.semanticTask?.id || null;
        const graphLink = semanticTaskId ? await graphs.missionForTask(semanticTaskId) : null;
        await app.record(null, "task.verifying", {
          taskId: run.taskId,
          ...(graphLink || {}),
          ...(missionId ? { missionId } : task?.metadata?.missionId ? { missionId: task.metadata.missionId } : {})
        });
      });
    });
    return Object.freeze({ detach() { for (const remove of listeners) remove(); unsubscribe?.(); } });
  }
}

module.exports = { TaskLifecycleMonitor };
