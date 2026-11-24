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
  let inputEnded = false;
  let pending = 0;
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  function settle() {
    if (inputEnded && pending === 0) finish();
  }
  reader.on("close", () => {
    inputEnded = true;
    settle();
  });
  reader.on("line", async (line) => {
    if (closed) return;
    pending++;
    try {
      const response = await parseAndHandle(line, bridge);
      if (response !== null && !closed) output.write(JSON.stringify(response) + "\n");
    } finally {
      pending--;
      settle();
    }
  });

  return Object.freeze({
    done,
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

  try {
    return await bridge.handle(request);
  } catch {
    return errorResponse(request?.id ?? null, ERROR_CODES.internal, "Internal error");
  }
}

module.exports = {
  createStdioServer,
  parseAndHandle
};
