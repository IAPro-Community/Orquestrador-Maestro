"use strict";

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const readline = require("node:readline");
const vscode = require("vscode");

class BridgeClient {
  constructor(command = "maestro") { this.command = command; this.sequence = 0; this.pending = new Map(); }
  start(workspacePath) {
    if (this.child) return;
    this.child = spawn(this.command, ["bridge", "--stdio", "--project-path", workspacePath], { stdio: ["pipe", "pipe", "pipe"], shell: false });
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", () => this.rejectAll(new Error("Maestro bridge was stopped.")));
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => {
      try { const response = JSON.parse(line); const pending = this.pending.get(response.id); if (pending) { this.pending.delete(response.id); response.error ? pending.reject(Object.assign(new Error(response.error.message), { code: response.error.code, data: response.error.data })) : pending.resolve(response.result); } } catch { /* Ignore non-protocol output. */ }
    });
  }
  rejectAll(error) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear(); }
  call(method, params = {}) {
    if (!this.child?.stdin.writable) return Promise.reject(new Error("Maestro bridge is unavailable. Install or update the Maestro CLI."));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`); });
  }
  dispose() { this.rejectAll(new Error("Maestro extension deactivated.")); this.child?.kill(); }
}

function item(label, state = vscode.TreeItemCollapsibleState.None, command, key) {
  const result = new vscode.TreeItem(label, state);
  result.key = key;
  if (command) result.command = command;
  return result;
}

class MaestroTreeProvider {
  constructor(client, workspacePath) { this.client = client; this.workspacePath = workspacePath; this.changed = new vscode.EventEmitter(); this.onDidChangeTreeData = this.changed.event; }
  refresh() { this.changed.fire(); }
  async getChildren(element) {
    try {
      if (!element) return [item("Projeto", 1, undefined, "project"), item("Missões", 1, undefined, "missions"), item("Skills", 1, undefined, "skills"), item("Providers", 1, undefined, "providers"), item("Runs", 1, undefined, "runs"), item("Sessões", 1, undefined, "sessions")];
      if (element.key === "project") { const project = await this.client.call("project.inspect", { projectPath: this.workspacePath }); return [item(`${project.name} · ${project.status}`), item(project.path), item(`Runs: ${project.runCount}`), item(`Git: ${project.git.available ? `${project.git.files.length} alteração(ões)` : "indisponível"}`)]; }
      if (element.key === "missions") { const project = await this.client.call("project.inspect", { projectPath: this.workspacePath }); const missions = await this.client.call("missions.list", { projectId: project.id }); return missions.length ? missions.map((mission) => item(`${mission.status}: ${mission.objective}`, 0, { command: "maestro.showMission", title: "Show Mission", arguments: [mission.id] })) : [item("Nenhuma missão neste projeto")]; }
      if (element.key === "skills") { const skills = await this.client.call("skills.list"); return ["maestro", "user", "project"].map((source) => item(`${source === "maestro" ? "Maestro Verified" : source === "user" ? "User Installed" : "Project"}: ${skills.filter((skill) => skill.source === source).length}`)); }
      if (element.key === "providers") { const providers = await this.client.call("providers.list"); return providers.map((provider) => item(`${provider.installed ? "Installed" : "Unavailable"}: ${provider.id}`)); }
      if (element.key === "runs") { const runs = await this.client.call("runs.list", { projectPath: this.workspacePath }); return runs.length ? runs.map((run) => item(`${run.status}: ${run.id}`, 0, { command: "maestro.showRun", title: "Show Run", arguments: [run.id] })) : [item("Nenhum Run neste projeto")]; }
      if (element.key === "sessions") return [item("Agentes", 1, undefined, "agents"), item("Shells", 1, undefined, "shells")];
      if (element.key === "agents" || element.key === "shells") {
        const project = await this.client.call("project.inspect", { projectPath: this.workspacePath });
        const kind = element.key === "agents" ? "agent" : "shell";
        const sessions = await this.client.call("terminals.list", { projectId: project.id, kind });
        return sessions.length ? sessions.map((session) => item(`${session.status}: ${session.label} · ${session.id}`, 0, { command: "maestro.focusTerminal", title: "Focus Terminal", arguments: [session.id] })) : [item(kind === "agent" ? "Nenhum agente" : "Nenhum shell")];
      }
    } catch (error) { return [item(`Erro: ${error.message}`)]; }
    return [];
  }
}

function commandLine(session) {
  return [session.command, ...(session.args || [])].map((part) => /[\s"']/u.test(part) ? JSON.stringify(part) : part).join(" ");
}

async function createNativeTerminal({ client, workspacePath, terminals, provider, kind, command, args = [] }) {
  const session = await client.call("terminals.create", { workspacePath, backend: "vscode", kind, providerId: provider, command, args, label: provider || command });
  const terminal = vscode.window.createTerminal({ name: `Maestro · ${session.label}`, cwd: workspacePath });
  terminals.set(terminal.name, { terminal, sessionId: session.id });
  await client.call("terminals.registerClient", { terminalId: session.id, clientId: terminals.clientId, terminalName: terminal.name });
  terminal.sendText(commandLine(session), true);
  terminal.show();
  return session;
}

function openCockpit(context, client, workspacePath) {
  const panel = vscode.window.createWebviewPanel("maestro.cockpit", "Maestro Cockpit", vscode.ViewColumn.One, {
    enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "node_modules")]
  });
  const xtermScript = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "node_modules", "@xterm", "xterm", "lib", "xterm.js"));
  const xtermStyle = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "node_modules", "@xterm", "xterm", "css", "xterm.css"));
  panel.webview.html = `<!doctype html><html><head><link rel="stylesheet" href="${xtermStyle}"><style>body{margin:0;background:#05070b;color:#e6edf5;font:13px system-ui}.cockpit{display:grid;grid-template-columns:260px 1fr;min-height:100vh}.nav{padding:16px;background:#0a0f16;border-right:1px solid #243244}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px}.pane{min-height:180px;border:1px solid #243244;background:#0a0f16}.pane:first-child{grid-row:span 2}.meta{padding:7px;color:#8391a5;border-bottom:1px solid #162131}.terminal{height:145px;padding:4px}</style></head><body><div class="cockpit"><aside class="nav"><h3>◆ Maestro ADE</h3><div id="project"></div><p id="mission"></p></aside><main><div class="meta">Piloto e especialistas · até seis terminais por página</div><section id="grid" class="grid"></section></main></div><script src="${xtermScript}"></script><script>const api=acquireVsCodeApi(),terminals=new Map(),sequences=new Map();function render(d){document.querySelector('#project').textContent=d.project.name+' · '+d.project.status;document.querySelector('#mission').textContent=d.mission?.objective||'Nenhuma missão ativa';for(const s of d.sessions.filter(x=>x.backend==='pty').slice(0,6)){let p=document.getElementById(s.id);if(!p){p=document.createElement('div');p.id=s.id;p.className='pane';p.innerHTML='<div class="meta"></div><div class="terminal"></div>';document.querySelector('#grid').append(p);const t=new Terminal({convertEol:true,scrollback:2000,theme:{background:'#0a0f16'}});t.open(p.querySelector('.terminal'));t.onData(input=>api.postMessage({type:'input',terminalId:s.id,input}));terminals.set(s.id,t);sequences.set(s.id,0)}p.querySelector('.meta').textContent=(s.providerId||'shell')+' · '+s.label+' · '+s.status;api.postMessage({type:'snapshot',terminalId:s.id,afterSequence:sequences.get(s.id)||0})}}window.addEventListener('message',e=>{if(e.data.type==='dashboard')render(e.data.data);if(e.data.type==='snapshot'){const d=e.data.data,t=terminals.get(d.session.id);if(t&&d.deltaAnsi)t.write(d.deltaAnsi);sequences.set(d.session.id,d.sequence||0)}});api.postMessage({type:'ready'});</script></body></html>`;
  const refresh = async () => panel.webview.postMessage({ type: "dashboard", data: await client.call("projects.dashboard", { projectPath: workspacePath }) });
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === "ready") return refresh();
    if (message.type === "snapshot") return panel.webview.postMessage({ type: "snapshot", data: await client.call("agentSessions.snapshot", { terminalId: message.terminalId, afterSequence: message.afterSequence || 0 }) });
    if (message.type === "input") return client.call("agentSessions.input", { terminalId: message.terminalId, input: message.input });
  });
  const interval = setInterval(() => refresh().catch(() => {}), 1000);
  panel.onDidDispose(() => clearInterval(interval));
}

