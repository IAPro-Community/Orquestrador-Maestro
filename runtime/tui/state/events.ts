import type { RuntimeAction } from "./actions.ts";

const FAMILIES = new Set(["runtime", "project", "mission", "plan", "task", "run", "agent", "terminal", "verification", "attention", "skill"]);
const ENTITY_KEY: Readonly<Record<string, string>> = Object.freeze({
  task: "taskId", run: "runId", agent: "id", terminal: "id", attention: "id", project: "id",
  mission: "id", plan: "id", verification: "id", skill: "id"
});

function failureAction(type: string, family: string, raw: Record<string, unknown>, error: string): RuntimeAction {
  return Object.freeze({
    source: "runtime-event", family, type, epoch: String(raw.epoch || ""), seq: Number(raw.seq || 0),
    timestamp: String(raw.timestamp || ""), payload: {}, kind: "normalization-failure", error
  });
}

export function normalizeEvent(raw: unknown): RuntimeAction {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return failureAction("invalid", "unknown", {}, "event must be an object");
  const record = raw as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "invalid";
  const rawFamily = type.split(".")[0];
  const family = rawFamily === "agentSession" ? "agent" : rawFamily;
  const epoch = typeof record.epoch === "string" || typeof record.epoch === "number" ? String(record.epoch) : "";
  const seq = typeof record.seq === "number" ? record.seq : Number.NaN;
  const envelopePayload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
    ? record.payload as Record<string, unknown> : {};
  const data = envelopePayload.data && typeof envelopePayload.data === "object" && !Array.isArray(envelopePayload.data)
    ? envelopePayload.data as Record<string, unknown> : envelopePayload;
  const payload: Record<string, unknown> = {
    ...data,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    ...(record.missionId ? { missionId: record.missionId } : {}),
    ...(record.taskId ? { taskId: record.taskId } : {}),
    ...(family === "mission" && record.missionId && data.id === undefined ? { id: record.missionId } : {}),
    ...(family === "task" && record.taskId && data.taskId === undefined ? { taskId: record.taskId } : {})
  };
  if (family === "agent" && payload.id === undefined && typeof payload.terminalId === "string") payload.id = payload.terminalId;
  if (family === "run" && payload.runId === undefined && typeof payload.id === "string") payload.runId = payload.id;
  if (family === "verification" && payload.id === undefined && typeof payload.runId === "string") payload.id = payload.runId;
  if (payload.status === undefined) {
    if (type.endsWith(".active") || type.endsWith(".started")) payload.status = family === "verification" ? "verifying" : family === "run" ? "running" : "active";
    else if (type.endsWith(".failed")) payload.status = "failed";
  }
  if (!FAMILIES.has(family)) {
    return Object.freeze({ source: "runtime-event", family, type, epoch, seq: Number.isFinite(seq) ? seq : 0,
      timestamp: String(record.timestamp || ""), payload, kind: "unknown-event", dropped: true });
  }
  if (!epoch || !Number.isFinite(seq)) return failureAction(type, family, record, "epoch and seq are required");
  const required = ENTITY_KEY[family];
  if (required && payload[required] === undefined) return failureAction(type, family, record, `${required} is required`);
  return Object.freeze({
    source: "runtime-event", family, type, epoch, seq, timestamp: String(record.timestamp || ""), payload,
    ...(seq <= 0 ? { nonMonotonic: true } : {})
  });
}

export function isUnknownEvent(action: RuntimeAction): boolean { return action.kind === "unknown-event"; }
