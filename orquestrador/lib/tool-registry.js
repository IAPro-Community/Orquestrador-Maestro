#!/usr/bin/env node
"use strict";

const path = require("node:path");

const TOOL_DEFINITIONS = {
  codex: {
    displayName: "Codex",
    commands: ["codex"],
    configPaths: [".codex"],
    skillTargets: [".codex/skills"],
    managedSubPaths: ["agents", "prompts", "skills"],
    configContentType: "directory"
  },
  claude: {
    displayName: "Claude Code",
    commands: ["claude"],
    configPaths: [".claude"],
    skillTargets: [".claude/skills"],
    managedSubPaths: ["skills"],
    configContentType: "directory"
  },
  opencode: {
    displayName: "OpenCode",
    commands: ["opencode"],
    configPaths: [".opencode", ".config/opencode"],
    skillTargets: [".opencode/skills", ".config/opencode/skills"],
    managedSubPaths: ["skills"],
    configContentType: "directory"
  },
  cursor: {
    displayName: "Cursor",
    commands: [],
    configPaths: [".cursor"],
    skillTargets: [],
    managedSubPaths: [],
    configContentType: "directory"
  },
  gemini: {
    displayName: "Gemini CLI",
    commands: ["gemini"],
    configPaths: [".gemini"],
    skillTargets: [],
    managedSubPaths: [],
    configContentType: "directory"
  },
  windsurf: {
    displayName: "Windsurf",
    commands: [],
    configPaths: [".windsurf", ".codeium/windsurf"],
    skillTargets: [],
    managedSubPaths: ["memories"],
    configContentType: "directory"
  },
  antigravity: {
    displayName: "Antigravity",
    commands: [],
    configPaths: [".antigravity", ".antigravity-skills"],
    skillTargets: [".antigravity-skills/skills"],
    managedSubPaths: ["skills"],
    configContentType: "directory"
  },
  mimo: {
    displayName: "Mimo Code",
    commands: ["mimo"],
    configPaths: [".mimo"],
    skillTargets: [],
    managedSubPaths: [],
    configContentType: "directory"
  },
  kimi: {
    displayName: "Kimi Code",
    commands: ["kimi"],
    configPaths: [".kimi-code"],
    skillTargets: [],
    managedSubPaths: [],
    configContentType: "directory"
  },
  grok: {
    displayName: "Grok CLI",
    commands: ["grok"],
    configPaths: [".grok"],
    skillTargets: [],
    managedSubPaths: [],
    configContentType: "directory"
  }
};

function listSupportedTools() {
  return Object.keys(TOOL_DEFINITIONS);
}

function getToolDefinition(toolId) {
  return TOOL_DEFINITIONS[toolId] || null;
}

function isSupportedTool(toolId) {
  return toolId in TOOL_DEFINITIONS;
}

function resolveToolConfigPaths(toolId, homePath) {
  const def = TOOL_DEFINITIONS[toolId];
  if (!def) return [];
  return def.configPaths.map(p => path.join(homePath, p));
}

function resolveToolSkillTargets(toolId, homePath) {
  const def = TOOL_DEFINITIONS[toolId];
  if (!def) return [];
  return def.skillTargets.map(p => path.join(homePath, p));
}

function listAllSkillTargets(homePath) {
  const result = {};
  for (const [toolId, def] of Object.entries(TOOL_DEFINITIONS)) {
    if (def.skillTargets.length > 0) {
      result[toolId] = def.skillTargets.map(p => path.join(homePath, p));
    }
  }
  return result;
}

module.exports = {
  TOOL_DEFINITIONS,
  listSupportedTools,
  getToolDefinition,
  isSupportedTool,
  resolveToolConfigPaths,
  resolveToolSkillTargets,
  listAllSkillTargets
};
