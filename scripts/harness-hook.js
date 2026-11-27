#!/usr/bin/env node
"use strict";

const os = require("node:os");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { hookResponse, observeHarnessEvent } = require("../runtime/integrations/harness/contract");
const MAX_INPUT = 1024 * 1024;

function renderHookConfig(host, script = __filename) {
  if (!["claude", "gemini"].includes(host)) throw new TypeError("expected claude or gemini");
  // Config contains a shell command. Refuse ambiguous shell characters rather
  // than interpolate arbitrary paths. No host config is modified by rendering.
  const absolute = path.resolve(script).replace(/\\/g, "/");
  if (!/^[A-Za-z0-9_./: @+(),-]+$/u.test(absolute)) {
    const error = new Error("hook path requires manual shell-safe configuration");
    error.code = "HARNESS_PATH_NOT_SHELL_SAFE";
    throw error;
  }
  const command = `node "${absolute}" ${host}`;
  const events = host === "claude" ? ["UserPromptSubmit", "Stop"] : ["BeforeAgent", "AfterAgent"];
  return { hooks: Object.fromEntries(events.map((event) => [event, [{ hooks: [{
    type: "command", command, timeout: host === "claude" ? 5 : 5000
  }] }]])) };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// Pure merge/remove: callers review the result before replacing their settings.
// Only exact generated groups belong to this opt-in integration.
function editHookConfig(host, config, { remove = false, script = __filename } = {}) {
  if (!isRecord(config) || (Object.hasOwn(config, "hooks") && !isRecord(config.hooks))) {
    throw new TypeError("existing settings must be a JSON object with an optional hooks object");
  }
  const generated = renderHookConfig(host, script).hooks;
  const hooks = { ...config.hooks };
  for (const [name, [group]] of Object.entries(generated)) {
    const existing = Object.hasOwn(hooks, name) ? hooks[name] : [];
    if (!Array.isArray(existing)) throw new TypeError("existing hook groups must be arrays");
    const matches = (entry) => isDeepStrictEqual(entry, group);
    if (remove) {
      const remaining = existing.filter((entry) => !matches(entry));
      if (remaining.length === existing.length) continue;
      if (remaining.length) hooks[name] = remaining;
      else delete hooks[name];
    } else if (!existing.some(matches)) {
      hooks[name] = [...existing, group];
    }
  }
  if (remove && !Object.hasOwn(config, "hooks")) return { ...config };
  return { ...config, hooks };
}

async function readInput(input) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_INPUT) return null;
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}

function parseOption(args, flag) {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1]) return args[i + 1];
    if (args[i].startsWith(flag + "=")) return args[i].slice(flag.length + 1);
  }
  return null;
}

function firstPositional(args) {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--home-path" || args[i] === "--to") { i += 1; continue; }
    if (args[i].startsWith("--")) continue;
    return args[i];
  }
  return null;
}

function harnessHelpText() {
  return [
    "Uso:",
    "  orquestrador-maestro harness status [--home-path PATH] [--json]",
    "  orquestrador-maestro harness install <claude|gemini|opencode|detected> [--home-path PATH] [--dry-run]",
    "  orquestrador-maestro harness update <claude|gemini|opencode|detected> [--home-path PATH] [--dry-run]",
    "  orquestrador-maestro harness remove <claude|gemini|opencode> [--home-path PATH] [--dry-run]",
    "  orquestrador-maestro harness rollback <claude|gemini|opencode> [--home-path PATH] [--to STAMP]",
    "  orquestrador-maestro harness doctor [--home-path PATH] [--json]",
    "  orquestrador-maestro harness --render|--merge|--remove claude|gemini",
    "  orquestrador-maestro harness --preview-review|--verify-review [APPROVAL_DIGEST] (JSON via stdin)"
  ].join("\n") + "\n";
}

