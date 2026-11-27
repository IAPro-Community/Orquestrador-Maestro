"use strict";

const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { detectExecutable, startProcess } = require("./process-execution");
const { assertSandboxHonourable } = require("./sandbox-contract");

class AgyAdapter extends ProviderAdapter {
  constructor({ executable = "agy", commandPrefixArgs = [] } = {}) {
    super("agy");
    this.executable = executable;
    this.commandPrefixArgs = Object.freeze([...commandPrefixArgs]);
  }

  async detect() { return detectExecutable({ executable: this.executable, args: this.commandPrefixArgs, providerId: this.id }); }
  // sandboxControl stays true: agy can sandbox. But it cannot guarantee a
  // read-only filesystem mode, so read-only review is refused (fail-closed)
  // instead of silently running with write access.
  async capabilities() { return capabilities({ headless: true, structuredEvents: true, streaming: true, sessionResume: true, toolApproval: true, sandboxControl: true, modelSelection: true }); }
  async execute(request) {
    // `agy --print` consumes the next positional as its prompt, so every other
    // flag must come first and `--print` must be the last flag. Passing
    // `--output-format` after `--print` made the real CLI abort with
    // "--print took --output-format as its prompt" (exit 2).
    const args = [...this.commandPrefixArgs, "--output-format", "stream-json"];
    if (request.model && request.model !== "default") args.push("--model", request.model);
    if (request.mode) args.push("--mode", request.mode);
    assertSandboxHonourable({
      requested: request.sandbox,
      providerId: this.id,
      supported: true,
      honoursReadOnly: false
    });
    if (request.sandbox !== undefined && request.sandbox !== null && request.sandbox !== false &&
        request.sandbox !== "" && request.sandbox !== true && request.sandbox !== "enabled") {
      throw new Error(`provider ${this.id} cannot enforce requested sandbox mode "${request.sandbox}"`);
    }
    if (request.sandbox === true || request.sandbox === "enabled") args.push("--sandbox");
    args.push("--print");
    return startProcess({ executable: this.executable, args, request, providerId: this.id });
  }
}

module.exports = { AgyAdapter };
