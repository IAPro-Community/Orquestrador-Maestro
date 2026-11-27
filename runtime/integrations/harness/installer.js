"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { inspectHarness, supportsOpenCodeV2 } = require("./registry");

const SUPPORTED_HOSTS = Object.freeze(["claude", "gemini", "opencode"]);

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function assertNoSymlinksBetween(homePath, targetFile) {
  const home = path.resolve(homePath);
  const fullTarget = path.resolve(targetFile);
  const rel = path.relative(home, fullTarget);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw makeError("INVALID_HARNESS_TARGET", "Target settings file must stay inside home");
  }
  const homeInfo = lstatOrNull(home);
  if (homeInfo && (homeInfo.isSymbolicLink() || !homeInfo.isDirectory())) {
    throw makeError("UNSAFE_SYMLINK_PATH", `Unsafe home root: ${home}`);
  }
  let current = home;
  const parts = rel.split(path.sep);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const info = lstatOrNull(current);
    if (!info) continue;
    if (info.isSymbolicLink()) {
      throw makeError("UNSAFE_SYMLINK_PATH", `Refusing symbolic link in path: ${current}`);
    }
    if (i < parts.length - 1 && !info.isDirectory()) {
      throw makeError("INVALID_HARNESS_TARGET", `Expected directory at ${current}`);
    }
    if (i === parts.length - 1 && !info.isFile()) {
      throw makeError("INVALID_HARNESS_TARGET", `Expected regular file at ${current}`);
    }
  }
}

function resolveHostConfigTarget(host, home = os.homedir()) {
  if (!SUPPORTED_HOSTS.includes(host)) {
    throw makeError("UNSUPPORTED_HARNESS_HOST", `Unsupported harness host: ${host}`);
  }
  const resolvedHome = path.resolve(home);
  if (host === "claude") return path.join(resolvedHome, ".claude", "settings.json");
  if (host === "gemini") return path.join(resolvedHome, ".gemini", "settings.json");

  // OpenCode uses ~/.config/opencode/opencode.json (or legacy ~/.opencode/opencode.json).
  const primary = path.join(resolvedHome, ".config", "opencode", "opencode.json");
  const primaryJsonc = path.join(resolvedHome, ".config", "opencode", "opencode.jsonc");
  const secondary = path.join(resolvedHome, ".opencode", "opencode.json");
  const secondaryJsonc = path.join(resolvedHome, ".opencode", "opencode.jsonc");
  if (lstatOrNull(primary)) return primary;
  if (lstatOrNull(primaryJsonc) && !lstatOrNull(primary)) {
    throw makeError("JSONC_MANUAL_EDIT_REQUIRED", `OpenCode JSONC file detected (${primaryJsonc}); configure plugins manually or migrate to opencode.json`);
  }
  if (lstatOrNull(secondary)) return secondary;
  if (lstatOrNull(secondaryJsonc) && !lstatOrNull(secondary)) {
    throw makeError("JSONC_MANUAL_EDIT_REQUIRED", `OpenCode JSONC file detected (${secondaryJsonc}); configure plugins manually or migrate to opencode.json`);
  }
  return primary;
}

function readStrictConfig(filePath) {
  const info = lstatOrNull(filePath);
  if (!info) return { existed: false, raw: null, config: {} };
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw makeError("INVALID_HOST_SETTINGS", `Existing settings file is not strict JSON (${filePath}): ${err.message}`);
  }
  if (!isPlainObject(parsed)) {
    throw makeError("INVALID_HOST_SETTINGS", `Existing settings must be a JSON object (${filePath})`);
  }
  return { existed: true, raw, config: parsed };
}

function atomicWriteFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(temp, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temp, filePath);
}

// Harness backups hold the previous content of host settings files, which can
// carry credentials. They live in a dedicated private directory instead of the
// Maestro core root, because the installer copies that whole root into the
// public backup tree on every install and update.
function backupDir(home) {
  return path.join(path.resolve(home), ".maestro-harness-backups");
}

function ensurePrivateDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try { fs.chmodSync(dirPath, 0o700); } catch { /* best-effort */ }
  }
}

