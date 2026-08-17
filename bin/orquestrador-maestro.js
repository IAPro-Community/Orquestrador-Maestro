#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const packageJson = require(path.join(rootDir, "package.json"));
const contextBrief = require(path.join(rootDir, "orquestrador", "bin", "context-brief.js"));
const { MaestroApplication } = require(path.join(rootDir, "runtime", "application"));
const { createBridge, createStdioServer, startSocketRuntime } = require(path.join(rootDir, "runtime", "bridge"));
const { startTui } = require(path.join(rootDir, "runtime", "tui"));
const telemetryTimeoutMs = 1200;
const telemetryConsentVersion = 1;

const installFlagDefs = {
  "--home-path": { ps: "-HomePath", sh: "--home-path", value: true },
  "--no-force": { ps: "-NoForce", sh: "--no-force" },
  "--no-tool-profiles": { ps: "-NoToolProfiles", sh: "--no-tool-profiles" },
  "--core-only": { ps: "-CoreOnly", sh: "--core-only" },
  "--skip-community-skills": { ps: "-SkipCommunitySkills", sh: "--skip-community-skills" },
  "--skip-skill-sync": { ps: "-SkipSkillSync", sh: "--skip-skill-sync" },
  "--only": { ps: "-Only", sh: "--only", value: true, splitComma: true },
  "--dry-run": { ps: "-DryRun", sh: "--dry-run" },
  "--list-targets": { ps: "-ListTargets", sh: "--list-targets" },
  "--uninstall": { ps: "-Uninstall", sh: "--uninstall" },
  "--non-interactive": { ps: "-NonInteractive", sh: "--non-interactive" },
  "--verbose-paths": { ps: "-VerbosePaths", sh: "--verbose-paths" }
};

const verifyFlagDefs = {
  "--home-path": { ps: "-HomePath", sh: "--home-path", value: true },
  "--skip-tool-profiles": { ps: "-SkipToolProfiles", sh: "--skip-tool-profiles" },
  "--core-only": { ps: "-CoreOnly", sh: "--core-only" },
  "--verbose-paths": { ps: "-VerbosePaths", sh: "--verbose-paths" }
};

const initDevFlagDefs = {
  "--project-path": { ps: "-ProjectPath", sh: "--project-path", value: true }
};

function printHelp() {
  console.log(`Orquestrador Maestro CLI ${packageJson.version}

Uso:
  orquestrador-maestro install [opcoes]
  orquestrador-maestro update [opcoes]
  orquestrador-maestro verify [opcoes]
  orquestrador-maestro doctor [opcoes]
  orquestrador-maestro init-dev [--project-path PATH]
  orquestrador-maestro compact-worklog [--project-path PATH] [--keep N]
  orquestrador-maestro check-dev-gates [--project-path PATH] [--max-entries N] [--strict]
  orquestrador-maestro context brief [--project-path PATH] [--task TEXT] [--max-chars N] [--json]
  orquestrador-maestro run [--provider ID] [--profile ID] [--policy ID] [--workspace PATH] "tarefa"
  orquestrador-maestro go [--auto] [--plan] [--provider ID] [--interviewer ID] [--project-path PATH] "tarefa"
  orquestrador-maestro plan [--auto] [--plan] [--provider ID] [--interviewer ID] [--project-path PATH] "tarefa"
  orquestrador-maestro runs [--project-path PATH]
  orquestrador-maestro run show <id> [--project-path PATH]
  orquestrador-maestro run inspect <id> [--project-path PATH]
  orquestrador-maestro run cancel <id> [--project-path PATH]
  orquestrador-maestro projects
  orquestrador-maestro project add <caminho>
  orquestrador-maestro project show <id> [--project-path PATH]
  orquestrador-maestro missions [--project-path PATH]
  orquestrador-maestro mission create [--project-path PATH] "objetivo"
  orquestrador-maestro mission show <id> [--project-path PATH]
  orquestrador-maestro terminal list [--project-path PATH]
  orquestrador-maestro terminals [--project-path PATH]
  orquestrador-maestro terminal agent <codex|claude|opencode|agy> [--project-path PATH]
  orquestrador-maestro terminal shell [--project-path PATH] -- <comando> [argumentos]
  orquestrador-maestro terminal attach <id> [--project-path PATH]
  orquestrador-maestro terminal close <id> [--project-path PATH]
  orquestrador-maestro terminal start [--project-path PATH] -- <comando> [argumentos]
  orquestrador-maestro terminal stop <id> [--project-path PATH]
  orquestrador-maestro tui [--project-path PATH] [--classic]
  orquestrador-maestro skills list [--project-path PATH]
  orquestrador-maestro providers list [--project-path PATH]
  orquestrador-maestro bridge --stdio [--project-path PATH]
  orquestrador-maestro runtime [--project-path PATH]
  orquestrador-maestro adapters <list|paths|validate> [id]
  orquestrador-maestro adapters render <junie|goose|openhands> --project-path PATH [--dry-run|--apply]
  orquestrador-maestro changelog [--full]
  orquestrador-maestro uninstall [opcoes]
  orquestrador-maestro list-targets [opcoes]
  orquestrador-maestro dry-run [opcoes]
  orquestrador-maestro telemetry [status|enable|disable|endpoint|test]
  orquestrador-maestro version

Opcoes de install/update/uninstall:
  --home-path <path>          Instala em outro home para teste
  --core-only                 Instala somente .orquestrador e AGENTS.md
  --only <component>          Limita a um componente: core, codex, agents,
                              claude, opencode, cursor, gemini, windsurf,
                              antigravity
  --no-tool-profiles          Nao instala perfis globais das ferramentas
  --skip-community-skills     Nao copia a biblioteca comunitaria offload
  --skip-skill-sync           Nao roda o sync de skills
  --dry-run                   Mostra o plano sem alterar arquivos
  --list-targets              Lista os destinos conhecidos
  --non-interactive           Evita prompts interativos
  --verbose-paths             Mostra caminhos reais nos relatorios

Opcoes de verify:
  --home-path <path>
  --core-only
  --skip-tool-profiles
  --verbose-paths

Opcoes de doctor:
  --home-path <path>          Diagnostica outro home
  --repair-ui                 Mostra a correção para Bun/OpenTUI/node-pty

Opcoes de init-dev:
  --project-path <path>       Cria a hierarquia DEV recomendada no projeto

Opcoes de compact-worklog:
  --project-path <path>       Projeto que contem DEV/WORKLOG.md
  --keep <n>                  Mantem as N entradas mais recentes no WORKLOG

Opcoes de check-dev-gates:
  --project-path <path>       Projeto que contem a hierarquia DEV
  --max-entries <n>           Falha se DEV/WORKLOG.md passar do limite
  --strict                    Exige entrada substantiva e bullets minimos

Opcoes de changelog:
  --full                      Mostra o historico completo embutido no pacote

Exemplos:
  npm install -g @iapro/orquestrador-maestro-cli
  orquestrador-maestro install
  orquestrador-maestro verify
  orquestrador-maestro changelog
  npm update -g @iapro/orquestrador-maestro-cli
  orquestrador-maestro update
  orquestrador-maestro doctor
  orquestrador-maestro init-dev --project-path .
  orquestrador-maestro compact-worklog --project-path . --keep 12
  orquestrador-maestro check-dev-gates --project-path . --strict
`);
}

