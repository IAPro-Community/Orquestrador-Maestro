"use strict";

// Context/targets extracted verbatim from bin/orquestrador-maestro.js.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const {
  path, rootDir, parseRuntimeArgs, createRuntimeApplication,
  resolveMaestroRoot, getArg, extractPositionalArg, Memory,
  DETECTION_STATES, detectAllTools, detectToolById, installState,
  getToolDefinition, isSupportedTool, listSupportedTools
} = require("../shared-context");

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
        DetectionReason: detection.reason,
        Configuration: require("../../orquestrador/lib/install-diagnostics").configurationState(toolId, homePath),
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
      const header = "Target".padEnd(20) + "Detection".padEnd(16) + "Enabled".padEnd(10) + "Configuration";
      const sep = "-".repeat(65);
      console.log(header);
      console.log(sep);
      for (const r of rows) {
        console.log(r.Target.padEnd(20) + r.Detection.padEnd(16) + r.Enabled.padEnd(10) + r.Configuration);
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
        break;
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

    if (toolId === "claude") require("../../orquestrador/lib/install-diagnostics").printClaudeGuidance(homePath);
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
  if (command === "harness") return (await require("../../scripts/harness-hook").main(args, process.stdin, process.stdout)) || 0;
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


module.exports = { handleContextCommand, handleTargetsCommand };
