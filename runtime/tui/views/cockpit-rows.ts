import { selectActiveAgents, selectPendingAttention, selectRunsByStatus, selectTasksByMission } from "../state/selectors.ts";
import type { TuiState } from "../state/types.ts";
import type { Row } from "./model.ts";

export function formatProgress(done: number, total: number): string { return total <= 0 ? "—" : `${done}/${total} · ${Math.round((done / total) * 100)}%`; }
export function truncate(value: string, width: number): string {
  if (width <= 0 || value.length <= width) return value; if (width < 2) return value.slice(0, width);
  const candidate = value.slice(0, Math.max(1, width - 1)); const word = candidate.lastIndexOf(" "); return `${candidate.slice(0, word >= 2 ? word : candidate.length)}…`;
}
export function projectSummaryRow(state: TuiState, projectId: string): Row {
  const project = state.projectsById.byId[projectId] || { id: projectId };
  const tasks = Object.values(state.tasksById.byId).filter((task) => task.projectId === projectId);
  const taskState = (task: Record<string, unknown>) => String(task.state || task.resolutionState || task.status || "");
  const completed = tasks.filter((task) => ["validated", "completed", "done"].includes(taskState(task))).length;
  const running = tasks.filter((task) => ["running", "verifying"].includes(taskState(task))).length;
  const blocked = tasks.filter((task) => ["blocked", "failed", "needs_attention"].includes(taskState(task))).length;
  const agents = selectActiveAgents(state, projectId).length;
  const attention = selectPendingAttention(state, projectId).length;
  const health = tasks.some((task) => taskState(task) === "needs_attention") ? "needs_attention"
    : tasks.some((task) => ["blocked", "failed"].includes(taskState(task))) || selectRunsByStatus(state, "failed").some((run) => run.projectId === projectId) ? "failed"
      : tasks.length > 0 && tasks.every((task) => taskState(task) === "validated") ? "validated" : "ok";
  const latestResolution = [...tasks].reverse().find((task) => task.strategy || task.state || task.resolutionState);
  const verification = latestResolution
    ? Object.values(state.verificationsById.byId).find((entry) => entry.taskId === latestResolution.id)
    : undefined;
  const resolution = latestResolution
    ? [
        String(latestResolution.state || latestResolution.resolutionState || latestResolution.status || "running"),
        latestResolution.strategy ? String(latestResolution.strategy) : "",
        Number.isFinite(Number(latestResolution.contextTokens)) ? `ctx ${latestResolution.contextTokens}` : "",
        Number.isFinite(Number(latestResolution.evidenceSelected)) ? `ev ${latestResolution.evidenceSelected}/${latestResolution.evidenceCandidates ?? "?"}` : "",
        Number.isFinite(Number(latestResolution.escalationMax)) ? `esc ${latestResolution.escalationCount ?? 0}/${latestResolution.escalationMax}` : "",
        verification?.status ? String(verification.status) : ""
      ].filter(Boolean).join(" · ")
    : project.autopilotPolicy || "N/A";
  return Object.freeze({ id: projectId, fields: Object.freeze([health, formatProgress(completed, tasks.length), agents, running, blocked, attention, resolution]) });
}
