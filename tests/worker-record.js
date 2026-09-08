#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { Memory } = require(path.join(process.argv[2], "orquestrador", "bin", "memory.js"));

const baseDir = process.argv[3];
const projectId = process.argv[4];
const workerId = parseInt(process.argv[5], 10);
const count = parseInt(process.argv[6], 10);

const memory = new Memory({ baseDir });

let recorded = 0;
let failed = 0;
for (let i = 0; i < count; i++) {
  try {
    memory.record(projectId, {
      type: "discovery",
      summary: `Worker ${workerId} observation ${i}`
    });
    recorded++;
  } catch (err) {
    failed++;
    process.stderr.write(`Worker ${workerId} error: ${err.message}\n`);
  }
}

process.stdout.write(JSON.stringify({ workerId, recorded, failed }) + "\n");
process.exit(failed > 0 ? 1 : 0);
