import { selectAllProjects, selectBusyOperations, selectConnection, selectPendingAttention } from "../state/selectors.ts";
import type { TuiState } from "../state/types.ts";
import { section, type Row, type Section } from "./model.ts";
import { projectSummaryRow } from "./cockpit-rows.ts";

const na = (id: string, text = "N/A"): Row => Object.freeze({ id, fields: Object.freeze([text]) });
export function cockpitModel(state: TuiState): Section[] {
  const projects = selectAllProjects(state);
  const attention = selectPendingAttention(state);
  const tasks = Object.values(state.tasksById.byId);
  const counts = { running: 0, ready: 0, blocked: 0, human: attention.length, verify: 0, failed: 0 };
  for (const task of tasks) { const status = String(task.status || ""); if (status === "verifying") counts.verify += 1; else if (status in counts) counts[status as keyof typeof counts] += 1; }
  const connection = selectConnection(state);
  const runningRows = projects.length ? projects.map((project) => projectSummaryRow(state, project.id)) : [na("none", "Nenhum projeto em execução")];
  const attentionRows = attention.length ? attention.map((entry) => Object.freeze({ id: entry.id, fields: Object.freeze([entry.severity || "medium", entry.title || entry.message || entry.id]) })) : [na("none", "Nenhuma decisão pendente")];
  const overview: Row = Object.freeze({ id: "totals", fields: Object.freeze(Object.entries(counts).flatMap(([key, value]) => [key, value])) });
  const health: Row = Object.freeze({ id: "connection", fields: Object.freeze([connection.kind, connection.epoch || "N/A", connection.retries || 0, selectBusyOperations(state).length]) });
  return Object.freeze([
    section("cockpit", "RUNNING PROJECTS", runningRows), section("global-attention", "GLOBAL ATTENTION", attentionRows),
    section("recent-activity", "RECENT ACTIVITY", [na("activity", "N/A")]), section("execution-overview", "EXECUTION OVERVIEW", [overview]),
    section("runtime-health", "RUNTIME HEALTH", [health])
  ]) as unknown as Section[];
}
