import path from "node:path"
import {
  createCliRenderer, BoxRenderable, InputRenderable, InputRenderableEvents,
  SelectRenderable, SelectRenderableEvents, TabSelectRenderable, TabSelectRenderableEvents, TextRenderable
} from "@opentui/core"
import { providerColor, statusColor, theme } from "./ade-theme"

const { MaestroApplication } = require("../application")
const { createRuntimeApplicationClient } = require("../bridge/socket-client")
const { PROVIDERS, canStartMission, clampSelection, cockpitLayout, cockpitShortcut, firstInteractiveIndex, isInteractiveSession, missionState, primaryAction, terminalInputForKey, visibleSessions } = require("./ade-model")

type Project = { id: string; name: string; path: string; status: string; verification?: { status?: string } }
type Session = { id: string; label: string; kind: string; providerId?: string; backend: string; workspacePath: string; sourceWorkspacePath?: string; status: string; startedAt?: string; missionId?: string; role?: string; isolation?: string }
type Mission = { id: string; objective: string; status: string; mode: string; startedAt?: string; plan?: { tasks?: unknown[]; blockers?: unknown[] } }
type Wizard = "none" | "agent" | "mission" | "shell" | "palette"

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

async function main() {
  const workspacePath = path.resolve(argument("--project-path") || process.cwd())
  let app: any; let connectedRuntime = true
  try { app = createRuntimeApplicationClient(workspacePath); await app.initialize() }
  catch { connectedRuntime = false; app = new MaestroApplication({ projectRoot: workspacePath }); await app.initialize() }

  let project = await app.inspectProject({ projectPath: workspacePath }) as Project
  let projects: Project[] = []
  let missions: Mission[] = []
  let sessions: Session[] = []
  let selectedSession = 0
  let selectionTouched = false
  let preferredSessionId: string | undefined
  let activeMission = 0
  let maximized = false
  let terminalInput = false
  let wizard: Wizard = "none"
  let destroyed = false
  let notice = ""
  let refreshing = false
  let refreshQueued = false
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let operation = Promise.resolve()

  const renderer = await createCliRenderer({ exitOnCtrlC: false, clearOnShutdown: true, useMouse: true, enableMouseMovement: true, targetFps: 30 })
  const layout = () => cockpitLayout(renderer.terminalWidth || process.stdout.columns || 120, renderer.terminalHeight || process.stdout.rows || 36, maximized)

  const screen = new BoxRenderable(renderer, { width: "100%", height: "100%", flexDirection: "column", backgroundColor: theme.canvas })
  const topbar = new BoxRenderable(renderer, { width: "100%", height: 3, flexDirection: "row", paddingLeft: 1, paddingRight: 1, backgroundColor: theme.surface, border: ["bottom"], borderColor: theme.border })
  const brand = new TextRenderable(renderer, { width: 22, content: "◆ MAESTRO  /  ADE", fg: theme.text })
  const projectTitle = new TextRenderable(renderer, { flexGrow: 1, content: "", fg: theme.muted })
  const runtimeState = new TextRenderable(renderer, { width: 26, content: "", fg: theme.green })
  topbar.add(brand); topbar.add(projectTitle); topbar.add(runtimeState)

  const content = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexDirection: "row", backgroundColor: theme.canvas })
  const sidebar = new BoxRenderable(renderer, { width: 29, height: "100%", flexDirection: "column", padding: 1, gap: 1, backgroundColor: theme.surface, border: ["right"], borderColor: theme.borderMuted })
  const sidebarHeading = new TextRenderable(renderer, { height: 2, content: "PROJETOS", fg: theme.faint })
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
      const visible = visibleSessions(sessions, selectedSession, layout()); const item = visible[index]; if (!item) return
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
  screen.add(topbar); screen.add(content); screen.add(action); screen.add(footer); renderer.root.add(screen)

  function currentSession() { return sessions[clampSelection(selectedSession, sessions.length)] }
  function currentMission() { return missions[clampSelection(activeMission, missions.length)] }
  missionCard.onMouseDown = () => { if (canStartMission(currentMission())) enqueue(startMission); else scheduleRefresh(currentMission()?.status === "running" ? "Esta missão já está ativa." : "Esta missão não pode ser reiniciada. Pressione M para criar uma nova.") }
  function setWizard(next: Wizard) {
    wizard = next; terminalInput = false; prompt.value = ""; prompt.blur(); providerPicker.blur(); projectSelect.blur(); missionTabs.blur()
    providerPicker.visible = next === "agent"; prompt.visible = next !== "agent"
    if (next === "agent") { promptLabel.content = "NOVO AGENTE"; providerPicker.focus() }
    else if (next === "mission") { promptLabel.content = "NOVA MISSÃO"; prompt.placeholder = "Descreva o objetivo da missão…"; prompt.focus() }
    else if (next === "shell") { promptLabel.content = "NOVO SHELL"; prompt.placeholder = "Comando opcional (padrão: shell atual)"; prompt.focus() }
    else if (next === "palette") { promptLabel.content = "PALETA"; prompt.placeholder = "agent · mission · shell · close · maximize"; prompt.focus() }
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
      const results = await Promise.all([app.listMissions({ projectId: project.id }), app.listTerminalSessions({ projectId: project.id })])
      if (destroyed) return
      missions = results[0] as Mission[]; sessions = (results[1] as Session[]).filter((entry) => entry.backend === "pty")
      if (preferredSessionId) { const preferred = sessions.findIndex((entry) => entry.id === preferredSessionId); if (preferred >= 0) { selectedSession = preferred; selectionTouched = true } preferredSessionId = undefined }
      else if (!selectionTouched) selectedSession = firstInteractiveIndex(sessions)
      selectedSession = clampSelection(selectedSession, sessions.length); activeMission = clampSelection(activeMission, missions.length)
      const active = currentMission(); const currentLayout = layout(); const visible = visibleSessions(sessions, selectedSession, currentLayout)
      const selectedPage = sessions.length ? Math.floor(selectedSession / currentLayout.visiblePanels) + 1 : 1
      const pageCount = Math.max(1, Math.ceil(sessions.length / currentLayout.visiblePanels))

      projectTitle.content = `${project.name}  /  ${project.path}`
      runtimeState.content = `${connectedRuntime ? "● runtime conectado" : "◌ runtime local"}  ·  ${sessions.length} ativos`
      runtimeState.fg = connectedRuntime ? theme.green : theme.orange
      projectSelect.options = projects.map((entry) => ({ name: `${entry.id === project.id ? "●" : "○"} ${entry.name}`, description: `${entry.status} · ${entry.path}`, value: entry.id }))
      const projectIndex = projects.findIndex((entry) => entry.id === project.id); if (projectIndex >= 0) projectSelect.setSelectedIndex(projectIndex)
      missionTabs.options = missions.length
        ? missions.map((entry, index) => ({ name: `${index === activeMission ? "●" : "○"} ${entry.objective.slice(0, 22)}`, description: missionState(entry), value: entry.id }))
        : [{ name: "+ Nova missão", description: "", value: "new" }]
      missionTabs.setSelectedIndex(missions.length ? activeMission : 0)
      const tasks = active?.plan?.tasks?.length || 0; const blockers = active?.plan?.blockers?.length || 0
      missionText.content = active
        ? `MISSÃO  ${missionState(active).toUpperCase()}\n${active.objective}\n${tasks} tarefas  ·  ${blockers} bloqueios  ·  verificação ${project.verification?.status || "pendente"}\n${active.status === "running" ? "● Em execução — adicione agentes com A" : canStartMission(active) ? "▶ R ou clique aqui para iniciar" : "M para criar uma nova missão"}`
        : "MISSÃO\nNenhum objetivo definido.\n\n▶ M para criar e iniciar a primeira missão"
      sidebarFoot.content = `SESSÕES  ${sessions.length}\nPÁGINA   ${selectedPage}/${pageCount}\nLEGADO   ${(results[1] as Session[]).length - sessions.length}\n\nCtrl+P projetos`

      await Promise.all(panels.map(async (panel, slot) => {
        const session = visible[slot]
        panel.box.visible = Boolean(session)
        if (!session) { panel.text.content = ""; return }
        const index = sessions.findIndex((entry) => entry.id === session.id); const selected = index === selectedSession
        const snapshot = await app.snapshotTerminalSession(session.id)
        const role = session.role ? session.role.toUpperCase().replace("SPECIALIST", "ESPECIALISTA").replace("PILOT", "PILOTO") : (slot === 0 ? "PILOTO" : "ESPECIALISTA")
        const affordance = isInteractiveSession(session) ? "↵ Enter para interagir" : "Indisponível — X encerra este painel"
        panel.box.borderColor = selected ? providerColor(session.providerId) : theme.border
        panel.box.backgroundColor = selected ? theme.raised : theme.surface
        panel.text.content = `${selected ? "●" : "○"} ${role}  ·  ${session.providerId || "shell"}  ·  ${session.status}  ·  ${age(session.startedAt)}\n${session.label}  ·  ${shortPath(session.workspacePath, session.sourceWorkspacePath)}\n${affordance}\n${"─".repeat(38)}\n${cleanLines(snapshot?.lines, Math.max(3, currentLayout.outputLines - 1))}`
        panel.text.fg = statusColor(session.status)
      }))
      if (!visible.length) {
        panels[0].box.visible = true; panels[0].text.fg = theme.muted
        panels[0].text.content = "COCKPIT VAZIO\n\nPressione A para escolher um agente\nou S para abrir um shell neste projeto."
      }
      const compact = currentLayout.mode === "compact" || currentLayout.mode === "maximized"
      sidebar.visible = !compact; specialists.visible = !compact && visible.length > 1; panels[0].box.width = compact ? "100%" : "48%"
      if (wizard === "none") { promptLabel.content = "PRÓXIMA AÇÃO"; prompt.placeholder = primaryAction(active, currentSession(), sessions) }
      footer.content = terminalInput
        ? `  TECLADO NO TERMINAL → ${currentSession()?.label || "terminal"}   Ctrl+] voltar ao cockpit`
        : `  1–6 selecionar painel   Enter interagir   A agente   M missão   S shell   R iniciar missão   X encerrar   Q sair${notice ? `\n  ${notice}` : ""}`
    } catch (error) { if (!destroyed) { notice = `Erro: ${(error as Error).message}`; footer.content = `  ${notice}`; footer.fg = theme.red } }
    finally { refreshing = false; if (!destroyed && refreshQueued) { refreshQueued = false; scheduleRefresh() } }
  }

  function scheduleRefresh(message?: string) {
    if (message !== undefined) notice = message
    if (refreshTimer) return
    refreshTimer = setTimeout(() => { refreshTimer = undefined; void refresh() }, 40)
  }
  function enqueue(task: () => Promise<void>) { operation = operation.then(async () => { if (!destroyed) await task() }).catch((error) => { if (!destroyed) return refresh(`Erro: ${error.message}`) }); return operation }
  function quit() { if (destroyed) return; destroyed = true; if (refreshTimer) clearTimeout(refreshTimer); unsubscribe?.(); clearInterval(fallbackPoll); renderer.destroy() }
  async function changeProject(projectId: string) {
    const next = projects.find((entry) => entry.id === projectId); if (!next || next.id === project.id) return
    project = await app.inspectProject({ projectId: next.id }); selectedSession = 0; selectionTouched = false; activeMission = 0; await refresh("Projeto alterado sem interromper os processos.")
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
    if (!focused) { terminalInput = false; await refresh("A PTY deste painel não está conectada. Selecione outro painel ou reinicie o agente."); return }
    prompt.blur(); providerPicker.blur(); projectSelect.blur(); missionTabs.blur()
    terminalInput = true; await refresh(`Agora o teclado controla ${session.label}. Use Ctrl+] para voltar.`)
  }
  async function submitPrompt() {
    const value = prompt.value.trim(); prompt.value = ""
    if (wizard === "mission") { if (!value) throw new Error("Descreva o objetivo da missão."); await app.createMission({ workspacePath: project.path, objective: value, status: "running", startedAt: new Date().toISOString() }); activeMission = missions.length; setWizard("none"); await refresh("Missão criada e iniciada. Pressione A para adicionar o agente piloto.") }
    else if (wizard === "shell") { const parts = value.split(/\s+/u).filter(Boolean); const shell = process.env.SHELL || "/bin/sh"; await app.createTerminalSession({ workspacePath: project.path, projectId: project.id, missionId: currentMission()?.id, kind: "shell", command: parts[0] || shell, args: parts.slice(1), backend: "pty" }); setWizard("none"); await refresh("Shell aberto na grade.") }
    else if (wizard === "palette") {
      const command = value.toLowerCase(); setWizard("none")
      if (command.startsWith("agent")) setWizard("agent"); else if (command.startsWith("mission")) setWizard("mission"); else if (command.startsWith("shell")) setWizard("shell"); else if (command.startsWith("close")) await closeSelected(); else if (command.startsWith("max")) { maximized = !maximized; await refresh() }
    }
  }
  async function closeSelected() { const session = currentSession(); if (!session) return; await app.closeTerminalSession(session.id); selectedSession = Math.max(0, selectedSession - 1); await refresh("Painel encerrado.") }

  projectSelect.on(SelectRenderableEvents.ITEM_SELECTED, (option: any) => enqueue(() => changeProject(option?.value || projectSelect.getSelectedOption()?.value)))
  missionTabs.on(TabSelectRenderableEvents.ITEM_SELECTED, (option: any) => {
    const value = option?.value || missionTabs.getSelectedOption()?.value
    if (value === "new") setWizard("mission"); else { const index = missions.findIndex((entry) => entry.id === value); if (index >= 0) { activeMission = index; scheduleRefresh() } }
  })
  providerPicker.on(TabSelectRenderableEvents.ITEM_SELECTED, (option: any) => enqueue(() => createAgent(option?.value || providerPicker.getSelectedOption()?.value)))
  prompt.on(InputRenderableEvents.ENTER, () => enqueue(submitPrompt))

  renderer.keyInput.on("keypress", (key: any) => {
    const name = key.name || ""
    if (terminalInput) {
      if (key.ctrl && (name === "]" || key.sequence === "\u001d")) { key.preventDefault(); terminalInput = false; scheduleRefresh("Foco retornou ao cockpit."); return }
      const session = currentSession(); const data = terminalInputForKey(key)
      if (session && data !== null) { key.preventDefault(); enqueue(async () => { const accepted = await app.inputTerminalSession(session.id, data); if (!accepted) { terminalInput = false; await refresh("A PTY parou de responder. O foco voltou ao cockpit.") } }) }
      return
    }
    const shortcut = cockpitShortcut(key, { textInput: prompt.focused })
    if (shortcut === "quit") { key.preventDefault(); quit(); return }
    if (shortcut === "palette") { key.preventDefault(); setWizard("palette"); return }
    if (shortcut === "projects") { key.preventDefault(); prompt.blur(); providerPicker.blur(); missionTabs.blur(); projectSelect.focus(); return }
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
    const numericSlot = /^[1-6]$/u.test(name) ? Number(name) - 1 : -1
    if (numericSlot >= 0) { const item = visibleSessions(sessions, selectedSession, layout())[numericSlot]; if (item) { selectedSession = sessions.findIndex((entry) => entry.id === item.id); selectionTouched = true; scheduleRefresh(`Painel ${numericSlot + 1} selecionado.`) } }
    else if (name === "up" || name === "k") { selectedSession = clampSelection(selectedSession - 1, sessions.length); selectionTouched = true; scheduleRefresh() }
    else if (name === "down" || name === "j") { selectedSession = clampSelection(selectedSession + 1, sessions.length); selectionTouched = true; scheduleRefresh() }
    else if (name === "left" || name === "h") { activeMission = clampSelection(activeMission - 1, missions.length); scheduleRefresh() }
    else if (name === "right" || name === "l") { activeMission = clampSelection(activeMission + 1, missions.length); scheduleRefresh() }
    else if (name === "return") enqueue(enterSelected)
    else if (name === "tab") projectSelect.focus()
    else if (name === "r") enqueue(startMission)
    else if (name === "escape") { setWizard("none"); scheduleRefresh() }
  })
  renderer.keyInput.on("paste", (event: any) => { if (terminalInput && currentSession()) enqueue(async () => { await app.inputTerminalSession(currentSession().id, Buffer.from(event.bytes).toString("utf8")) }) })

  const unsubscribe = typeof app.subscribe === "function" ? app.subscribe((event: any) => {
    if (["agentSession.output", "agentSession.active", "agentSession.exited", "agentSession.closed", "mission.created", "mission.updated"].includes(event?.type)) scheduleRefresh()
  }) : undefined
  const fallbackPoll = setInterval(() => scheduleRefresh(), 1500)
  process.on("SIGWINCH", () => scheduleRefresh())
  setWizard("none"); await refresh(connectedRuntime ? "Cockpit conectado ao runtime persistente." : "Runtime externo indisponível; usando processo local.")
}

main().catch((error) => { console.error(`Erro na TUI OpenTUI: ${error.message}`); process.exitCode = 1 })
