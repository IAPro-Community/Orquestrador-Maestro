"use strict";

const { createBridge, PROTOCOL_VERSION } = require("./bridge");
const { createStdioServer } = require("./stdio-server");
const { runtimePaths, startSocketRuntime } = require("./socket-server");
const { SocketBridgeClient, createRuntimeApplicationClient } = require("./socket-client");

module.exports = {
  PROTOCOL_VERSION,
  createBridge,
  createStdioServer,
  runtimePaths,
  startSocketRuntime,
  SocketBridgeClient,
  createRuntimeApplicationClient
};