function normalizeArgs(args) {
  return args.flatMap((arg) => {
    if (arg.startsWith("--") && arg.includes("=")) {
      const index = arg.indexOf("=");
      return [arg.slice(0, index), arg.slice(index + 1)];
    }
    return [arg];
  });
}

function translateArgs(args, defs, target) {
  const normalized = normalizeArgs(args);
  const translated = [];
  const arrayValues = new Map();

  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    const def = defs[arg];
    if (!def) {
      throw new Error(`Parametro desconhecido: ${arg}`);
    }

    if (def.value) {
      const value = normalized[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Parametro ${arg} exige um valor.`);
      }
      const values = def.splitComma
        ? value.split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean)
        : [value];
      if (values.length === 0) {
        throw new Error(`Parametro ${arg} exige um valor.`);
      }
      if (def.splitComma && target === "ps") {
        const collected = arrayValues.get(arg) || [];
        collected.push(...values);
        arrayValues.set(arg, collected);
      } else if (def.splitComma) {
        for (const item of values) {
          translated.push(def[target], item);
        }
      } else {
        translated.push(def[target], value);
      }
      i += 1;
    } else {
      translated.push(def[target]);
    }
  }

  for (const [arg, values] of arrayValues.entries()) {
    translated.push(defs[arg][target], values.join(","));
  }

  return translated;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 1;
}

function commandExists(filePath) {
  return fs.existsSync(filePath);
}

function runInstall(args, injectedFlags = []) {
  const isWindows = process.platform === "win32";
  const script = path.join(rootDir, isWindows ? "install.ps1" : "install.sh");
  if (!commandExists(script)) {
    throw new Error(`Instalador nao encontrado: ${script}`);
  }

  if (isWindows) {
    const translated = translateArgs([...args, ...injectedFlags], installFlagDefs, "ps");
    return run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...translated]);
  }

  const translated = translateArgs([...args, ...injectedFlags], installFlagDefs, "sh");
  return run("bash", [script, ...translated]);
}

function runVerify(args) {
  const isWindows = process.platform === "win32";
  const script = path.join(rootDir, "scripts", isWindows ? "verify-install.ps1" : "verify-install.sh");
  if (!commandExists(script)) {
    throw new Error(`Verificador nao encontrado: ${script}`);
  }

  if (isWindows) {
    const translated = translateArgs(args, verifyFlagDefs, "ps");
    return run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...translated]);
  }

  const translated = translateArgs(args, verifyFlagDefs, "sh");
  return run("bash", [script, ...translated]);
}

function parseDoctorArgs(args) {
  const normalized = normalizeArgs(args);
  let homePath = "";
  let repairUi = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === "--repair-ui") { repairUi = true; continue; }
    if (arg === "--home-path") {
      const value = normalized[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Parametro --home-path exige um valor.");
      }
      homePath = value;
      i += 1;
      continue;
    }
    throw new Error(`Parametro desconhecido: ${arg}`);
  }

  return { homePath, repairUi };
}

function runDoctor(args) {
  const script = path.join(rootDir, "orquestrador", "doctor.ps1");
  if (!commandExists(script)) {
    throw new Error(`Diagnostico nao encontrado: ${script}`);
  }

  const { homePath, repairUi } = parseDoctorArgs(args);
  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script];
  if (homePath) {
    psArgs.push("-HomePath", homePath);
  }
  if (repairUi) psArgs.push("-RepairUi");

  if (process.platform === "win32") {
    return run("powershell", psArgs);
  }

  for (const command of ["pwsh", "powershell"]) {
    try {
      return run(command, psArgs);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("O comando doctor requer PowerShell. Instale pwsh ou use orquestrador-maestro verify.");
}

function runInitDev(args) {
  const isWindows = process.platform === "win32";
  const script = path.join(rootDir, "orquestrador", "bin", isWindows ? "init-project-dev.ps1" : "init-project-dev.sh");
  if (!commandExists(script)) {
    throw new Error(`Inicializador DEV nao encontrado: ${script}`);
  }

  if (isWindows) {
    const translated = translateArgs(args, initDevFlagDefs, "ps");
    return run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...translated], { cwd: process.cwd() });
  }

  const translated = translateArgs(args, initDevFlagDefs, "sh");
  return run("bash", [script, ...translated], { cwd: process.cwd() });
}

function runDevContextHelper(helperCommand, args) {
  const script = path.join(rootDir, "orquestrador", "bin", "dev-context-tools.js");
  if (!commandExists(script)) {
    throw new Error(`Helper DEV nao encontrado: ${script}`);
  }
  return run(process.execPath, [script, helperCommand, ...args], { cwd: process.cwd() });
}

function runToolAdapters(args) {
  const script = path.join(rootDir, "orquestrador", "bin", "tool-adapters.js");
  if (!commandExists(script)) {
    throw new Error(`Manifesto de adaptadores nao encontrado: ${script}`);
  }
  return run(process.execPath, [script, ...args], { cwd: process.cwd() });
}

function parseRuntimeArgs(args, allowed = [], booleanFlags = []) {
  const options = { projectPath: process.cwd(), values: [] };
  const normalized = normalizeArgs(args);
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    if (!arg.startsWith("--")) { options.values.push(arg); continue; }
    if (!allowed.includes(arg) && !booleanFlags.includes(arg)) throw new Error(`Parametro desconhecido: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (booleanFlags.includes(arg)) {
      options[key] = true;
      continue;
    }
    const value = normalized[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Parametro ${arg} exige um valor.`);
    options[key] = value;
    index += 1;
  }
  return options;
}

async function createRuntimeApplication(projectPath) {
  const app = new MaestroApplication({ projectRoot: projectPath });
  await app.initialize();
  return app;
}

async function handleRunCommand(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "show" || subcommand === "inspect") {
    const options = parseRuntimeArgs(rest, ["--project-path"]);
    const runId = options.values[0];
    if (!runId || options.values.length !== 1) throw new Error("Uso: maestro run inspect <id> [--project-path PATH]");
    const inspection = await (await createRuntimeApplication(options.projectPath)).inspectRun(runId);
    if (!inspection) throw new Error(`Run nao encontrado: ${runId}`);
    console.log(JSON.stringify(inspection, null, 2)); return 0;
  }
  if (subcommand === "cancel") {
    const options = parseRuntimeArgs(rest, ["--project-path"]);
    const runId = options.values[0];
    if (!runId || options.values.length !== 1) throw new Error("Uso: maestro run cancel <id> [--project-path PATH]");
    const cancelled = await (await createRuntimeApplication(options.projectPath)).cancelRun(runId);
    if (!cancelled) throw new Error(`Run ativo nao encontrado: ${runId}`);
    console.log(`Cancelamento solicitado para ${runId}.`); return 0;
  }
  const options = parseRuntimeArgs(args, ["--provider", "--profile", "--policy", "--workspace", "--project-path", "--model", "--mode", "--agent", "--sandbox"]);
  const description = options.values.join(" ").trim();
  if (!description) throw new Error("Informe a tarefa: maestro run [opcoes] \"tarefa\"");
  const outcome = await (await createRuntimeApplication(options.projectPath)).executeRun({
    description, providerId: options.provider, profileId: options.profile, policyId: options.policy,
    workspacePath: options.workspace || options.projectPath, model: options.model, mode: options.mode, agent: options.agent, sandbox: options.sandbox
  });
  console.log(JSON.stringify({ run: outcome.run, verification: outcome.verification, changes: outcome.changes }, null, 2));
  return outcome.run.status === "completed" ? 0 : 1;
}

async function handleRunsCommand(args) {
  const options = parseRuntimeArgs(args, ["--project-path"]);
  if (options.values.length > 0) throw new Error("Uso: maestro runs [--project-path PATH]");
  console.log(JSON.stringify(await (await createRuntimeApplication(options.projectPath)).listRuns({ projectPath: options.projectPath }), null, 2));
  return 0;
}

async function handleProjectsCommand(args) {
  if (args.length !== 0) throw new Error("Uso: maestro projects");
  console.log(JSON.stringify(await (await createRuntimeApplication(process.cwd())).listProjects(), null, 2));
  return 0;
}

async function handleProjectCommand(args) {
  const [subcommand, ...rest] = args;
  
  if (subcommand === "inspect") {
    const options = parseRuntimeArgs(rest, ["--project-path"]);
    const targetPath = options.projectPath || process.cwd();
    const { inspectProject } = require(path.join(rootDir, "runtime", "inspector", "project-inspector"));
    const snapshot = await inspectProject(targetPath, "local");
    console.log(JSON.stringify(snapshot, null, 2));
    return 0;
  }

  if (subcommand === "add") {
    if (rest.length !== 1 || rest[0].startsWith("--")) throw new Error("Uso: maestro project add <caminho>");
    console.log(JSON.stringify(await (await createRuntimeApplication(process.cwd())).registerProject({ projectPath: rest[0] }), null, 2)); return 0;
  }
  if (subcommand !== "show") throw new Error("Uso: maestro project show <id> [--project-path PATH] ou maestro project inspect [--project-path PATH]");
  const options = parseRuntimeArgs(rest, ["--project-path"]);
  if (options.values.length > 1) throw new Error("Uso: maestro project show <id> [--project-path PATH]");
  const project = await (await createRuntimeApplication(options.projectPath)).inspectProject({ projectId: options.values[0], projectPath: options.projectPath });
  console.log(JSON.stringify(project, null, 2)); return 0;
}

async function handleMissionsCommand(args) {
  const options = parseRuntimeArgs(args, ["--project-path"]);
  if (options.values.length) throw new Error("Uso: maestro missions [--project-path PATH]");
  const app = await createRuntimeApplication(options.projectPath);
  const project = await app.inspectProject({ projectPath: options.projectPath });
  console.log(JSON.stringify(await app.listMissions({ projectId: project.id }), null, 2));
  return 0;
}

async function handleMissionCommand(args) {
  const [subcommand, ...rest] = args;
  const options = parseRuntimeArgs(rest, ["--project-path"]);
  if (subcommand === "create") {
    if (options.values.length !== 1) throw new Error('Uso: maestro mission create [--project-path PATH] "objetivo"');
    const mission = await (await createRuntimeApplication(options.projectPath)).createMission({ workspacePath: options.projectPath, objective: options.values[0] });
    console.log(JSON.stringify(mission, null, 2));
    return 0;
  }
  if (subcommand === "show") {
    if (options.values.length !== 1) throw new Error("Uso: maestro mission show <id> [--project-path PATH]");
    const mission = await (await createRuntimeApplication(options.projectPath)).getMission(options.values[0]);
    if (!mission) throw new Error(`Missão não encontrada: ${options.values[0]}`);
    console.log(JSON.stringify(mission, null, 2));
    return 0;
  }
  throw new Error("Uso: maestro mission <create|show>");
}

async function handleTerminalCommand(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "list") {
    const options = parseRuntimeArgs(rest, ["--project-path"]);
    if (options.values.length) throw new Error("Uso: maestro terminal list [--project-path PATH]");
    const app = await createRuntimeApplication(options.projectPath);
    const project = await app.inspectProject({ projectPath: options.projectPath });
    console.log(JSON.stringify(await app.listTerminalSessions({ projectId: project.id }), null, 2)); return 0;
  }
  if (subcommand === "agent" || subcommand === "shell") {
    const separator = rest.indexOf("--");
    const options = parseRuntimeArgs(separator === -1 ? rest : rest.slice(0, separator), ["--project-path"]);
    const values = options.values;
    if (subcommand === "agent") {
      const providerId = values[0];
      if (!providerId || values.length !== 1 || separator !== -1) throw new Error("Uso: maestro terminal agent <codex|claude|opencode|agy> [--project-path PATH]");
      const session = await (await createRuntimeApplication(options.projectPath)).createTerminalSession({ workspacePath: options.projectPath, kind: "agent", providerId, backend: "pty" });
      console.log(JSON.stringify(session, null, 2)); return 0;
    }
    if (separator === -1 || separator === rest.length - 1 || values.length) throw new Error("Uso: maestro terminal shell [--project-path PATH] -- <comando> [argumentos]");
    const [command, ...commandArgs] = rest.slice(separator + 1);
    const session = await (await createRuntimeApplication(options.projectPath)).createTerminalSession({ workspacePath: options.projectPath, kind: "shell", command, args: commandArgs, backend: "pty" });
    console.log(JSON.stringify(session, null, 2)); return 0;
  }
  if (subcommand === "attach" || subcommand === "close") {
    const options = parseRuntimeArgs(rest, ["--project-path"]); const terminalId = options.values[0];
    if (!terminalId || options.values.length !== 1) throw new Error(`Uso: maestro terminal ${subcommand} <id> [--project-path PATH]`);
    const app = await createRuntimeApplication(options.projectPath);
    const successful = subcommand === "attach" ? await app.attachTerminalSession(terminalId) : await app.closeTerminalSession(terminalId);
    if (!successful) throw new Error(`Sessão não encontrada ou não está disponível: ${terminalId}`);
    if (subcommand === "close") console.log(`Sessão encerrada: ${terminalId}.`);
    return 0;
  }
  if (subcommand === "stop") {
    const options = parseRuntimeArgs(rest, ["--project-path"]); const terminalId = options.values[0];
    if (!terminalId || options.values.length !== 1) throw new Error("Uso: maestro terminal stop <id> [--project-path PATH]");
    if (!await (await createRuntimeApplication(options.projectPath)).stopTerminal(terminalId)) throw new Error(`Terminal ativo nao encontrado: ${terminalId}`);
    console.log(`Encerramento solicitado para ${terminalId}.`); return 0;
  }
  if (subcommand === "start") {
    const separator = rest.indexOf("--");
    if (separator === -1 || separator === rest.length - 1) throw new Error("Uso: maestro terminal start [--project-path PATH] -- <comando> [argumentos]");
    const options = parseRuntimeArgs(rest.slice(0, separator), ["--project-path"]);
    const [command, ...commandArgs] = rest.slice(separator + 1);
    if (options.values.length) throw new Error("Uso: maestro terminal start [--project-path PATH] -- <comando> [argumentos]");
    const app = await createRuntimeApplication(options.projectPath);
    const terminal = await app.startTerminal({ workspacePath: options.projectPath, command, args: commandArgs });
    console.log(`Comando gerenciado iniciado: ${terminal.id}. Aguarde a conclusão; para sessão ao vivo, use \`maestro tui\` ou a extensão VS Code.`);
    const completed = await app.waitTerminal(terminal.id);
    console.log(JSON.stringify(completed, null, 2)); return completed?.status === "completed" ? 0 : 1;
  }
  throw new Error("Uso: maestro terminal <list|agent|shell|attach|close|start|stop>");
}

async function handleTerminalsCommand(args) {
  const options = parseRuntimeArgs(args, ["--project-path"]);
  if (options.values.length) throw new Error("Uso: maestro terminals [--project-path PATH]");
  const app = await createRuntimeApplication(options.projectPath);
  const project = await app.inspectProject({ projectPath: options.projectPath });
  console.log(JSON.stringify(await app.listTerminalSessions({ projectId: project.id }), null, 2));
  return 0;
}

async function handleTuiCommand(args) {
  const classic = args.includes("--classic");
  const options = parseRuntimeArgs(args.filter((arg) => arg !== "--classic"), ["--project-path"]);
  if (options.values.length) throw new Error("Uso: maestro tui [--project-path PATH]");
  await startTui(await createRuntimeApplication(options.projectPath), { classic }); return 0;
}

async function handleSkillsCommand(args) {
  const options = parseRuntimeArgs(args.slice(1), ["--project-path"]);
  if (args[0] !== "list" || options.values.length > 0) throw new Error("Uso: maestro skills list [--project-path PATH]");
  console.log(JSON.stringify((await createRuntimeApplication(options.projectPath)).skills.list(), null, 2));
  return 0;
}

async function handleProvidersCommand(args) {
  const options = parseRuntimeArgs(args.slice(1), ["--project-path"]);
  if (args[0] !== "list" || options.values.length > 0) throw new Error("Uso: maestro providers list [--project-path PATH]");
  console.log(JSON.stringify(await (await createRuntimeApplication(options.projectPath)).listProviders(), null, 2));
  return 0;
}

async function handleBridgeCommand(args) {
  const hasStdio = args.includes("--stdio");
  const options = parseRuntimeArgs(args.filter((arg) => arg !== "--stdio"), ["--project-path"]);
  if (!hasStdio || options.values.length !== 0) throw new Error("Uso: maestro bridge --stdio [--project-path PATH]");
  const app = await createRuntimeApplication(options.projectPath);
  const bridge = createBridge({ projectRoot: options.projectPath, services: {
    projectInspector: { inspect: (params) => app.inspectProject(params) },
    skillRegistry: app.skills,
    providerRegistry: { list: () => app.listProviders() },
    runStore: { listRuns: (filters) => app.listRuns(filters), getRun: (id) => app.getRun(id), listArtifacts: (filters) => app.listArtifacts(filters), getArtifact: (id) => app.getArtifact(id), getVerification: (runId) => app.getVerification(runId) },
    runtime: app
  } });
  createStdioServer(bridge);
  return new Promise(() => {});
}

async function handleRuntimeCommand(args) {
  const options = parseRuntimeArgs(args, ["--project-path"]);
  if (options.values.length) throw new Error("Uso: maestro runtime [--project-path PATH]");
  const app = await createRuntimeApplication(options.projectPath);
  const bridge = createBridge({ projectRoot: options.projectPath, services: {
    projectInspector: { inspect: (params) => app.inspectProject(params) }, skillRegistry: app.skills,
    providerRegistry: { list: () => app.listProviders() }, runtime: app,
    runStore: { listRuns: (filters) => app.listRuns(filters), getRun: (id) => app.getRun(id), listArtifacts: (filters) => app.listArtifacts(filters), getArtifact: (id) => app.getArtifact(id), getVerification: (runId) => app.getVerification(runId) }
  } });
  const runtime = startSocketRuntime(bridge, { projectRoot: options.projectPath });
  console.log(`Runtime Maestro ativo em ${runtime.paths.socketPath}`);
  return new Promise((resolve) => process.once("SIGINT", async () => { await runtime.close(); resolve(0); }));
}

function getTelemetryConfigPath() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "OrquestradorMaestro", "telemetry.json");
  }

  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "orquestrador-maestro", "telemetry.json");
}

