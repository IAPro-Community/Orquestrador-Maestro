#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { hookResponse, observeHarnessEvent } = require("../runtime/integrations/harness/contract");
const MAX_INPUT = 1024 * 1024;

function renderHookConfig(host, script = __filename) {
  if (!['claude', 'gemini'].includes(host)) throw new TypeError("expected claude or gemini");
  // Config contains a shell command. Refuse ambiguous shell characters rather
  // than interpolate arbitrary paths. No host config is modified by rendering.
  const absolute = path.resolve(script).replace(/\\/g, "/");
  if (!/^[A-Za-z0-9_./: @+(),-]+$/u.test(absolute)) throw new Error("hook path requires manual shell-safe configuration");
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

async function main(args, input, output) {
  const [action, host] = args;
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
  throw new Error("usage: harness-hook.js --render|--merge|--remove claude|gemini | --inspect HOST | claude|gemini");
}

if (require.main === module) {
  main(process.argv.slice(2), process.stdin, process.stdout).catch(() => {
    process.stderr.write("Maestro harness hook: invalid invocation\n");
    process.exitCode = 1;
  });
}
module.exports = { renderHookConfig, editHookConfig, readInput, main };