function activate(context) {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspacePath) return;
  const client = new BridgeClient(); client.start(workspacePath);
  const terminals = new Map(); terminals.clientId = `vscode-${crypto.randomUUID()}`;
  const provider = new MaestroTreeProvider(client, workspacePath);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("maestro.runs", provider));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.openCockpit", () => openCockpit(context, client, workspacePath)));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.refresh", () => provider.refresh()));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.refreshTerminalSessions", () => provider.refresh()));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.showProject", async () => vscode.window.showInformationMessage(JSON.stringify(await client.call("project.inspect", { projectPath: workspacePath }), null, 2))));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.showRun", async (runId) => vscode.workspace.openTextDocument({ content: JSON.stringify(await client.call("runs.inspect", { runId }), null, 2), language: "json" }).then(vscode.window.showTextDocument)));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.showMission", async (missionId) => vscode.workspace.openTextDocument({ content: JSON.stringify(await client.call("missions.get", { missionId }), null, 2), language: "json" }).then(vscode.window.showTextDocument)));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.createMission", async () => {
    const objective = await vscode.window.showInputBox({ prompt: "Objetivo da missão", placeHolder: "Ex.: preparar o cockpit visual do projeto" });
    if (!objective) return;
    try { await client.call("missions.create", { objective, workspacePath }); provider.refresh(); vscode.window.showInformationMessage("Missão criada. Revise o plano no cockpit Maestro."); } catch (error) { vscode.window.showErrorMessage(error.message); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.runTask", async () => {
    const description = await vscode.window.showInputBox({ prompt: "O que você quer fazer?" }); if (!description) return;
    const providers = await client.call("providers.list", {}); const selected = await vscode.window.showQuickPick(providers.filter((entry) => entry.installed).map((entry) => entry.id), { placeHolder: "Provider" }); if (!selected) return;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Maestro Run" }, () => client.call("runs.create", { description, providerId: selected, workspacePath })); provider.refresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.startAgentTerminal", async () => {
    const selected = await vscode.window.showQuickPick(["codex", "claude", "opencode", "agy"], { placeHolder: "Agente" }); if (!selected) return;
    try { await createNativeTerminal({ client, workspacePath, terminals, provider: selected, kind: "agent" }); provider.refresh(); } catch (error) { vscode.window.showErrorMessage(error.message); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.startShellTerminal", async () => {
    const commandLineInput = await vscode.window.showInputBox({ prompt: "Comando (ex.: npm test)" }); if (!commandLineInput) return;
    const [command, ...args] = commandLineInput.trim().split(/\s+/u);
    try { await createNativeTerminal({ client, workspacePath, terminals, kind: "shell", command, args }); provider.refresh(); } catch (error) { vscode.window.showErrorMessage(error.message); }
  }));
  // Alias compatível com a primeira extensão, agora abrindo um terminal nativo.
  context.subscriptions.push(vscode.commands.registerCommand("maestro.startTerminal", () => vscode.commands.executeCommand("maestro.startShellTerminal")));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.focusTerminal", async (terminalId) => {
    const matching = [...terminals.values()].find((entry) => entry.sessionId === terminalId);
    if (matching) { matching.terminal.show(); return; }
    vscode.window.showInformationMessage("A sessão não pertence a esta janela VS Code ou já foi encerrada.");
  }));
  context.subscriptions.push(vscode.commands.registerCommand("maestro.stopTerminal", async (terminalId) => {
    const matching = [...terminals.values()].find((entry) => entry.sessionId === terminalId);
    if (matching) matching.terminal.dispose();
    await client.call("terminals.close", { terminalId }); provider.refresh();
  }));
  context.subscriptions.push(vscode.window.onDidCloseTerminal((terminal) => {
    const entry = terminals.get(terminal.name); if (!entry) return;
    terminals.delete(terminal.name);
    client.call("terminals.updateClientStatus", { terminalId: entry.sessionId, clientId: terminals.clientId, status: "closed" }).catch(() => {});
    provider.refresh();
  }));
  context.subscriptions.push({ dispose: () => client.dispose() });
}

function deactivate() {}
module.exports = { activate, deactivate, BridgeClient, MaestroTreeProvider, commandLine, createNativeTerminal, openCockpit };
