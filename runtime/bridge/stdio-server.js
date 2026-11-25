"use strict";

const readline = require("node:readline");

const { ERROR_CODES, errorResponse } = require("./bridge");

function createStdioServer(bridge, options = {}) {
  if (!bridge || typeof bridge.handle !== "function") {
    throw new TypeError("bridge.handle must be a function");
  }

  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const maxChars = options.maxFrameChars ?? 1024 * 1024;
  const maxPending = options.maxPending ?? 32;
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || !Number.isSafeInteger(maxPending) || maxPending < 1) throw new TypeError("Invalid RPC limits");
  input.setEncoding("utf8");
  let closed = false, inputEnded = false, pending = 0, frame = "", oversized = false;
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  function settle() { if (inputEnded && pending === 0) finish(); }
  function write(response) { if (response !== null && !closed) output.write(JSON.stringify(response) + "\n"); }
  function submit(line) {
    if (pending >= maxPending) {
      // Preserve bounded resources. This is a transport-level failure;
      // the caller must reconnect rather than assume a request executed.
      close();
      return;
    }
    pending++;
    Promise.resolve().then(() => parseAndHandle(line, bridge)).then(write)
      .catch(() => close()).finally(() => { pending--; settle(); });
  }
  function onData(chunk) {
    let offset = 0;
    while (!closed && offset < chunk.length) {
      const end = chunk.indexOf("\n", offset);
      const stop = end < 0 ? chunk.length : end;
      const part = chunk.slice(offset, stop);
      if (!oversized && frame.length + part.length <= maxChars) frame += part;
      else { oversized = true; frame = ""; }
      if (end < 0) break;
      if (oversized) { close(); break; }
      submit(frame.replace(/\r$/, ""));
      frame = ""; oversized = false; offset = end + 1;
    }
  }
  function onEnd() {
    if (inputEnded) return;
    if (oversized) { close(); return; }
    if (frame && !closed) submit(frame.replace(/\r$/, ""));
    frame = ""; inputEnded = true; settle();
  }
  function close() {
    if (closed) return;
    closed = true; inputEnded = true; frame = "";
    input.removeListener("data",onData);
    input.removeListener("end",onEnd);
    input.pause(); settle();
  }
  input.on("data",onData);
  input.once("end",onEnd);
  input.once("error",close);
  output.once("error",close);
  return Object.freeze({done,close});
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
