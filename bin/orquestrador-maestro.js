#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const packageJson = require(path.join(rootDir, "package.json"));
const contextBrief = require(path.join(rootDir, "orquestrador", "bin", "context-brief.js"));
const workflowLock = require(path.join(rootDir, "orquestrador", "bin", "workflow-lock.js"));
const { resolveGitContext } = require(path.join(rootDir, "orquestrador", "lib", "git-context.js"));
const workflowState = require(path.join(rootDir, "orquestrador", "bin", "workflow-state.js"));
const { Memory } = require(path.join(rootDir, "orquestrador", "bin", "memory.js"));
const { MaestroApplication } = require(path.join(rootDir, "runtime", "application"));
const { createBridge, createStdioServer, runtimePaths, startSocketRuntime } = require(path.join(rootDir, "runtime", "bridge"));
const { SocketMaestroClient } = require(path.join(rootDir, "runtime", "client", "socket-maestro-client"));
const { createProtocolV2Server } = require(path.join(rootDir, "runtime", "protocol", "protocol-v2"));
const { startTui } = require(path.join(rootDir, "runtime", "tui"));
const { resolveMaestroRoot } = require(path.join(rootDir, "runtime", "config", "maestro-paths"));
const { loadGovernanceConfig, writeGovernanceConfig } = require(path.join(rootDir, "runtime", "governance", "compatibility"));
const { loadInteractionCatalog, resolveInteractionProfile, setInteractionProfile, resetInteractionProfile } = require(path.join(rootDir, "runtime", "interaction"));
const { formatStatus, resolveStatus } = require(path.join(rootDir, "runtime", "status"));
const { listSupportedTools, getToolDefinition, isSupportedTool, resolveToolConfigPaths } = require(path.join(rootDir, "orquestrador", "lib", "tool-registry.js"));
const { DETECTION_STATES, detectTool, detectAllTools, detectToolById } = require(path.join(rootDir, "orquestrador", "lib", "tool-detector.js"));
const installState = require(path.join(rootDir, "orquestrador", "lib", "install-state.js"));
const telemetryTimeoutMs = 350;
const telemetryConsentVersion = 2;
const defaultTelemetryProvider = "posthog";
const defaultTelemetryEndpointUrl = "";

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
  "--verbose-paths": { ps: "-VerbosePaths", sh: "--verbose-paths" },
  "--all-targets": { ps: "-AllTargets", sh: "--all-targets" }
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
  orquestrador-maestro context brief [--project-path PATH] [--task TEXT] [--max-chars N] [--since COMMIT] [--json]
  orquestrador-maestro context section --path FILE.md --heading TEXT [--project-path PATH] [--json]
  orquestrador-maestro run [--provider ID] [--profile ID] [--workspace PATH] "tarefa"
  orquestrador-maestro go|plan [--auto] [--project-path PATH] "objetivo"
  orquestrador-maestro runtime [--project-path PATH]
  orquestrador-maestro tui [--project-path PATH] [--classic]
  orquestrador-maestro governance <status|set> [opcoes]
  orquestrador-maestro interaction <list|get|set|reset> [opcoes]
  orquestrador-maestro status [--json] [--task-id ID] [--lockfile PATH] [--project-path PATH]
  orquestrador-maestro projects|missions|terminal|providers|skills [opcoes]
  orquestrador-maestro memory record [--project PATH] --type TYPE --summary TEXT [opcoes]
  orquestrador-maestro memory search [--project PATH] [--search TEXT] [--type TYPE] [--verified] [--unverified]
  orquestrador-maestro memory show [--project PATH] --id ID
  orquestrador-maestro memory timeline [--project PATH] [--limit N]
  orquestrador-maestro memory promote [--project PATH] --id ID --destination PATH [--apply]
  orquestrador-maestro memory stats [--project PATH]
  orquestrador-maestro memory status
  orquestrador-maestro memory cleanup [--project PATH]
  orquestrador-maestro benchmark list
  orquestrador-maestro benchmark run [--scenario ID] [--condition CONDITION]
  orquestrador-maestro benchmark validate <scenario>
  orquestrador-maestro benchmark run [scenario] [opcoes]
  orquestrador-maestro run [--provider ID] [--profile ID] [--policy ID] [--workspace PATH] "tarefa"
  orquestrador-maestro go [--auto] [--plan] [--provider ID] [--interviewer ID] [--project-path PATH] "tarefa"
  orquestrador-maestro plan [--auto] [--plan] [--provider ID] [--interviewer ID] [--project-path PATH] "tarefa"
  orquestrador-maestro runs [--project-path PATH]
  orquestrador-maestro usage [--project-path PATH] [--limit N] [--json]
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
  orquestrador-maestro skill-catalog <generate|check|validate>
  orquestrador-maestro providers list [--project-path PATH]
  orquestrador-maestro bridge --stdio [--project-path PATH]
  orquestrador-maestro runtime [--project-path PATH]
  orquestrador-maestro adapters <list|paths|validate> [id]
  orquestrador-maestro adapters render <junie|goose|openhands> --project-path PATH [--dry-run|--apply]
  orquestrador-maestro targets [list|detect|add|remove|sync] [--home-path PATH]
  orquestrador-maestro changelog [--full]
  orquestrador-maestro uninstall [opcoes]
  orquestrador-maestro list-targets [opcoes]
  orquestrador-maestro dry-run [opcoes]
  orquestrador-maestro telemetry [status|enable|disable|endpoint|test]
  orquestrador-maestro version [--check]

Opcoes de install/update/uninstall:
  --home-path <path>          Instala em outro home para teste
  --core-only                 Instala somente .orquestrador-maestro e AGENTS.md
  --only <component>          Limita a um componente: core, codex, agents,
                              claude, opencode, cursor, gemini, windsurf,
                              antigravity
  --all-targets               Instala em todos os targets suportados (opt-in)
  --no-tool-profiles          Nao instala perfis globais das ferramentas
  --skip-community-skills     Nao copia a biblioteca comunitaria offload
  --skip-skill-sync           Nao roda o sync de skills
  --dry-run                   Mostra o plano sem alterar arquivos
  --list-targets              Lista os destinos conhecidos
  --non-interactive           Evita prompts interativos
  --verbose-paths             Mostra caminhos reais nos relatorios

  Opcoes de targets:
  targets add <id> [--force]  Instala e habilita uma integracao
  targets remove <id>         Desabilita sem apagar arquivos humanos
  targets sync                Sincroniza somente targets habilitados
  targets list --json         Saida JSON estavel
  --home-path <path>          Caminho home para detectar

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

Opcoes de version:
  --check                     Compara a CLI instalada com o latest publicado no npm

Exemplos:
  npm install -g @iapro/orquestrador-maestro-cli
  orquestrador-maestro install
  orquestrador-maestro verify
  orquestrador-maestro changelog
  orquestrador-maestro update
  orquestrador-maestro version --check
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

