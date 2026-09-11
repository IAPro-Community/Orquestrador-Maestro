const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { TaskStore } = require("../src/TaskStore");

describe("TaskStore - Hidden Tests", () => {
  it("should update task", () => {
    const store = new TaskStore();
    const task = store.addTask({ title: "Original" });
    const updated = store.updateTask(task.id, { title: "Updated", status: "in-progress" });
    assert.equal(updated.title, "Updated");
    assert.equal(updated.status, "in-progress");
  });

  it("should delete task", () => {
    const store = new TaskStore();
    const task = store.addTask({ title: "To delete" });
    assert.equal(store.deleteTask(task.id), true);
    assert.equal(store.getTask(task.id), null);
  });

  it("should return stats", () => {
    const store = new TaskStore();
    store.addTask({ title: "P1", status: "pending" });
    store.addTask({ title: "C1", status: "completed" });
    store.addTask({ title: "I1", status: "in-progress" });
    const stats = store.getStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.pending, 1);
    assert.equal(stats.completed, 1);
    assert.equal(stats.inProgress, 1);
  });

  it("should export and import", () => {
    const store1 = new TaskStore();
    store1.addTask({ title: "Export me" });
    const json = store1.export();

    const store2 = new TaskStore();
    store2.import(json);
    assert.equal(store2.tasks.length, 1);
    assert.equal(store2.tasks[0].title, "Export me");
  });

  it("should return null for non-existent task", () => {
    const store = new TaskStore();
    assert.equal(store.getTask("nonexistent"), null);
  });
});