function writeBackup(home, host, targetPath, existed, raw) {
  const dir = backupDir(home);
  assertNoSymlinksBetween(home, path.join(dir, "probe.json"));
  ensurePrivateDir(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex");
  const file = path.join(dir, `${host}-${stamp}.json`);
  const payload = {
    schemaVersion: 1,
    host,
    targetRelative: path.relative(path.resolve(home), path.resolve(targetPath)).split(path.sep).join("/"),
    existed,
    previousContent: existed ? raw : null,
    createdAt: new Date().toISOString()
  };
  atomicWriteFile(file, JSON.stringify(payload, null, 2) + "\n");
  return { stamp, file };
}

function editOpenCodeConfig(config, pluginDir, { remove = false } = {}) {
  if (!isPlainObject(config)) throw makeError("INVALID_HOST_SETTINGS", "OpenCode config must be a JSON object");
  if (Object.hasOwn(config, "plugins") && !Array.isArray(config.plugins)) {
    throw makeError("INVALID_HOST_SETTINGS", "OpenCode config `plugins` field must be an array");
  }
  const resolvedTarget = path.resolve(pluginDir);
  const existing = Array.isArray(config.plugins) ? config.plugins : [];
  if (remove) {
    const remaining = existing.filter((entry) => typeof entry !== "string" || path.resolve(entry) !== resolvedTarget);
    const next = { ...config };
    if (remaining.length > 0) next.plugins = remaining;
    else delete next.plugins;
    return next;
  }
  if (existing.some((entry) => typeof entry === "string" && path.resolve(entry) === resolvedTarget)) {
    return { ...config, plugins: [...existing] };
  }
  return { ...config, plugins: [...existing, resolvedTarget] };
}

function computeNextConfig(host, config, { packageRoot, remove = false }) {
  if (host === "opencode") {
    const pluginDir = path.resolve(packageRoot, "tool-profiles", "opencode", "maestro-harness-v2");
    return editOpenCodeConfig(config, pluginDir, { remove });
  }
  // Loaded lazily: scripts/harness-hook.js requires this module, so a static
  // import here would close a cycle and expose a partially initialized export.
  const { editHookConfig } = require("../../../scripts/harness-hook");
  const hookScript = path.resolve(packageRoot, "scripts", "harness-hook.js");
  return editHookConfig(host, config, { remove, script: hookScript });
}

function applyHarnessChange(host, {
  home = os.homedir(),
  packageRoot = path.resolve(__dirname, "..", "..", ".."),
  dryRun = false,
  remove = false
} = {}) {
  const resolvedHome = path.resolve(home);
  const targetPath = resolveHostConfigTarget(host, resolvedHome);
  assertNoSymlinksBetween(resolvedHome, targetPath);
  const { existed, raw, config } = readStrictConfig(targetPath);
  const nextConfig = computeNextConfig(host, config, { packageRoot, remove });
  const nextText = JSON.stringify(nextConfig, null, 2) + "\n";

  const alreadyMatching = existed && JSON.stringify(config) === JSON.stringify(nextConfig);
  const unchangedOnRemove = remove && !existed;
  const changed = !alreadyMatching && !unchangedOnRemove;

  let backup = null;
  if (changed && !dryRun) {
    backup = writeBackup(resolvedHome, host, targetPath, existed, raw);
    atomicWriteFile(targetPath, nextText);
  }

  let sdkNote = null;
  if (host === "opencode" && !remove) {
    const sdkPkg = path.join(packageRoot, "tool-profiles", "opencode", "maestro-harness-v2", "node_modules", "@opencode", "plugin", "package.json");
    if (!fs.existsSync(sdkPkg)) {
      sdkNote = "Install @opencode/plugin in tool-profiles/opencode/maestro-harness-v2 (`npm install --ignore-scripts`) before enabling OpenCode V2 runtime loading.";
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    host,
    action: remove ? (changed ? "removed" : "unchanged") : (!changed ? "unchanged" : existed ? "updated" : "installed"),
    dryRun: dryRun === true,
    changed,
    targetPath,
    backupStamp: backup?.stamp || null,
    backupFile: backup?.file || null,
    hookTrust: "host-managed",
    ...(sdkNote ? { note: sdkNote } : {})
  });
}

function installHarnessAdapter(host, options = {}) {
  return applyHarnessChange(host, { ...options, remove: false });
}

function updateHarnessAdapter(host, options = {}) {
  return applyHarnessChange(host, { ...options, remove: false });
}

function removeHarnessAdapter(host, options = {}) {
  return applyHarnessChange(host, { ...options, remove: true });
}

function listHarnessBackups(host, home) {
  if (!SUPPORTED_HOSTS.includes(host)) throw makeError("UNSUPPORTED_HARNESS_HOST", `Unsupported harness host: ${host}`);
  const dir = backupDir(home);
  const info = lstatOrNull(dir);
  if (!info) return [];
  // A symlinked backup directory would redirect reads outside the home.
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw makeError("UNSAFE_SYMLINK_PATH", `Unsafe harness backup directory: ${dir}`);
  }
  const prefix = `${host}-`;
  return fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .sort()
    .map((name) => ({
      stamp: name.slice(prefix.length, -".json".length),
      file: path.join(dir, name)
    }));
}

