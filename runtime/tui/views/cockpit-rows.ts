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
  const completed = tasks.filter((task) => task.status === "completed" || task.status === "done").length;
  const running = tasks.filter((task) => task.status === "running").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const agents = selectActiveAgents(state, projectId).length;
  const attention = selectPendingAttention(state, projectId).length;
  const health = selectRunsByStatus(state, "failed").some((run) => run.projectId === projectId) ? "failed" : "ok";
  return Object.freeze({ id: projectId, fields: Object.freeze([health, formatProgress(completed, tasks.length), agents, running, blocked, attention, project.autopilotPolicy || "N/A"]) });
}
