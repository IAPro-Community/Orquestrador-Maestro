"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadLock, resolveLockPath, resolveStatePath } = require("../../orquestrador/bin/workflow-utils");
const { validateState } = require("../../orquestrador/bin/workflow-state");
const { projectIdForPath } = require("../application/maestro-application");
const { projectProgress } = require("../progress");
const { resolveInteractionProfile } = require("../interaction");

function readState(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (error) { throw new Error(`State inválido: ${filePath} (${error.message})`); }
}
function stateFiles(projectRoot) {
  const root = path.join(projectRoot, ".local", "orquestrador", "workflow-state");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((name) => name.endsWith(".json")).map((name) => path.join(root, name));
}
function statusFromFiles({ projectRoot, taskId, lockfile } = {}) {
  if (taskId || lockfile) {
    const lockPath = lockfile ? resolveLockPath(projectRoot, lockfile, taskId || "task/placeholder").absolute : null;
    const lock = lockPath ? loadLock(lockPath) : loadLock(resolveLockPath(projectRoot, undefined, taskId).absolute);
    const statePath = resolveStatePath(projectRoot, taskId || lock.taskId).absolute;
    const state = readState(statePath); validateState(state, lock);
    return { state, lock, inferred: false };
  }
  const candidates = stateFiles(projectRoot).map((filePath) => ({ filePath, state: readState(filePath) })).filter(({ state }) => state.status !== "completed" && state.status !== "cancelled");
  candidates.sort((a, b) => String(b.state.updatedAt || b.state.history?.at(-1)?.at || fs.statSync(b.filePath).mtimeMs).localeCompare(String(a.state.updatedAt || a.state.history?.at(-1)?.at || fs.statSync(a.filePath).mtimeMs)) || a.state.taskId.localeCompare(b.state.taskId));
  if (!candidates[0]) return null;
  const state = candidates[0].state;
  const lock = loadLock(resolveLockPath(projectRoot, state.lockfile, state.taskId).absolute);
  validateState(state, lock);
  return { state, lock, inferred: true };
}

async function resolveStatus({ projectRoot = process.cwd(), taskId, lockfile, application } = {}) {
  const explicit = statusFromFiles({ projectRoot, taskId, lockfile });
  let context = explicit;
  let warning;
  if (!context) {
    const project = application ? await application.inspectProject({ projectPath: projectRoot }) : null;
    const runs = application ? await application.listRuns({ projectId: project?.id || projectIdForPath(projectRoot) }) : [];
    const missions = application ? await application.listMissions({ projectId: project?.id || projectIdForPath(projectRoot) }) : [];
    const latestMission = missions.filter((item) => item.status !== "completed" && item.status !== "cancelled").sort((a, b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)) || b.id.localeCompare(a.id))[0];
    const latestRun = runs.sort((a, b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)) || b.id.localeCompare(a.id))[0];
    if (latestMission?.metadata?.workflowState && latestMission.metadata.workflowLock) context = { state: latestMission.metadata.workflowState, lock: latestMission.metadata.workflowLock, inferred: true };
    else if (latestRun?.metadata?.workflowState && latestRun.metadata.workflowLock) context = { state: latestRun.metadata.workflowState, lock: latestRun.metadata.workflowLock, inferred: true };
    if (context) warning = "Contexto de workflow inferido a partir do trabalho mais recente.";
  } else if (context.inferred) warning = "Contexto de workflow ativo inferido a partir do state mais recente.";
  if (!context) return { status: "idle", taskId: undefined, workflow: undefined, inferred: false, warning: undefined, interaction: resolveInteractionProfile({ cwd: projectRoot }) };
  const interaction = resolveInteractionProfile({ cwd: projectRoot });
  const projection = projectProgress({ workflowState: context.state, workflowLock: context.lock, runState: context.state.run || {}, agents: [], interactionProfile: interaction });
  return { ...projection, inferred: Boolean(context.inferred), ...(warning ? { warning } : {}) };
}

function formatStatus(status) {
  if (status.status === "idle") return "Maestro\n\nStatus       idle\nNenhum trabalho encontrado";
  const lines = ["Maestro", "", `Workflow     ${status.workflow}`, `Phase        ${status.phase.id}`, `Progress     ${status.completed} / ${status.total}`, `Agent        ${status.current.agent || "—"}`, `Interaction  ${status.interaction.id}`, "", "Current", `  ${status.current.title}`, "", "Last completed", `  ${status.lastCompleted?.title || "none"}`, "", "Next", `  ${status.next?.title || "none"}`, "", "Blockers", `  ${status.blockers.length ? status.blockers.join(", ") : "none"}`];
  if (status.warning) lines.push("", `Warning      ${status.warning}`);
  return lines.join("\n");
}

module.exports = { formatStatus, resolveStatus, statusFromFiles };
