"use strict";

const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { detectExecutable, startProcess } = require("./process-execution");
const { assertSandboxHonourable } = require("./sandbox-contract");

class OpenCodeAdapter extends ProviderAdapter {
  constructor({ executable = "opencode", commandPrefixArgs = [] } = {}) {
    super("opencode");
    this.executable = executable;
    this.commandPrefixArgs = Object.freeze([...commandPrefixArgs]);
  }

  async detect() { return detectExecutable({ executable: this.executable, args: this.commandPrefixArgs, providerId: this.id }); }
  // opencode exposes no sandbox flag in this adapter, so sandboxControl is
  // reported honestly as false and any explicit sandbox request is refused
  // (fail-closed) instead of being silently ignored.
  async capabilities() { return capabilities({ headless: true, structuredEvents: true, streaming: true, sessionResume: true, modelSelection: true, mcp: true }); }
  async execute(request) {
    const args = [...this.commandPrefixArgs, "run", "--format", "json"];
    if (request.model && request.model !== "default") args.push("--model", request.model);
    if (request.agent) args.push("--agent", request.agent);
    if (request.sessionId) args.push("--session", request.sessionId);
    else if (request.continue === true) args.push("--continue");
    if (request.workspacePath) args.push("--dir", request.workspacePath);
    assertSandboxHonourable({
      requested: request.sandbox,
      providerId: this.id,
      supported: false
    });
    return startProcess({ executable: this.executable, args, request, providerId: this.id });
  }
}

module.exports = { OpenCodeAdapter };
