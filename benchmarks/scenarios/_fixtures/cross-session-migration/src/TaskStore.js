"use strict";

class TaskStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.tasks = [];
    this.version = 1;
  }

  addTask(task) {
    const newTask = {
      id: `task-${Date.now()}`,
      title: task.title,
      description: task.description || "",
      status: task.status || "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: task.metadata || {},
    };
    this.tasks.push(newTask);
    return newTask;
  }

  updateTask(id, updates) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    return task;
  }

  getTask(id) {
    return this.tasks.find((t) => t.id === id) || null;
  }

  listTasks(filter = {}) {
    return this.tasks.filter((t) => {
      if (filter.status && t.status !== filter.status) return false;
      return true;
    });
  }

  deleteTask(id) {
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) return false;
    this.tasks.splice(index, 1);
    return true;
  }

  getStats() {
    return {
      total: this.tasks.length,
      pending: this.tasks.filter((t) => t.status === "pending").length,
      completed: this.tasks.filter((t) => t.status === "completed").length,
      inProgress: this.tasks.filter((t) => t.status === "in-progress").length,
    };
  }

  export() {
    return JSON.stringify({ version: this.version, tasks: this.tasks }, null, 2);
  }

  import(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.version !== this.version) {
      throw new Error(`Version mismatch: expected ${this.version}, got ${data.version}`);
    }
    this.tasks = data.tasks;
    return true;
  }
}

module.exports = { TaskStore };
