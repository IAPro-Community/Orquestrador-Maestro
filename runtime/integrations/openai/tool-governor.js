"use strict";

function normalizeToolName(value) {
  return String(value || "").trim();
}

function commandFromInput(input) {
  if (!input || typeof input !== "object") return "";
  return typeof input.command === "string" ? input.command.trim() : "";
}

function serializedInput(input) {
  try { return JSON.stringify(input || {}); }
  catch { return ""; }
}

function isAgentTool(toolName) {
  return ["Agent", "spawn_agent"].includes(toolName);
}

function isBroadRepositoryScan(toolName, input) {
  const command = commandFromInput(input);
  if (command) {
    return [
      /\b(?:rg|ripgrep)\b[^\n]*(?:\s|^)(?:\.|\.\/|\*\*?)(?:\s|$)/iu,
      /\bgrep\b[^\n]*\s-R\b[^\n]*(?:\s|^)(?:\.|\.\/)(?:\s|$)/iu,
      /\bfind\s+(?:\.|\.\/)\s*(?:$|[^\n]*-type\s+f)/iu,
      /\bls\b[^\n]*\s-R\b/iu,
      /\bGet-ChildItem\b[^\n]*\s-Recurse\b/iu,
      /\btree\b(?:\s+\.|\s*$)/iu
    ].some((pattern) => pattern.test(command));
  }

  const name = toolName.toLocaleLowerCase("en-US");
  if (!/(read|search|find|glob|grep)/u.test(name)) return false;
  const payload = serializedInput(input);
  return /"(?:path|root|directory|glob|pattern)"\s*:\s*"(?:\.|\.\/|\/|\*|\*\*\/\*)"(?=[,}])/iu.test(payload);
}

function governToolUse({ toolName, toolInput, complexity = "STANDARD", allowSubagents = false, mode = "optimize" } = {}) {
  const normalizedTool = normalizeToolName(toolName);
  const level = String(complexity || "STANDARD").toUpperCase();

  if (isAgentTool(normalizedTool) && !allowSubagents) {
    const reason = `Maestro budget for ${level} does not authorize subagents for this turn. Continue in the current agent unless the user explicitly requests multi-agent execution.`;
    if (mode === "strict" || (mode === "optimize" && ["MICRO", "SIMPLE"].includes(level))) {
      return { action: "deny", toolName: normalizedTool, reason };
    }
    return { action: "context", toolName: normalizedTool, reason };
  }

  if (isBroadRepositoryScan(normalizedTool, toolInput)) {
    const reason = `Maestro context budget for ${level} requires progressive disclosure. Narrow this repository-wide scan to the files or directory relevant to the current task before expanding scope.`;
    if (mode === "strict" || (mode === "optimize" && ["MICRO", "SIMPLE"].includes(level))) {
      return { action: "deny", toolName: normalizedTool, reason };
    }
    if (mode === "optimize" && level === "STANDARD") {
      return { action: "context", toolName: normalizedTool, reason };
    }
  }

  return { action: "allow", toolName: normalizedTool, reason: null };
}

module.exports = {
  commandFromInput,
  governToolUse,
  isAgentTool,
  isBroadRepositoryScan,
  normalizeToolName
};
