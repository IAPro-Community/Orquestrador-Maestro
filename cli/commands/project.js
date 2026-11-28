"use strict";

// Governance/interaction/status/projects/missions/terminal/skills/providers
// extracted verbatim from bin/orquestrador-maestro.js.

const { spawnSync } = require("node:child_process");
const {
  path, rootDir, parseRuntimeArgs, createRuntimeApplication,
  loadGovernanceConfig, writeGovernanceConfig,
  loadInteractionCatalog, resolveInteractionProfile, setInteractionProfile, resetInteractionProfile,
  formatStatus, resolveStatus
} = require("../shared-context");

function handleGovernanceCommand(args) {
  const [subcommand = "status", ...rest] = args;
  const options = parseRuntimeArgs(rest, ["--project-path", "--mode", "--warning-frequency", "--hooks", "--missing-verification", "--missing-evidence"]);
  if (options.values.length > 0 || !["status", "set"].includes(subcommand)) {
    throw new Error("Uso: maestro governance <status|set> [--project-path PATH] [--mode compatibility|strict]");
  }
  const cwd = path.resolve(options.projectPath);
  if (subcommand === "status") {
    const loaded = loadGovernanceConfig({ cwd });
    console.log(JSON.stringify({ ...loaded.config, source: loaded.source, projectRoot: cwd }, null, 2));
    return 0;
  }
  const patch = {};
  if (options.mode) patch.mode = options.mode;
  if (options.warningFrequency) patch.warningFrequency = options.warningFrequency;
  if (options.missingVerification) patch.checks = { ...(patch.checks || {}), missingVerification: options.missingVerification };
  if (options.missingEvidence) patch.checks = { ...(patch.checks || {}), missingEvidence: options.missingEvidence };
  if (options.hooks) {
    if (!["on", "off", "true", "false"].includes(options.hooks)) throw new Error("--hooks aceita on, off, true ou false");
    patch.hooks = { enabled: ["on", "true"].includes(options.hooks) };
  }
  if (Object.keys(patch).length === 0) throw new Error("Informe ao menos uma configuração para alterar.");
  const written = writeGovernanceConfig({ cwd, patch });
  console.log(JSON.stringify({ ...written.config, path: written.path }, null, 2));
  return 0;
}

function handleInteractionCommand(args) {
  const [subcommand = "get", ...rest] = args;
  const options = parseRuntimeArgs(rest, ["--project-path", "--scope", "--interaction"]);
  const cwd = path.resolve(options.projectPath); const catalog = loadInteractionCatalog();
  if (subcommand === "list") { if (options.values.length) throw new Error("list não aceita argumentos"); console.log(JSON.stringify(catalog, null, 2)); return 0; }
  if (subcommand === "get") { if (options.values.length) throw new Error("get não aceita argumentos"); console.log(JSON.stringify(resolveInteractionProfile({ cwd }), null, 2)); return 0; }
  const scope = options.scope || "project";
  if (subcommand === "set") { if (options.values.length > 1) throw new Error("Informe somente um profile"); const id = options.values[0] || options.interaction; if (!id) throw new Error("Informe o profile: default|focus"); console.log(JSON.stringify(setInteractionProfile({ cwd, id, scope }), null, 2)); return 0; }
  if (subcommand === "reset") { if (options.values.length) throw new Error("reset não aceita profile"); console.log(JSON.stringify(resetInteractionProfile({ cwd, scope }), null, 2)); return 0; }
  throw new Error("Subcomando de interaction desconhecido: " + subcommand);
}

