"use strict";

const { familyOf } = require("./event-families");

function field(condition, name) {
  if (!condition) throw new TypeError(`RuntimeEvent.${name} is invalid`);
}

function validateRuntimeEvent(event) {
  field(event && typeof event === "object" && !Array.isArray(event), "event");
  field(event.version === 2, "version");
  field(Number.isInteger(event.epoch) && event.epoch > 0, "epoch");
  field(Number.isInteger(event.seq) && event.seq > 0, "seq");
  field(typeof event.type === "string" && event.type.length > 0, "type");
  familyOf(event.type);
  field(typeof event.timestamp === "string" && !Number.isNaN(Date.parse(event.timestamp)), "timestamp");
  field(event.payload && typeof event.payload === "object" && !Array.isArray(event.payload), "payload");
  for (const name of ["projectId", "missionId", "taskId"]) {
    field(event[name] === undefined || (typeof event[name] === "string" && event[name].length > 0), name);
  }
  return event;
}

function freezeRuntimeEvent(event) {
  validateRuntimeEvent(event);
  if (event.payload?.data && typeof event.payload.data === "object") Object.freeze(event.payload.data);
  Object.freeze(event.payload);
  return Object.freeze(event);
}

async function toRuntimeEvent(legacy, options = {}) {
  field(legacy && typeof legacy === "object", "legacy");
  const context = legacy.runId && typeof options.resolveContext === "function"
    ? await options.resolveContext(legacy.runId).catch(() => undefined)
    : undefined;
  const data = legacy.data && typeof legacy.data === "object" ? legacy.data : {};
  const projectId = context?.projectId || data.projectId;
  const missionId = context?.missionId || data.missionId;
  const taskId = context?.taskId || data.taskId;
  return freezeRuntimeEvent({
    version: 2,
    epoch: options.epoch,
    seq: options.seq,
    type: legacy.type,
    ...(projectId ? { projectId } : {}),
    ...(missionId ? { missionId } : {}),
    ...(taskId ? { taskId } : {}),
    timestamp: legacy.occurredAt,
    payload: { data: legacy.data, legacyId: legacy.id }
  });
}

module.exports = { freezeRuntimeEvent, toRuntimeEvent, validateRuntimeEvent };
