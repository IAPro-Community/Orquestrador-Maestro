"use strict";

const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { detectExecutable, startProcess } = require("./process-execution");

class ClaudeAdapter extends ProviderAdapter {
  constructor({ executable = "claude", commandPrefixArgs = [] } = {}) {
    super("claude");
    this.executable = executable;
    this.commandPrefixArgs = Object.freeze([...commandPrefixArgs]);
  }

  async detect() { return detectExecutable({ executable: this.executable, args: this.commandPrefixArgs, providerId: this.id }); }
  async capabilities() {
    return capabilities({ headless: true, structuredEvents: true, streaming: true, sessionResume: true, toolApproval: true, modelSelection: true, mcp: true });
  }

  async execute(request) {
    const args = [...this.commandPrefixArgs, "--print", "--output-format", "stream-json", "--include-partial-messages", "--verbose"];
    if (request.model && request.model !== "default") args.push("--model", request.model);
    if (request.permissionMode) args.push("--permission-mode", request.permissionMode);
    return startProcess({ executable: this.executable, args, request, providerId: this.id });
  }
}

module.exports = { ClaudeAdapter };