function executableAvailable(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore", shell: false });
  return !result.error && result.status === 0;
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runNpm(args, options = {}) {
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec || "cmd.exe", [
      "/d", "/s", "/c", getNpmCommand(), ...args
    ], { ...options, shell: false });
  }

  return spawnSync(getNpmCommand(), args, { ...options, shell: false });
}

function getLatestNpmVersion() {
  const result = runNpm(["view", `${packageJson.name}@latest`, "version", "--json", "--prefer-online"], {
    encoding: "utf8"
  });

  if (result.error || result.status !== 0) {
    throw new Error("Não foi possível consultar a versão latest no npm.");
  }

  let version;
  try {
    version = JSON.parse(result.stdout.trim());
  } catch {
    version = result.stdout.trim().replace(/^['"]|['"]$/gu, "");
  }

  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error("O npm retornou uma versão inválida.");
  }

  return version;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

function readGlobalCliVersion(cliPath) {
  const packagePath = path.join(path.dirname(path.dirname(cliPath)), "package.json");
  try {
    const installedPackage = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return typeof installedPackage.version === "string" ? installedPackage.version : null;
  } catch {
    return null;
  }
}

function resolveGlobalCliPath() {
  const result = runNpm(["root", "-g"], {
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    throw new Error("Não foi possível localizar o diretório global do npm.");
  }

  const globalRoot = result.stdout.trim();
  if (!globalRoot) {
    throw new Error("O npm não retornou o diretório global dos pacotes.");
  }

  const cliPath = path.join(globalRoot, "@iapro", "orquestrador-maestro-cli", "bin", "orquestrador-maestro.js");
  if (!fs.existsSync(cliPath)) {
    throw new Error(`CLI global atualizada não encontrada: ${cliPath}`);
  }
  return cliPath;
}

function runCliUpdate(args) {
  if (process.env.ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE === "1") {
    return null;
  }

  console.log(`Atualizando a CLI npm para ${packageJson.name}@latest...`);
  const result = runNpm([
    "install", "-g", `${packageJson.name}@latest`, "--force", "--prefer-online"
  ], { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`A atualização da CLI npm falhou (código ${result.status}).`);
  }

  const cliPath = resolveGlobalCliPath();
  const installedVersion = readGlobalCliVersion(cliPath);
  if (installedVersion) {
    console.log(`CLI npm instalada após a atualização: ${installedVersion}`);
  }
  const childEnv = { ...process.env, ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE: "1" };
  return spawnSync(process.execPath, [cliPath, "update", ...args], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit",
    shell: false
  });
}

async function runInstall(args, injectedFlags = []) {
  const isWindows = process.platform === "win32";
  const script = path.join(rootDir, isWindows ? "install.ps1" : "install.sh");
  if (!commandExists(script)) {
    throw new Error(`Instalador nao encontrado: ${script}`);
  }

  const isNonInteractive = args.includes("--non-interactive") || injectedFlags.includes("--non-interactive");
  const isAllTargets = args.includes("--all-targets") || injectedFlags.includes("--all-targets");
  const hasOnly = args.some(a => a === "--only") || injectedFlags.some(a => a === "--only");

  if (!isNonInteractive && !isAllTargets && !hasOnly && process.stdin.isTTY) {
    const homePath = getArg(args, "--home-path") || process.env.HOME || process.env.USERPROFILE || os.homedir();
    const orquestradorDir = resolveMaestroRoot({ home: homePath });
    const detections = detectAllTools(homePath);
    const state = installState.readState(orquestradorDir) || installState.getDefaultState();

    const detected = [];
    const notDetected = [];
    for (const [toolId, detection] of Object.entries(detections)) {
      const def = getToolDefinition(toolId);
      if (detection.state === "detected" || detection.state === "configured") {
        detected.push({ id: toolId, name: def.displayName, state: detection.state });
      } else {
        notDetected.push({ id: toolId, name: def.displayName, state: detection.state });
      }
    }

    if (detected.length > 0) {
      console.log("\nDetectando ferramentas...\n");
      for (const d of detected) {
        const marker = d.state === "detected" ? "✓" : "~";
        console.log(`  ${marker} ${d.name}          ${d.state}`);
      }
      for (const d of notDetected) {
        console.log(`  ○ ${d.name}          ${d.state}`);
      }

      try {
        const p = require("@clack/prompts");
        const options = detected.map((d) => ({
          value: d.id,
          label: `${d.name} (${d.state})`,
          hint: state.targets[d.id]?.enabled ? "already enabled" : undefined
        }));

        const selected = await p.multiselect({
          message: "Onde deseja instalar as integracoes Maestro?",
          options,
          required: true
        });

        if (p.isCancel(selected)) {
          p.cancel("Instalacao cancelada.");
          return 0;
        }

        if (Array.isArray(selected) && selected.length > 0) {
          const onlyFlag = selected.join(",");
          injectedFlags.push("--only", onlyFlag);
        }
      } catch (err) {
        console.error("\nErro ao selecionar targets: " + (err.message || err));
        console.error("Use --all-targets para instalar todos, ou --only codex,claude para selecao manual.\n");
        return 1;
      }
    }
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

function runMemoryCommand(args) {
  const memory = new Memory();
  const [subcommand = "help", ...rest] = args;

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    memory.printHelp();
    return 0;
  }

  if (subcommand === "status") {
    const projectPath = memory.resolveProjectRootFromArgs(rest, process.cwd());
    const gitCtx = resolveGitContext(projectPath);
    const stats = memory.stats(gitCtx.repositoryId);
    console.log(JSON.stringify({
      repository: gitCtx.remote || gitCtx.projectRoot,
      repositoryId: gitCtx.repositoryId,
      workspaceId: gitCtx.workspaceId,
      branch: gitCtx.branch,
      detached: gitCtx.detached,
      head: gitCtx.headCommit,
      vcs: gitCtx.vcs,
      memory: {
        repository: stats.total,
        byType: stats.byType,
        verified: stats.verified
      }
    }, null, 2));
    return 0;
  }

  const project = memory.resolveProjectFromArgs(rest, process.cwd());
  const projectRoot = memory.resolveProjectRootFromArgs(rest, process.cwd());

  switch (subcommand) {
    case "record": {
      const type = memory.getArg(rest, "--type");
      const summary = memory.getArg(rest, "--summary");
      if (!type || !summary) {
        throw new Error("--type and --summary are required");
      }
      const obs = memory.record(project, {
        type,
        summary,
        details: memory.getArg(rest, "--details"),
        files: memory.getArgList(rest, "--files"),
        tags: memory.getArgList(rest, "--tags"),
        verified: rest.includes("--verified"),
        taskId: memory.getArg(rest, "--task"),
        scope: memory.resolveScope(project, rest, projectRoot),
        gitContext: resolveGitContext(projectRoot)
      }, { projectRoot, gitContext: resolveGitContext(projectRoot) });
      console.log(JSON.stringify(obs, null, 2));
      return 0;
    }
    case "search": {
      const results = memory.search(project, {
        type: memory.getArg(rest, "--type"),
        tags: memory.getArgList(rest, "--tags"),
        search: memory.getArg(rest, "--search"),
        from: memory.getArg(rest, "--from"),
        to: memory.getArg(rest, "--to"),
        limit: memory.getArgNumber(rest, "--limit"),
        verified: rest.includes("--verified") ? true : rest.includes("--unverified") ? false : undefined,
        branch: memory.getArg(rest, "--branch"),
        scope: memory.getArg(rest, "--scope")
      });
      console.log(JSON.stringify(results, null, 2));
      return 0;
    }
    case "show": {
      const id = memory.getArg(rest, "--id");
      if (!id) throw new Error("--id is required");
      const obs = memory.show(project, id);
      if (!obs) { console.error("Observation not found"); return 1; }
      console.log(JSON.stringify(obs, null, 2));
      return 0;
    }
    case "timeline": {
      const timeline = memory.timeline(project, {
        from: memory.getArg(rest, "--from"),
        to: memory.getArg(rest, "--to"),
        limit: memory.getArgNumber(rest, "--limit") || 50
      });
      console.log(JSON.stringify(timeline, null, 2));
      return 0;
    }
    case "promote": {
      const id = memory.getArg(rest, "--id");
      const destination = memory.getArg(rest, "--destination");
      if (!id || !destination) throw new Error("--id and --destination are required");
      const apply = rest.includes("--apply");
      const result = memory.promote(project, id, destination, { apply, projectRoot });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "stats": {
      const stats = memory.stats(project);
      console.log(JSON.stringify(stats, null, 2));
      return 0;
    }
    case "cleanup": {
      const result = memory.cleanup(project);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    default:
      throw new Error(`Unknown memory subcommand: ${subcommand}`);
  }
}

function parseArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  const val = args[idx + 1];
  if (!val || val.startsWith("--")) return null;
  return val;
}

function parseArgEqual(args, name) {
  const prefix = `${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function getArg(args, name) {
  return parseArg(args, name) || parseArgEqual(args, name);
}

function extractPositionalArg(args, knownFlags) {
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (!a.startsWith("-")) {
      const prev = i > 0 ? args[i - 1] : null;
      if (prev && knownFlags.includes(prev)) continue;
      return a;
    }
  }
  return null;
}

function resolveBenchmarkScenario(value) {
  if (!value || value.includes(path.sep) || value.includes("/") || value.endsWith(".json") || value.includes("..")) return value;
  return path.join(rootDir, "benchmark-harness", "scenarios", `${value}.json`);
}

function runBenchmarkCommand(args) {
  const [subcommand = "list", ...rest] = args;
  if (subcommand === "real" || subcommand === "ai-real") throw new Error("Os benchmarks legados foram removidos; use `benchmark run` com o harness v2.");
  const forwarded = [subcommand];
  if (subcommand === "list" && !rest.some((arg) => arg === "--dir" || arg.startsWith("--dir="))) {
    forwarded.push("--dir", path.join(rootDir, "benchmark-harness", "scenarios"));
  }
  if (subcommand === "run") {
    const scenario = getArg(rest, "--scenario");
    const condition = getArg(rest, "--condition");
    if (scenario) forwarded.push("--scenario", resolveBenchmarkScenario(scenario));
    for (let index = 0; index < rest.length; index += 1) {
      if (rest[index] === "--scenario" || rest[index] === "--condition") { index += 1; continue; }
      forwarded.push(rest[index]);
    }
    if (condition) forwarded.push("--condition", condition);
  } else if (subcommand === "validate") {
    const scenario = rest.find((arg) => !arg.startsWith("--"));
    if (scenario) forwarded.push("--scenario", resolveBenchmarkScenario(scenario));
    forwarded.push(...rest.filter((arg, index) => !(arg === scenario && index === rest.indexOf(scenario))));
  } else forwarded.push(...rest);
  return run(process.execPath, ["--import", "tsx", path.join(rootDir, "benchmark-harness", "src", "cli", "index.ts"), ...forwarded], { cwd: rootDir });
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

async function createRuntimeApplication(projectPath) {
  const app = new MaestroApplication({ projectRoot: projectPath });
  await app.initialize();
  const { AttentionQueue } = require(path.join(rootDir, "runtime", "attention", "attention-queue"));
  const { AttentionProducers } = require(path.join(rootDir, "runtime", "attention", "attention-producers"));
  const { TaskGraphPersistence } = require(path.join(rootDir, "runtime", "planner", "task-graph-persistence"));
  const { RunTerminalBridge } = require(path.join(rootDir, "runtime", "runs", "run-terminal-bridge"));
  const project = await app.inspectProject({ projectPath: app.projectRoot });
  app.attention = new AttentionQueue({ store: app.store, record: (type, data) => app.record(null, type, data) });
  app.attentionProducers = new AttentionProducers({ queue: app.attention, projectId: project.id });
  app.taskGraphs = new TaskGraphPersistence({ store: app.store });
  app.runTerminals = new RunTerminalBridge({ app, store: app.store, terminals: app.terminals, terminalSessions: app.terminalSessions, graphs: app.taskGraphs });
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
  const options = parseRuntimeArgs(args, ["--provider", "--profile", "--policy", "--workspace", "--project-path", "--model", "--mode", "--agent", "--sandbox", "--interaction"]);
  const description = options.values.join(" ").trim();
  if (!description) throw new Error("Informe a tarefa: maestro run [opcoes] \"tarefa\"");
  const outcome = await (await createRuntimeApplication(options.projectPath)).executeRun({
    description, providerId: options.provider, profileId: options.profile, policyId: options.policy,
    workspacePath: options.workspace || options.projectPath, model: options.model, mode: options.mode, agent: options.agent, sandbox: options.sandbox, interactionProfile: options.interaction
  });
  console.log(JSON.stringify({ run: outcome.run, verification: outcome.verification, changes: outcome.changes }, null, 2));
  return outcome.run.status === "completed" ? 0 : 1;
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

async function handleRunsCommand(args) {
  const options = parseRuntimeArgs(args, ["--project-path"]);
  if (options.values.length > 0) throw new Error("Uso: maestro runs [--project-path PATH]");
  console.log(JSON.stringify(await (await createRuntimeApplication(options.projectPath)).listRuns({ projectPath: options.projectPath }), null, 2));
  return 0;
}

function formatTokens(value) {
  return value === null || value === undefined ? "unavailable" : String(value);
}

async function handleUsageCommand(args) {
  const options = parseRuntimeArgs(args, ["--project-path", "--limit"], ["--json"]);
  if (options.values.length > 0) throw new Error("Uso: maestro usage [--project-path PATH] [--limit N] [--json]");
  const limit = options.limit !== undefined ? Number.parseInt(options.limit, 10) : 20;
  if (options.limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
    throw new Error("--limit deve ser um inteiro entre 1 e 200.");
  }
  const app = await createRuntimeApplication(options.projectPath);
  const runs = (await app.listRuns({ projectPath: options.projectPath })).slice(-limit);
  const rows = [];
  for (const run of runs) {
    const telemetry = run.metadata?.cognitiveTelemetry || {};
    const task = run.taskId ? await app.getTask(run.taskId).catch(() => null) : null;
    rows.push({
      run: run.id,
      project: task?.projectId || telemetry.projectId || "unknown",
      branch: telemetry.branch || "unknown",
      tool: telemetry.tool || run.providerId || "unknown",
      provider: telemetry.provider || "unknown",
      model: telemetry.model || "unknown",
      status: run.status,
      primaryCalls: telemetry.primaryCalls ?? "unavailable",
      reviewCalls: telemetry.reviewCalls ?? "unavailable",
      modelCalls: telemetry.modelCalls ?? "unavailable",
      inputTokens: telemetry.tokenInput ?? null,
      outputTokens: telemetry.tokenOutput ?? null,
      cachedInputTokens: telemetry.cachedInputTokens ?? null,
      tokenSource: telemetry.tokenSource || "unavailable",
      childAgentsObserved: telemetry.childAgentsObserved ?? 0,
      durationMs: telemetry.durationMs ?? null
    });
  }
  if (options.json) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  if (rows.length === 0) {
    console.log("No runs recorded for this project.");
    return 0;
  }
  for (const row of rows) {
    console.log([
      `Run: ${row.run}`,
      `Project: ${row.project}`,
      `Branch: ${row.branch}`,
      `Tool: ${row.tool}`,
      `Provider: ${row.provider}`,
      `Model: ${row.model}`,
      `Primary calls: ${row.primaryCalls}`,
      `Review calls: ${row.reviewCalls}`,
      `Child agents observed: ${row.childAgentsObserved}`,
      `Input tokens: ${formatTokens(row.inputTokens)}`,
      `Cached: ${formatTokens(row.cachedInputTokens)}`,
      `Output: ${formatTokens(row.outputTokens)}`,
      `Token source: ${row.tokenSource}`,
      ""
    ].join("\n"));
  }
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
  if (classic) { await startTui(await createRuntimeApplication(options.projectPath), { classic: true }); return 0; }
  const projectRoot = path.resolve(options.projectPath);
  const paths = runtimePaths(projectRoot);
  let externalRuntime = false;
  if (fs.existsSync(paths.tokenPath)) {
    const probe = new SocketMaestroClient({ socketPath: paths.socketPath, token: fs.readFileSync(paths.tokenPath, "utf8").trim(), watchdog: false, requestTimeoutMs: 500 });
    try { await probe.initialize(); externalRuntime = true; } catch { externalRuntime = false; } finally { probe.close(); }
  }
  if (!externalRuntime) {
    const daemon = spawn(process.execPath, [__filename, "runtime", "--project-path", projectRoot], { detached: true, stdio: "ignore", shell: false });
    daemon.unref();
    const deadline = Date.now() + 5_000;
    while (!externalRuntime && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!fs.existsSync(paths.tokenPath)) continue;
      const probe = new SocketMaestroClient({ socketPath: paths.socketPath, token: fs.readFileSync(paths.tokenPath, "utf8").trim(), watchdog: false, requestTimeoutMs: 500 });
      try { await probe.initialize(); externalRuntime = true; } catch { externalRuntime = false; } finally { probe.close(); }
    }
    if (!externalRuntime) throw new Error("O runtime canônico não iniciou dentro de 5 segundos.");
  }
  const hasBun = executableAvailable("bun");
  const hasOpentui = (() => { try { require.resolve("@opentui/core"); return true; } catch { return false; } })();
  if (!hasBun || !hasOpentui) { await startTui(await createRuntimeApplication(options.projectPath), { classic: true }); return 0; }
  const visualHost = {
    projectRoot,
    terminalCapabilities: () => ({ tui: { bun: true, opentui: true } })
  };
  try { await startTui(visualHost, { classic: false }); } catch { await startTui(await createRuntimeApplication(options.projectPath), { classic: true }); }
  return 0;
}

function createRuntimeBridge(app, projectRoot) {
  return createBridge({ projectRoot, services: {
    projectInspector: { inspect: (params) => app.inspectProject(params) }, skillRegistry: app.skills,
    providerRegistry: { list: () => app.listProviders() }, runtime: app,
    runStore: { listRuns: (filters) => app.listRuns(filters), getRun: (id) => app.getRun(id), listArtifacts: (filters) => app.listArtifacts(filters), getArtifact: (id) => app.getArtifact(id), getVerification: (runId) => app.getVerification(runId) }
  } });
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
  const bridge = createRuntimeBridge(app, options.projectPath);
  const protocolV2 = createProtocolV2Server({ runtime: app, store: app.store, serverInfo: { name: "maestro-runtime", projectRoot: path.resolve(options.projectPath) } });
  const runtime = startSocketRuntime(bridge, { projectRoot: options.projectPath, protocolV2 });
  await runtime.ready;
  console.log(`Runtime Maestro ativo em ${runtime.paths.socketPath}`);
  return new Promise((resolve) => {
    let closing = false;
    const close = async () => { if (closing) return; closing = true; protocolV2.close(); await runtime.close(); resolve(0); };
    process.once("SIGINT", close); process.once("SIGTERM", close);
  });
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
    defaultTelemetryEndpointUrl;
}

function defaultTelemetryConfig() {
  return {
    enabled: false,
    provider: defaultTelemetryProvider,
    endpoint: defaultTelemetryEndpoint(),
    anonymousId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    consentVersion: telemetryConsentVersion
  };
}

function normalizeTelemetryConfig(config) {
  const rawConfig = config && typeof config === "object" ? config : {};
  const hasCurrentConsent = rawConfig.consentVersion === telemetryConsentVersion;

  return {
    ...defaultTelemetryConfig(),
    ...rawConfig,
    enabled: hasCurrentConsent && rawConfig.enabled !== false,
    provider: rawConfig.provider || defaultTelemetryProvider,
    endpoint: rawConfig.endpoint || defaultTelemetryEndpoint(),
    consentVersion: hasCurrentConsent ? telemetryConsentVersion : (rawConfig.consentVersion || 0)
  };
}

/**
 * Read telemetry config from disk. If the file doesn't exist, creates it with defaults.
 * Side effect: writes default config to disk when first called.
 */
function readTelemetryConfig() {
  const configPath = getTelemetryConfigPath();
  if (!fs.existsSync(configPath)) {
    const config = defaultTelemetryConfig();
    writeTelemetryConfig(config);
    return config;
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
  const isPostHog = url.hostname === "eu.i.posthog.com" || url.hostname === "us.i.posthog.com";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    throw new Error("Endpoint de telemetria deve usar HTTPS, exceto localhost para desenvolvimento.");
  }
  if (!isLocalhost && !isPostHog) {
    throw new Error("A telemetria usa somente endpoints oficiais do PostHog ou localhost para testes.");
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
    errorCategory: errorName ? normalizeTelemetryError(errorName) : null,
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    anonymousId: config.anonymousId,
    date: new Date().toISOString().slice(0, 10)
  };
}

function normalizeTelemetryError(errorName) {
  const knownCategories = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError"]);
  return knownCategories.has(errorName) ? errorName : "unknown";
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

  if (!endpoint) return { sent: false, reason: "no-endpoint" };

  const projectKey = process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_API_KEY ||
    (packageJson.config && packageJson.config.telemetryProjectKey) || "";
  if (!projectKey) return { sent: false, reason: "no-provider-key" };

  writeTelemetryConfig({ ...config, endpoint });
  const result = await postTelemetry(endpoint, {
    api_key: projectKey,
    ip: false,
    event: payload.event,
    distinct_id: payload.anonymousId,
    properties: {
      schemaVersion: payload.schemaVersion,
      packageName: payload.packageName,
      packageVersion: payload.packageVersion,
      command: payload.command,
      flags: payload.flags,
      exitCode: payload.exitCode,
      success: payload.success,
      errorCategory: payload.errorCategory,
      platform: payload.platform,
      arch: payload.arch,
      nodeMajor: payload.nodeMajor,
      date: payload.date,
      $process_person_profile: false
    },
    timestamp: `${payload.date}T00:00:00.000Z`
  });
  if (!result.sent && process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_DEBUG) {
    console.error(`Telemetry skipped: ${result.reason}`);
  }
  return result;
}

function printTelemetryStatus() {
  const config = readTelemetryConfig();
  const envDisabled = telemetryDisabledByEnv();
  const endpoint = config.endpoint || defaultTelemetryEndpoint();
  const hasProviderKey = Boolean(process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_API_KEY ||
    (packageJson.config && packageJson.config.telemetryProjectKey));
  let status = "desabilitada";
  if (config.enabled && !envDisabled && endpoint && hasProviderKey) {
    status = "habilitada e enviando";
  } else if (config.enabled && !envDisabled) {
    status = "habilitada, aguardando configuração do provedor";
  }

  console.log(`Telemetria: ${status}

Endpoint: ${endpointLabel(endpoint)}
Provedor: PostHog (US Cloud)
Finalidade: medir adoção e uso técnico por instalação anônima

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
  orquestrador-maestro update
  orquestrador-maestro verify
  orquestrador-maestro doctor`);

  if (process.platform !== "win32") {
    console.log("Obs.: em Linux/macOS, doctor requer pwsh ou powershell instalado.");
  }

  return 0;
}

function handleVersionCommand(args) {
  const normalized = normalizeArgs(args);
  if (normalized.length === 0) {
    console.log(packageJson.version);
    return 0;
  }
  if (normalized.length !== 1 || normalized[0] !== "--check") {
    throw new Error(`Parametro desconhecido: ${normalized.join(" ")}`);
  }

  let latestVersion;
  try {
    latestVersion = getLatestNpmVersion();
  } catch (error) {
    console.error(`Não foi possível verificar atualizações: ${error.message}`);
    return 1;
  }

  console.log(`Versão instalada: ${packageJson.version}`);
  console.log(`Versão latest no npm: ${latestVersion}`);
  const comparison = compareVersions(packageJson.version, latestVersion);
  if (comparison < 0) {
    console.log(`Atualização disponível: npm install -g ${packageJson.name}@latest --force --prefer-online`);
  } else if (comparison > 0) {
    console.log("A instalação local é mais nova que o latest publicado no npm.");
  } else {
    console.log("A CLI já está atualizada.");
  }
  return 0;
}

async function handleGoCommand(args, planningOnly = false) {
  const options = parseRuntimeArgs(args, ["--project-path", "--provider", "--interviewer", "--max-cost", "--max-parallel", "--profile", "--interaction"], ["--auto", "--plan"]);
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

  const { TaskGraphPersistence } = require(path.join(rootDir, "runtime", "planner", "task-graph-persistence"));
  const { PlanPersistenceHooks } = require(path.join(rootDir, "runtime", "planner", "plan-persistence-hooks"));
  const graphs = new TaskGraphPersistence({ store: app.store });
  const project = await app.inspectProject({ projectPath: workspacePath });
  const persistenceHooks = new PlanPersistenceHooks({
    graphs,
    getGraphInput: () => ({
      graphId: planResult.taskGraph.id,
      projectId: project.id,
      planningMode: planResult.planningMode,
      tasks: planResult.taskGraph.tasks.map((task) => task.metadata?.semantic || task)
    })
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
      await persistenceHooks.onRejected({ missionId: approvedBrief.id, taskGraphId: planResult.taskGraph.id, approval: autoEval });
      await app.attentionProducers.humanApprovalRequest({ missionId: approvedBrief.id, taskGraphId: planResult.taskGraph.id, evalResult: autoEval, projectId: project.id });
      p.cancel(`Execução automática rejeitada: ${autoEval.reason}`);
      return 1;
    }
    await persistenceHooks.onApproved({ missionId: approvedBrief.id, taskGraphId: planResult.taskGraph.id, approval: autoEval });
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
        const humanApproval = PlanApprovalGate.recordHumanApproval({ taskGraphId: planResult.taskGraph.id, userDecision: "approved" });
        await persistenceHooks.onApproved({ missionId: approvedBrief.id, taskGraphId: planResult.taskGraph.id, approval: humanApproval });
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
  const executor = new LaneExecutor({ application: app, maxParallel: parseInt(options.maxParallel, 10) || 3, executionProfile: options.profile, interactionProfile: options.interaction });
  const { TaskLifecycleMonitor } = require(path.join(rootDir, "runtime", "planner", "task-lifecycle-monitor"));
  const lifecycleMonitor = TaskLifecycleMonitor.attach({ executor, app, graphs, store: app.store });

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
  lifecycleMonitor.detach();
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

function handleTargetsCommand(args) {
  const [subcommand = "list", ...rest] = args;
  const isWindows = process.platform === "win32";

  const getHomePath = () => {
    const hp = getArg(rest, "--home-path");
    if (hp) return hp;
    return process.env.HOME || process.env.USERPROFILE || os.homedir();
  };

  const homePath = getHomePath();
  const orquestradorDir = resolveMaestroRoot({ home: homePath });

  const normalizeManagedPath = (value) => {
    if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return null;
    const normalized = value.replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.startsWith("//") || /^[A-Za-z]:\//u.test(normalized)) return null;
    const parts = normalized.split("/");
    if (parts.some(part => !part || part === "." || part === "..")) return null;
    return parts.join(path.sep);
  };

  const assertSafeHomePath = (relativePath) => {
    const safe = normalizeManagedPath(relativePath);
    if (!safe) throw new Error(`Unsafe managed path: ${relativePath}`);
    const resolvedHome = path.resolve(homePath);
    const resolved = path.resolve(resolvedHome, safe);
    const relative = path.relative(resolvedHome, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Path escapes home: ${relativePath}`);

    let current = resolvedHome;
    const components = path.relative(resolvedHome, resolved).split(path.sep).filter(Boolean);
    for (const component of components) {
      current = path.join(current, component);
      try {
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Refusing symlink in managed path: ${relativePath}`);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
        break;
      }
    }
    return { safe, resolved };
  };

  const hashFile = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  const markerContent = (toolId) => `managed by orquestrador-maestro\ntool: ${toolId}\n`;
  const isRecognizedMarker = (content, toolId) => content === markerContent(toolId);

  if (subcommand === "list" || subcommand === "detect") {
    const detections = detectAllTools(homePath);
    const state = installState.readState(orquestradorDir) || installState.getDefaultState();
    const jsonFlag = rest.includes("--json");

    const rows = [];
    for (const [toolId, detection] of Object.entries(detections)) {
      const def = getToolDefinition(toolId);
      const targetState = installState.getTargetState(state, toolId);
      const enabled = targetState ? targetState.enabled : false;
      rows.push({
        Target: def.displayName,
        ToolId: toolId,
        Detection: detection.state,
        Enabled: enabled ? "yes" : "no"
      });
    }

    if (subcommand === "detect") {
      for (const [toolId, detection] of Object.entries(detections)) {
        installState.updateDetectionState(state, toolId, detection);
      }
      installState.writeState(orquestradorDir, state);
    }

    if (jsonFlag) {
      console.log(JSON.stringify({ schemaVersion: 1, targets: rows }, null, 2));
    } else {
      const header = "Target".padEnd(20) + "Detection".padEnd(16) + "Enabled";
      const sep = "-".repeat(44);
      console.log(header);
      console.log(sep);
      for (const r of rows) {
        console.log(r.Target.padEnd(20) + r.Detection.padEnd(16) + r.Enabled);
      }
    }
    return 0;
  }

  if (subcommand === "add") {
    const toolId = extractPositionalArg(rest, ["--home-path", "--force"]);
    if (!toolId || !isSupportedTool(toolId)) {
      throw new Error(`Invalid target: ${toolId}. Supported: ${listSupportedTools().join(", ")}`);
    }

    const state = installState.readState(orquestradorDir) || installState.getDefaultState();
    const detection = detectToolById(toolId, homePath);
    const force = rest.includes("--force");

    if (detection.state === DETECTION_STATES.NOT_DETECTED) {
      if (detection.reason === "maestro-created-directory-only") {
        throw new Error(`Refusing to enable ${toolId}: directory exists but was created by Maestro, not by an actual CLI installation.`);
      }
      if (!force) {
        throw new Error(`Refusing to enable ${toolId}: CLI not detected. Use --force to override.`);
      }
    }

    const def = getToolDefinition(toolId);
    const previousTarget = installState.getTargetState(state, toolId) || {};
    const previousEntries = new Map((previousTarget.managedEntries || []).map(entry => [entry.path.replace(/\\/g, "/"), entry]));
    const managedFiles = [];
    const managedDirectories = [];
    const managedEntries = [];
    const createdFiles = [];
    const createdDirectories = [];
    const replacedFiles = new Map();
    const preservedExisting = [];
    const conflicts = [];

    try {
      const homeStat = fs.lstatSync(homePath);
      if (homeStat.isSymbolicLink()) throw new Error("Refusing symlink home path");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    const rememberDirectoryAncestry = (targetDirectory) => {
      const missing = [];
      let current = path.resolve(targetDirectory);
      while (current !== path.resolve(homePath)) {
        try {
          const stat = fs.lstatSync(current);
          if (stat.isSymbolicLink()) throw new Error(`Refusing symlink directory: ${current}`);
          break;
        } catch (err) {
          if (err.code !== "ENOENT") throw err;
          missing.push(path.relative(homePath, current));
          current = path.dirname(current);
        }
      }
      createdDirectories.push(...missing.filter(Boolean));
    };

    const rollbackCreated = () => {
      for (const [filePath, content] of replacedFiles.entries()) {
        try { fs.writeFileSync(filePath, content); } catch {}
      }
      for (const f of createdFiles) {
        try { fs.unlinkSync(path.join(homePath, f)); } catch {}
      }
      for (const d of [...new Set(createdDirectories)].sort((a, b) => b.length - a.length)) {
        try { fs.rmdirSync(path.join(homePath, d)); } catch {}
      }
    };

    let installSuccess = false;

    try {
      for (const skillTarget of def.skillTargets) {
        const srcCandidates = [
          path.join(rootDir, "orquestrador", "skills", "orquestrador-maestro"),
          path.join(rootDir, "codex", "skills", "orquestrador-maestro")
        ];
        const srcDir = srcCandidates.find(candidate => fs.existsSync(candidate));
        const destDir = assertSafeHomePath(path.posix.join(skillTarget, "orquestrador-maestro")).resolved;
        if (srcDir && fs.existsSync(srcDir)) {
          rememberDirectoryAncestry(destDir);
          fs.mkdirSync(destDir, { recursive: true });
          const files = fs.readdirSync(srcDir, { withFileTypes: true });
          for (const entry of files) {
            const srcFile = path.join(srcDir, entry.name);
            const destFile = path.join(destDir, entry.name);
            if (entry.isFile()) {
              const relManaged = path.join(skillTarget, "orquestrador-maestro", entry.name);
              const normalizedRel = relManaged.replace(/\\/g, "/");
              const existing = fs.existsSync(destFile) ? fs.lstatSync(destFile) : null;
              const previous = previousEntries.get(normalizedRel);
              const isOwned = Boolean(existing && existing.isFile() && previous && previous.sha256 === hashFile(destFile));
              if (!existing) {
                createdFiles.push(relManaged);
              } else if (existing.isSymbolicLink() || !existing.isFile()) {
                conflicts.push(normalizedRel);
                continue;
              } else if (!isOwned) {
                preservedExisting.push(normalizedRel);
                continue;
              } else {
                replacedFiles.set(destFile, fs.readFileSync(destFile));
              }
              fs.copyFileSync(srcFile, destFile);
              const entryRecord = {
                path: normalizedRel,
                kind: "file",
                sha256: hashFile(destFile),
                installedBy: "orquestrador-maestro",
                installedAt: new Date().toISOString(),
                target: toolId
              };
              managedEntries.push(entryRecord);
              managedFiles.push(normalizedRel);
            }
          }
          if (managedEntries.some(entry => entry.path.startsWith(`${skillTarget.replace(/\\/g, "/")}/orquestrador-maestro/`))) {
            managedDirectories.push(path.posix.join(skillTarget, "orquestrador-maestro"));
          }
        }
      }

      for (const configPath of def.configPaths) {
        const markerPath = assertSafeHomePath(path.posix.join(configPath, ".maestro-managed")).resolved;
        rememberDirectoryAncestry(path.dirname(markerPath));
        fs.mkdirSync(path.dirname(markerPath), { recursive: true });
        const markerExists = fs.existsSync(markerPath);
        if (markerExists) {
          const markerStat = fs.lstatSync(markerPath);
          if (markerStat.isSymbolicLink() || !markerStat.isFile()) throw new Error(`Unsafe marker: ${markerPath}`);
          const currentMarker = fs.readFileSync(markerPath, "utf8");
          const previous = previousEntries.get(path.posix.join(configPath, ".maestro-managed"));
          const isOwned = isRecognizedMarker(currentMarker, toolId)
            && (!previous || previous.sha256 === hashFile(markerPath));
          if (!isOwned) {
            conflicts.push(path.posix.join(configPath, ".maestro-managed"));
            break;
          }
          replacedFiles.set(markerPath, Buffer.from(currentMarker));
        } else {
          createdFiles.push(path.posix.join(configPath, ".maestro-managed"));
        }
        fs.writeFileSync(markerPath, markerContent(toolId));
        const markerRel = path.posix.join(configPath, ".maestro-managed");
        managedFiles.push(markerRel);
        managedEntries.push({
          path: markerRel,
          kind: "file",
          sha256: hashFile(markerPath),
          installedBy: "orquestrador-maestro",
          installedAt: new Date().toISOString(),
          target: toolId
        });
        if (markerExists || def.configPaths.length > 0) {
          break;
        }
      }

      installSuccess = true;
    } catch (err) {
      installSuccess = false;
      rollbackCreated();
    }

    if (!installSuccess) {
      console.error(JSON.stringify({
        target: toolId,
        enabled: false,
        detection: detection.state,
        error: "Failed to install integration files."
      }, null, 2));
      return 1;
    }

    state.targets[toolId] = {
      enabled: true,
      selection: "user",
      lastDetection: detection.state,
      enabledAt: new Date().toISOString(),
      managedFiles,
      managedDirectories,
      managedEntries,
      preservedExisting,
      conflicts
    };

    try {
      installState.writeState(orquestradorDir, state);
    } catch {
      rollbackCreated();
      console.error(JSON.stringify({
        target: toolId,
        enabled: false,
        detection: detection.state,
        error: "Failed to persist state. Rolled back file changes."
      }, null, 2));
      return 1;
    }

    console.log(JSON.stringify({
      target: toolId,
      enabled: true,
      detection: detection.state,
      managedFiles,
      managedEntries,
      preservedExisting,
      conflicts,
      message: `Target ${toolId} installed and enabled.`
    }, null, 2));
    return 0;
  }

  if (subcommand === "remove") {
    const toolId = extractPositionalArg(rest, ["--home-path"]);
    if (!toolId || !isSupportedTool(toolId)) {
      throw new Error(`Invalid target: ${toolId}. Supported: ${listSupportedTools().join(", ")}`);
    }

    const state = installState.readState(orquestradorDir) || installState.getDefaultState();
    const targetState = installState.getTargetState(state, toolId);
    const removedFiles = [];
    const preservedFiles = [];
    const modifiedManagedFile = [];
    const removedFileBackups = new Map();
    const force = rest.includes("--force");

    function isPathContained(relPath) {
      const full = path.resolve(homePath, relPath);
      // Resolve symlinks to prevent physical path escape
      let realHome;
      try { realHome = fs.realpathSync(homePath); } catch { realHome = path.resolve(homePath); }
      let realFull;
      try { realFull = fs.realpathSync(full); } catch {
        // Path doesn't exist yet — check parent directory instead
        try { realFull = fs.realpathSync(path.dirname(full)); } catch { realFull = path.dirname(full); }
        realFull = path.join(realFull, path.basename(full));
      }
      const rel = path.relative(realHome, realFull);
      return !rel.startsWith("..") && !path.isAbsolute(rel);
    }

    const managedEntries = targetState?.managedEntries || [];
    for (const entry of managedEntries) {
      const relPath = entry.path;
      try {
        const { resolved: fullPath } = assertSafeHomePath(relPath);
        if (!fs.existsSync(fullPath)) continue;
        const stat = fs.lstatSync(fullPath);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          preservedFiles.push(relPath);
          continue;
        }
        const unchanged = hashFile(fullPath) === entry.sha256;
        if (!unchanged && !force) {
          modifiedManagedFile.push(relPath);
          preservedFiles.push(relPath);
          continue;
        }
        removedFileBackups.set(fullPath, fs.readFileSync(fullPath));
        fs.unlinkSync(fullPath);
        removedFiles.push(relPath);
      } catch (err) {
        preservedFiles.push(relPath);
        console.error(`Refusing to remove path ${relPath}: ${err.message}`);
      }
    }

    // Legacy path-only records are intentionally preserved: without a hash they
    // do not prove that the current file is still Maestro-owned.
    for (const relPath of targetState?.managedFiles || []) {
      if (!managedEntries.some(entry => entry.path === relPath)) preservedFiles.push(relPath);
    }

    if (targetState && targetState.managedDirectories) {
      for (const relDir of targetState.managedDirectories) {
        let fullDir;
        try { fullDir = assertSafeHomePath(relDir).resolved; } catch (err) {
          console.error(`Refusing to remove directory ${relDir}: ${err.message}`);
          continue;
        }
        try {
          if (fs.existsSync(fullDir) && !fs.lstatSync(fullDir).isSymbolicLink()) {
            const entries = fs.readdirSync(fullDir);
            if (entries.length === 0) {
              fs.rmdirSync(fullDir);
            }
          }
        } catch {}
      }
    }

    const markerRemoved = [];
    const def = getToolDefinition(toolId);
    if (def) {
      for (const configPath of def.configPaths) {
        let markerPath;
        try { markerPath = assertSafeHomePath(path.posix.join(configPath, ".maestro-managed")).resolved; } catch (err) {
          console.error(`Refusing marker path ${configPath}: ${err.message}`);
          continue;
        }
        try {
          if (fs.existsSync(markerPath)) {
            const markerStat = fs.lstatSync(markerPath);
            const markerRel = path.posix.join(configPath, ".maestro-managed");
            const markerEntry = managedEntries.find(entry => entry.path === markerRel);
            if (markerStat.isSymbolicLink() || !markerStat.isFile() || !markerEntry) {
              preservedFiles.push(markerRel);
            } else if (hashFile(markerPath) !== markerEntry.sha256 && !force) {
              modifiedManagedFile.push(markerRel);
              preservedFiles.push(markerRel);
            } else if (isRecognizedMarker(fs.readFileSync(markerPath, "utf8"), toolId)) {
              removedFileBackups.set(markerPath, fs.readFileSync(markerPath));
              fs.unlinkSync(markerPath);
              markerRemoved.push(markerRel);
            } else {
              preservedFiles.push(markerRel);
            }
          }
        } catch {}
      }
    }

    installState.disableTarget(state, toolId);
    try {
      installState.writeState(orquestradorDir, state);
    } catch (err) {
      for (const [filePath, content] of removedFileBackups.entries()) {
        try { fs.writeFileSync(filePath, content, { flag: "wx" }); } catch {}
      }
      console.error(JSON.stringify({
        target: toolId,
        enabled: true,
        error: "Failed to persist state. Restored removed files.",
        cause: err.message
      }, null, 2));
      return 1;
    }

    console.log(JSON.stringify({
      target: toolId,
      enabled: false,
      removedFiles: [...removedFiles, ...markerRemoved],
      preservedFiles: [...new Set(preservedFiles)],
      modifiedManagedFile: [...new Set(modifiedManagedFile)],
      message: `Target ${toolId} disabled. Maestro-managed files removed. User files preserved.`
    }, null, 2));
    return 0;
  }

  if (subcommand === "sync") {
    const state = installState.readState(orquestradorDir) || installState.getDefaultState();
    const enabledTargets = installState.getEnabledTargets(state);

    if (enabledTargets.length === 0) {
      console.log(JSON.stringify({ synced: [], message: "No enabled targets to sync." }, null, 2));
      return 0;
    }

    const packageSyncSh = path.join(rootDir, "orquestrador", "sync-skills.sh");
    const packageSyncPs1 = path.join(rootDir, "orquestrador", "sync-skills.ps1");
    const scriptExists = isWindows ? fs.existsSync(packageSyncPs1) : fs.existsSync(packageSyncSh);

    if (!scriptExists) {
      console.error(`Error: sync script not found in package: ${isWindows ? packageSyncPs1 : packageSyncSh}`);
      return 1;
    }

    const synced = [];
    const failed = [];
    for (const target of enabledTargets) {
      try {
        const exitCode = isWindows
          ? run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", packageSyncPs1, "-Apply", "-HomePath", homePath, "-Only", target])
          : run("bash", [packageSyncSh, "--apply", "--home-path", homePath, "--only", target]);
        if (exitCode === 0) {
          synced.push(target);
        } else {
          failed.push({ target, exitCode });
        }
      } catch (e) {
        failed.push({ target, error: e.message });
      }
    }

    if (failed.length > 0) {
      console.error(JSON.stringify({ synced, failed }, null, 2));
      return 1;
    }

    console.log(JSON.stringify({ synced }, null, 2));
    return 0;
  }

  throw new Error(`Unknown targets subcommand: ${subcommand}. Use: targets [list|detect|add|remove|sync]`);
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

  if (command === "workflow-lock") return workflowLock.main(args);
  if (command === "workflow-state") return workflowState.main(args);

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }

  if (command === "install") {
    return await runInstall(args);
  }

  if (command === "update") {
    if (args.includes("--help") || args.includes("-h")) {
      printHelp();
      return 0;
    }
    if (args.includes("--version") || args.includes("-v")) {
      console.log(packageJson.version);
      return 0;
    }
    if (args.includes("--dry-run") || args.includes("--list-targets")) {
      return await runInstall(args);
    }
    const childResult = runCliUpdate(args);
    if (childResult) {
      if (childResult.error) throw childResult.error;
      return typeof childResult.status === "number" ? childResult.status : 1;
    }
    return await runInstall(args);
  }

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }

  if (command === "--version" || command === "-v") {
    console.log(packageJson.version);
    return 0;
  }

  if (command === "version") {
    return handleVersionCommand(args);
  }
  if (command === "uninstall") {
    return await runInstall(args, ["--uninstall"]);
  }

  if (command === "list-targets") {
    return await runInstall(args, ["--list-targets"]);
  }

  if (command === "dry-run") {
    return await runInstall(args, ["--dry-run"]);
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
  if (command === "usage") return handleUsageCommand(args);
  if (command === "projects") return handleProjectsCommand(args);
  if (command === "project") return handleProjectCommand(args);
  if (command === "missions") return handleMissionsCommand(args);
  if (command === "mission") return handleMissionCommand(args);
  if (command === "terminal") return handleTerminalCommand(args);
  if (command === "terminals") return handleTerminalsCommand(args);
  if (command === "tui") return handleTuiCommand(args);
  if (command === "skills") return handleSkillsCommand(args);
  if (command === "skill-catalog") return handleSkillCatalogCommand(args);
  if (command === "providers") return handleProvidersCommand(args);
  if (command === "bridge") return handleBridgeCommand(args);
  if (command === "runtime") return handleRuntimeCommand(args);
  if (command === "governance") return handleGovernanceCommand(args);
  if (command === "interaction") return handleInteractionCommand(args);
  if (command === "status") return handleStatusCommand(args);

  if (command === "memory") {
    if (args.includes("--help") || args.includes("-h")) {
      const memory = new Memory();
      memory.printHelp();
      return 0;
    }
    return runMemoryCommand(args);
  }

  if (command === "benchmark") {
    return runBenchmarkCommand(args);
  }

  if (command === "adapters") {
    return runToolAdapters(args);
  }

  if (command === "targets") {
    return handleTargetsCommand(args);
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

  const telemetryCommands = new Set([
    "install", "update", "uninstall", "list-targets", "dry-run", "verify", "doctor",
    "init-dev", "compact-worklog", "check-dev-gates", "changelog", "version", "run",
    "runs", "usage", "projects", "project", "missions", "mission", "terminal", "terminals",
    "tui", "skills", "skill-catalog", "providers", "bridge", "runtime", "governance", "interaction",
    "status", "memory", "benchmark", "adapters", "targets", "go", "plan"
  ]);
  if (telemetryCommands.has(command)) {
    await sendTelemetry(buildTelemetryPayload(command, args, exitCode, errorName));
  }

  process.exit(exitCode);
}

main();
