"use strict";

class TaskLifecycleMonitor {
  static attach({ executor, app, graphs, store }) {
    if (!executor || !app || !graphs) throw new TypeError("executor, app and graphs are required");
    const listeners = [];
    let pending = Promise.resolve();
    const persist = async (type, task, extra = {}) => {
      try {
        const link = await graphs.missionForTask(task.id);
        if (!link?.missionId) return;
        await app.record(null, type, { taskId: task.id, ...link, ...extra });
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
      void enqueue(async () => { const run = await store?.getRun?.(event.runId); if (run?.taskId) await persist("task.verifying", { id: run.taskId }); });
    });
    return Object.freeze({ detach() { for (const remove of listeners) remove(); unsubscribe?.(); } });
  }
}

module.exports = { TaskLifecycleMonitor };
