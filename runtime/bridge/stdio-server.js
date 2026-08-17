"use strict";

const readline = require("node:readline");

const { ERROR_CODES, errorResponse } = require("./bridge");

function createStdioServer(bridge, options = {}) {
  if (!bridge || typeof bridge.handle !== "function") {
    throw new TypeError("bridge.handle must be a function");
  }

  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  let closed = false;

  reader.on("line", async (line) => {
    const response = await parseAndHandle(line, bridge);
    if (response !== null && !closed) {
      output.write(`${JSON.stringify(response)}\n`);
    }
  });

  return Object.freeze({
    close() {
      if (!closed) {
        closed = true;
        reader.close();
      }
    }
  });
}

async function parseAndHandle(line, bridge) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return errorResponse(null, ERROR_CODES.parse, "Parse error");
  }

  return bridge.handle(request);
}

module.exports = {
  createStdioServer,
  parseAndHandle
};
