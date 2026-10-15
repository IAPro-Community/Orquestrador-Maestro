"use strict";

const { createBridge, PROTOCOL_VERSION } = require("./bridge");
const { createStdioServer } = require("./stdio-server");

module.exports = {
  PROTOCOL_VERSION,
  createBridge,
  createStdioServer
};
