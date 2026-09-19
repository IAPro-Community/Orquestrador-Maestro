"use strict";

const { sanitizeDiagnostic } = require("../telemetry/diagnostic-sanitizer");

const MAX_PERSISTED_ARG_CHARS = 500;
const MAX_PERSISTED_COMMAND_CHARS = 500;

/**
 * Durable terminal identity for the RunStore (privacy contract).
 *
 * Raw terminal output NEVER reaches the store (it lives in live-process
 * memory only). Command lines are almost as dangerous: `curl -H
 * "Authorization: Bearer ..."` or `tool --token SECRET` would persist the
 * secret verbatim in `terminals[].args`. Persist only metadata the UI and
 * recovery actually need: a sanitized command, an arg count, and argv-aware
 * redacted values. Spawn paths must use the original in-memory argv, never
 * the redacted copy.
 *
 * Each argv entry is sanitized on its own EXCEPT secret flags, which consume
 * the following entry (`--token SECRET` spans two argv entries, so per-arg
 * sanitizing alone would miss it).
 */
const SENSITIVE_FLAG = /^-{1,2}[a-z0-9-]*(?:token|secret|passwd|password|api[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret)$/i;

function redactArgv(args) {
  const list = Array.isArray(args) ? args : [];
  const redacted = [];
  for (let index = 0; index < list.length; index += 1) {
    const arg = list[index];
    if (typeof arg !== "string") { redacted.push("[redacted]"); continue; }
    const equals = arg.indexOf("=");
    if (arg.startsWith("-") && equals > 0 && SENSITIVE_FLAG.test(arg.slice(0, equals))) {
      redacted.push(`${arg.slice(0, equals)}=[redacted]`);
      continue;
    }
    if (SENSITIVE_FLAG.test(arg)) {
      redacted.push(arg);
      if (index + 1 < list.length) { redacted.push("[redacted]"); index += 1; }
      continue;
    }
    redacted.push(sanitizeDiagnostic(arg, { maxChars: MAX_PERSISTED_ARG_CHARS }));
  }
  return redacted;
}

function toPersistedTerminalIdentity(command, args = []) {
  const list = Array.isArray(args) ? args : [];
  return {
    command: sanitizeDiagnostic(command, { maxChars: MAX_PERSISTED_COMMAND_CHARS }),
    argCount: list.length,
    redactedArgs: redactArgv(list)
  };
}

function sanitizeTerminalError(error) {
  const message = error && error.message ? error.message : String(error ?? "terminal-failed");
  return sanitizeDiagnostic(message);
}

module.exports = {
  MAX_PERSISTED_ARG_CHARS,
  MAX_PERSISTED_COMMAND_CHARS,
  sanitizeTerminalError,
  toPersistedTerminalIdentity
};
