"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  handleRequest,
  resolveWorkspaceCwd,
  toolDefinitions
} = require("../runtime/integrations/openai");

test("desktop MCP exposes only progressive-disclosure tools", () => {
  assert.deepEqual(
    toolDefinitions().map((tool) => tool.name).sort(),
    ["maestro_context", "maestro_route", "maestro_skill"]
  );
});

test("desktop MCP initializes with tools capability", async () => {
  const response = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18" }
  });
  assert.equal(response.result.serverInfo.name, "orquestrador-maestro");
  assert.equal(response.result.capabilities.tools.listChanged, false);
});

test("desktop MCP lists the bounded tool schemas", async () => {
  const response = await handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });
  assert.equal(response.result.tools.length, 3);
  const context = response.result.tools.find((tool) => tool.name === "maestro_context");
  assert.equal(context.inputSchema.properties.maxTokens.maximum, 16000);
});


test("desktop MCP requires an explicit workspace", () => {
  assert.throws(() => resolveWorkspaceCwd(""), /cwd is required/);
  const routeTool = toolDefinitions().find((tool) => tool.name === "maestro_route");
  const contextTool = toolDefinitions().find((tool) => tool.name === "maestro_context");
  const skillTool = toolDefinitions().find((tool) => tool.name === "maestro_skill");
  assert.deepEqual(routeTool.inputSchema.required, ["intent", "cwd"]);
  assert.deepEqual(contextTool.inputSchema.required, ["intent", "cwd"]);
  assert.deepEqual(skillTool.inputSchema.required, ["id", "cwd"]);
});