function rollbackHarnessAdapter(host, { home = os.homedir(), to = null } = {}) {
  const resolvedHome = path.resolve(home);
  const backups = listHarnessBackups(host, resolvedHome);
  if (backups.length === 0) {
    throw makeError("HARNESS_BACKUP_NOT_FOUND", `No harness backup found for ${host}`);
  }
  const chosen = to
    ? backups.find((b) => b.stamp === to || b.file.endsWith(`${to}.json`))
    : backups[backups.length - 1];
  if (!chosen) {
    throw makeError("HARNESS_BACKUP_NOT_FOUND", `Harness backup not found for ${host} (${to})`);
  }
  const info = lstatOrNull(chosen.file);
  if (!info || info.isSymbolicLink() || !info.isFile()) {
    throw makeError("UNSAFE_SYMLINK_PATH", `Unsafe backup file: ${chosen.file}`);
  }
  const record = JSON.parse(fs.readFileSync(chosen.file, "utf8"));
  if (record.schemaVersion !== 1 || record.host !== host || typeof record.targetRelative !== "string") {
    throw makeError("INVALID_HARNESS_BACKUP", `Malformed harness backup: ${chosen.file}`);
  }
  const relParts = record.targetRelative.split("/");
  if (!record.targetRelative || relParts.some((p) => !p || p === "." || p === ".." || p.includes(":"))) {
    throw makeError("INVALID_HARNESS_BACKUP", `Unsafe backup targetRelative: ${record.targetRelative}`);
  }
  const targetPath = path.resolve(resolvedHome, ...relParts);
  assertNoSymlinksBetween(resolvedHome, targetPath);

  if (!record.existed) {
    if (lstatOrNull(targetPath)) fs.rmSync(targetPath, { force: true });
    return Object.freeze({
      schemaVersion: 1,
      host,
      restored: true,
      existedBefore: false,
      stamp: chosen.stamp,
      targetPath
    });
  }
  if (typeof record.previousContent !== "string") {
    throw makeError("INVALID_HARNESS_BACKUP", `Missing previousContent in backup: ${chosen.file}`);
  }
  atomicWriteFile(targetPath, record.previousContent);
  return Object.freeze({
    schemaVersion: 1,
    host,
    restored: true,
    existedBefore: true,
    stamp: chosen.stamp,
    targetPath
  });
}

function installDetectedHarnesses({
  home = os.homedir(),
  packageRoot = path.resolve(__dirname, "..", "..", ".."),
  dryRun = false,
  hosts = null,
  probeCommand
} = {}) {
  const results = [];
  // An explicit host list narrows the scope: `install --only codex` must not
  // configure adapters for tools the operator did not select.
  const selectedHosts = Array.isArray(hosts)
    ? SUPPORTED_HOSTS.filter((host) => hosts.includes(host))
    : SUPPORTED_HOSTS;
  for (const host of selectedHosts) {
    const inspected = inspectHarness(host, { home, packageRoot, probeCommand });
    if (!inspected.installed && !inspected.configDetected) {
      results.push({ host, skipped: true, reason: "not-detected" });
      continue;
    }
    if (host === "opencode" && !supportsOpenCodeV2(inspected.version)) {
      results.push({ host, skipped: true, reason: "opencode-v2-version-unverified" });
      continue;
    }
    try {
      results.push({ skipped: false, ...installHarnessAdapter(host, { home, packageRoot, dryRun }) });
    } catch (err) {
      results.push({ host, skipped: false, error: err.message, code: err.code || "INSTALL_ERROR" });
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    dryRun: dryRun === true,
    results: Object.freeze(results)
  });
}

