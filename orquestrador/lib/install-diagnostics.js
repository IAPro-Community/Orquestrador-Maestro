"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { resolveToolConfigPaths } = require("./tool-registry");
const { hasMaestroMarker } = require("./tool-detector");

function configurationState(toolId, home) {
  const present = resolveToolConfigPaths(toolId, home).some(p => fs.existsSync(p));
  if (!present) return "absent";
  return hasMaestroMarker(home, toolId) ? "maestro-managed" : "present";
}

// Inspect only the known Claude integration files; never report their contents.
function inspectClaude(home) {
  const findings = [];
  const files = [".claude/skills/orquestrador-maestro/SKILL.md", ".claude/CLAUDE.md", ".claude/hooks.md", ".claude/SYSTEM_PROMPT.md"];
  for (const relative of files) {
    const absolute = path.join(home, relative);
    try {
      let current = home;
      for (const part of relative.split("/")) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error("unsafe");
      }
      const info = fs.lstatSync(absolute);
      if (!info.isFile() || info.size > 256 * 1024) throw new Error("unsafe");
      const source = fs.readFileSync(absolute, "utf8");
      if (relative.endsWith("/SKILL.md") && /\bCodex (?:is the|follows the)\b|(?:~|\{\{USER_HOME\}\})\/\.codex\/skills\//i.test(source)) {
        findings.push({ path: relative, code: "CLAUDE_FOREIGN_SKILL", message: "Skill preservada contém instruções específicas de outro cliente. Revise e faça backup antes de substituí-la." });
      }
      const normalizedHome = path.resolve(home).replace(/\\/g, "/");
      const normalized = source.replace(/\\/g, "/");
      const paths = normalized.match(/(?:\/home\/|\/Users\/|[A-Z]:\/Users\/)[^/\s"'{}]+\/(?:\.orquestrador(?:-maestro)?(?:\/|(?=\s|$))|AGENTS\.md)/gi) || [];
      if (normalized.includes("{{USER_HOME}}") || paths.some(value => !value.startsWith(normalizedHome + "/"))) {
        findings.push({ path: relative, code: "STALE_HOME_REFERENCE", message: "Referência de home não resolvida ou de outro usuário. Revise o arquivo preservado; não será sobrescrito automaticamente." });
      }
    } catch (error) {
      if (error.code !== "ENOENT") findings.push({ path: relative, code: "UNREADABLE_PROFILE", message: "Arquivo de integração indisponível ou não regular." });
    }
  }
  return findings;
}
function printClaudeGuidance(home, write = console.error) {
  const findings = inspectClaude(home);
  for (const item of findings) write("Maestro [" + item.code + "] " + item.path + ": " + item.message);
  if (fs.existsSync(path.join(home, ".claude", "CLAUDE.md")) || fs.existsSync(path.join(home, ".claude", "skills", "orquestrador-maestro", "SKILL.md"))) {
    write("Claude Code: abra uma sessão nova para carregar os arquivos de integração instalados (CLAUDE.md, quando presente, e skills). hooks.md contém instruções textuais; Maestro não pressupõe hooks executáveis nem aprova confiança.");
  }
  return findings;
}

function npmPermissionHint(result) {
  const diagnostic = String(result?.stderr || "") + "\n" + String(result?.stdout || "") + "\n" + String(result?.error?.code || "");
  return /\b(?:EACCES|EPERM)\b|permission denied/i.test(diagnostic)
    ? "Sem permissão no prefixo global npm. Use um gerenciador Node por usuário ou configure um prefixo gravável (consulte docs/installation.md); não use sudo para atualizar o Maestro."
    : null;
}
module.exports = { configurationState, inspectClaude, printClaudeGuidance, npmPermissionHint };
