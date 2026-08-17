"use strict";

const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { detectExecutable, startProcess } = require("./process-execution");

class CodexAdapter extends ProviderAdapter {
  constructor({ executable = "codex", commandPrefixArgs = [] } = {}) {
    super("codex");
    this.executable = executable;
    this.commandPrefixArgs = Object.freeze([...commandPrefixArgs]);
  }

  async detect() { return detectExecutable({ executable: this.executable, args: this.commandPrefixArgs, providerId: this.id }); }
  async capabilities() {
    return capabilities({ headless: true, structuredEvents: true, streaming: true, sessionResume: true, sandboxControl: true, modelSelection: true });
  }

  async execute(request) {
    const args = [...this.commandPrefixArgs, "exec", "--json", "--color", "never"];
    if (request.model && request.model !== "default") args.push("--model", request.model);
    if (request.sandbox) args.push("--sandbox", request.sandbox);
    if (request.workspacePath) args.push("--cd", request.workspacePath);
    return startProcess({ executable: this.executable, args, request, providerId: this.id });
  }
}

module.exports = { CodexAdapter };