function defaultTelemetryEndpoint() {
  return process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_ENDPOINT ||
    (packageJson.config && packageJson.config.telemetryEndpoint) ||
    "";
}

function defaultTelemetryConfig() {
  return {
    enabled: false,
    endpoint: defaultTelemetryEndpoint(),
    anonymousId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    consentVersion: 0
  };
}

function normalizeTelemetryConfig(config) {
  const rawConfig = config && typeof config === "object" ? config : {};
  const hasCurrentConsent =
    rawConfig.enabled === true &&
    rawConfig.consentVersion === telemetryConsentVersion;

  return {
    ...defaultTelemetryConfig(),
    ...rawConfig,
    enabled: hasCurrentConsent,
    endpoint: rawConfig.endpoint || defaultTelemetryEndpoint(),
    consentVersion: hasCurrentConsent ? telemetryConsentVersion : (rawConfig.consentVersion || 0)
  };
}

function readTelemetryConfig() {
  const configPath = getTelemetryConfigPath();
  if (!fs.existsSync(configPath)) {
    return defaultTelemetryConfig();
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return normalizeTelemetryConfig(config);
  } catch {
    return defaultTelemetryConfig();
  }
}

function writeTelemetryConfig(config) {
  const configPath = getTelemetryConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function telemetryDisabledByEnv() {
  const value = String(process.env.ORQUESTRADOR_MAESTRO_TELEMETRY || "").toLowerCase();
  return value === "0" || value === "false" || value === "off" || value === "disabled";
}

function validateTelemetryEndpoint(endpoint) {
  if (!endpoint) {
    return "";
  }

  const url = new URL(endpoint);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    throw new Error("Endpoint de telemetria deve usar HTTPS, exceto localhost para desenvolvimento.");
  }
  return url.toString();
}

