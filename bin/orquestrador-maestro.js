#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const {
  path,
  rootDir,
  packageJson,
  managedFiles,
  updateMigrations,
  nativeSkillsSync,
  contextBrief,
  workflowLock,
  resolveGitContext,
  workflowState,
  Memory,
  MaestroApplication,
  createBridge,
  createStdioServer,
  resolveMaestroRoot,
  loadGovernanceConfig,
  writeGovernanceConfig,
  loadInteractionCatalog,
  resolveInteractionProfile,
  setInteractionProfile,
  resetInteractionProfile,
  formatStatus,
  resolveStatus,
  listSupportedTools,
  getToolDefinition,
  isSupportedTool,
  DETECTION_STATES,
  detectAllTools,
  detectToolById,
  installState,
  telemetryTimeoutMs,
  telemetryConsentVersion,
  defaultTelemetryProvider,
  defaultTelemetryEndpointUrl,
  installFlagDefs,
  verifyFlagDefs,
  initDevFlagDefs,
  normalizeArgs,
  parseArg,
  parseArgEqual,
  getArg,
  extractPositionalArg,
  resolveBenchmarkScenario,
  parseRuntimeArgs,
  createRuntimeApplication,
  commandExists,
  getNpmCommand,
  runNpm,
  getPublishedNpmVersion,
  compareVersions,
  hasV3SkillManifest,
  getNpmChannel
} = require("../cli/shared-context");
const { handleRunCommand } = require("../cli/commands/run");
const { handleRunsCommand, handleUsageCommand } = require("../cli/commands/runs");
const {
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
} = require("../cli/commands/project");
const {
  handleBridgeCommand,
  handleTelemetryCommand,
  handleChangelogCommand,
  handleVersionCommand,
  handleDesktopPluginCommand,
  handleDesktopMcpCommand,
  handleDesktopHookCommand,
  handleRouteCommand,
  sendTelemetry,
  buildTelemetryPayload
} = require("../cli/commands/ops");
const { handleGoCommand } = require("../cli/commands/go");
const { handleContextCommand, handleTargetsCommand } = require("../cli/commands/context");

