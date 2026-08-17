"use strict";

const readline = require("node:readline");
const path = require("node:path");
const { spawn } = require("node:child_process");

function renderDashboard(project, { runs = [], skills = [], terminals = [], capabilities } = {}) {
  const groups = skills.reduce((result, skill) => { const key = skill.source || "user"; result[key] = (result[key] || 0) + 1; return result; }, {});
  return [
    "Maestro · Project Manager",
    `${project.name} · ${project.status}`,
    project.path,
    `Runs: ${runs.length} | Sessões nativas: ${terminals.length}`,
    `Skills: Maestro ${groups.maestro || 0} · Usuário ${groups.user || 0} · Projeto ${groups.project || 0}`,
    "",
    capabilities && !capabilities.backends.tmux ? "tmux indisponível: instale-o manualmente para sessões persistentes." : "",
    capabilities && !capabilities.tui.bun ? "TUI OpenTUI experimental indisponível (Bun/OpenTUI). Usando painel clássico." : "",
    "[r] runs  [s] skills  [t] sessões  [a] agente  [h] shell  [u] anexar  [x] encerrar  [q] sair"
  ].filter(Boolean).join("\n");
}

async function startTui(application, { input = process.stdin, output = process.stdout, classic = false } = {}) {
  if (!classic) return startOpenTui(application, { input, output });
  const project = await application.inspectProject();
  const [runs, skills, terminals] = await Promise.all([
    application.listRuns({ projectId: project.id }), application.skills.list(), application.listTerminalSessions({ projectId: project.id })
  ]);
  const capabilities = application.terminalCapabilities();
  output.write(`${renderDashboard(project, { runs, skills, terminals, capabilities })}\n`);
  if (!input.isTTY || !output.isTTY) return { interactive: false, project };
  const rl = readline.createInterface({ input, output, prompt: "maestro> " });
  rl.prompt();
  return new Promise((resolve) => rl.on("line", async (line) => {
    const choice = line.trim().toLowerCase();
    if (choice === "q" || choice === "quit" || choice === "exit") { rl.close(); return; }
    if (choice === "r") output.write(`${JSON.stringify(await application.listRuns({ projectId: project.id }), null, 2)}\n`);
    else if (choice === "s") output.write(`${JSON.stringify(application.skills.list(), null, 2)}\n`);
    else if (choice === "t") output.write(`${JSON.stringify(await application.listTerminalSessions({ projectId: project.id }), null, 2)}\n`);
    else if (choice.startsWith("a ")) {
      const providerId = choice.slice(2).trim();
      try { output.write(`${JSON.stringify(await application.createTerminalSession({ workspacePath: project.path, kind: "agent", providerId, backend: "tmux" }), null, 2)}\n`); } catch (error) { output.write(`Erro: ${error.message}\n`); }
    } else if (choice.startsWith("h ")) {
      const [command, ...args] = choice.slice(2).trim().split(/\s+/u);
      try { output.write(`${JSON.stringify(await application.createTerminalSession({ workspacePath: project.path, kind: "shell", command, args, backend: "tmux" }), null, 2)}\n`); } catch (error) { output.write(`Erro: ${error.message}\n`); }
    } else if (choice.startsWith("u ")) {
      const terminalId = choice.slice(2).trim();
      try { await application.attachTerminalSession(terminalId); } catch (error) { output.write(`Erro: ${error.message}\n`); }
    } else if (choice.startsWith("x ")) {
      const terminalId = choice.slice(2).trim();
      output.write((await application.closeTerminalSession(terminalId)) ? "Sessão encerrada.\n" : "Sessão não encontrada.\n");
    } else if (choice === "a") output.write("Uso: a <codex|claude|opencode|agy>\n");
    else if (choice === "h") output.write("Uso: h <comando> [argumentos]\n");
    else if (choice === "u") output.write("Uso: u <id-da-sessão>\n");
    else if (choice === "x") output.write("Uso: x <id-da-sessão>\n");
    else output.write("Comando inválido. Use r, s, t, a, h, u, x ou q.\n");
    rl.prompt();
  }).on("close", () => resolve({ interactive: true, project })));
}

function startOpenTui(application, { input, output }) {
  const capabilities = application.terminalCapabilities();
  if (!capabilities.tui.bun || !capabilities.tui.opentui) {
    throw new Error("A TUI visual requer Bun e @opentui/core. Execute `bun install` no projeto após instalar Bun. `--classic` é apenas o fallback de compatibilidade.");
  }
  const entrypoint = path.join(__dirname, "opentui.ts");
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [entrypoint, "--project-path", application.projectRoot], { stdio: [input, output, process.stderr], shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve({ interactive: true, renderer: "opentui" }) : reject(new Error(`A TUI OpenTUI terminou com código ${code}.`)));
  });
}

module.exports = { renderDashboard, startOpenTui, startTui };
