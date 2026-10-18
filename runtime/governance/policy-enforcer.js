"use strict";

// 1.1.0 (SEC-03): deterministic deny policy for shell commands spawned by
// the runtime. Prompt-level bans in SKILL.md are advisory; these rules are
// enforced in code before spawn (see runtime/verification/engine.js).
// Rule definitions live in orquestrador/POLICY_DENY.json; this module embeds
// the same patterns so enforcement works from any installed root.
// Parity is checked by tests/policy-enforcer.test.js.

const DENY_RULES = Object.freeze([
  Object.freeze({
    id: "deny:git-push",
    description: "Forbid git push from automated verification/execution.",
    pattern: /(^|[\s;&|])(git\s+push)\b/i
  }),
  Object.freeze({
    id: "deny:git-commit",
    description: "Forbid git commit from automated verification/execution.",
    pattern: /(^|[\s;&|])(git\s+commit)\b/i
  }),
  Object.freeze({
    id: "deny:yolo-full-auto",
    description: "Forbid unattended full-auto flags in high-risk operations.",
    pattern: /(--yolo|--full-auto)\b/i
  }),
  Object.freeze({
    id: "deny:destructive-rm",
    description: "Forbid recursive removal of filesystem roots, home, or with --no-preserve-root.",
    pattern: /(^|[\s;&|])rm\s+(-[a-zA-Z]*r[a-zA-Z]*f?|-[a-zA-Z]*f[a-zA-Z]*r?|--recursive|--force)\s+[^\n]*?(--no-preserve-root|(\/|~|\$HOME|%USERPROFILE%|\$env:USER_PROFILE))(?=$|[\s;&|/])/i
  }),
  Object.freeze({
    id: "deny:secret-in-command",
    description: "Forbid service-role credentials or bearer tokens inline in spawned commands.",
    pattern: /((service_role|service-role).{0,64}(eyJ[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9-_]{8,})|(Bearer\s+eyJ[A-Za-z0-9_-]{8,})|(sk-[A-Za-z0-9_-]{20,}))/i
  }),
  Object.freeze({
    id: "deny:pipe-to-shell",
    description: "Forbid curl/wget piped directly into a shell.",
    pattern: /\b(curl|wget)\b[^\n|]*\|\s*\/?(bin\/(ba)?sh|(ba)?sh|pwsh|powershell|zsh|dash)\b/i
  })
]);

function isDeniedCommand(command) {
  const text = typeof command === "string" ? command : String(command ?? "");
  for (const rule of DENY_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      return Object.freeze({ denied: true, rule: rule.id, description: rule.description });
    }
  }
  return null;
}

module.exports = { DENY_RULES, isDeniedCommand };
