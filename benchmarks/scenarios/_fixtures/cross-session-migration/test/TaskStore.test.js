const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { TaskStore } = require("../src/TaskStore");

describe("TaskStore", () => {
  it("should add a task", () => {
    const store = new TaskStore();
    const task = store.addTask({ title: "Test task" });
    assert.equal(task.title, "Test task");
    assert.equal(task.status, "pending");
  });

  it("should list tasks", () => {
    const store = new TaskStore();
    store.addTask({ title: "Task 1" });
    store.addTask({ title: "Task 2" });
    assert.equal(store.listTasks().length, 2);
  });
});
