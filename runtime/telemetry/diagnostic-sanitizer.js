"use strict";

/**
 * Shared sanitizer for DURABLE provider diagnostics.
 *
 * Raw diagnostics may exist in memory during execution, but they MUST NOT
 * reach the RunStore: provider stderr/stdout, rejection messages and reviewer
 * failures routinely embed tokens, keys, cookies, connection strings,
 * credentials, emails and absolute local paths.
 *
 * Rules:
 * - Redact secrets/credentials/identifiers, keep the surrounding structure
 *   so the diagnostic stays useful (exit codes, counts, relative paths).
 * - Relative paths are preserved; only absolute home/root paths are redacted.
 * - Collapse whitespace runs and cap length (default 2000 chars).
 * - Pure function: no I/O, never throws (falls back to "[unavailable]").
 */

const MAX_DIAGNOSTIC_CHARS = 2000;

const PATTERNS = [
  // Bearer / basic auth values (headers, JSON, CLI output).
  [/(bearer\s+)[^\s"'`;,}]+/giu, "$1[redacted]"],
  [/(basic\s+)[A-Za-z0-9+/=]+/gu, "$1[redacted]"],
  // Well-known token prefixes (GitHub, OpenAI, Slack, AWS access keys).
  [/\b(ghp_[A-Za-z0-9]+|gho_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9-_]+|xox[baprs]-[A-Za-z0-9-]+|AKIA[A-Z0-9]{16})\b/g, "[token redacted]"],
  // JWT (full header.payload.signature or truncated eyJ... fragments).
  [/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g, "[jwt redacted]"],
  // Authorization / cookie header values (whole value, any scheme leftovers).
  [/((?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*["']?)[^"'`\s;,}]+/giu, "$1[redacted]"],
  // Connection strings: redact credentials, keep host for debuggability.
  [/([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+@)/giu, "$1[credentials-redacted]@"],
  // Generic secret assignments (password/passwd/secret/token/api_key keys).
  [/((?:["']?(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?)\s*[:=]\s*["']?)[^"'\s,}]+/giu, "$1[redacted]"],
  // CLI flags with secret values (--token SECRET, --api-key=ABC). Names only:
  // innocuous flags (--color, --model) never match.
  [/(--?[a-z0-9-]*(?:token|secret|passwd|password|api[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret)\s*[=\s]\s*["']?)[^"'\s;,}]+/giu, "$1[redacted]"],
  // Emails / identifiers.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email redacted]"],
  // Absolute home/root paths (POSIX + Windows). The drive-letter branch
  // requires no preceding letter so URL schemes (postgres://...) never match.
  // Relative paths survive.
  [/(?:(?<![A-Za-z])[A-Za-z]:[\\/]|\/Users\/|\/home\/|\/root\/)[^\s`"']+/gu, "[caminho local redigido]"]
];

function sanitizeDiagnostic(value, { maxChars = MAX_DIAGNOSTIC_CHARS } = {}) {
  try {
    let text = typeof value === "string" ? value : String(value ?? "");
    for (const [pattern, replacement] of PATTERNS) {
      pattern.lastIndex = 0;
      text = text.replace(pattern, replacement);
    }
    text = text.replace(/\s+/g, " ").trim();
    const cap = Number.isInteger(maxChars) && maxChars > 0 ? maxChars : MAX_DIAGNOSTIC_CHARS;
    return text.length > cap ? text.slice(0, cap) : text;
  } catch {
    return "[unavailable]";
  }
}

module.exports = { sanitizeDiagnostic, MAX_DIAGNOSTIC_CHARS };