function endpointLabel(endpoint) {
  if (!endpoint) {
    return "[not configured]";
  }
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[invalid]";
  }
}

function sanitizeFlags(args) {
  const normalized = normalizeArgs(args);
  const flags = [];
  for (const arg of normalized) {
    if (arg.startsWith("--")) {
      flags.push(arg);
    }
  }
  return Array.from(new Set(flags)).sort();
}

function readBundledFile(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (!commandExists(filePath)) {
    throw new Error(`Arquivo nao encontrado no pacote: ${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function extractMarkdownSections(markdown, limit) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const header = lines[0] && lines[0].startsWith("# ") ? lines[0] : "";
  const body = header ? lines.slice(1) : lines;
  const captured = [];
  let sectionCount = 0;
  let capturing = false;

  for (const line of body) {
    if (line.startsWith("## ")) {
      if (capturing && sectionCount >= limit) {
        break;
      }
      sectionCount += 1;
      capturing = sectionCount <= limit;
    }
    if (capturing) {
      captured.push(line);
    }
  }

  return [header, captured.join("\n").trim()].filter(Boolean).join("\n\n").trim();
}

function buildTelemetryPayload(command, args, exitCode, errorName) {
  const config = readTelemetryConfig();
  return {
    schemaVersion: 1,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    event: "cli_command",
    command,
    flags: sanitizeFlags(args),
    exitCode,
    success: exitCode === 0,
    errorName: errorName || null,
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    ci: Boolean(process.env.CI),
    anonymousId: config.anonymousId,
    timestamp: new Date().toISOString()
  };
}

function postTelemetry(endpoint, payload) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      resolve({ sent: false, reason: "invalid-endpoint" });
      return;
    }

    const body = JSON.stringify(payload);
    const transport = url.protocol === "http:" ? http : https;
    const request = transport.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "user-agent": `${packageJson.name}/${packageJson.version}`
      },
      timeout: telemetryTimeoutMs
    }, (response) => {
      response.resume();
      response.on("end", () => {
        resolve({
          sent: response.statusCode >= 200 && response.statusCode < 300,
          reason: `http-${response.statusCode}`
        });
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve({ sent: false, reason: "timeout" });
    });
    request.on("error", (error) => {
      resolve({ sent: false, reason: error.code || "request-error" });
    });
    request.end(body);
  });
}

async function sendTelemetry(payload) {
  if (telemetryDisabledByEnv()) {
    return { sent: false, reason: "disabled-by-env" };
  }

  const config = readTelemetryConfig();
  if (!config.enabled) {
    return { sent: false, reason: "disabled" };
  }

  let endpoint;
  try {
    endpoint = validateTelemetryEndpoint(config.endpoint || defaultTelemetryEndpoint());
  } catch {
    return { sent: false, reason: "invalid-endpoint" };
  }

  if (!endpoint) {
    return { sent: false, reason: "no-endpoint" };
  }

  writeTelemetryConfig({ ...config, endpoint });
  const result = await postTelemetry(endpoint, payload);
  if (!result.sent && process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_DEBUG) {
    console.error(`Telemetry skipped: ${result.reason}`);
  }
  return result;
}

function printTelemetryStatus() {
  const config = readTelemetryConfig();
  const envDisabled = telemetryDisabledByEnv();
  const endpoint = config.endpoint || defaultTelemetryEndpoint();
  let status = "desabilitada";
  if (config.enabled && !envDisabled && endpoint) {
    status = "habilitada e enviando";
  } else if (config.enabled && !envDisabled) {
    status = "habilitada, aguardando endpoint";
  }

  console.log(`Telemetria: ${status}

Endpoint: ${endpointLabel(endpoint)}
Config: ${getTelemetryConfigPath()}
AnonymousId: ${config.anonymousId}

Payload permitido:
  - comando executado
  - flags sem valores
  - versao do pacote
  - plataforma, arquitetura e versao major do Node.js
  - exit code e sucesso/falha
  - identificador anonimo aleatorio

Nunca coletar:
  - telefone
  - nome de usuario
  - caminho local
  - conteudo de projeto
  - tokens, prompts, logs ou nomes de arquivos privados

Para desabilitar:
  orquestrador-maestro telemetry disable
  ORQUESTRADOR_MAESTRO_TELEMETRY=0 orquestrador-maestro install

Para habilitar:
  orquestrador-maestro telemetry endpoint https://seu-dominio.example/api/orquestrador-telemetry
  orquestrador-maestro telemetry enable`);
}

function parseTelemetryEndpoint(args) {
  const normalized = normalizeArgs(args);
  const index = normalized.indexOf("--endpoint");
  if (index === -1) {
    return "";
  }
  const endpoint = normalized[index + 1];
  if (!endpoint || endpoint.startsWith("--")) {
    throw new Error("Parametro --endpoint exige uma URL.");
  }
  return validateTelemetryEndpoint(endpoint);
}

async function handleTelemetryCommand(args) {
  const [subcommand = "status", ...rest] = args;
  const config = readTelemetryConfig();

  if (subcommand === "status") {
    printTelemetryStatus();
    return 0;
  }

  if (subcommand === "enable") {
    const endpoint = parseTelemetryEndpoint(rest) || config.endpoint || defaultTelemetryEndpoint();
    writeTelemetryConfig({
      ...config,
      enabled: true,
      endpoint,
      consentVersion: telemetryConsentVersion,
      consentedAt: new Date().toISOString()
    });
    console.log("Telemetria habilitada.");
    if (!endpoint) {
      console.log("Nenhum endpoint configurado. Use: orquestrador-maestro telemetry endpoint <url>");
    }
    return 0;
  }

  if (subcommand === "disable") {
    writeTelemetryConfig({ ...config, enabled: false });
    console.log("Telemetria desabilitada.");
    return 0;
  }

  if (subcommand === "endpoint") {
    const endpoint = validateTelemetryEndpoint(rest[0] || "");
    if (!endpoint) {
      throw new Error("Informe a URL do endpoint.");
    }
    writeTelemetryConfig({ ...config, endpoint });
    console.log(`Endpoint de telemetria atualizado: ${endpointLabel(endpoint)}`);
    return 0;
  }

  if (subcommand === "test") {
    const payload = buildTelemetryPayload("telemetry:test", rest, 0, null);
    const result = await sendTelemetry({ ...payload, event: "telemetry_test" });
    console.log(result.sent ? "Evento de teste enviado." : `Evento de teste nao enviado: ${result.reason}`);
    return result.sent ? 0 : 1;
  }

  throw new Error(`Subcomando de telemetria desconhecido: ${subcommand}`);
}

function handleChangelogCommand(args) {
  const normalized = normalizeArgs(args);
  for (const arg of normalized) {
    if (arg !== "--full") {
      throw new Error(`Parametro desconhecido: ${arg}`);
    }
  }

  const changelog = readBundledFile("CHANGELOG.md");
  const shouldPrintFull = normalized.includes("--full");
  const excerpt = shouldPrintFull ? changelog.trim() : extractMarkdownSections(changelog, 2);

  console.log(excerpt);
  console.log(`
Fluxo recomendado para quem ja tem o Orquestrador instalado:
  npm update -g @iapro/orquestrador-maestro-cli
  orquestrador-maestro changelog
  orquestrador-maestro update
  orquestrador-maestro verify
  orquestrador-maestro doctor`);

  if (process.platform !== "win32") {
    console.log("Obs.: em Linux/macOS, doctor requer pwsh ou powershell instalado.");
  }

  return 0;
}

async function handleGoCommand(args, planningOnly = false) {
  const options = parseRuntimeArgs(args, ["--project-path", "--provider", "--interviewer", "--max-cost", "--max-parallel"], ["--auto", "--plan"]);
  const description = options.values.join(" ").trim();
  if (!description) throw new Error('Informe a intenção: orquestrador-maestro go "tarefa"');
  
  const core = require(path.join(rootDir, "runtime", "core"));
  const { IntentRouter } = require(path.join(rootDir, "runtime", "planner", "intent-router"));
  const { gatherPreflight } = require(path.join(rootDir, "runtime", "planner", "context-preflight"));
  const { DynamicInterviewer } = require(path.join(rootDir, "runtime", "planner", "dynamic-interviewer"));
  const { SemanticPlanner } = require(path.join(rootDir, "runtime", "planner", "semantic-planner"));
  const { PlanApprovalGate } = require(path.join(rootDir, "runtime", "planner", "plan-approval-gate"));
  const { LegacyExecutionProjection } = require(path.join(rootDir, "runtime", "planner", "legacy-execution-projection"));
  const { formatTasks } = require(path.join(rootDir, "runtime", "planner", "task-formatter"));
  const { estimateCost } = require(path.join(rootDir, "runtime", "planner", "model-router"));
  const { LaneExecutor } = require(path.join(rootDir, "runtime", "planner", "lane-executor"));
  
  const workspacePath = path.resolve(options.projectPath || process.cwd());
  const app = await createRuntimeApplication(workspacePath);
  
  const p = require("@clack/prompts");
  const notifier = require("node-notifier");
  p.intro("◆ Orquestrador Maestro");

  const updateTitle = (title) => process.stdout.write(`\x1b]0;Maestro: ${title}\x07`);
  updateTitle("Inicializando...");

  // Fase 1: Classificação automática via skills
  const s = p.spinner();
  s.start("Classificando intenção");
  const router = new IntentRouter({});
  const resolved = router.resolve(description);
  
  if (resolved.primarySkill) {
    const skillsList = [resolved.primarySkill, ...resolved.chainedSkills].map(sk => sk.id).join(", ");
    s.stop(`Intenção classificada: ${skillsList} (Profile: ${resolved.profile})`);
  } else {
    s.stop("Nenhuma skill específica detectada — usando modo genérico");
  }
  
  // Instancia a IntentSession localmente
  let session;
  if (!args.includes("--auto")) {
    session = await app.startIntentSession({ workspacePath, rawIntent: description });
  }
  
  // Fase 2: Exploração do codebase
  updateTitle("Explorando codebase...");
  s.start("Explorando codebase local");
  const { ContextEngine } = require(path.join(rootDir, "runtime", "context", "context-engine"));
  const { SemanticRanker } = require(path.join(rootDir, "runtime", "context", "semantic-ranker"));
  
  const semanticRanker = new SemanticRanker(app, { localOnly: false });
  const contextEngine = new ContextEngine({ workspacePath, semanticRanker });
  const relevantContext = await contextEngine.buildContext(description);
  
  s.stop(`Codebase explorada. Itens relevantes encontrados: ${relevantContext.items.length}`);
  
  if (session) {
    session = await app.updateIntentSession(session.id, { relevantContext });
  }

  // Fase 3: Entrevista dinâmica (ou batch)
  updateTitle("Refinamento...");
  const { AiInterviewer } = require(path.join(rootDir, "runtime", "planner", "ai-interviewer"));
  const interviewer = new AiInterviewer({
    resolvedSkills: resolved.allSkills,
    preflightFacts: relevantContext.items.reduce((acc, item) => ({...acc, [item.key]: item.value}), {}),
    application: app,
    intent: description,
    aiProvider: options.interviewer
  });
  
  const spec = args.includes("--auto")
    ? await interviewer.runBatch()
    : await interviewer.runInteractive();
  
  // Fallback interviewers may return per-dimension answers as plain strings;
  // the MissionBrief contract requires string arrays.
  const normalizeList = (value) => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string" && entry.trim() !== "");
    return typeof value === "string" && value.trim() !== "" ? [value] : [];
  };

  let approvedBrief = null;
  if (session) {
    approvedBrief = await app.approveMissionBrief(session.id, {
      objective: spec.answers?.intent || description,
      requirements: normalizeList(spec.answers?.requirements),
      userDecisions: normalizeList(spec.answers?.userDecisions),
      constraints: normalizeList(spec.answers?.constraints),
      relevantContext: JSON.stringify(spec.answers)
    });
  } else {
    approvedBrief = core.createMissionBrief({
      id: `brief-${crypto.randomUUID()}`,
      intentSessionId: `session-${crypto.randomUUID()}`,
      objective: spec.answers?.intent || description,
      requirements: normalizeList(spec.answers?.requirements),
      userDecisions: normalizeList(spec.answers?.userDecisions),
      constraints: normalizeList(spec.answers?.constraints),
      relevantContext: JSON.stringify(spec.answers)
    });
  }
  
  // Fase 4: Planejamento semântico
  updateTitle("Montando plano de engenharia...");
  s.start("Montando plano de engenharia");

  const providers = await app.listProviders();
  const availableProviders = providers.filter((p) => p.installed).map((p) => p.id);
  const selectedProviderId = options.provider || (availableProviders.includes("opencode") ? "opencode" : availableProviders[0]);

  if (!selectedProviderId) {
    s.stop("Nenhum provedor de execução disponível.");
    throw new Error("MISSING_EXECUTION_TARGET: No installed provider available for execution");
  }

  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: selectedProviderId, model: "default", local: selectedProviderId === "opencode" },
    localOnly: selectedProviderId === "opencode"
  });

  const planResult = await planner.plan({
    missionBrief: approvedBrief,
    missionId: approvedBrief.id,
    taskRelevantContext: relevantContext,
    resolvedSkills: resolved.allSkills,
    allowFallback: true
  });

  const executionTarget = { providerId: selectedProviderId, model: "default" };
  let tasks = planResult.taskGraph.tasks.map((st) =>
    LegacyExecutionProjection.projectTask(st.metadata?.semantic || st, { executionTarget })
  );

  s.stop(`Plano de engenharia montado (${tasks.length} tarefas, modo: ${planResult.planningMode})`);

  const maxWidth = process.stdout.columns || 80;
  p.note(formatTasks(tasks, maxWidth), "Plano de Engenharia");

  // Fase 4.5: Plan Approval Gate
  if (args.includes("--auto")) {
    const autoEval = PlanApprovalGate.evaluateAutoApproval({
      validationResult: { valid: true, blockers: [] },
      planningMode: planResult.planningMode
    }, { autoFallbackAllowed: false });

    if (!autoEval.approved) {
      p.cancel(`Execução automática rejeitada: ${autoEval.reason}`);
      return 1;
    }
    if (planningOnly) {
      await app.createMission({ workspacePath, objective: approvedBrief.objective, status: "awaiting_approval", startedAt: new Date().toISOString() });
      s.stop("Plano aprovado");
      updateTitle("Plano aprovado");
      p.outro("◆ Plano de engenharia aprovado — nenhuma execução será realizada (modo plan)");
      return 0;
    }
  } else {
    let planApproved = false;
    while (!planApproved) {
      const action = await p.select({
        message: "Como deseja prosseguir com o plano?",
        options: [
          { value: "aprovar", label: "Aprovar plano de engenharia" },
          { value: "inspecionar", label: "Inspecionar critérios de aceite" },
          { value: "refinar", label: "Refinar missão (Retornar ao M2)" },
          { value: "cancelar", label: "Cancelar operação" }
        ]
      });

      if (p.isCancel(action) || action === "cancelar") {
        p.cancel("Operação cancelada pelo usuário.");
        return 0;
      } else if (action === "aprovar") {
        PlanApprovalGate.recordHumanApproval({ taskGraphId: planResult.taskGraph.id, userDecision: "approved" });
        planApproved = true;
        if (planningOnly) {
          await app.createMission({ workspacePath, objective: approvedBrief.objective, status: "awaiting_approval", startedAt: new Date().toISOString() });
          s.stop("Plano aprovado");
          updateTitle("Plano aprovado");
          p.outro("◆ Plano de engenharia aprovado — nenhuma execução será realizada (modo plan)");
          return 0;
        }
      } else if (action === "inspecionar") {
        const details = planResult.taskGraph.tasks.map(t => {
          const s = t.metadata?.semantic || t;
          return `• ${s.title}\n  Objetivo: ${s.objective}\n  Critérios: ${(s.acceptanceCriteria || []).join(", ") || "Padrão"}`;
        }).join("\n\n");
        p.note(details, "Detalhes das Tarefas");
      } else if (action === "refinar") {
        p.cancel("Retornando ao refinamento de missão.");
        return 0;
      }
    }
  }
  
  // Fase 5: Execução
  updateTitle("Executando tarefas...");
  const mission = await app.createMission({ workspacePath, objective: spec.answers?.intent || description, status: "running", startedAt: new Date().toISOString() });
  const executor = new LaneExecutor({ application: app, maxParallel: parseInt(options.maxParallel, 10) || 3 });
  
  const runningTasks = new Set();
  const updateSpinner = () => {
    if (runningTasks.size === 0) {
      s.message("Aguardando tarefas...");
    } else {
      const runningNames = Array.from(runningTasks).join(", ");
      s.message(`Executando (${runningTasks.size}/${tasks.length}): ${runningNames}`);
    }
  };
  
  executor.on("task.started", (e) => {
    runningTasks.add(e.id);
    updateSpinner();
    p.log.info(`▶ Iniciando: ${e.label} — ${e.provider}+${e.model ? e.model.split("/").pop() : "default"}`);
  });
  
  executor.on("task.completed", (e) => {
    runningTasks.delete(e.id);
    updateSpinner();
    p.log.success(`✓ Concluído: ${e.label}`);
  });
  
  executor.on("task.failed", (e) => {
    runningTasks.delete(e.id);
    updateSpinner();
    p.log.error(`✗ Falha: ${e.label}: ${e.error}`);
  });
  
  s.start("Inicializando execução...");
  const results = await executor.execute(tasks, mission.id);
  s.stop("Execução concluída");
  
  const failures = Object.values(results).filter((r) => r.status === "failed");
  
  if (failures.length) {
    updateTitle("Concluído (com falhas)");
    notifier.notify({ title: "Maestro CLI", message: "Missão concluída com algumas falhas.", sound: true });
    p.outro("◆ Missão parcialmente concluída (houve falhas)");
    return 1;
  } else {
    updateTitle("Concluído!");
    notifier.notify({ title: "Maestro CLI", message: "Missão concluída com sucesso! 🚀", sound: true });
    p.outro("◆ Missão concluída com sucesso! 🚀");
    return 0;
  }
}

async function handleContextCommand(args) {
  if (args[0] !== "inspect") {
    throw new Error("Uso: orquestrador-maestro context inspect --intent \"<intent>\" [--project-path PATH]");
  }
  
  const options = parseRuntimeArgs(args.slice(1), ["--project-path", "--intent"]);
  const intent = options.intent || "";
  const workspacePath = path.resolve(options.projectPath || process.cwd());

  const app = await createRuntimeApplication(workspacePath);
  
  const { ContextEngine } = require(path.join(rootDir, "runtime", "context", "context-engine"));
  const { SemanticRanker } = require(path.join(rootDir, "runtime", "context", "semantic-ranker"));
  
  const semanticRanker = new SemanticRanker(app, { localOnly: false });
  const contextEngine = new ContextEngine({ workspacePath, semanticRanker });
  
  console.log(`Construindo contexto para intenção: "${intent}"\n`);
  const relevantContext = await contextEngine.buildContext(intent);
  
  let currentKind = "";
  for (const item of relevantContext.items) {
    if (currentKind !== item.kind) {
      currentKind = item.kind;
      console.log(`\n=== ${currentKind} ===`);
    }
    console.log(`✓ ${item.key} (confidence: ${item.confidence}, relevance: ${item.relevance})`);
    for (const source of item.sources) {
      console.log(`  └─ Source: ${source.type} ${source.path ? `(${source.path})` : ""}`);
    }
  }
  return 0;
}

async function dispatch(command, args) {
  if (command === "go" || command === "plan") {
    return handleGoCommand(args, command === "plan");
  }

  if (command === "context") {
    if (args[0] === "inspect") {
      return handleContextCommand(args);
    }
    return contextBrief.main(args);
  }

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    console.log(packageJson.version);
    return 0;
  }

  if (command === "install" || command === "update") {
    return runInstall(args);
  }

  if (command === "uninstall") {
    return runInstall(args, ["--uninstall"]);
  }

  if (command === "list-targets") {
    return runInstall(args, ["--list-targets"]);
  }

  if (command === "dry-run") {
    return runInstall(args, ["--dry-run"]);
  }

  if (command === "verify") {
    return runVerify(args);
  }

  if (command === "doctor") {
    return runDoctor(args);
  }

  if (command === "init-dev") {
    return runInitDev(args);
  }

  if (command === "compact-worklog") {
    return runDevContextHelper("compact-worklog", args);
  }

  if (command === "check-dev-gates") {
    return runDevContextHelper("check-dev-gates", args);
  }

  if (command === "run") return handleRunCommand(args);
  if (command === "runs") return handleRunsCommand(args);
  if (command === "projects") return handleProjectsCommand(args);
  if (command === "project") return handleProjectCommand(args);
  if (command === "missions") return handleMissionsCommand(args);
  if (command === "mission") return handleMissionCommand(args);
  if (command === "terminal") return handleTerminalCommand(args);
  if (command === "terminals") return handleTerminalsCommand(args);
  if (command === "tui") return handleTuiCommand(args);
  if (command === "skills") return handleSkillsCommand(args);
  if (command === "providers") return handleProvidersCommand(args);
  if (command === "bridge") return handleBridgeCommand(args);
  if (command === "runtime") return handleRuntimeCommand(args);

  if (command === "adapters") {
    return runToolAdapters(args);
  }

  if (command === "changelog") {
    return handleChangelogCommand(args);
  }

  if (command === "telemetry") {
    return handleTelemetryCommand(args);
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

async function main() {
  const [command = "--help", ...args] = process.argv.slice(2);
  let exitCode = 0;
  let errorName = null;

  try {
    exitCode = await dispatch(command, args);
  } catch (error) {
    errorName = error.name || "Error";
    console.error(`Erro: ${error.message}`);
    exitCode = 1;
  }

  if (["install", "update", "uninstall", "list-targets", "dry-run", "verify", "doctor", "init-dev", "compact-worklog", "check-dev-gates", "changelog"].includes(command)) {
    await sendTelemetry(buildTelemetryPayload(command, args, exitCode, errorName));
  }

  process.exit(exitCode);
}

main();
