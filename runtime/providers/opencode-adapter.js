"use strict";

const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { detectExecutable, startProcess } = require("./process-execution");

class OpenCodeAdapter extends ProviderAdapter {
  constructor({ executable = "opencode", commandPrefixArgs = [] } = {}) {
    super("opencode");
    this.executable = executable;
    this.commandPrefixArgs = Object.freeze([...commandPrefixArgs]);
  }

  async detect() { return detectExecutable({ executable: this.executable, args: this.commandPrefixArgs, providerId: this.id }); }
  async capabilities() { return capabilities({ headless: true, structuredEvents: true, streaming: true, sessionResume: true, modelSelection: true, mcp: true }); }
  async execute(request) {
    const args = [...this.commandPrefixArgs, "run", "--format", "json"];
    if (request.model && request.model !== "default") args.push("--model", request.model);
    if (request.agent) args.push("--agent", request.agent);
    if (request.sessionId) args.push("--session", request.sessionId);
    else if (request.continue === true) args.push("--continue");
    if (request.workspacePath) args.push("--dir", request.workspacePath);
    return startProcess({ executable: this.executable, args, request, providerId: this.id });
  }
}

module.exports = { OpenCodeAdapter };