function printHelp() {
  console.log(`Orquestrador Maestro CLI ${packageJson.version}

Uso:
  orquestrador-maestro install [opcoes]
  orquestrador-maestro update [opcoes]
  orquestrador-maestro verify [opcoes]
  orquestrador-maestro rollback [--home-path PATH] [--to STAMP] [--list]
  orquestrador-maestro doctor [--home-path PATH] [--strict]
  orquestrador-maestro init-dev [--project-path PATH]
  orquestrador-maestro compact-worklog [--project-path PATH] [--keep N]
  orquestrador-maestro check-dev-gates [--project-path PATH] [--max-entries N] [--strict] [--architectural]
  orquestrador-maestro check-recurrence [--project-path PATH] [--threshold N] [--write]
  orquestrador-maestro context brief [--project-path PATH] [--task TEXT] [--max-chars N] [--since COMMIT] [--json]
  orquestrador-maestro context section --path FILE.md --heading TEXT [--project-path PATH] [--json]
  orquestrador-maestro context inspect --intent TEXT [--project-path PATH]
  orquestrador-maestro workflow-lock <generate|validate> [opcoes]
  orquestrador-maestro workflow-state <init|get|validate|approve|advance> [opcoes]
  orquestrador-maestro route explain [--json] [--complexity LEVEL] "objetivo"
  orquestrador-maestro governance <status|set> [opcoes]
  orquestrador-maestro interaction <list|get|set|reset> [opcoes]
  orquestrador-maestro status [--json] [--task-id ID] [--lockfile PATH] [--project-path PATH]
  orquestrador-maestro memory record [--project PATH] --type TYPE --summary TEXT [opcoes]
  orquestrador-maestro memory search [--project PATH] [--search TEXT] [--type TYPE] [--verified] [--unverified]
  orquestrador-maestro memory show [--project PATH] --id ID
  orquestrador-maestro memory forget [--project PATH] --id ID [--force]
  orquestrador-maestro memory timeline [--project PATH] [--limit N]
  orquestrador-maestro memory export [--project PATH] [--output PATH]
  orquestrador-maestro memory import [--project PATH] --input PATH [--dry-run]
  orquestrador-maestro memory promote [--project PATH] --id ID --destination PATH [--apply]
  orquestrador-maestro memory stats [--project PATH]
  orquestrador-maestro memory status
  orquestrador-maestro memory cleanup [--project PATH]
  orquestrador-maestro benchmark list
  orquestrador-maestro benchmark run [scenario] [--scenario ID] [--condition CONDITION] [opcoes]
  orquestrador-maestro benchmark validate <scenario>
  orquestrador-maestro benchmark <pair|adaptive-pair|report|preflight|inspect|compare|suite> [opcoes]
  orquestrador-maestro run [--provider ID] [--profile ID] [--policy ID] [--workspace PATH] "tarefa"
  orquestrador-maestro go [--auto] [--plan] [--router-version 2|3] [--complexity LEVEL] [--provider ID] [--model MODEL] [--interviewer ID] [--project-path PATH] "tarefa"
  orquestrador-maestro plan [--auto] [--plan] [--router-version 2|3] [--complexity LEVEL] [--provider ID] [--model MODEL] [--interviewer ID] [--project-path PATH] "tarefa"
  orquestrador-maestro runs [--project-path PATH]
  orquestrador-maestro runs worker [--project-path PATH] [--interval MS] [--concurrency N] [--once]
  orquestrador-maestro runs admissions [--project-path PATH] [--limit N]
  orquestrador-maestro runs reconcile [--project-path PATH] [--limit N] [--apply]
  orquestrador-maestro usage [--project-path PATH] [--limit N] [--provider TOOL] [--model MODEL] [--branch BRANCH] [--project ID] [--json]
  orquestrador-maestro run show <id> [--project-path PATH]
  orquestrador-maestro run inspect <id> [--project-path PATH]
  orquestrador-maestro run report <id> [--project-path PATH]
  orquestrador-maestro run cancel <id> [--project-path PATH]
  orquestrador-maestro projects
  orquestrador-maestro project add <caminho>
  orquestrador-maestro project show <id> [--project-path PATH]
  orquestrador-maestro project inspect [--project-path PATH]
  orquestrador-maestro missions [--project-path PATH]
  orquestrador-maestro mission create [--project-path PATH] "objetivo"
  orquestrador-maestro mission show <id> [--project-path PATH]
  orquestrador-maestro terminal list [--project-path PATH]
  orquestrador-maestro terminal start [--project-path PATH] -- <comando> [argumentos]
  orquestrador-maestro terminal stop <id> [--project-path PATH]
  orquestrador-maestro skills list [--project-path PATH]
  orquestrador-maestro skill-catalog <generate|check|validate>
  orquestrador-maestro providers list [--project-path PATH]
  orquestrador-maestro providers goals [--project-path PATH]
  orquestrador-maestro bridge --stdio [--with-worker] [--project-path PATH]
  orquestrador-maestro desktop-plugin <install|status|doctor|stats|remove> [opcoes]
  orquestrador-maestro harness <status|install|update|remove|rollback|doctor> [alvo] [opcoes]
  orquestrador-maestro harness --render|--merge|--remove claude|gemini
  orquestrador-maestro harness --preview-review|--verify-review [APPROVAL_DIGEST] (JSON via stdin)
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
  --core-only                 Instala somente .orquestrador e AGENTS.md
  --only <component>          Limita a um componente: core, codex, agents,
                              claude, opencode, cursor, gemini, windsurf,
                              antigravity, freebuff, mimo, kimi, grok
  --all-targets               Instala em todos os targets suportados (opt-in)
  --no-tool-profiles          Nao instala perfis globais das ferramentas
  --skip-community-skills     Nao copia a biblioteca comunitaria offload
  --skip-skill-sync           Nao roda o sync de skills
  --skip-desktop-plugin       Nao instala o plugin do app ChatGPT/Codex Desktop
  --with-harness-hooks        Configura hooks/plugins opt-in para harnesses detectados (backup antes de editar)
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
  --strict                    Verifica espelho completo + MANAGED_FILES + policy v2
  --verbose-paths

Opcoes de doctor:
  --home-path <path>          Diagnostica outro home
  --strict                    Falha em avisos e verifica integridade detalhada

Opcoes de init-dev:
  --project-path <path>       Cria a hierarquia DEV recomendada no projeto

Opcoes de compact-worklog:
  --project-path <path>       Projeto que contem DEV/WORKLOG.md
  --keep <n>                  Mantem as N entradas mais recentes no WORKLOG

Opcoes de check-dev-gates:
  --project-path <path>       Projeto que contem a hierarquia DEV
  --max-entries <n>           Falha se DEV/WORKLOG.md passar do limite
  --strict                    Exige entrada substantiva e bullets minimos
  --architectural             Exige cobertura da secao arquitetural

Opcoes de changelog:
  --full                      Mostra o historico completo embutido no pacote

Opcoes de version:
  --check                     Compara a CLI instalada com o canal publicado correspondente

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
    env: options.env || process.env,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 1;
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

  const channel = getNpmChannel(packageJson.version);
  console.log(`Atualizando a CLI npm para ${packageJson.name}@${channel}...`);
  // Capture npm output to classify permission failures without exposing raw
  // registry/auth diagnostics. npm still writes its own local debug log.
  const result = runNpm([
    "install", "-g", `${packageJson.name}@${channel}`, "--force", "--prefer-online"
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const { npmPermissionHint } = require("../orquestrador/lib/install-diagnostics");
  const hint = npmPermissionHint(result);
  if (hint) throw new Error(hint);
  if (result.error || result.status !== 0) {
    throw new Error(`A atualização da CLI npm falhou (código ${result.status ?? result.error?.code ?? "desconhecido"}). Consulte o log local do npm.`);
  }
  if (result.stdout) process.stdout.write(result.stdout);

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

function desktopAppPresent() {
  if (process.platform === "darwin") return fs.existsSync("/Applications/ChatGPT.app");
  if (process.platform !== "linux") return false;
  const candidates = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, "chatgpt"));
  return candidates.some((candidate) => fs.existsSync(candidate));
}

function desktopPluginTargetsCodex(args) {
  if (args.includes("--core-only")) return false;
  const only = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--only") {
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        only.push(...value.split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean));
      }
      i += 1;
    }
  }
  return only.length === 0 || only.includes("codex");
}

function maybeInstallDesktopPlugin(args, installStatus) {
  if (installStatus !== 0) return;
  if (process.env.ORQUESTRADOR_MAESTRO_SKIP_DESKTOP_PLUGIN === "1") return;
  if (!desktopPluginTargetsCodex(args)) return;
  const { desktopAppSupport } = require(path.join(rootDir, "orquestrador", "lib", "codex-home.js"));
  const support = desktopAppSupport();
  if (!support.supported && !desktopAppPresent()) return;
  const homePath = getArg(args, "--home-path") || process.env.HOME || process.env.USERPROFILE || os.homedir();
  try {
    const integration = require(path.join(rootDir, "runtime", "integrations", "openai", "installer.js"));
    const result = integration.installDesktopPlugin({ home: homePath, packageRoot: rootDir });
    console.log(`Plugin desktop ChatGPT/Codex instalado em ${result.destination}.`);
    console.log("Reabra o ChatGPT Desktop ou Codex e aprove os hooks do plugin somente se confiar na integração.");
  } catch (error) {
    console.error(`Aviso: plugin desktop nao instalado (${error.message || error}).`);
  }
}

async function runInstall(args, injectedFlags = []) {
  const isWindows = process.platform === "win32";
  const script = path.join(rootDir, isWindows ? "install.ps1" : "install.sh");
  if (!commandExists(script)) {
    throw new Error(`Instalador nao encontrado: ${script}`);
  }

  const normalizedForOnly = [...args, ...injectedFlags].flatMap((a) => a.startsWith("--only=") ? ["--only", a.slice("--only=".length)] : [a]);
  const isNonInteractive = normalizedForOnly.includes("--non-interactive");
  const isAllTargets = normalizedForOnly.includes("--all-targets");
  const hasOnly = normalizedForOnly.includes("--only");

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

  const skipDesktopPlugin = normalizedForOnly.includes("--skip-desktop-plugin");
  const withHarnessHooks = normalizedForOnly.includes("--with-harness-hooks");
  const isDryRunInstall = normalizedForOnly.includes("--dry-run");
  const scriptArgs = [...args, ...injectedFlags].filter((arg) => arg !== "--skip-desktop-plugin" && arg !== "--with-harness-hooks");
  const runOnly = normalizedForOnly.includes("--uninstall")
    || normalizedForOnly.includes("--list-targets")
    || normalizedForOnly.includes("--dry-run");

  let result;
  if (isWindows) {
    const translated = translateArgs(scriptArgs, installFlagDefs, "ps");
    result = run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...translated]);
  } else {
    const translated = translateArgs(scriptArgs, installFlagDefs, "sh");
    result = run("bash", [script, ...translated]);
  }

  if (!skipDesktopPlugin && !runOnly) {
    maybeInstallDesktopPlugin(normalizedForOnly, result);
  }
  if (withHarnessHooks && result === 0 && !normalizedForOnly.includes("--uninstall") && !normalizedForOnly.includes("--list-targets")) {
    const home = path.resolve(getArg(scriptArgs, "--home-path") || process.env.HOME || process.env.USERPROFILE || os.homedir());
    // `--only` narrows the scope: never configure an adapter for a tool the
    // operator excluded from this install.
    const onlyArg = getArg(scriptArgs, "--only");
    const selectedComponents = typeof onlyArg === "string"
      ? onlyArg.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean)
      : [];
    const hosts = selectedComponents.length > 0 && !selectedComponents.includes("all")
      ? selectedComponents
      : null;
    try {
      const harnessInstaller = require(path.join(rootDir, "runtime", "integrations", "harness", "installer.js"));
      const summary = harnessInstaller.installDetectedHarnesses({ home, packageRoot: rootDir, dryRun: isDryRunInstall, hosts });
      for (const entry of summary.results) {
        if (entry.skipped) continue;
        if (entry.error) console.error(`Aviso: harness ${entry.host} nao configurado (${entry.error}).`);
        else console.log(`Harness ${entry.host}: ${entry.action}${entry.dryRun ? " (dry-run)" : ""} -> ${entry.targetPath}`);
      }
    } catch (error) {
      console.error(`Aviso: harness hooks nao configurados (${error.message || error}).`);
    }
  }
  if (!runOnly && result === 0) {
    const home = path.resolve(getArg(scriptArgs, "--home-path") || process.env.HOME || process.env.USERPROFILE || os.homedir());
    require("../orquestrador/lib/install-diagnostics").printClaudeGuidance(home);
  }
  return result;
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

function rollbackPathInfo(target) {
  try { return fs.lstatSync(target); }
  catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
}

function rollbackRemove(target) {
  if (rollbackPathInfo(target)) fs.rmSync(target, { recursive: true, force: true });
}

function rollbackSafeRelativePath(root, relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || relative.includes("\0")) {
    throw new Error("Rollback recusado: caminho relativo inválido no backup.");
  }
  const parts = relative.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
    throw new Error("Rollback recusado: caminho relativo inseguro no backup.");
  }
  const absoluteRoot = path.resolve(root);
  const destination = path.resolve(absoluteRoot, ...parts);
  if (!destination.startsWith(absoluteRoot + path.sep)) throw new Error("Rollback recusado: caminho fora da raiz.");
  let current = absoluteRoot;
  for (const part of parts) {
    current = path.join(current, part);
    const info = rollbackPathInfo(current);
    if (info?.isSymbolicLink()) throw new Error(`Rollback recusado: caminho contém link simbólico: ${current}`);
  }
  return destination;
}

function readNativeRollbackPlan(homePath, backupDirectory) {
  const artifactRoot = path.join(backupDirectory, "update-artifacts", "native-skills");
  const reportPath = path.join(artifactRoot, "native-skills-report.json");
  const reportInfo = rollbackPathInfo(reportPath);
  if (!reportInfo) return { operations: [], stateRestores: [] };
  if (reportInfo.isSymbolicLink() || !reportInfo.isFile()) throw new Error("Backup incompatível: relatório de skills nativas inválido.");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.schemaVersion !== 1 || report.kind !== "orquestrador-native-skill-update-report" || !Array.isArray(report.operations)) {
    throw new Error("Backup incompatível: formato do relatório de skills nativas não suportado.");
  }

  const operations = [];
  const stateGroups = new Map();
  const seenSkills = new Set();
  for (const operation of report.operations) {
    if (!operation || !/^[A-Za-z0-9._-]+$/u.test(operation.program || "") ||
        !/^[A-Za-z0-9._-]+$/u.test(operation.skill || "") ||
        !["updated", "copied", "preserved-customization", "unchanged"].includes(operation.action) ||
        !/^[a-f0-9]{64}$/iu.test(operation.installedTreeSha256 || "") ||
        !/^[a-f0-9]{64}$/iu.test(operation.sourceTreeSha256 || "")) {
      throw new Error("Backup incompatível: operação inválida no relatório de skills nativas.");
    }
    const root = rollbackSafeRelativePath(homePath, operation.targetRoot);
    const rootInfo = rollbackPathInfo(root);
    if (!rootInfo || rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      throw new Error(`Rollback recusado: raiz nativa ausente ou insegura: ${operation.targetRoot}`);
    }
    const skillKey = `${operation.targetRoot}/${operation.skill}`.toLowerCase();
    if (seenSkills.has(skillKey)) throw new Error(`Backup incompatível: skill duplicada no relatório: ${operation.skill}`);
    seenSkills.add(skillKey);
    const destination = rollbackSafeRelativePath(homePath, `${operation.targetRoot}/${operation.skill}`);
    const skillInfo = rollbackPathInfo(destination);
    if (skillInfo && (skillInfo.isSymbolicLink() || !skillInfo.isDirectory())) {
      throw new Error(`Rollback recusado: a skill nativa tem um tipo inseguro: ${operation.skill}`);
    }
    const currentTreeHash = skillInfo ? nativeSkillsSync.treeHash(destination) : null;

    let previousCopy = null;
    if (operation.action === "updated") {
      if (!/^[a-f0-9]{64}$/iu.test(operation.previousTreeSha256 || "") || typeof operation.previousCopy !== "string") {
        throw new Error(`Backup incompatível: cópia anterior ausente para ${operation.skill}.`);
      }
      previousCopy = rollbackSafeRelativePath(artifactRoot, operation.previousCopy);
      const previousInfo = rollbackPathInfo(previousCopy);
      if (!previousInfo || previousInfo.isSymbolicLink() || !previousInfo.isDirectory() ||
          nativeSkillsSync.treeHash(previousCopy) !== operation.previousTreeSha256) {
        throw new Error(`Backup incompatível: cópia anterior inválida para ${operation.skill}.`);
      }
    }
    if (operation.action === "copied" && operation.previousCopy) {
      throw new Error(`Backup incompatível: operação copiada contém snapshot anterior inesperado (${operation.skill}).`);
    }
    let alreadyRestored = false;
    if (operation.action === "updated") {
      if (currentTreeHash === operation.previousTreeSha256) alreadyRestored = true;
      else if (currentTreeHash !== operation.installedTreeSha256) {
        throw new Error(`Rollback recusado: a skill nativa mudou após o backup: ${operation.skill}`);
      }
    } else if (operation.action === "copied") {
      if (!currentTreeHash) alreadyRestored = true;
      else if (currentTreeHash !== operation.installedTreeSha256) {
        throw new Error(`Rollback recusado: a skill nativa mudou após o backup: ${operation.skill}`);
      }
    } else if (currentTreeHash !== operation.installedTreeSha256) {
      throw new Error(`Rollback recusado: a skill nativa mudou após o backup: ${operation.skill}`);
    }
    operations.push({ operation, destination, previousCopy, alreadyRestored });
    const stateKey = operation.targetRoot;
    if (!stateGroups.has(stateKey)) stateGroups.set(stateKey, { targetRoot: operation.targetRoot, root, programs: new Set(), operations: [], operationPlans: [] });
    const stateGroup = stateGroups.get(stateKey);
    stateGroup.programs.add(operation.program);
    stateGroup.operations.push(operation);
    stateGroup.operationPlans.push(operations.at(-1));
  }

  const stateRestores = [];
  for (const group of stateGroups.values()) {
    const stateDestination = path.join(group.root, nativeSkillsSync.STATE_FILE);
    const stateInfo = rollbackPathInfo(stateDestination);
    if (stateInfo && (stateInfo.isSymbolicLink() || !stateInfo.isFile())) {
      throw new Error(`Rollback recusado: estado de skills inseguro em ${group.targetRoot}.`);
    }
    const snapshots = [];
    for (const program of group.programs) {
      const base = `native-skill-state-before/${program}`;
      const presentSnapshot = rollbackSafeRelativePath(artifactRoot, `${base}.json`);
      const absentSnapshot = rollbackSafeRelativePath(artifactRoot, `${base}.absent`);
      const presentInfo = rollbackPathInfo(presentSnapshot);
      const absentInfo = rollbackPathInfo(absentSnapshot);
      if (presentInfo) snapshots.push({ program, path: presentSnapshot, info: presentInfo, absent: false });
      if (absentInfo) snapshots.push({ program, path: absentSnapshot, info: absentInfo, absent: true });
    }
    if (snapshots.length !== 1) {
      throw new Error(`Backup incompatível: snapshot do estado de skills ausente ou ambíguo para ${group.targetRoot}.`);
    }
    const [stateSnapshot] = snapshots;
    const { program } = stateSnapshot;
    const presentInfo = stateSnapshot.absent ? null : stateSnapshot.info;
    const absentInfo = stateSnapshot.absent ? stateSnapshot.info : null;
    const presentSnapshot = presentInfo ? stateSnapshot.path : null;
    const absentSnapshot = absentInfo ? stateSnapshot.path : null;
    if (presentInfo && (presentInfo.isSymbolicLink() || !presentInfo.isFile())) {
      throw new Error(`Backup incompatível: snapshot do estado de skills inválido para ${program}.`);
    }
    if (absentInfo && (absentInfo.isSymbolicLink() || !absentInfo.isFile() || fs.statSync(absentSnapshot).size !== 0)) {
      throw new Error(`Backup incompatível: marcador de estado ausente inválido para ${program}.`);
    }
    let currentState = null;
    if (stateInfo) {
      try { currentState = JSON.parse(fs.readFileSync(stateDestination, "utf8")); }
      catch { throw new Error(`Rollback recusado: estado de skills inválido em ${group.targetRoot}.`); }
    }
    let snapshot = null;
    if (presentInfo) {
      try { snapshot = JSON.parse(fs.readFileSync(presentSnapshot, "utf8")); }
      catch { throw new Error(`Backup incompatível: snapshot do estado de skills inválido para ${program}.`); }
      if (snapshot.version !== nativeSkillsSync.STATE_VERSION || !snapshot.skills || typeof snapshot.skills !== "object") {
        throw new Error(`Backup incompatível: snapshot do estado de skills inválido para ${program}.`);
      }
    }
    const stateAlreadyRestored = absentInfo ? !currentState : Boolean(currentState && JSON.stringify(currentState) === JSON.stringify(snapshot));
    if (!stateAlreadyRestored) {
      if (!currentState) throw new Error(`Rollback recusado: estado de skills ausente em ${group.targetRoot}.`);
      for (const operation of group.operations) {
        const entry = currentState.skills?.[operation.skill];
        if (!entry || entry.sourceTreeSha256 !== operation.sourceTreeSha256 ||
            entry.installedTreeSha256 !== operation.installedTreeSha256) {
          throw new Error(`Rollback recusado: estado da skill ${operation.skill} mudou após o backup.`);
        }
      }
    }
    const treeAlreadyRestored = group.operationPlans.every(({ operation, alreadyRestored }) =>
      !["updated", "copied"].includes(operation.action) || alreadyRestored);
    if (stateAlreadyRestored && !treeAlreadyRestored) {
      throw new Error(`Rollback recusado: estado restaurado, mas skills continuam atualizadas em ${group.targetRoot}.`);
    }
    if (!stateAlreadyRestored && treeAlreadyRestored && group.operationPlans.some(({ operation }) => ["updated", "copied"].includes(operation.action))) {
      throw new Error(`Rollback recusado: skills restauradas, mas o estado ainda indica a atualização em ${group.targetRoot}.`);
    }
    if (!stateAlreadyRestored) {
      stateRestores.push({ destination: stateDestination, source: presentInfo ? presentSnapshot : null, type: "file" });
    }
  }

  return { operations, stateRestores };
}

function rollbackCoreSnapshot(homePath, backupDirectory) {
  const coreNames = [".orquestrador", ".orquestrador-maestro"];
  const backupCores = [];
  for (const name of coreNames) {
    const candidate = path.join(backupDirectory, name);
    const info = rollbackPathInfo(candidate);
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`Backup incompatível: ${name} não é um diretório comum.`);
    }
    backupCores.push({ name, source: candidate });
  }

  const backupAgents = path.join(backupDirectory, "AGENTS.md");
  const agentsInfo = rollbackPathInfo(backupAgents);
  if (agentsInfo && (agentsInfo.isSymbolicLink() || !agentsInfo.isFile())) {
    throw new Error("Backup incompatível: AGENTS.md não é um arquivo comum.");
  }
  if (backupCores.length === 0 && !agentsInfo) {
    throw new Error(`Backup vazio ou incompatível: ${backupDirectory}`);
  }

  const nonce = crypto.randomUUID();
  const nativePlan = readNativeRollbackPlan(homePath, backupDirectory);
  const mutations = [];
  const previous = new Map();
  const published = new Set();
  try {
  for (const entry of backupCores) {
    const stage = path.join(homePath, `${entry.name}.rollback-stage-${nonce}`);
    mutations.push({ destination: path.join(homePath, entry.name), stage, type: "directory" });
    fs.cpSync(entry.source, stage, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    const currentName = rollbackPathInfo(path.join(homePath, entry.name)) ? entry.name : coreNames.find((name) => rollbackPathInfo(path.join(homePath, name)));
    if (currentName) {
      const current = path.join(homePath, currentName);
      const preservationArtifacts = path.join(backupDirectory, "update-artifacts", "rollback-preserved");
      managedFiles.preserveUserFiles(current, stage, preservationArtifacts);
      const stagedConfig = path.join(stage, "config.json");
      const currentConfig = path.join(current, "config.json");
      if (rollbackPathInfo(stagedConfig) || rollbackPathInfo(currentConfig)) {
        updateMigrations.mergeToFile(stagedConfig, [stagedConfig, currentConfig]);
      }
      managedFiles.refreshInstalledOverrides(stage);
    }
  }
  if (agentsInfo) {
    const stage = path.join(homePath, `.AGENTS.md.rollback-stage-${nonce}`);
    mutations.push({ destination: path.join(homePath, "AGENTS.md"), stage, type: "file" });
    fs.copyFileSync(backupAgents, stage, fs.constants.COPYFILE_EXCL);
  }

  for (const name of backupCores.length > 0 ? coreNames : []) {
    const destination = path.join(homePath, name);
    const info = rollbackPathInfo(destination);
    if (info && (info.isSymbolicLink() || !info.isDirectory())) throw new Error(`Rollback recusado: ${name} não é um diretório comum.`);
    if (!backupCores.some((entry) => entry.name === name) && info) mutations.push({ destination, stage: null, type: "directory" });
  }
  for (const mutation of mutations) {
    const info = rollbackPathInfo(mutation.destination);
    if (info && (info.isSymbolicLink() || (mutation.type === "directory" ? !info.isDirectory() : !info.isFile()))) {
      throw new Error(`Rollback recusado: destino incompatível: ${mutation.destination}`);
    }
  }

  for (const { operation, destination, previousCopy, alreadyRestored } of nativePlan.operations) {
    if (alreadyRestored) continue;
    if (operation.action === "updated") {
      const stage = `${destination}.rollback-stage-${nonce}`;
      mutations.push({ destination, stage, type: "directory" });
      fs.cpSync(previousCopy, stage, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    } else if (operation.action === "copied") {
      mutations.push({ destination, stage: null, type: "directory" });
    }
  }
  for (const state of nativePlan.stateRestores) {
    const stage = state.source ? `${state.destination}.rollback-stage-${nonce}` : null;
    mutations.push({ destination: state.destination, stage, type: "file" });
    if (stage) fs.copyFileSync(state.source, stage, fs.constants.COPYFILE_EXCL);
  }
    for (const mutation of mutations) {
      const info = rollbackPathInfo(mutation.destination);
      if (info && (info.isSymbolicLink() || (mutation.type === "directory" ? !info.isDirectory() : !info.isFile()))) {
        throw new Error(`Rollback recusado: destino incompatível: ${mutation.destination}`);
      }
    }
    for (const mutation of mutations) {
      if (!rollbackPathInfo(mutation.destination)) continue;
      const old = `${mutation.destination}.rollback-previous-${nonce}`;
      fs.renameSync(mutation.destination, old);
      previous.set(mutation.destination, old);
    }
    for (const mutation of mutations) {
      if (!mutation.stage) continue;
      fs.renameSync(mutation.stage, mutation.destination);
      published.add(mutation.destination);
    }
  } catch (error) {
    const recoveryProblems = [];
    for (const destination of published) {
      try { rollbackRemove(destination); }
      catch (cleanupError) { recoveryProblems.push(`${destination}: ${cleanupError.message}`); }
    }
    for (const [destination, old] of [...previous.entries()].reverse()) {
      try { if (rollbackPathInfo(old)) fs.renameSync(old, destination); }
      catch (restoreError) { recoveryProblems.push(`${destination}: ${restoreError.message}`); }
    }
    for (const mutation of mutations) {
      if (mutation.stage) try { rollbackRemove(mutation.stage); } catch (cleanupError) { recoveryProblems.push(`${mutation.stage}: ${cleanupError.message}`); }
    }
    const recoveryNote = recoveryProblems.length ? ` Recovery paths need attention: ${recoveryProblems.join("; ")}` : " A instalação ativa foi restaurada.";
    throw new Error(`Rollback failed: ${error.message}.${recoveryNote}`);
  }

  // The restored snapshot remains reusable. Remove only transient copies of the
  // installation that was active before this rollback; cleanup is best effort.
  for (const old of previous.values()) { try { rollbackRemove(old); } catch {} }
  return {
    restoredCore: backupCores.map((entry) => entry.name),
    restoredAgents: Boolean(agentsInfo),
    restoredNativeSkills: nativePlan.operations.filter(({ operation }) => ["updated", "copied"].includes(operation.action)).length,
  };
}

function runRollback(args) {
  const normalized = normalizeArgs(args);
  let homePath = process.env.HOME || process.env.USERPROFILE || os.homedir();
  let to = "";
  let list = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const a = normalized[i];
    if (a === "--home-path") {
      const v = normalized[i + 1];
      if (!v || v.startsWith("--")) throw new Error("Parametro --home-path exige um valor.");
      homePath = v;
      i += 1;
    } else if (a === "--to") {
      const v = normalized[i + 1];
      if (!v || v.startsWith("--")) throw new Error("Parametro --to exige um valor.");
      to = v;
      i += 1;
    } else if (a === "--list") {
      list = true;
    } else {
      throw new Error(`Parametro desconhecido: ${a}`);
    }
  }
  const backupRoot = path.join(homePath, ".orquestrador-public-backups");
  const backupRootInfo = rollbackPathInfo(backupRoot);
  if (!backupRootInfo || !backupRootInfo.isDirectory() || backupRootInfo.isSymbolicLink()) throw new Error(`Nenhum backup encontrado: ${backupRoot}`);
  // Only timestamp-based backups produced by the installers are valid.
  // Refuse traversal, absolute paths and symlinked backup directories.
  const validStamp = (value) => /^\d{8}-\d{6}-\d+(?:-\d+|-[a-f0-9]{32})?$/iu.test(value);
  if (to && !validStamp(to)) throw new Error("Identificador de backup invalido: --to exige um timestamp do instalador.");
  const stamps = fs.readdirSync(backupRoot).filter((d) => {
    if (!validStamp(d)) return false;
    try {
      const info = fs.lstatSync(path.join(backupRoot, d));
        return info.isDirectory() && !info.isSymbolicLink();
    } catch { return false; }
  }).sort();
  if (list) {
    console.log(stamps.length ? stamps.join("\n") : "Nenhum backup disponível.");
    return 0;
  }
  if (stamps.length === 0) throw new Error("Nenhum backup válido disponível para restauração.");
  if (to && !stamps.includes(to)) throw new Error("Backup inexistente ou inválido: " + to);
  const stamp = to || stamps[stamps.length - 1];
  const src = path.join(backupRoot, stamp);
  if (!fs.existsSync(src)) throw new Error(`Backup não encontrado: ${src}`);
  rollbackCoreSnapshot(path.resolve(homePath), src);
  console.log(`Rollback concluído a partir de ${stamp}. Reexecute 'orquestrador-maestro verify' para confirmar.`);
  return 0;
}

function parseDoctorArgs(args) {
  const normalized = normalizeArgs(args);
  let homePath = "";
  let strict = false;
  for (let i = 0; i < normalized.length; i++) {
    const arg = normalized[i];
    if (arg === "--strict") { strict = true; continue; }
    if (arg === "--home-path") {
      const value = normalized[++i];
      if (!value || value.startsWith("--")) throw new Error("Parametro --home-path exige um valor.");
      homePath = value;
      continue;
    }
    throw new Error(`Parametro desconhecido: ${arg}`);
  }
  return { homePath, strict };
}

function printHarnessDoctorSummary(home) {
  try {
    const harnessInstaller = require(path.join(rootDir, "runtime", "integrations", "harness", "installer.js"));
    const report = harnessInstaller.harnessDoctor({ home, packageRoot: rootDir });
    const configured = Object.entries(report.hosts).filter(([, info]) => info.configured).map(([id]) => id);
    console.log(`Harness adapters: healthy=${report.healthy} configured=${configured.length ? configured.join(",") : "none"}`);
    for (const warning of report.warnings || []) console.log(`Aviso: harness ${warning}`);
  } catch (error) {
    console.log(`Harness adapters: indisponivel (${error.code || "HARNESS_DOCTOR_UNAVAILABLE"})`);
  }
}

function runDoctor(args) {
  const { homePath, strict } = parseDoctorArgs(args);
  const home = path.resolve(homePath || process.env.HOME || process.env.USERPROFILE || os.homedir());
  const diagnostics = require("../orquestrador/lib/install-diagnostics");
  const script = path.join(rootDir, "orquestrador", "doctor.ps1");
  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-HomePath", home];
  if (strict) psArgs.push("-Strict");
  if (process.platform === "win32") {
    const code = run("powershell", psArgs);
    const findings = diagnostics.printClaudeGuidance(home);
    printHarnessDoctorSummary(home);
    return code || (strict && findings.length ? 1 : 0);
  }
  // Preserve the detailed report when pwsh exists. Otherwise reuse the
  // existing Unix verifier, including its strict managed-file/policy gates.
  for (const command of ["pwsh", "powershell"]) {
    try {
      const code = run(command, psArgs);
      const findings = diagnostics.printClaudeGuidance(home);
      printHarnessDoctorSummary(home);
      return code || (strict && findings.length ? 1 : 0);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  console.log("Doctor: modo portável (Node.js + verificador Unix; relatório detalhado PowerShell não executado).");
  const verifyArgs = ["--home-path", home];
  if (strict) verifyArgs.push("--strict");
  const code = runVerify(verifyArgs);
  const findings = diagnostics.printClaudeGuidance(home);
  printHarnessDoctorSummary(home);
  return code || (strict && findings.length ? 1 : 0);
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
  const gitCtx = resolveGitContext(projectRoot);

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
        verifier: memory.getArg(rest, "--verifier"),
        verifyNote: memory.getArg(rest, "--verify-note"),
        taskId: memory.getArg(rest, "--task"),
        scope: memory.resolveScope(project, rest, projectRoot),
        gitContext: gitCtx
      }, { projectRoot, gitContext: gitCtx });
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
    case "forget": {
      const id = memory.getArg(rest, "--id");
      if (!id) throw new Error("--id is required");
      const result = memory.forget(project, id, { force: rest.includes("--force") });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "export": {
      const out = memory.getArg(rest, "--output");
      const data = memory.exportData(project);
      const text = JSON.stringify(data, null, 2);
      if (out) {
        fs.writeFileSync(path.resolve(out), text + "\n", "utf8");
      } else {
        console.log(text);
      }
      return 0;
    }
    case "import": {
      const input = memory.getArg(rest, "--input");
      if (!input) throw new Error("--input is required");
      const payload = fs.readFileSync(path.resolve(input), "utf8");
      const result = memory.importData(project, payload, { dryRun: rest.includes("--dry-run") });
      console.log(JSON.stringify(result, null, 2));
      return result.rejected.length > 0 && !rest.includes("--dry-run") ? 2 : 0;
    }
    default:
      throw new Error(`Unknown memory subcommand: ${subcommand}`);
  }
}

function runBenchmarkCommand(args) {
  const [subcommand = "list", ...rest] = args;
  if (subcommand === "real" || subcommand === "ai-real") throw new Error("Os benchmarks legados foram removidos; use `benchmark run` com o harness v3.");
  const forwarded = [subcommand];
  if (subcommand === "list" && !rest.some((arg) => arg === "--dir" || arg.startsWith("--dir="))) {
    forwarded.push("--dir", path.join(rootDir, "benchmark-harness", "scenarios"));
  }
  if (subcommand === "run" || subcommand === "pair" || subcommand === "adaptive-pair") {
    const scenario = getArg(rest, "--scenario");
    const condition = subcommand === "run" ? getArg(rest, "--condition") : null;
    if (scenario) forwarded.push("--scenario", resolveBenchmarkScenario(scenario));
    for (let index = 0; index < rest.length; index += 1) {
      if (rest[index] === "--scenario" || (subcommand === "run" && rest[index] === "--condition")) { index += 1; continue; }
      if (rest[index].startsWith("--scenario=") || (subcommand === "run" && rest[index].startsWith("--condition="))) continue;
      forwarded.push(rest[index]);
    }
    if (condition) forwarded.push("--condition", condition);
  } else if (subcommand === "validate") {
    const scenario = rest.find((arg) => !arg.startsWith("--"));
    if (scenario) forwarded.push("--scenario", resolveBenchmarkScenario(scenario));
    forwarded.push(...rest.filter((arg, index) => !(arg === scenario && index === rest.indexOf(scenario))));
  } else forwarded.push(...rest);

  const { POLICY_IDENTITIES } = require(path.join(rootDir, "runtime", "resolution", "policy-identity"));
  const adaptiveIdentity = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
  const benchmarkEnv = {
    ...process.env,
    BENCHMARK_ADAPTIVE_POLICY_ID: adaptiveIdentity.id,
    BENCHMARK_ADAPTIVE_POLICY_FINGERPRINT: adaptiveIdentity.fingerprint,
    BENCHMARK_MAESTRO_VERSION: packageJson.version,
    BENCHMARK_MAESTRO_BINARY: path.join(rootDir, "bin", "orquestrador-maestro.js")
  };
  return run(process.execPath, ["--import", "tsx", path.join(rootDir, "benchmark-harness", "src", "cli", "index.ts"), ...forwarded], { cwd: rootDir, env: benchmarkEnv });
}

async function dispatch(command, args) {
  if (command === "go" || command === "plan") {
    return handleGoCommand(args, command === "plan");
  }

  if (command === "route") {
    return handleRouteCommand(args);
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
    if (args.includes("--no-force")) {
      throw new Error("update sempre reaplica o núcleo com backup; use install --no-force para impedir a substituição.");
    }
    // The public install wrappers back up and replace managed files by default.
    const childResult = runCliUpdate(args);
    if (childResult) {
      if (childResult.error) throw childResult.error;
      return typeof childResult.status === "number" ? childResult.status : 1;
    }
    return await runInstall(args);
  }

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

  if (command === "rollback") {
    return runRollback(args);
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

  if (command === "check-recurrence") {
    return runDevContextHelper("check-recurrence", args);
  }

  if (command === "desktop-plugin") return handleDesktopPluginCommand(args);
  if (command === "desktop-mcp") return handleDesktopMcpCommand(args);
  if (command === "desktop-hook") return handleDesktopHookCommand(args);
  if (command === "harness") return (await require("../scripts/harness-hook").main(args, process.stdin, process.stdout)) || 0;
  if (command === "run") return handleRunCommand(args);
  if (command === "runs") return handleRunsCommand(args);
  if (command === "usage") return handleUsageCommand(args);
  if (command === "projects") return handleProjectsCommand(args);
  if (command === "project") return handleProjectCommand(args);
  if (command === "missions") return handleMissionsCommand(args);
  if (command === "mission") return handleMissionCommand(args);
  if (command === "terminal") return handleTerminalCommand(args);
  if (command === "skills") return handleSkillsCommand(args);
  if (command === "skill-catalog") return handleSkillCatalogCommand(args);
  if (command === "providers") return handleProvidersCommand(args);
  if (command === "bridge") return handleBridgeCommand(args);
  if (command === "governance") return handleGovernanceCommand(args);
  if (command === "interaction") return handleInteractionCommand(args);
  if (command === "status") return handleStatusCommand(args);

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

function flushStream(stream) {
  return new Promise((resolve) => {
    if (!stream || stream.destroyed || stream.writableEnded) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.removeListener("error", done);
      resolve();
    };
    const timer = setTimeout(done, 250);
    if (typeof timer.unref === "function") timer.unref();
    stream.once("error", done);
    try {
      stream.write("", done);
    } catch {
      done();
    }
  });
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
    "install", "update", "uninstall", "list-targets", "dry-run", "verify", "rollback", "doctor",
    "init-dev", "compact-worklog", "check-dev-gates", "check-recurrence", "changelog", "version", "run",
    "runs", "usage", "projects", "project", "missions", "mission", "terminal",
    "skills", "skill-catalog", "providers", "bridge", "governance", "interaction",
    "status", "memory", "benchmark", "adapters", "targets", "go", "plan", "route",
    "context", "workflow-lock", "workflow-state", "desktop-plugin", "harness"
  ]);
  if (telemetryCommands.has(command)) {
    await sendTelemetry(buildTelemetryPayload(command, args, exitCode, errorName));
  }

  // Wait for buffered pipe writes (e.g. `harness status --json`) before forcing
  // process exit, otherwise Node 20 on macOS can truncate stdout.
  await Promise.all([flushStream(process.stdout), flushStream(process.stderr)]);
  process.exit(exitCode);
}

main();