async function main(args, input, output) {
  const [action, host] = args;
  const packageRoot = path.resolve(__dirname, "..");
  if (action === "--help" || action === "-h" || action === "help" || action === undefined) {
    output.write(harnessHelpText());
    return 0;
  }
  if (action === "status" || action === "doctor" || action === "install" || action === "update" || action === "remove" || action === "rollback") {
    const rest = args.slice(1);
    if (rest.includes("--help") || rest.includes("-h")) {
      output.write(harnessHelpText());
      return 0;
    }
    const home = path.resolve(parseOption(rest, "--home-path") || process.env.HOME || process.env.USERPROFILE || os.homedir());
    const json = rest.includes("--json");
    const dryRun = rest.includes("--dry-run");
    const registry = require("../runtime/integrations/harness/registry");
    const installer = require("../runtime/integrations/harness/installer");

    if (action === "status") {
      const report = registry.inspectAllHarnesses({ home, packageRoot });
      if (json) {
        output.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        output.write(`Harnesses: ${report.summary.installed}/${report.summary.total} instalados, ${report.summary.governedActive} governed ativos, ${report.summary.goalIntegrated} goal-integrated\n`);
        for (const [id, entry] of Object.entries(report.harnesses)) {
          output.write(`- ${id}: installed=${entry.installed} version=${entry.version || "none"} level=${entry.compatibilityLevel} adapter=${entry.adapterState.detail}\n`);
        }
      }
      return 0;
    }
    if (action === "doctor") {
      const report = installer.harnessDoctor({ home, packageRoot });
      if (json) {
        output.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        output.write(`Harness doctor: healthy=${report.healthy} hookTrust=${report.hookTrust}\n`);
        for (const [id, info] of Object.entries(report.hosts)) {
          output.write(`- ${id}: configured=${info.configured} healthy=${info.healthy} detail=${info.detail}\n`);
        }
        for (const warning of report.warnings) output.write(`Aviso: ${warning}\n`);
      }
      return report.healthy ? 0 : 1;
    }
    const target = firstPositional(rest);
    if (!target) throw new Error(`Uso: harness ${action} <claude|gemini|opencode${action === "install" || action === "update" ? "|detected" : ""}>`);
    if (action === "rollback") {
      const res = installer.rollbackHarnessAdapter(target, { home, to: parseOption(rest, "--to") });
      output.write(JSON.stringify(res, null, 2) + "\n");
      return 0;
    }
    if ((action === "install" || action === "update") && target === "detected") {
      const res = installer.installDetectedHarnesses({ home, packageRoot, dryRun });
      output.write(JSON.stringify(res, null, 2) + "\n");
      return 0;
    }
    const res = action === "remove"
      ? installer.removeHarnessAdapter(target, { home, packageRoot, dryRun })
      : installer.installHarnessAdapter(target, { home, packageRoot, dryRun });
    output.write(JSON.stringify(res, null, 2) + "\n");
    return 0;
  }
  if (action === "--preview-review" || action === "--verify-review") {
    if (args.length !== (action === "--preview-review" ? 1 : 2)) throw new Error("INVALID_REVIEW_ARGUMENTS");
    const { previewReview, executeReview } = require("../runtime/integrations/harness/review");
    const request = await readInput(input);
    const report = action === "--preview-review" ? previewReview(request) : await executeReview(request, host);
    output.write(JSON.stringify(report, null, 2) + "\n");
    return action === "--verify-review" && report.status !== "CHECKS_PASSED" ? 1 : 0;
  }
  if (action === "--render") {
    output.write(JSON.stringify(renderHookConfig(host), null, 2) + "\n");
    return;
  }
  if (action === "--merge" || action === "--remove") {
    const config = await readInput(input);
    output.write(JSON.stringify(editHookConfig(host, config, { remove: action === "--remove" }), null, 2) + "\n");
    return;
  }
  if (action === "--inspect") {
    output.write(JSON.stringify(observeHarnessEvent(host, await readInput(input))) + "\n");
    return;
  }
  if (action === "claude" || action === "gemini") {
    // Fail open: hook output never stops a host or requests another turn.
    try { output.write(JSON.stringify(hookResponse(action, await readInput(input))) + "\n"); }
    catch { output.write("{}\n"); }
    return;
  }
  throw new Error("usage: harness status|install|update|remove|rollback|doctor | --render|--merge|--remove claude|gemini | --preview-review|--verify-review");
}

// CLI diagnostics must stay useful without leaking private paths, credentials
// or host configuration content. Only a stable error code and a redacted
// summary are surfaced; absolute paths are replaced by a placeholder.
// Windows paths carry the user name in the profile segment, so POSIX-only
// redaction leaked the POSIX form as the Windows form on every Windows host.
const REDACTED_PATTERNS = Object.freeze([
  /"(?:file:\/{2,3}|\\\\|[A-Za-z]:[\\/]|\/)[^"\r\n]*"/giu, // quoted paths (incl. spaces)
  /'(?:file:\/{2,3}|\\\\|[A-Za-z]:[\\/]|\/)[^'\r\n]*'/giu, // single-quoted paths
  /\bfile:\/{2,3}[^\s:,;"'`|<>]+/giu, // file:///C:/x/y
  /\\\\[^\s:,;"'`|<>]+(?: +[^\s:,;"'`|<>]+(?=[\\/]))*(?:[\\/][^\s:,;"'`|<>]+(?: +[^\s:,;"'`|<>]+(?=[\\/]))*)*/gu, // \\server\share\...
  /[A-Za-z]:(?:[\\/][^\s:,;"'`|<>]+(?: +[^\s:,;"'`|<>]+(?=[\\/]))*)+/gu, // C:\... or C:/...
  /(?:[A-Za-z]:)?(?:\/[^\s:,;"'`|<>]+(?: +[^\s:,;"'`|<>]+(?=\/))*)+\/?/gu // POSIX /...
]);

function sanitizeCliError(error) {
  const code = typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(error.code)
    ? error.code
    : (error instanceof TypeError ? "INVALID_ARGUMENT" : "INVALID_INVOCATION");
  let raw = typeof error?.message === "string" ? error.message.split("\n")[0].trim() : "";
  // Truncate before rewriting so a truncated fragment can never keep half a path.
  if (raw.length > 400) raw = raw.slice(0, 400);
  for (const pattern of REDACTED_PATTERNS) raw = raw.replace(pattern, "<path>");
  const redacted = raw.slice(0, 200);
  return redacted ? `${code}: ${redacted}` : code;
}

module.exports = { renderHookConfig, editHookConfig, readInput, main, sanitizeCliError };

if (require.main === module) {
  main(process.argv.slice(2), process.stdin, process.stdout).then(code => { process.exitCode = code || 0; }).catch((error) => {
    process.stderr.write(`Maestro harness hook: ${sanitizeCliError(error)}\n`);
    process.exitCode = 1;
  });
}