function checkHookSynthetic(host, packageRoot) {
  const hookScript = path.join(packageRoot, "scripts", "harness-hook.js");
  const promptEvent = host === "claude" ? "UserPromptSubmit" : "BeforeAgent";
  const res = spawnSync(process.execPath, [hookScript, host], {
    input: JSON.stringify({ hook_event_name: promptEvent, prompt: "/goal verify" }),
    encoding: "utf8",
    timeout: 4000,
    windowsHide: true,
    shell: false
  });
  let parsed = null;
  try { parsed = res.stdout?.trim() ? JSON.parse(res.stdout.trim()) : null; } catch {}
  const ok = !res.error && res.status === 0 && Boolean(parsed?.hookSpecificOutput?.additionalContext);
  return { pass: ok, detail: ok ? "synthetic-hook-ok" : (res.error?.message || res.stderr || "synthetic-hook-failed").trim() };
}

function harnessDoctor({
  home = os.homedir(),
  packageRoot = path.resolve(__dirname, "..", "..", ".."),
  probeCommand
} = {}) {
  const hosts = {};
  const warnings = [];
  let healthy = true;

  const codexInspection = inspectHarness("codex", { home, packageRoot, probeCommand });
  try {
    const { desktopPluginDoctor } = require("../openai/installer");
    const doc = desktopPluginDoctor({ home, packageRoot });
    hosts.codex = {
      installed: codexInspection.installed,
      version: codexInspection.version,
      compatibilityLevel: codexInspection.compatibilityLevel,
      configured: codexInspection.adapterState.installed,
      healthy: doc.healthy,
      detail: codexInspection.adapterState.detail,
      failedChecks: doc.failed
    };
    if (codexInspection.adapterState.installed && !doc.healthy) {
      healthy = false;
      warnings.push(`codex: ${doc.failed.join(", ")}`);
    }
  } catch (err) {
    hosts.codex = { installed: codexInspection.installed, version: codexInspection.version, healthy: false, detail: err.message };
    warnings.push(`codex: ${err.message}`);
  }

  for (const host of SUPPORTED_HOSTS) {
    const inspected = inspectHarness(host, { home, packageRoot, probeCommand });
    const entry = {
      installed: inspected.installed,
      version: inspected.version,
      compatibilityLevel: inspected.compatibilityLevel,
      configured: inspected.adapterState.installed,
      healthy: true,
      detail: inspected.adapterState.detail,
      configPath: inspected.adapterState.configPath
    };
    if (inspected.adapterState.detail === "settings-invalid" || inspected.adapterState.detail === "config-invalid") {
      entry.healthy = false;
      healthy = false;
      warnings.push(`${host}: invalid host configuration JSON (${inspected.adapterState.configPath})`);
    } else if (inspected.adapterState.installed) {
      if (host === "claude" || host === "gemini") {
        const syn = checkHookSynthetic(host, packageRoot);
        entry.syntheticHook = syn.detail;
        if (!syn.pass) {
          entry.healthy = false;
          healthy = false;
          warnings.push(`${host}: ${syn.detail}`);
        }
      } else if (host === "opencode" && !inspected.adapterState.healthy) {
        entry.healthy = false;
        healthy = false;
        warnings.push(`${host}: ${inspected.adapterState.detail}`);
      }
    }
    hosts[host] = entry;
  }

  return Object.freeze({
    schemaVersion: 1,
    healthy,
    hookTrust: "host-managed",
    note: "External host hooks remain disabled/untrusted until approved by the operator in the host tool.",
    warnings: Object.freeze(warnings),
    hosts: Object.freeze(hosts)
  });
}

module.exports = {
  SUPPORTED_HOSTS,
  resolveHostConfigTarget,
  installHarnessAdapter,
  updateHarnessAdapter,
  removeHarnessAdapter,
  rollbackHarnessAdapter,
  listHarnessBackups,
  installDetectedHarnesses,
  harnessDoctor
};
