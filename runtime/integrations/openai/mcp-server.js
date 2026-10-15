"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { resolveMaestroRoot } = require("../../config/maestro-paths");
const { SkillRegistry } = require("../../skills/registry");
const { classifyComplexity } = require("../../planner/complexity-gate");
const { ContextEngine } = require("../../context/context-engine");
const { trimToBudget } = require("./context-budget");
const { routePrompt } = require("./adapter");

const SERVER_NAME = "orquestrador-maestro";
const SERVER_VERSION = require(path.resolve(__dirname, "..", "..", "..", "package.json")).version;
const PROTOCOL_VERSION = "2025-06-18";

function resolveSkillRegistry(cwd = process.cwd()) {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const installedRoot = resolveMaestroRoot({ home });
  const installedManifest = path.join(installedRoot, "SKILLS_MANIFEST.json");
  const bundledRoot = path.resolve(__dirname, "..", "..", "..", "orquestrador");
  const maestroRoot = fs.existsSync(installedManifest) ? installedRoot : bundledRoot;
  return new SkillRegistry({ maestroRoot, projectRoot: path.resolve(cwd) });
}

function resolveWorkspaceCwd(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("cwd is required and must identify the current project workspace");
  }
  const cwd = path.resolve(value);
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    throw new Error(`workspace does not exist: ${cwd}`);
  }
  return cwd;
}

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(message) {
  return { isError: true, content: [{ type: "text", text: String(message) }] };
}

function toolDefinitions() {
  return [
    {
      name: "maestro_route",
      description: "Classify the current intent with Maestro Router v3 and return only the selected skills and context budget.",
      inputSchema: {
        type: "object",
        properties: {
          intent: { type: "string", minLength: 1 },
          cwd: { type: "string", minLength: 1 }
        },
        required: ["intent", "cwd"],
        additionalProperties: false
      }
    },
    {
      name: "maestro_context",
      description: "Build bounded, task-relevant local project context using the Maestro ContextEngine. Use only when more repository context is actually needed.",
      inputSchema: {
        type: "object",
        properties: {
          intent: { type: "string", minLength: 1 },
          cwd: { type: "string", minLength: 1 },
          maxTokens: { type: "integer", minimum: 256, maximum: 16000 }
        },
        required: ["intent", "cwd"],
        additionalProperties: false
      }
    },
    {
      name: "maestro_skill",
      description: "Load one selected Maestro skill body on demand. Do not use speculatively.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^skill-[a-z0-9-]+$" },
          cwd: { type: "string", minLength: 1 },
          maxTokens: { type: "integer", minimum: 256, maximum: 4000 }
        },
        required: ["id", "cwd"],
        additionalProperties: false
      }
    }
  ];
}

async function callTool(name, args = {}) {
  if (name === "maestro_route") {
    const intent = String(args.intent || "").trim();
    if (!intent) return errorResult("intent is required");
    const cwd = resolveWorkspaceCwd(args.cwd);
    const routed = routePrompt(intent, cwd);
    return textResult({
      complexity: routed?.complexity?.level || "STANDARD",
      profile: routed?.profile || "standard",
      contextBudget: routed?.complexity?.budget?.maxContextTokens || routed?.contextBudget || 6000,
      allowSubagents: Boolean(routed?.complexity?.budget?.allowSubagents),
      selectedSkills: (routed?.allSkills || []).map((skill) => skill.id).filter(Boolean)
    });
  }

  if (name === "maestro_context") {
    const intent = String(args.intent || "").trim();
    if (!intent) return errorResult("intent is required");
    const cwd = resolveWorkspaceCwd(args.cwd);
    const complexity = classifyComplexity(intent);
    const requested = Number(args.maxTokens);
    const budget = Number.isFinite(requested)
      ? Math.max(256, Math.min(requested, complexity.budget.maxContextTokens))
      : complexity.budget.maxContextTokens;
    const engine = new ContextEngine({ workspacePath: cwd, semanticRanker: null });
    const result = await engine.buildContext(intent, budget, { resolutionMode: "shadow" });
    return textResult({
      intent,
      maxTokens: budget,
      metrics: engine.getLastBuildMetrics(),
      items: result.items
    });
  }

  if (name === "maestro_skill") {
    const id = String(args.id || "").trim();
    if (!/^skill-[a-z0-9-]+$/u.test(id)) return errorResult("invalid skill id");
    const cwd = resolveWorkspaceCwd(args.cwd);
    const record = resolveSkillRegistry(cwd).get(id);
    if (!record) return errorResult(`skill not found: ${id}`);
    const file = path.join(record.path, "SKILL.md");
    if (!fs.existsSync(file)) return errorResult(`skill body not found: ${id}`);
    const maxTokens = Math.max(256, Math.min(Number(args.maxTokens) || 1800, 4000));
    return textResult({
      id,
      source: record.source,
      maturity: record.maturity,
      body: trimToBudget(fs.readFileSync(file, "utf8"), maxTokens)
    });
  }

  return errorResult(`unknown tool: ${name}`);
}

async function handleRequest(message) {
  if (!message || message.jsonrpc !== "2.0" || message.id === undefined) return null;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      }
    };
  }
  if (message.method === "ping") {
    return { jsonrpc: "2.0", id: message.id, result: {} };
  }
  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id: message.id, result: { tools: toolDefinitions() } };
  }
  if (message.method === "tools/call") {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments || {});
      return { jsonrpc: "2.0", id: message.id, result };
    } catch (error) {
      return { jsonrpc: "2.0", id: message.id, result: errorResult(error?.message || error) };
    }
  }
  return {
    jsonrpc: "2.0",
    id: message.id,
    error: { code: -32601, message: `Method not found: ${message.method}` }
  };
}

function startMcpServer({ input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); }
    catch {
      output.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      return;
    }
    if (message.method === "notifications/initialized" || message.id === undefined) return;
    const response = await handleRequest(message);
    if (response) output.write(JSON.stringify(response) + "\n");
  });
  return rl;
}

module.exports = {
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  callTool,
  handleRequest,
  resolveSkillRegistry,
  resolveWorkspaceCwd,
  startMcpServer,
  toolDefinitions
};
