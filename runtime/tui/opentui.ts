import path from "node:path"
import fs from "node:fs"
import {
  createCliRenderer, BoxRenderable, InputRenderable, InputRenderableEvents,
  SelectRenderable, SelectRenderableEvents, TabSelectRenderable, TabSelectRenderableEvents, TextRenderable
} from "@opentui/core"
import { providerColor, statusColor, theme } from "./ade-theme"
import { normalizeEvent } from "./state/events.ts"
import { createTuiStore } from "./state/store.ts"
import { tabStatus } from "./shell/tabs-status.ts"
import { attentionCenter } from "./attention/attention-center.ts"
import { attentionReducer, createAttentionState, type AttentionItem } from "./attention/attention-state.ts"
import { createGateState, gateModalModel, gateReducer } from "./views/gate-modal.ts"
import { createNotificationState, notificationReducer } from "./notifications/notification-state.ts"
import { toastRegion } from "./notifications/toast-region.ts"
import { buildWorkspaceTabs, isCockpitTab, railVisibility, primaryWorkspaceSurface } from "./shell/navigation-model.ts"

const { MaestroApplication } = require("../application")
const { runtimePaths } = require("../bridge/socket-server")
const { LocalMaestroClient } = require("../client/maestro-client")
const { SocketMaestroClient } = require("../client/socket-maestro-client")
const { createRegistry } = require("./commands/registry")
const { paletteModel, selectResult } = require("./commands/palette")
const { explorerModel } = require("./views/skills-explorer")
const { initialSkillsState, skillsReducer } = require("./skills/skills-state")
const { resolveAction } = require("./shell/terminal-actions")
const { resolveStatus } = require("../status")
const { resolveInteractionProfile, setInteractionProfile } = require("../interaction")
const { ScrollbackRing } = require("./shell/scrollback")
const { projectTerminals } = require("./views/terminal-layouts")
const { NORMAL_MODE, enterInput, exitInput } = require("./views/terminal-mouse")
const { PROVIDERS, canStartMission, clampSelection, cockpitLayout, cockpitShortcut, firstInteractiveIndex, isInteractiveSession, missionState, primaryAction, terminalInputForKey, visibleSessions } = require("./ade-model")

type Project = {
  id: string; name: string; path: string; status: string;
  verification?: { status?: string };
  resolution?: {
    state?: string; strategy?: string; mode?: string;
    budget?: { tier?: string; contextTokens?: number };
    evidence?: { candidates?: number; selected?: unknown[]; budgetOverflow?: boolean };
    escalation?: { count?: number; max?: number };
    outcome?: { state?: string; reason?: string }
  }
}
type Session = { id: string; label: string; kind: string; providerId?: string; backend: string; workspacePath: string; sourceWorkspacePath?: string; status: string; startedAt?: string; missionId?: string; role?: string; isolation?: string }
type Mission = { id: string; objective: string; status: string; mode: string; startedAt?: string; plan?: { tasks?: unknown[]; blockers?: unknown[] } }
type Wizard = "none" | "agent" | "mission" | "shell" | "palette" | "search"
type Surface = "cockpit" | "project" | "skills" | "attention"

function argument(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined }
function age(timestamp?: string) {
  if (!timestamp) return "—"
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60); return minutes < 60 ? `${minutes}min` : `${Math.floor(minutes / 60)}h${minutes % 60}m`
}
function shortPath(value: string, source?: string) {
  if (source && value !== source) return `worktree · ${path.basename(value)}`
  return value.length > 46 ? `…${value.slice(-45)}` : value
}
function cleanLines(lines: string[], count: number) { return (lines || []).slice(-count).join("\n").trimEnd() || "Aguardando saída do terminal…" }
function severityOf(value: unknown) {
  const severity = String(value || "INFO").toUpperCase()
  return severity === "CRITICAL" ? "CRITICAL" : severity === "HIGH" || severity === "ATTENTION" ? "ATTENTION" : severity === "MEDIUM" || severity === "WARNING" ? "WARNING" : "INFO"
}
function attentionItem(payload: any): AttentionItem {
  return Object.freeze({
    id: String(payload.id || payload.attentionId), projectId: String(payload.projectId || "global"),
    ...(payload.missionId ? { missionId: String(payload.missionId) } : {}), ...(payload.taskId ? { taskId: String(payload.taskId) } : {}),
    type: String(payload.type || "DECISION").toUpperCase() as AttentionItem["type"], severity: severityOf(payload.severity) as AttentionItem["severity"],
    status: String(payload.status || "PENDING").toUpperCase(), title: String(payload.title || payload.reason || "Intervenção necessária"),
    reason: String(payload.reason || "Decisão humana necessária."), impact: String(payload.impact || "A execução permanece aguardando."),
    evidence: payload.evidence || [], recommendation: String(payload.recommendation || "Inspecione antes de decidir."),
    actions: Object.freeze((payload.actions || []).map((action: any) => String(action.id || action))), createdAt: String(payload.createdAt || new Date().toISOString())
  })
}

