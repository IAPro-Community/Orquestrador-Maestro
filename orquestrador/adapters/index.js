#!/usr/bin/env node
"use strict";

const DEFAULT_OBSERVATION_TYPE_MAP = {
  tool_use: "implementation",
  file_edit: "implementation",
  file_create: "implementation",
  file_delete: "implementation",
  edit: "implementation",
  write: "implementation",

  command_execute: "attempt",
  shell: "attempt",
  bash: "attempt",

  error: "problem",

  decision: "decision",
  discovery: "discovery"
};

class Adapter {
  constructor(name, options = {}) {
    this.name = name;
    this.memory = options.memory;
    this.projectId = options.projectId;
    this.projectRoot = options.projectRoot || null;
    this.gitContext = options.gitContext || null;
    this.taskId = options.taskId || null;
  }

  shouldRecord(event) {
    if (!event || !event.type) return false;

    const noisyTypes = new Set([
      "read", "grep", "glob", "ls", "pwd", "cat", "search"
    ]);

    if (noisyTypes.has(event.type)) return false;

    // Default-deny: only mapped types are recorded. Unknown event types
    // are dropped instead of spamming memory (subclasses with their own
    // allow-list, e.g. FreebuffAdapter, are unaffected).
    return Object.hasOwn(DEFAULT_OBSERVATION_TYPE_MAP, event.type);
  }

  normalizeEvent(rawEvent) {
    throw new Error("normalizeEvent must be implemented by subclass");
  }

  record(normalizedEvent) {
    if (!this.memory || !this.projectId) return null;

    const opts = {};
    if (this.projectRoot) opts.projectRoot = this.projectRoot;
    if (this.gitContext) opts.gitContext = this.gitContext;
    if (this.taskId && !normalizedEvent.taskId) normalizedEvent.taskId = this.taskId;

    // Agent pipelines must not crash on rejected observations, but only
    // on *rejections* (the exact validation/policy messages below). IO,
    // lock and programmer errors are re-thrown: silent data loss is worse
    // than a loud pipeline failure.
    try {
      const obs = this.memory.record(this.projectId, normalizedEvent, opts);
      return obs;
    } catch (err) {
      const msg = err && err.message ? err.message : "";
      if (/Private content|cannot be persisted|prompt injection|Invalid (schemaVersion|observation|scope)|Summary (is required|must be)|Project is required|No valid observations|Cannot consolidate/i.test(msg)) {
        return null;
      }
      throw err;
    }
  }

  processEvent(rawEvent) {
    if (!rawEvent || typeof rawEvent !== "object") return null;
    if (!this.shouldRecord(rawEvent)) return null;

    const normalized = this.normalizeEvent(rawEvent);
    return this.record(normalized);
  }
}

class ClaudeAdapter extends Adapter {
  constructor(options = {}) {
    super("claude", options);
  }

  normalizeEvent(rawEvent) {
    return {
      type: DEFAULT_OBSERVATION_TYPE_MAP[rawEvent.type] || "discovery",
      summary: rawEvent.summary ?? rawEvent.description ?? `${rawEvent.type} event`,
      details: rawEvent.details || rawEvent.content || null,
      files: rawEvent.files || (rawEvent.file_path ? [rawEvent.file_path] : []),
      tags: rawEvent.tags || [this.name, rawEvent.type],
      source: {
        tool: this.name,
        session: rawEvent.session_id,
        commit: rawEvent.commit
      }
    };
  }
}

class CodexAdapter extends Adapter {
  constructor(options = {}) {
    super("codex", options);
  }

  normalizeEvent(rawEvent) {
    return {
      type: DEFAULT_OBSERVATION_TYPE_MAP[rawEvent.type] || "discovery",
      summary: rawEvent.summary || `${rawEvent.type} operation`,
      details: rawEvent.details || rawEvent.command || null,
      files: rawEvent.files || (rawEvent.file_path ? [rawEvent.file_path] : []),
      tags: rawEvent.tags || [this.name, rawEvent.type],
      source: {
        tool: this.name,
        session: rawEvent.session_id,
        commit: rawEvent.commit
      }
    };
  }
}

