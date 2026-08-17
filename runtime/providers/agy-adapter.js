"use strict";

const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { detectExecutable, startProcess } = require("./process-execution");

class AgyAdapter extends ProviderAdapter {
  constructor({ executable = "agy", commandPrefixArgs = [] } = {}) {
    super("agy");
    this.executable = executable;
    this.commandPrefixArgs = Object.freeze([...commandPrefixArgs]);
  }

  async detect() { return detectExecutable({ executable: this.executable, args: this.commandPrefixArgs, providerId: this.id }); }
  async capabilities() { return capabilities({ headless: true, structuredEvents: true, streaming: true, sessionResume: true, toolApproval: true, sandboxControl: true, modelSelection: true }); }
  async execute(request) {
    const args = [...this.commandPrefixArgs, "--print", "--output-format", "stream-json"];
    if (request.model && request.model !== "default") args.push("--model", request.model);
    if (request.mode) args.push("--mode", request.mode);
    if (request.sandbox === true || request.sandbox === "enabled") args.push("--sandbox");
    return startProcess({ executable: this.executable, args, request, providerId: this.id });
  }
}

module.exports = { AgyAdapter };