async function main() {
  const workspacePath = path.resolve(argument("--project-path") || process.cwd())
  let app: any; let connectedRuntime = true
  try {
    const paths = runtimePaths(workspacePath)
    const token = fs.readFileSync(paths.tokenPath, "utf8").trim()
    app = new SocketMaestroClient({ socketPath: paths.socketPath, token, clientId: `tui-${process.pid}` })
    await app.initialize()
  } catch {
    connectedRuntime = false
    const runtimeApp = new MaestroApplication({ projectRoot: workspacePath }); await runtimeApp.initialize()
    app = new LocalMaestroClient({ app: runtimeApp }); await app.initialize()
  }

  let project = await app.inspectProject({ projectPath: workspacePath }) as Project
  let projects: Project[] = []
  let missions: Mission[] = []
  let sessions: Session[] = []
  const hiddenSessionIds = new Set<string>()
  let selectedSession = 0
  let selectionTouched = false
  let preferredSessionId: string | undefined
  let activeMission = 0
  let maximized = false
  let terminalOwnership = { mode: NORMAL_MODE, rect: { x: 0, y: 0, w: 1, h: 1 }, dragStart: null }
  let wizard: Wizard = "none"
  let destroyed = false
  let notice = ""
  let refreshing = false
  let refreshQueued = false
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let operation = Promise.resolve()
  let surface: Surface = "cockpit"
  let skills: any[] = []
  let skillsState = initialSkillsState()
  let attentionState = createAttentionState()
  let gateState = createGateState()
  let notificationState = createNotificationState()
  const scrollbacks = new Map<string, any>()
  const tuiStore = createTuiStore()
  const commands = createRegistry({ includeDefaults: false })
  let interaction = resolveInteractionProfile({ cwd: workspacePath })
  let progress: any = { status: "idle", interaction }

  const renderer = await createCliRenderer({ exitOnCtrlC: false, clearOnShutdown: true, useMouse: true, enableMouseMovement: true, targetFps: 30 })
  const layout = () => cockpitLayout(renderer.terminalWidth || process.stdout.columns || 120, renderer.terminalHeight || process.stdout.rows || 36, maximized)

  const screen = new BoxRenderable(renderer, { width: "100%", height: "100%", flexDirection: "column", backgroundColor: theme.canvas })
  const topbar = new BoxRenderable(renderer, { width: "100%", height: 3, flexDirection: "row", paddingLeft: 1, paddingRight: 1, backgroundColor: theme.surface, border: ["bottom"], borderColor: theme.border })
  const brand = new TextRenderable(renderer, { width: 22, content: "◆ MAESTRO  /  ADE", fg: theme.text })
  const projectTitle = new TextRenderable(renderer, { flexGrow: 1, content: "", fg: theme.muted })
  const runtimeState = new TextRenderable(renderer, { width: 26, content: "", fg: theme.green })
  topbar.add(brand); topbar.add(projectTitle); topbar.add(runtimeState)

  const content = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexDirection: "row", backgroundColor: theme.canvas })
  const projectTabs = new TabSelectRenderable(renderer, { width: "100%", height: 3, options: [], tabWidth: 25, showDescription: false, showUnderline: true, showScrollArrows: true, wrapSelection: true, backgroundColor: theme.surface, textColor: theme.muted, focusedBackgroundColor: theme.surface, focusedTextColor: theme.text, selectedBackgroundColor: theme.selection, selectedTextColor: theme.cyan })
  const sidebar = new BoxRenderable(renderer, { width: 29, height: "100%", flexDirection: "column", padding: 1, gap: 1, backgroundColor: theme.surface, border: ["right"], borderColor: theme.borderMuted })
  const sidebarHeading = new TextRenderable(renderer, { height: 2, content: "COCKPIT · PROJETOS", fg: theme.faint })
  const projectSelect = new SelectRenderable(renderer, { width: "100%", flexGrow: 1, options: [], showDescription: true, showScrollIndicator: true, wrapSelection: true, backgroundColor: theme.surface, textColor: theme.text, descriptionColor: theme.faint, focusedBackgroundColor: theme.surface, focusedTextColor: theme.cyan, selectedBackgroundColor: theme.selection, selectedTextColor: theme.cyan, selectedDescriptionColor: theme.muted })
  const sidebarFoot = new TextRenderable(renderer, { height: 5, content: "", fg: theme.muted })
  sidebar.add(sidebarHeading); sidebar.add(projectSelect); sidebar.add(sidebarFoot)

  const workspace = new BoxRenderable(renderer, { flexGrow: 1, height: "100%", flexDirection: "column", padding: 1, gap: 1, backgroundColor: theme.canvas })
  const missionTabs = new TabSelectRenderable(renderer, { width: "100%", height: 3, options: [], tabWidth: 24, showDescription: false, showUnderline: true, showScrollArrows: true, wrapSelection: true, backgroundColor: theme.canvas, textColor: theme.muted, focusedBackgroundColor: theme.canvas, focusedTextColor: theme.text, selectedBackgroundColor: theme.selection, selectedTextColor: theme.orange, selectedDescriptionColor: theme.muted })
  const missionCard = new BoxRenderable(renderer, { width: "100%", height: 6, border: true, borderColor: theme.border, paddingLeft: 1, paddingRight: 1, backgroundColor: theme.surface, cursor: "pointer" })
  const missionText = new TextRenderable(renderer, { content: "", fg: theme.text }); missionCard.add(missionText)
  const deck = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexDirection: "row", gap: 1 })

  const panels = Array.from({ length: 6 }, (_, index) => {
    const box = new BoxRenderable(renderer, { width: index === 0 ? "48%" : "50%", height: "100%", border: true, borderColor: theme.border, padding: 1, backgroundColor: theme.surface, cursor: "pointer" })
    const text = new TextRenderable(renderer, { content: "", fg: theme.text }); box.add(text)
    box.onMouseDown = () => {
      const visible = projectedSessions(); const item = visible[index]; if (!item) return
      const nextIndex = sessions.findIndex((entry) => entry.id === item.id)
      if (nextIndex === selectedSession && isInteractiveSession(item)) enqueue(enterSelected)
      else { selectedSession = nextIndex; selectionTouched = true; scheduleRefresh(`Painel ${item.label} selecionado.`) }
    }
    return { box, text }
  })
  const specialists = new BoxRenderable(renderer, { flexGrow: 1, height: "100%", flexDirection: "column", gap: 1 })
  const specialistRows = [0, 1, 2].map(() => new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexDirection: "row", gap: 1 }))
  specialistRows[0].add(panels[1].box); specialistRows[0].add(panels[2].box)
  specialistRows[1].add(panels[3].box); specialistRows[1].add(panels[4].box)
  specialistRows[2].add(panels[5].box)
  specialistRows.forEach((row) => specialists.add(row))
  deck.add(panels[0].box); deck.add(specialists)

  const action = new BoxRenderable(renderer, { width: "100%", height: 3, flexDirection: "row", paddingLeft: 1, paddingRight: 1, backgroundColor: theme.raised, border: ["top"], borderColor: theme.border })
  const promptLabel = new TextRenderable(renderer, { width: 24, content: "", fg: theme.cyan })
  const prompt = new InputRenderable(renderer, { flexGrow: 1, placeholder: "", backgroundColor: theme.raised, focusedBackgroundColor: theme.selection, fg: theme.text })
  const providerPicker = new TabSelectRenderable(renderer, { flexGrow: 1, height: 2, visible: false, options: PROVIDERS.map((entry: any) => ({ name: entry.name, description: "", value: entry.id })), tabWidth: 16, showDescription: false, showUnderline: true, backgroundColor: theme.raised, textColor: theme.muted, selectedBackgroundColor: theme.selection, selectedTextColor: theme.cyan, focusedBackgroundColor: theme.raised, focusedTextColor: theme.text })
  action.add(promptLabel); action.add(prompt); action.add(providerPicker)
  const footer = new TextRenderable(renderer, { width: "100%", height: 2, content: "", fg: theme.muted, backgroundColor: theme.surface })

  workspace.add(missionTabs); workspace.add(missionCard); workspace.add(deck)
  content.add(sidebar); content.add(workspace)
  screen.add(topbar); screen.add(projectTabs); screen.add(content); screen.add(action); screen.add(footer); renderer.root.add(screen)

  const commandContext = { app, open: (next: Surface) => { surface = next; scheduleRefresh() } }
  commands.register({ id: "view.cockpit", title: "Abrir cockpit", category: "view", execute: () => commandContext.open("cockpit") })
  commands.register({ id: "view.skills", title: "Abrir Skills Explorer", category: "view", execute: () => commandContext.open("skills") })
  commands.register({ id: "view.attention", title: "Abrir Attention Center", category: "view", execute: () => commandContext.open("attention") })
  commands.register({ id: "mission.new", title: "Criar missão", category: "mission", execute: () => setWizard("mission") })
  commands.register({ id: "agent.new", title: "Criar agente", category: "agent", execute: () => setWizard("agent") })
  commands.register({ id: "terminal.new", title: "Abrir shell", category: "system", execute: () => enqueue(createShell) })
  commands.register({ id: "view.close", title: "Fechar painel selecionado", category: "view", execute: () => enqueue(closeSelected) })
  commands.register({ id: "terminal.terminate", title: "Encerrar agente", category: "agent", tooltip: "Indisponível: runtime kill contract ausente.", availability: () => false, execute: () => { const session = currentSession(); if (session) return resolveAction("terminate_agent", { terminalId: session.id, runtimeSupportsKill: false }) } })
  commands.register({ id: "view.maximize", title: "Alternar painel maximizado", category: "view", execute: () => { maximized = !maximized; scheduleRefresh() } })
  commands.register({ id: "interaction.default", title: "Usar interação default", category: "view", execute: () => { setInteractionProfile({ cwd: workspacePath, id: "default" }); interaction = resolveInteractionProfile({ cwd: workspacePath }); return scheduleRefresh("Interação default ativada.") } })
  commands.register({ id: "interaction.focus", title: "Usar interação focus", category: "view", execute: () => { setInteractionProfile({ cwd: workspacePath, id: "focus" }); interaction = resolveInteractionProfile({ cwd: workspacePath }); return scheduleRefresh("Interação focus ativada.") } })

  function consumeRuntimeEntry(entry: any) {
    tuiStore.dispatch(normalizeEvent(entry))
    const payload = entry?.payload?.data && typeof entry.payload.data === "object" ? entry.payload.data : entry?.payload || {}
    if (entry?.type === "attention.created") {
      const item = attentionItem({ ...payload, projectId: entry.projectId || payload.projectId, missionId: entry.missionId || payload.missionId })
      attentionState = attentionReducer(attentionState, { type: "attention.created", item })
      gateState = Object.freeze({ ...gateState, pendingIds: Object.freeze([...new Set([...gateState.pendingIds, item.id])]) })
      if (item.severity === "CRITICAL") gateState = gateReducer(gateState, { type: "gate.open", item })
    } else if (entry?.type === "attention.resolved") {
      const id = String(payload.id || payload.attentionId || "")
      if (id) attentionState = attentionReducer(attentionState, { type: "attention.resolved", id, decision: String(payload.decision || "resolved"), resolvedAt: String(payload.resolvedAt || new Date().toISOString()) })
    } else if (entry?.type === "attention.snoozed") {
      const id = String(payload.id || payload.attentionId || "")
      const until = String(payload.snoozedUntil || "")
      if (id && Date.parse(until) > Date.now()) {
        attentionState = attentionReducer(attentionState, { type: "attention.snoozed", id, snoozedUntil: until })
        if (gateState.pendingIds.includes(id)) gateState = gateReducer(gateState, { type: "gate.snooze", id, until })
      }
    }
    const entityId = String(payload.id || payload.attentionId || payload.taskId || payload.missionId || payload.runId || entry?.seq || "event")
    const tier = entry?.type === "attention.created" ? severityOf(payload.severity)
      : entry?.type === "task.failed" || entry?.type === "verification.failed" ? "WARNING"
        : entry?.type === "mission.completed" ? "SUCCESS" : "INFO"
    notificationState = notificationReducer(notificationState, { type: String(entry?.type || "runtime.event"), entityId, hash: JSON.stringify(payload), tier: tier as any, timestamp: Date.parse(entry?.timestamp) || Date.now(), payload })
  }

  function currentSession() { return sessions[clampSelection(selectedSession, sessions.length)] }
  function currentMission() { return missions[clampSelection(activeMission, missions.length)] }
  function terminalInputActive() { return terminalOwnership.mode !== NORMAL_MODE }
  function projectedSessions() {
    if (!sessions.length) return []
    const projection = projectTerminals({ count: sessions.length, columns: Math.max(1, renderer.terminalWidth || 120), rows: Math.max(1, (renderer.terminalHeight || 36) - 14), mode: maximized ? "single" : "2x2", fullscreen: maximized, focusIndex: selectedSession })
    return projection.rects.map((rect: any) => sessions[rect.index]).filter(Boolean)
  }
  missionCard.onMouseDown = () => { if (canStartMission(currentMission())) enqueue(startMission); else scheduleRefresh(currentMission()?.status === "running" ? "Esta missão já está ativa." : "Esta missão não pode ser reiniciada. Pressione M para criar uma nova.") }
  function setWizard(next: Wizard) {
    wizard = next; terminalOwnership = exitInput(terminalOwnership); prompt.value = ""; prompt.blur(); providerPicker.blur(); projectSelect.blur(); missionTabs.blur()
    gateState = gateReducer(gateState, { type: next === "palette" ? "palette.open" : "palette.close" })
    providerPicker.visible = next === "agent"; prompt.visible = next !== "agent"
    if (next === "agent") { promptLabel.content = "NOVO AGENTE"; providerPicker.focus() }
    else if (next === "mission") { promptLabel.content = "NOVA MISSÃO"; prompt.placeholder = "Descreva o objetivo da missão…"; prompt.focus() }
    else if (next === "shell") { promptLabel.content = "NOVO SHELL"; prompt.placeholder = "Comando opcional (padrão: shell atual)"; prompt.focus() }
    else if (next === "palette") { promptLabel.content = "PALETA"; prompt.placeholder = "comando, projeto, missão ou skill · >c filtra comandos"; prompt.focus() }
    else if (next === "search") { promptLabel.content = "BUSCAR OUTPUT"; prompt.placeholder = "Texto no scrollback do painel atual"; prompt.focus() }
    else { promptLabel.content = "AÇÃO RÁPIDA"; prompt.placeholder = "A agente  ·  M missão  ·  S shell  ·  Ctrl+K ações" }
  }

  const refresh = async (message?: string) => {
    if (destroyed) return
    if (refreshing) { refreshQueued = true; return }
    refreshing = true
    try {
      if (message !== undefined) notice = message
      const allProjects = await app.listProjects() as Project[]
      projects = allProjects.length ? allProjects : [project]
      const results = await Promise.all([app.listMissions({ projectId: project.id }), app.listTerminalSessions({ projectId: project.id }), app.skillsList().catch(() => [])])
      if (destroyed) return
      missions = results[0] as Mission[]; sessions = (results[1] as Session[]).filter((entry) => entry.backend === "pty" && !hiddenSessionIds.has(entry.id))
      skills = results[2] as any[]
      interaction = resolveInteractionProfile({ cwd: workspacePath })
      progress = await resolveStatus({ projectRoot: workspacePath })
      skillsState = skillsReducer(skillsState, { type: "catalog.loaded", skills })
      if (preferredSessionId) { const preferred = sessions.findIndex((entry) => entry.id === preferredSessionId); if (preferred >= 0) { selectedSession = preferred; selectionTouched = true } preferredSessionId = undefined }
      else if (!selectionTouched) selectedSession = firstInteractiveIndex(sessions)
      selectedSession = clampSelection(selectedSession, sessions.length); activeMission = clampSelection(activeMission, missions.length)
      const active = currentMission(); const currentLayout = layout(); const visible = projectedSessions()
      const selectedPage = sessions.length ? Math.floor(selectedSession / currentLayout.visiblePanels) + 1 : 1
      const pageCount = Math.max(1, Math.ceil(sessions.length / currentLayout.visiblePanels))

      projectTitle.content = surface === "cockpit" ? "Cockpit · operações globais" : `${project.name}  ·  workspace`
      runtimeState.content = `${connectedRuntime ? "● runtime conectado" : "◌ runtime local"}  ·  ${sessions.length} ativos`
      runtimeState.fg = connectedRuntime ? theme.green : theme.orange
      projectSelect.options = projects.map((entry) => ({ name: `${entry.id === project.id ? "●" : "○"} ${entry.name}`, description: `${tabStatus(tuiStore.getState(), entry.id).label} · ${entry.status}`, value: entry.id }))
      const projectIndex = projects.findIndex((entry) => entry.id === project.id); if (projectIndex >= 0) projectSelect.setSelectedIndex(projectIndex)
      const workspaceTabs = buildWorkspaceTabs(projects.map((entry) => ({ ...entry, badge: tabStatus(tuiStore.getState(), entry.id).label })))
      projectTabs.options = workspaceTabs.map((entry) => ({
        name: entry.kind === "cockpit" ? entry.name : `${entry.name} ${entry.badge || "○ idle"}`,
        description: entry.kind === "cockpit" ? "operações globais" : "workspace",
        value: entry.id,
      }))
      const activeTabIndex = surface === "cockpit" ? 0 : Math.max(0, workspaceTabs.findIndex((entry) => entry.id === project.id))
      projectTabs.setSelectedIndex(activeTabIndex)
      missionTabs.options = missions.length
        ? missions.map((entry, index) => ({ name: `${index === activeMission ? "●" : "○"} ${entry.objective.slice(0, 22)}`, description: missionState(entry), value: entry.id }))
        : [{ name: "+ Nova missão", description: "", value: "new" }]
      missionTabs.setSelectedIndex(missions.length ? activeMission : 0)
      const tasks = active?.plan?.tasks?.length || 0; const blockers = active?.plan?.blockers?.length || 0
      const hasTaskGraph = Boolean(active?.plan?.tasks?.length)
      const taskGraph = hasTaskGraph
        ? (active?.plan?.tasks || []).slice(0, 8).map((task: any) => {
          const state = String(task.status || "ready").toLowerCase(); const marker = state === "completed" ? "✓" : state === "running" ? "●" : state === "blocked" ? "⊘" : state === "failed" ? "✕" : "○"
          return `${marker} ${String(task.title || task.name || task.id || "task").slice(0, 44)}  ${state.toUpperCase()}`
        }).join("\n")
        : "No active TaskGraph\n\nOpen Plan or create a mission to begin."
      const projectionSummary = progress.status === "idle"
        ? `INTERAÇÃO  ·  ${interaction.id.toUpperCase()}\nWorkflow sem state ativo`
        : `INTERAÇÃO  ·  ${interaction.id.toUpperCase()}\n${progress.workflow || "Workflow"}  ·  ${progress.phase?.id || "—"}  ·  ${progress.completed}/${progress.total}\nAtual: ${progress.current?.title || "—"}\nPróximo: ${progress.next?.title || "—"}`
      missionText.content = active
        ? `${primaryWorkspaceSurface({ hasTaskGraph, width: renderer.terminalWidth || 120 }) === "taskgraph" ? "TASKGRAPH" : "MISSÃO"}  ·  ${missionState(active).toUpperCase()}\n${active.objective}\n${hasTaskGraph ? `${taskGraph}\n` : ""}${projectionSummary}\n${tasks} tarefas  ·  ${blockers} bloqueios  ·  verificação ${project.verification?.status || "pendente"}\n${active.status === "running" ? "● Em execução — A adiciona agente · T abre terminal" : canStartMission(active) ? "▶ R ou clique aqui para iniciar" : "M para criar uma nova missão"}`
        : `${projectionSummary}\n\nMISSÃO\nNenhum objetivo definido.\n\n▶ M para criar e iniciar a primeira missão`
      sidebarFoot.content = `ATIVOS  ${projects.filter((entry) => ["running", "active", "executing"].includes(String(entry.status).toLowerCase())).length}/${projects.length}\nATENÇÃO  ${projects.reduce((total, entry) => total + tabStatus(tuiStore.getState(), entry.id).attentionCount, 0)}\nRUNTIME  ${connectedRuntime ? "conectado" : "local"}\n\nCtrl+P trocar projeto`

      await Promise.all(panels.map(async (panel, slot) => {
        const session = visible[slot]
        panel.box.visible = Boolean(session)
        if (!session) { panel.text.content = ""; return }
        const index = sessions.findIndex((entry) => entry.id === session.id); const selected = index === selectedSession
        const snapshot = await app.snapshotTerminalSession(session.id)
        const ring = new ScrollbackRing(); ring.append({ data: `${(snapshot?.lines || []).join("\n")}\n` }); scrollbacks.set(session.id, ring)
        const role = session.role ? session.role.toUpperCase().replace("SPECIALIST", "ESPECIALISTA").replace("PILOT", "PILOTO") : (slot === 0 ? "PILOTO" : "ESPECIALISTA")
        const affordance = isInteractiveSession(session) ? "↵ Enter para interagir" : "Indisponível — X fecha somente a visualização"
        panel.box.borderColor = selected ? providerColor(session.providerId) : theme.border
        panel.box.backgroundColor = selected ? theme.raised : theme.surface
        panel.text.content = `${selected ? "●" : "○"} ${role}  ·  ${session.providerId || "shell"}  ·  ${session.status}  ·  ${age(session.startedAt)}\n${session.label}  ·  ${shortPath(session.workspacePath, session.sourceWorkspacePath)}\n${affordance}\n${"─".repeat(38)}\n${cleanLines(ring.lines() as string[], Math.max(3, currentLayout.outputLines - 1))}`
        panel.text.fg = statusColor(session.status)
      }))
      if (!visible.length) {
        panels[0].box.visible = true; panels[0].text.fg = theme.muted
        panels[0].text.content = "COCKPIT VAZIO\n\nPressione A para escolher um agente\nou S para abrir um shell neste projeto."
      }
      if (surface === "cockpit") {
        missionTabs.visible = false; missionCard.visible = false; specialists.visible = false
        panels.forEach((panel, index) => { panel.box.visible = index === 0 })
        panels[0].box.width = "100%"; panels[0].text.fg = theme.text
        const rows = projects.map((entry) => {
          const status = tabStatus(tuiStore.getState(), entry.id)
          const resolution = entry.resolution
          const state = resolution?.state === "validated" ? "✓ validated"
            : resolution?.state === "needs_attention" ? "⚠ needs attention"
              : resolution?.state === "blocked" ? "■ blocked"
                : resolution?.state === "verifying" ? "◐ verifying"
                  : resolution?.state === "failed" ? "✗ failed"
                    : status.kind === "attention" ? "⚠ needs attention"
                      : status.kind === "verifying" ? "◐ verifying"
                        : status.kind === "running" ? `● ${status.agentCount} agent${status.agentCount === 1 ? "" : "s"} running` : "○ idle"
          const detail = resolution
            ? [
                resolution.strategy,
                resolution.budget?.tier ? `budget ${resolution.budget.tier}` : "",
                Number.isInteger(resolution.evidence?.selected?.length) ? `evidence ${resolution.evidence?.selected?.length}/${resolution.evidence?.candidates ?? "?"}` : "",
                Number.isInteger(resolution.escalation?.max) ? `esc ${resolution.escalation?.count ?? 0}/${resolution.escalation?.max}` : "",
                entry.verification?.status ? `verify ${entry.verification.status}` : ""
              ].filter(Boolean).join(" · ")
            : ""
          return `${entry.name.padEnd(22, " ")} ${state}${detail ? ` · ${detail}` : ""}`
        }).join("\n") || "Nenhum projeto registrado."
        const attentionCount = projects.reduce((total, entry) => total + tabStatus(tuiStore.getState(), entry.id).attentionCount, 0)
        panels[0].text.content = `ACTIVE PROJECTS\n${rows}\n\nATTENTION\n${attentionCount ? `${attentionCount} decisão${attentionCount === 1 ? "" : "ões"} pendente${attentionCount === 1 ? "" : "s"}` : "Nenhuma intervenção pendente."}\n\nEXECUTION\n${projects.filter((entry) => ["running", "active", "executing"].includes(String(entry.status).toLowerCase())).length} ativos · ${connectedRuntime ? "runtime conectado" : "runtime local"}\n\nCtrl+P trocar projeto · A atenção · T terminal`
      } else {
        missionTabs.visible = true; missionCard.visible = true
      }
      if (surface === "skills") {
        const model = explorerModel(skills, skillsState, { columns: renderer.terminalWidth || 120, projectId: project.id })
        panels.forEach((panel, index) => { panel.box.visible = index === 0 })
        panels[0].box.width = "100%"; specialists.visible = false; panels[0].text.fg = theme.text
        panels[0].text.content = `SKILLS EXPLORER  ·  ${model.visible.length} disponíveis\n\n${model.visible.slice(0, 18).map((skill: any) => `• ${skill.displayName || skill.id}  [${skill.normalizedCategory || "Other"}]\n  ${skill.description || "Sem descrição"}`).join("\n") || "Nenhuma skill encontrada."}`
      } else if (surface === "attention") {
        const items = attentionCenter(attentionState, project.id)
        panels.forEach((panel, index) => { panel.box.visible = index === 0 })
        panels[0].box.width = "100%"; specialists.visible = false; panels[0].text.fg = items.length ? theme.orange : theme.green
        panels[0].text.content = `ATTENTION CENTER  ·  ${items.length} pendências\n\n${items.map((item: any) => `⚠ ${item.title || item.reason || item.id}\n  ${item.recommendation || item.status || "pending"}`).join("\n\n") || "Nenhuma intervenção humana pendente."}`
      }
      if (gateState.open && gateState.activeId && attentionState.byId[gateState.activeId]) {
        const modal = gateModalModel(attentionState.byId[gateState.activeId])
        panels.forEach((panel, index) => { panel.box.visible = index === 0 }); specialists.visible = false; panels[0].box.width = "100%"; panels[0].text.fg = theme.orange
        panels[0].text.content = `GATE HUMANO · ${modal.id}\n\n${modal.sections.map((section) => `${section.id}\n${section.content}`).join("\n\n")}\n\n${modal.actions.map((item) => `[${item.key}] ${item.label}`).join("   ")}\nEsc fecha o modal sem resolver.`
      }
      const compact = currentLayout.mode === "compact" || currentLayout.mode === "maximized"
      const showCockpitRail = railVisibility(surface === "cockpit") && !compact
      sidebar.visible = showCockpitRail
      sidebar.width = showCockpitRail ? 29 : 0
      sidebar.padding = showCockpitRail ? 1 : 0
      specialists.visible = surface !== "cockpit" && !compact && visible.length > 1; panels[0].box.width = compact || surface === "cockpit" ? "100%" : "48%"
      if (wizard === "none") { promptLabel.content = surface === "cockpit" ? "PRÓXIMA AÇÃO" : surface.toUpperCase(); prompt.placeholder = surface === "cockpit" ? primaryAction(active, currentSession(), sessions) : "Esc volta ao cockpit · Ctrl+K abre a paleta" }
      const toastModel = toastRegion(notificationState.toasts)
      const toastText = toastModel.visible.map((toast) => `${toast.prominent ? "‼" : "•"} ${toast.message}${toast.count > 1 ? ` (${toast.count})` : ""}`).join(" · ")
      footer.content = terminalInputActive()
        ? `  TECLADO NO TERMINAL → ${currentSession()?.label || "terminal"}   Ctrl+] voltar ao cockpit`
        : `  T terminal   S skills   A atenção   I interação   Ctrl+F fullscreen   Ctrl+K paleta   Ctrl+P projetos   Q sair${notice || toastText ? `\n  ${[notice, toastText].filter(Boolean).join(" · ")}` : ""}`
    } catch (error) { if (!destroyed) { notice = `Erro: ${(error as Error).message}`; footer.content = `  ${notice}`; footer.fg = theme.red } }
    finally { refreshing = false; if (!destroyed && refreshQueued) { refreshQueued = false; scheduleRefresh() } }
  }

  function scheduleRefresh(message?: string) {
    if (message !== undefined) notice = message
    if (refreshTimer) return
    refreshTimer = setTimeout(() => { refreshTimer = undefined; void refresh() }, 40)
  }
  function enqueue(task: () => Promise<void>) { operation = operation.then(async () => { if (!destroyed) await task() }).catch((error) => { if (!destroyed) return refresh(`Erro: ${error.message}`) }); return operation }
  function quit() { if (destroyed) return; destroyed = true; if (refreshTimer) clearTimeout(refreshTimer); unsubscribe?.(); app.close?.(); renderer.destroy() }
  async function changeProject(projectId: string) {
    if (isCockpitTab(projectId)) { surface = "cockpit"; await refresh("Cockpit global."); return }
    const next = projects.find((entry) => entry.id === projectId); if (!next) return
    surface = "project"
    if (next.id === project.id) { await refresh("Workspace selecionado."); return }
    project = await app.inspectProject({ projectId: next.id }); selectedSession = 0; selectionTouched = false; activeMission = 0; await refresh("Workspace alterado sem interromper os processos.")
  }
  async function startMission() {
    const mission = currentMission(); if (!mission) { setWizard("mission"); return }
    if (mission.status === "running") { await refresh("Esta missão já está ativa."); return }
    if (!canStartMission(mission)) { await refresh("Esta missão não pode ser reiniciada. Pressione M para criar uma nova."); return }
    await app.updateMission(mission.id, { status: "running", startedAt: mission.startedAt || new Date().toISOString() })
    await refresh("Missão iniciada. Pressione A para adicionar um agente.")
  }
  async function createAgent(providerId: string) {
    const mission = currentMission()
    const created = await app.createTerminalSession({ workspacePath: project.path, projectId: project.id, missionId: mission?.id, kind: "agent", providerId, backend: "pty", isolation: "worktree", role: sessions.some(isInteractiveSession) ? "specialist" : "pilot" })
    preferredSessionId = created.id
    setWizard("none"); await refresh(`Agente ${providerId} iniciado em worktree isolado.`)
  }
  async function createShell() {
    const shell = process.env.SHELL || "/bin/sh"
    const created = await app.createTerminalSession({ workspacePath: project.path, projectId: project.id, missionId: currentMission()?.id, kind: "shell", command: shell, args: [], backend: "pty", label: path.basename(shell) })
    preferredSessionId = created.id; setWizard("none"); await refresh("Shell interativo aberto e selecionado.")
  }
  async function enterSelected() {
    const session = currentSession()
    if (!session) { await refresh("Nenhum painel selecionado. Pressione A para criar um agente."); return }
    if (!isInteractiveSession(session)) { await refresh(`O painel ${session.label} está ${session.status} e não aceita input. Selecione um painel ativo ou pressione X para removê-lo.`); return }
    const focused = await app.focusTerminalSession(session.id)
    if (!focused) { terminalOwnership = exitInput(terminalOwnership); await refresh("A PTY deste painel não está conectada. Selecione outro painel ou reinicie o agente."); return }
    prompt.blur(); providerPicker.blur(); projectSelect.blur(); missionTabs.blur()
    terminalOwnership = enterInput(terminalOwnership); await refresh(`Agora o teclado controla ${session.label}. Use Ctrl+] para voltar.`)
  }
  async function submitPrompt() {
    const value = prompt.value.trim(); prompt.value = ""
    if (wizard === "mission") { if (!value) throw new Error("Descreva o objetivo da missão."); await app.createMission({ workspacePath: project.path, objective: value, status: "running", startedAt: new Date().toISOString() }); activeMission = missions.length; setWizard("none"); await refresh("Missão criada e iniciada. Pressione A para adicionar o agente piloto.") }
    else if (wizard === "shell") { const parts = value.split(/\s+/u).filter(Boolean); const shell = process.env.SHELL || "/bin/sh"; await app.createTerminalSession({ workspacePath: project.path, projectId: project.id, missionId: currentMission()?.id, kind: "shell", command: parts[0] || shell, args: parts.slice(1), backend: "pty" }); setWizard("none"); await refresh("Shell aberto na grade.") }
    else if (wizard === "palette") {
      const command = value.toLowerCase(); setWizard("none")
      const model = paletteModel({ query: value, domains: { commands, projects, missions, skills }, ctx: commandContext, state: { capabilities: { switchProject: true }, attentionCount: tuiStore.getState().attentionById.ids.length } })
      const selected = model.results[0]
      if (!selected) { await refresh(`Nenhum resultado para “${value}”.`); return }
      const result = selectResult(selected, { registry: commands, ctx: commandContext })
      if (result?.kind === "project") await changeProject(result.id)
      else if (result?.kind === "mission") { const index = missions.findIndex((entry) => entry.id === result.id); if (index >= 0) activeMission = index; await refresh() }
      else if (result?.kind === "skill") { surface = "skills"; await refresh(`Skill selecionada: ${result.id}`) }
    }
    else if (wizard === "search") {
      setWizard("none"); const session = currentSession(); const match = session ? scrollbacks.get(session.id)?.search(value) : null
      await refresh(match ? `Busca: ${match.indexes.length} ocorrência(s); primeira na linha ${match.current + 1}.` : `Nenhuma ocorrência para “${value}”.`)
    }
  }
  async function closeSelected() {
    const session = currentSession(); if (!session) return
    const action = resolveAction("close_view", { terminalId: session.id })
    if (action.effect.type === "closeView") hiddenSessionIds.add(session.id)
    selectedSession = Math.max(0, selectedSession - 1)
    await refresh("Visualização fechada; o processo continua no runtime.")
  }
  async function decideGate(key: string) {
    const id = gateState.activeId; if (!id) return
    if (key === "s") {
      const until = new Date(Date.now() + 15 * 60_000).toISOString()
      await app.resolveAttention(id, "snooze", { snoozedUntil: until })
      gateState = gateReducer(gateState, { type: "gate.snooze", id, until })
      await refresh("Gate adiado por 15 minutos; nenhuma autorização foi concedida.")
      return
    }
    const decision = key === "3" ? "approve" : "reject"
    await app.resolveAttention(id, decision)
    gateState = gateReducer(gateState, { type: decision === "approve" ? "gate.approve" : "gate.reject", id, decision } as any)
    attentionState = attentionReducer(attentionState, { type: "attention.resolved", id, decision, resolvedAt: new Date().toISOString() })
    await refresh(decision === "approve" ? "Gate aprovado explicitamente." : "Gate rejeitado explicitamente.")
  }

  projectSelect.on(SelectRenderableEvents.ITEM_SELECTED, (option: any) => enqueue(() => changeProject(option?.value || projectSelect.getSelectedOption()?.value)))
  projectTabs.on(TabSelectRenderableEvents.ITEM_SELECTED, (option: any) => enqueue(() => changeProject(option?.value || projectTabs.getSelectedOption()?.value)))
  missionTabs.on(TabSelectRenderableEvents.ITEM_SELECTED, (option: any) => {
    const value = option?.value || missionTabs.getSelectedOption()?.value
    if (value === "new") setWizard("mission"); else { const index = missions.findIndex((entry) => entry.id === value); if (index >= 0) { activeMission = index; scheduleRefresh() } }
  })
  providerPicker.on(TabSelectRenderableEvents.ITEM_SELECTED, (option: any) => enqueue(() => createAgent(option?.value || providerPicker.getSelectedOption()?.value)))
  prompt.on(InputRenderableEvents.ENTER, () => enqueue(submitPrompt))

  renderer.keyInput.on("keypress", (key: any) => {
    const name = key.name || ""
    if (terminalInputActive()) {
      if (key.ctrl && (name === "]" || key.sequence === "\u001d")) { key.preventDefault(); terminalOwnership = exitInput(terminalOwnership); scheduleRefresh("Foco retornou ao cockpit."); return }
      const session = currentSession(); const data = terminalInputForKey(key)
      if (session && data !== null) { key.preventDefault(); enqueue(async () => { const accepted = await app.inputTerminalSession(session.id, data); if (!accepted) { terminalOwnership = exitInput(terminalOwnership); await refresh("A PTY parou de responder. O foco voltou ao cockpit.") } }) }
      return
    }
    if (gateState.open && gateState.activeId) {
      if (name === "escape") { key.preventDefault(); gateState = gateReducer(gateState, { type: "gate.escape" }); scheduleRefresh(); return }
      if (["3", "4", "s"].includes(name)) { key.preventDefault(); enqueue(() => decideGate(name)); return }
    }
    const shortcut = cockpitShortcut(key, { textInput: prompt.focused })
    if (shortcut === "quit") { key.preventDefault(); quit(); return }
    if (shortcut === "palette") { key.preventDefault(); setWizard("palette"); return }
    if (shortcut === "projects") { key.preventDefault(); prompt.blur(); providerPicker.blur(); missionTabs.blur(); projectTabs.focus(); return }
    if (shortcut === "missions") { key.preventDefault(); prompt.blur(); providerPicker.blur(); projectSelect.blur(); missionTabs.focus(); return }
    if (shortcut === "agent") { key.preventDefault(); setWizard("agent"); return }
    if (shortcut === "mission") { key.preventDefault(); setWizard("mission"); return }
    if (shortcut === "shell") { key.preventDefault(); enqueue(createShell); return }
    if (shortcut === "close") { key.preventDefault(); projectSelect.blur(); missionTabs.blur(); enqueue(closeSelected); return }
    if (shortcut === "maximize") { key.preventDefault(); projectSelect.blur(); missionTabs.blur(); maximized = !maximized; scheduleRefresh(); return }
    if (prompt.focused || providerPicker.focused || projectSelect.focused || missionTabs.focused) {
      if (name === "escape") { key.preventDefault(); setWizard("none"); scheduleRefresh() }
      return
    }
    const numericSlot = /^[1-4]$/u.test(name) ? Number(name) - 1 : -1
    if (numericSlot >= 0) { const item = projectedSessions()[numericSlot]; if (item) { selectedSession = sessions.findIndex((entry) => entry.id === item.id); selectionTouched = true; scheduleRefresh(`Painel ${numericSlot + 1} selecionado.`) } }
    else if (name === "up" || name === "k") { selectedSession = clampSelection(selectedSession - 1, sessions.length); selectionTouched = true; scheduleRefresh() }
    else if (name === "down" || name === "j") { selectedSession = clampSelection(selectedSession + 1, sessions.length); selectionTouched = true; scheduleRefresh() }
    else if (name === "left" || name === "h") { activeMission = clampSelection(activeMission - 1, missions.length); scheduleRefresh() }
    else if (name === "right" || name === "l") { activeMission = clampSelection(activeMission + 1, missions.length); scheduleRefresh() }
    else if (name === "return") enqueue(enterSelected)
    else if (name === "tab") projectSelect.focus()
    else if (name === "r") enqueue(startMission)
    else if (name === "i") { setWizard("palette"); prompt.value = "interaction." }
    else if (name === "/" || key.sequence === "/") setWizard("search")
    else if (name === "escape") { setWizard("none"); surface = "cockpit"; scheduleRefresh() }
  })
  renderer.keyInput.on("paste", (event: any) => { if (terminalInputActive() && currentSession()) enqueue(async () => { await app.inputTerminalSession(currentSession().id, Buffer.from(event.bytes).toString("utf8")) }) })

  try {
    const snapshot = await app.snapshot()
    for (const entries of Object.values(snapshot?.streams || {}) as any[][]) for (const entry of entries) consumeRuntimeEntry(entry)
  } catch { /* local compatibility client may not expose a persisted event snapshot */ }
  const unsubscribe = typeof app.subscribe === "function" ? app.subscribe((event: any) => {
    if (event?.entry) consumeRuntimeEntry(event.entry)
    const type = event?.entry?.type || event?.type
    if (["agentSession.output", "agentSession.active", "agentSession.exited", "agentSession.closed", "terminal.output", "agent.active", "agent.exited", "mission.created", "mission.updated", "attention.created", "attention.resolved", "resolution.planned", "outcome.validated", "outcome.revoked", "outcome.revalidated", "verification.completed", "verification.failed", "provider.handoff"].includes(type)) scheduleRefresh()
  }) : undefined
  process.on("SIGWINCH", () => scheduleRefresh())
  setWizard("none"); await refresh(connectedRuntime ? "Cockpit conectado ao runtime persistente." : "Runtime externo indisponível; usando processo local.")
}

main().catch((error) => { console.error(`Erro na TUI OpenTUI: ${error.message}`); process.exitCode = 1 })
