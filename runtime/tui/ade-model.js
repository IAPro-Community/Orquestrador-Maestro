"use strict";

const PROVIDERS = Object.freeze([
  { id: "codex", name: "Codex", color: "cyan" },
  { id: "claude", name: "Claude", color: "orange" },
  { id: "opencode", name: "OpenCode", color: "lime" },
  { id: "agy", name: "Agy", color: "violet" }
]);

function clampSelection(index, count) {
  if (!count) return 0;
  return Math.max(0, Math.min(Number.isInteger(index) ? index : 0, count - 1));
}

function pageForSelection(index, pageSize = 6) {
  return Math.floor(clampSelection(index, Number.MAX_SAFE_INTEGER) / pageSize);
}

function cockpitLayout(columns, rows, maximized = false) {
  if (maximized) return Object.freeze({ mode: "maximized", sidebarWidth: 0, visiblePanels: 1, outputLines: Math.max(8, rows - 10) });
  if (columns < 80) return Object.freeze({ mode: "compact", sidebarWidth: 0, visiblePanels: 1, outputLines: Math.max(6, rows - 13) });
  if (columns < 120) return Object.freeze({ mode: "medium", sidebarWidth: 24, visiblePanels: 4, outputLines: Math.max(5, Math.floor((rows - 12) / 2) - 4) });
  return Object.freeze({ mode: "wide", sidebarWidth: 28, visiblePanels: 6, outputLines: Math.max(5, Math.floor((rows - 12) / 2) - 4) });
}

function visibleSessions(sessions, selected, layout) {
  if (!sessions.length) return [];
  const safe = clampSelection(selected, sessions.length);
  if (layout.visiblePanels === 1) return [sessions[safe]];
  const page = pageForSelection(safe, layout.visiblePanels);
  return sessions.slice(page * layout.visiblePanels, page * layout.visiblePanels + layout.visiblePanels);
}

function missionState(mission) {
  if (!mission) return "sem missão";
  return ({ draft: "rascunho", planning: "planejando", awaiting_approval: "aguardando autorização", running: "ativa", verifying: "verificando", consolidating: "consolidando", completed: "concluída", failed: "falhou", blocked: "bloqueada", cancelled: "cancelada" })[mission.status] || mission.status;
}

function isInteractiveSession(session) {
  return Boolean(session && session.backend === "pty" && ["active", "running"].includes(session.status));
}

function canStartMission(mission) {
  return Boolean(mission && ["draft", "planning", "awaiting_approval", "blocked"].includes(mission.status));
}

function firstInteractiveIndex(sessions) {
  const index = sessions.findIndex(isInteractiveSession);
  return index < 0 ? 0 : index;
}

function primaryAction(mission, session, sessions = []) {
  if (!mission) return "M  Criar e iniciar a primeira missão";
  if (canStartMission(mission)) return "R  Iniciar esta missão";
  if (["completed", "failed", "cancelled"].includes(mission.status)) return "M  Criar uma nova missão";
  if (!sessions.some(isInteractiveSession)) return "A  Adicionar o agente piloto";
  if (isInteractiveSession(session)) return "Enter  Interagir com o painel selecionado";
  return "1–6  Selecionar um painel ativo";
}

function cockpitShortcut(key = {}, { textInput = false } = {}) {
  const name = String(key.name || "").toLowerCase();
  if (key.ctrl && name === "c") return "quit";
  if (key.ctrl && name === "k") return "palette";
  if (key.ctrl && name === "p") return "projects";
  if (key.ctrl && name === "m") return "missions";
  if (textInput) return null;
  return ({ q: "quit", a: "agent", n: "agent", m: "mission", s: "shell", x: "close", f: "maximize" })[name] || null;
}

function terminalInputForKey(key = {}) {
  const name = String(key.name || "").toLowerCase();
  if (key.ctrl && /^[a-z]$/u.test(name)) return String.fromCharCode(name.charCodeAt(0) - 96);
  const controls = {
    return: "\r", enter: "\r", backspace: "\x7f", tab: "\t", escape: "\x1b", space: " ",
    up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D",
    home: "\x1b[H", end: "\x1b[F", delete: "\x1b[3~", insert: "\x1b[2~",
    pageup: "\x1b[5~", pagedown: "\x1b[6~"
  };
  if (Object.hasOwn(controls, name)) return controls[name];
  if (typeof key.sequence === "string" && key.sequence.length > 0) return key.sequence;
  if (typeof key.raw === "string" && key.raw.length > 0) return key.raw;
  return null;
}

module.exports = { PROVIDERS, canStartMission, clampSelection, cockpitLayout, cockpitShortcut, firstInteractiveIndex, isInteractiveSession, missionState, pageForSelection, primaryAction, terminalInputForKey, visibleSessions };
