"use strict";

const { buildSnapshot, eventsSince } = require("../events/epoch-sequencer");
const { familyOf } = require("../events/event-families");

const PROTOCOL_VERSION = 2;
const REJECTION_REASONS = new Set(["gate.required", "not_running", "double_confirm", "offline", "invalid_payload", "deprecated"]);

function protocolMismatchError(supported = [PROTOCOL_VERSION]) {
  const error = new Error(`Unsupported Maestro protocol version; supported: ${supported.join(", ")}`);
  error.code = "PROTOCOL_MISMATCH";
  error.supportedProtocolVersions = [...supported];
  return error;
}

function parseLine(line) {
  if (typeof line !== "string") throw new TypeError("Protocol line must be a string");
  const message = JSON.parse(line);
  if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.kind !== "string") throw new TypeError("Protocol message.kind is required");
  return message;
}

function createProtocolV2Server({ runtime, store = runtime?.store, epoch = 1, serverInfo = {} } = {}) {
  if (!store || typeof store.listEvents !== "function") throw new TypeError("A runtime store is required");
  const listeners = new Set();
  let closed = false;
  let subscriptions = null;
  let delivery = Promise.resolve();

  const unsubscribeRuntime = typeof runtime?.subscribe === "function" ? runtime.subscribe((legacy) => {
    delivery = delivery.then(async () => {
      if (closed) return;
      const snapshot = await buildSnapshot({ store, epoch });
      const family = familyOf(legacy.type);
      if (subscriptions && !subscriptions.has(family)) return;
      const entry = snapshot.streams[family]?.find((event) => event.payload.legacyId === legacy.id);
      if (!entry) return;
      const frame = Object.freeze({ kind: "event", seq: entry.seq, epoch, family, entry });
      for (const listener of listeners) listener(frame);
    }).catch(() => undefined);
  }) : null;

  async function snapshot(streams) {
    const result = await buildSnapshot({ store, epoch, streams });
    return { kind: "snapshot", ...result };
  }

  async function action(message) {
    if (!message.requestId || typeof message.type !== "string" || !message.payload || typeof message.payload !== "object") {
      return { kind: "action.rejected", requestId: message.requestId, ok: false, reason: "invalid_payload" };
    }
    try {
      let result;
      if (typeof runtime?.action === "function") result = await runtime.action({ type: message.type, payload: message.payload, requestId: message.requestId });
      else {
        const methodByType = {
          "project.inspect": "inspectProject", "projects.list": "listProjects", "missions.list": "listMissions", "mission.create": "createMission", "mission.update": "updateMission",
          "runs.list": "listRuns", "run.create": "createRun", "run.execute": "executeRun", "run.cancel": "cancelRun",
          "providers.list": "listProviders", "terminals.list": "listTerminalSessions", "terminal.create": "createTerminalSession",
          "terminal.close": "closeTerminalSession", "terminal.attach": "attachTerminalSession", "terminal.focus": "focusTerminalSession",
          "terminal.input": "inputTerminalSession", "terminal.resize": "resizeTerminalSession", "terminal.snapshot": "snapshotTerminalSession"
        };
        if (message.type === "skills.list" && typeof runtime?.skills?.list === "function") result = runtime.skills.list();
        else if (message.type === "attention.resolve" && typeof runtime?.attention?.resolve === "function") {
          const { attentionId, decision, ...options } = message.payload; result = await runtime.attention.resolve(attentionId, { decision, ...options });
        }
        else {
          const method = methodByType[message.type];
          if (!method || typeof runtime?.[method] !== "function") throw Object.assign(new Error("Action is deprecated"), { reason: "deprecated" });
          if (message.type === "mission.update") {
            const { missionId, ...patch } = message.payload; result = await runtime[method](missionId, patch);
          } else if (["run.cancel"].includes(message.type)) result = await runtime[method](message.payload.runId);
          else if (["terminal.close", "terminal.attach", "terminal.focus"].includes(message.type)) result = await runtime[method](message.payload.terminalId);
          else if (message.type === "terminal.input") result = await runtime[method](message.payload.terminalId, message.payload.input);
          else if (message.type === "terminal.resize") result = await runtime[method](message.payload.terminalId, message.payload.columns, message.payload.rows);
          else if (message.type === "terminal.snapshot") result = await runtime[method](message.payload.terminalId, message.payload.afterSequence || 0);
          else result = await runtime[method](message.payload);
        }
      }
      if (result?.ok === false) return { kind: "action.rejected", requestId: message.requestId, ok: false, reason: REJECTION_REASONS.has(result.reason) ? result.reason : "invalid_payload" };
      return { kind: "action.validated", requestId: message.requestId, ok: true, result: result?.result ?? result };
    } catch (error) {
      const reason = REJECTION_REASONS.has(error?.reason) ? error.reason : "invalid_payload";
      return { kind: "action.rejected", requestId: message.requestId, ok: false, reason };
    }
  }

  async function handleLine(line) {
    let message;
    try { message = parseLine(line); } catch (error) { return [{ kind: "error", code: "invalid_payload", message: error.message }]; }
    switch (message.kind) {
      case "hello":
        if (message.protocolVersion !== PROTOCOL_VERSION) return [{ kind: "hello.error", ok: false, code: "PROTOCOL_MISMATCH", supportedProtocolVersions: [PROTOCOL_VERSION] }];
        return [{ kind: "hello.ack", protocolVersion: PROTOCOL_VERSION, serverInfo, epoch }];
      case "snapshot.request": return [await snapshot(message.streams)];
      case "streams.subscribe": subscriptions = Array.isArray(message.streams) && message.streams.length ? new Set(message.streams) : null; return [{ kind: "streams.subscribed", streams: subscriptions ? [...subscriptions] : [] }];
      case "streams.unsubscribe": {
        if (!subscriptions) subscriptions = new Set();
        for (const family of message.streams || []) subscriptions.delete(family);
        return [{ kind: "streams.unsubscribed", streams: message.streams || [] }];
      }
      case "resume": {
        if (message.epoch !== epoch) return [{ kind: "resume.rejected", reason: "epoch_mismatch", epoch }];
        const result = await eventsSince({ store, epoch, cursor: { epoch, perStream: message.cursor || {} } });
        return [{ kind: "resume.result", epoch, cursor: result.nextCursor.perStream, events: result.events.map((entry) => ({ kind: "event", seq: entry.seq, epoch, family: familyOf(entry.type), entry })) }];
      }
      case "action": return [await action(message)];
      case "ping": return [{ kind: "pong", ts: message.ts }];
      default: return [{ kind: "error", code: "invalid_payload", message: `Unknown message kind: ${message.kind}` }];
    }
  }

  return Object.freeze({
    handleLine,
    subscribe(listener) { if (typeof listener !== "function") throw new TypeError("listener must be a function"); listeners.add(listener); return () => listeners.delete(listener); },
    snapshot,
    close() { closed = true; listeners.clear(); if (typeof unsubscribeRuntime === "function") unsubscribeRuntime(); }
  });
}

module.exports = { PROTOCOL_VERSION, REJECTION_REASONS, createProtocolV2Server, protocolMismatchError };