async function handleStatusCommand(args) {
  const options = parseRuntimeArgs(args, ["--project-path", "--task-id", "--lockfile"], ["--json"]);
  if (options.values.length) throw new Error("Uso: maestro status [--json] [--task-id ID] [--lockfile PATH]");
  const projectRoot = path.resolve(options.projectPath); const app = await createRuntimeApplication(projectRoot);
  const status = await resolveStatus({ projectRoot, taskId: options.taskId, lockfile: options.lockfile, application: app });
  console.log(options.json ? JSON.stringify(status, null, 2) : formatStatus(status));
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
    console.log(JSON.stringify(await (await createRuntimeApplication(options.projectPath)).listTerminals({ projectPath: options.projectPath }), null, 2));
    return 0;
  }
  if (subcommand === "stop") {
    const options = parseRuntimeArgs(rest, ["--project-path"]);
    const terminalId = options.values[0];
    if (!terminalId || options.values.length !== 1) throw new Error("Uso: maestro terminal stop <id> [--project-path PATH]");
    if (!await (await createRuntimeApplication(options.projectPath)).stopTerminal(terminalId)) throw new Error(`Terminal ativo nao encontrado: ${terminalId}`);
    console.log(`Encerramento solicitado para ${terminalId}.`);
    return 0;
  }
  if (subcommand === "start") {
    const separator = rest.indexOf("--");
    if (separator === -1 || separator === rest.length - 1) throw new Error("Uso: maestro terminal start [--project-path PATH] -- <comando> [argumentos]");
    const options = parseRuntimeArgs(rest.slice(0, separator), ["--project-path"]);
    const [command, ...commandArgs] = rest.slice(separator + 1);
    if (options.values.length) throw new Error("Uso: maestro terminal start [--project-path PATH] -- <comando> [argumentos]");
    const app = await createRuntimeApplication(options.projectPath);
    const terminal = await app.startTerminal({ workspacePath: options.projectPath, command, args: commandArgs });
    console.log(`Comando gerenciado iniciado: ${terminal.id}. Aguarde a conclusão.`);
    const completed = await app.waitTerminal(terminal.id);
    console.log(JSON.stringify(completed, null, 2));
    return completed?.status === "completed" ? 0 : 1;
  }
  throw new Error("Uso: maestro terminal <list|start|stop>");
}

async function handleSkillsCommand(args) {
  const options = parseRuntimeArgs(args.slice(1), ["--project-path"]);
  if (args[0] !== "list" || options.values.length > 0) throw new Error("Uso: maestro skills list [--project-path PATH]");
  console.log(JSON.stringify((await createRuntimeApplication(options.projectPath)).skills.list(), null, 2));
  return 0;
}

function handleSkillCatalogCommand(args) {
  const allowed = new Set(["generate", "check", "validate"]);
  const [subcommand = "validate", ...rest] = args;
  if (!allowed.has(subcommand) || rest.length > 0) {
    throw new Error("Uso: maestro skill-catalog <generate|check|validate>");
  }
  const script = path.join(rootDir, "scripts", "skill-catalog.js");
  const result = spawnSync(process.execPath, [script, subcommand], {
    cwd: rootDir,
    stdio: "inherit",
    shell: false
  });
  if (result.error) throw result.error;
  return typeof result.status === "number" ? result.status : 1;
}

async function handleProvidersCommand(args) {
  const [subcommand = "list", ...rest] = args;
  const options = parseRuntimeArgs(rest, ["--project-path"]);
  if (!["list", "goals"].includes(subcommand) || options.values.length > 0) {
    throw new Error("Uso: maestro providers <list|goals> [--project-path PATH]");
  }
  const app = await createRuntimeApplication(options.projectPath);
  if (subcommand === "list") {
    console.log(JSON.stringify(await app.listProviders(), null, 2));
    return 0;
  }
  const { inspectProviderGoal } = require(path.join(rootDir, "runtime", "providers"));
  const probes = await Promise.all(["codex", "claude", "opencode"].map(async (id) => {
    const adapter = app.providers.get(id);
    return adapter ? await inspectProviderGoal(adapter) : {
      schemaVersion: 1, providerId: id, installed: false,
      nativeOvernightReady: false, managedOvernightReady: false,
      reason: "PROVIDER_NOT_REGISTERED"
    };
  }));
  console.log(JSON.stringify({
    schemaVersion: 1, mode: "read-only", autonomyEnabled: false,
    providers: probes
  }, null, 2));
  return 0;
}

module.exports = {
  handleGovernanceCommand,
  handleInteractionCommand,
  handleStatusCommand,
  handleProjectsCommand,
  handleProjectCommand,
  handleMissionsCommand,
  handleMissionCommand,
  handleTerminalCommand,
  handleSkillsCommand,
  handleSkillCatalogCommand,
  handleProvidersCommand
};