class OpenCodeAdapter extends Adapter {
  constructor(options = {}) {
    super("opencode", options);
  }

  normalizeEvent(rawEvent) {
    return {
      type: DEFAULT_OBSERVATION_TYPE_MAP[rawEvent.type] || "discovery",
      summary: rawEvent.summary || `${rawEvent.type} operation`,
      details: rawEvent.details || rawEvent.command || null,
      files: rawEvent.files || (rawEvent.filePath ? [rawEvent.filePath] : []),
      tags: rawEvent.tags || [this.name, rawEvent.type],
      source: {
        tool: this.name,
        session: rawEvent.session_id,
        commit: rawEvent.commit
      }
    };
  }
}

class FreebuffAdapter extends Adapter {
  constructor(options = {}) {
    super("freebuff", options);
  }

  shouldRecord(event) {
    if (!event || !event.type) return false;
    return new Set(["tool_call", "tool_result", "subagent_start", "subagent_finish", "error"]).has(event.type);
  }

  normalizeEvent(rawEvent) {
    const input = rawEvent.input || rawEvent.args || null;
    const output = rawEvent.output || rawEvent.result || null;
    const toolName = rawEvent.tool_name || rawEvent.toolName || rawEvent.name || "tool";
    const summary = rawEvent.summary || rawEvent.description ||
      (rawEvent.type === "subagent_start" ? `Started subagent ${toolName}` :
        rawEvent.type === "subagent_finish" ? `Finished subagent ${toolName}` :
          `${toolName} ${rawEvent.type.replace(/_/g, " ")}`);
    const detailsValue = rawEvent.details || rawEvent.content || rawEvent.error || output || input;
    const details = detailsValue && typeof detailsValue === "object" ? JSON.stringify(detailsValue) : detailsValue || null;
    const files = rawEvent.files || [
      rawEvent.file_path,
      rawEvent.filePath,
      rawEvent.path,
      input && (input.file_path || input.filePath || input.path)
    ].filter(Boolean);

    return {
      type: rawEvent.type === "error" ? "problem" : rawEvent.type.startsWith("subagent_") ? "discovery" : "implementation",
      summary,
      details,
      files,
      tags: rawEvent.tags || [this.name, rawEvent.type, toolName],
      source: {
        tool: this.name,
        session: rawEvent.session_id || rawEvent.sessionId,
        commit: rawEvent.commit
      }
    };
  }
}

class GenericAdapter extends Adapter {
  constructor(options = {}) {
    super(options.name || "generic", options);
  }

  normalizeEvent(rawEvent) {
    return {
      type: DEFAULT_OBSERVATION_TYPE_MAP[rawEvent.type] || "discovery",
      summary: rawEvent.summary || rawEvent.description || "Event captured",
      details: rawEvent.details || null,
      files: rawEvent.files || [],
      tags: rawEvent.tags || [this.name],
      source: {
        tool: this.name,
        session: rawEvent.session_id,
        commit: rawEvent.commit
      }
    };
  }
}

function createAdapter(toolName, options = {}) {
  switch (toolName.toLowerCase()) {
    case "claude":
      return new ClaudeAdapter(options);
    case "codex":
      return new CodexAdapter(options);
    case "opencode":
      return new OpenCodeAdapter(options);
    case "freebuff":
      return new FreebuffAdapter(options);
    default:
      return new GenericAdapter({ ...options, name: toolName });
  }
}

module.exports = {
  Adapter,
  ClaudeAdapter,
  CodexAdapter,
  OpenCodeAdapter,
  FreebuffAdapter,
  GenericAdapter,
  createAdapter,
  DEFAULT_OBSERVATION_TYPE_MAP
};
