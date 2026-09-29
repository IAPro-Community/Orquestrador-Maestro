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

function isBashTool(toolName) {
  return normalizeToolName(toolName).toLocaleLowerCase("en-US") === "bash";
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

function isReadOnlyScanCommand(command) {
  const text = String(command || "").trim();
  if (!text) return false;
  if (!/\b(?:rg|ripgrep|grep|find|ls|Get-ChildItem|tree)\b/iu.test(text)) return false;
  return !/\b(?:rm|rmdir|del|Remove-Item|mv|move|cp|copy|Set-Content|Add-Content|Out-File|sed\s+-i|perl\s+-pi|git\s+(?:clean|reset|checkout|restore))\b/iu.test(text);
}

function hasOutputBound(command) {
  return /(?:\bhead\s+-n\s+\d+\b|\bSelect-Object\s+-First\s+\d+\b|\b--max-count(?:=|\s+)\d+\b)/iu.test(String(command || ""));
}

function rewriteBroadBashInput(input, complexity = "MICRO") {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const command = commandFromInput(input);
  if (!command || !isReadOnlyScanCommand(command) || hasOutputBound(command)) return null;
  const level = String(complexity || "MICRO").toUpperCase();
  const limit = level === "MICRO" ? 80 : 120;
  const boundedCommand = /\bGet-ChildItem\b/iu.test(command)
    ? `${command} | Select-Object -First ${limit}`
    : `${command} | head -n ${limit}`;
  return { ...input, command: boundedCommand };
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
    if (mode === "strict") {
      return { action: "deny", toolName: normalizedTool, reason };
    }
    if (mode === "optimize" && ["MICRO", "SIMPLE"].includes(level)) {
      const updatedInput = isBashTool(normalizedTool) ? rewriteBroadBashInput(toolInput, level) : null;
      if (updatedInput) {
        return {
          action: "rewrite",
          toolName: normalizedTool,
          reason: `${reason} Output was bounded automatically for this read-only scan.`,
          updatedInput
        };
      }
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
  hasOutputBound,
  isAgentTool,
  isBashTool,
  isBroadRepositoryScan,
  isReadOnlyScanCommand,
  normalizeToolName,
  rewriteBroadBashInput
};
