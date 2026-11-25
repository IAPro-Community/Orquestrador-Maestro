#!/usr/bin/env node
"use strict";

/**
 * Contract gate for the canonical memory surface (Bridge protocol v1).
 *
 * It proves, against the real Bridge implementation:
 * 1. `initialize` advertises memory v1 read/scoped and write only on opt-in.
 * 2. Every declared memory method is dispatchable; forbidden ones are not.
 * 3. The published integration document names every method, keeps write
 *    explicitly opt-in, and never advertises promotion over the wire.
 *
 * Run: node scripts/check-memory-contract.js
 */

const fs = require("node:fs");
const path = require("node:path");
const { createBridge, ERROR_CODES } = require("../runtime/bridge/bridge");
const { MEMORY_CONTRACT, memoryCapabilities, validateMemorySurface } = require("../runtime/bridge/memory-contract");

const rootDir = path.resolve(__dirname, "..");
const docPath = path.join(rootDir, "docs", "architecture", "MAESTRO_INTEGRATION_API.md");
const failures = [];

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`  ✗ ${label}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function probe(bridge, method, params = {}) {
  return bridge.handle({ jsonrpc: "2.0", id: 1, method, params });
}

async function main() {
  console.log("check-memory-contract — canonical memory surface\n");

  const bridge = createBridge({ projectRoot: rootDir, services: {} });
  const writable = createBridge({ projectRoot: rootDir, services: {}, memoryWriteEnabled: true });
  const initialize = await probe(bridge, "initialize");
  const initializeWritable = await probe(writable, "initialize");

  await check("initialize advertises exactly the canonical default capabilities", () => {
    assert(initialize.result, "initialize failed");
    const memory = initialize.result.capabilities.memory;
    assert(memory.version === MEMORY_CONTRACT.version, "memory.version must be 1");
    assert(memory.read === true, "memory.read must be true");
    assert(memory.write === false, "memory.write must be false by default");
    assert(memory.scoped === true, "memory.scoped must be true");
    assert(
      JSON.stringify(memory) === JSON.stringify(memoryCapabilities({ writeEnabled: false })),
      "initialize capabilities drifted from memoryCapabilities()"
    );
  });

  await check("write is advertised only with the explicit operator opt-in", () => {
    assert(initializeWritable.result, "writable initialize failed");
    assert(initializeWritable.result.capabilities.memory.write === true, "opt-in must advertise write");
    assert(
      JSON.stringify(initializeWritable.result.capabilities.memory) ===
        JSON.stringify(memoryCapabilities({ writeEnabled: true })),
      "opt-in capabilities drifted from memoryCapabilities()"
    );
  });

  for (const [method, spec] of Object.entries(MEMORY_CONTRACT.methods)) {
    // The guarded writer is only registered when write is enabled; probe the
    // matching instance so "not registered" and "fails closed" stay distinct.
    const target = spec.requiresWriteCapability ? writable : bridge;
    // eslint-disable-next-line no-await-in-loop
    const response = await probe(target, method);
    // eslint-disable-next-line no-await-in-loop
    await check(`${method} is dispatchable (${spec.readOnly ? "read-only" : "guarded write"})`, () => {
      assert(response?.error?.code !== ERROR_CODES.methodNotFound,
        `${method} is not registered in the Bridge`);
    });
  }

  const refusedRecord = await probe(bridge, "memory.record", { confirmed: true });
  await check("memory.record fails closed when write is not enabled", () => {
    assert(refusedRecord?.error?.code === ERROR_CODES.methodNotFound,
      "memory.record must return method-not-found without the write opt-in");
  });

  for (const method of MEMORY_CONTRACT.forbiddenMethods) {
    // eslint-disable-next-line no-await-in-loop
    const response = await probe(bridge, method);
    // eslint-disable-next-line no-await-in-loop
    await check(`${method} is not exposed`, () => {
      assert(response?.error?.code === ERROR_CODES.methodNotFound, `${method} must not exist in the Bridge`);
    });
  }

  await check("the Bridge construction gate rejects surface drift", () => {
    const declared = Object.fromEntries(
      Object.keys(MEMORY_CONTRACT.methods).map((name) => [name, () => null])
    );
    const surface = validateMemorySurface(declared);
    assert(surface.methods.length === Object.keys(MEMORY_CONTRACT.methods).length, "contract surface mismatch");
    let missingRejected = false;
    try {
      const { "memory.timeline": _dropped, ...rest } = declared;
      validateMemorySurface(rest);
    } catch {
      missingRejected = true;
    }
    assert(missingRejected, "validateMemorySurface accepted a missing declared method");
    let undeclaredRejected = false;
    try {
      validateMemorySurface({ ...declared, "memory.forget": () => null });
    } catch {
      undeclaredRejected = true;
    }
    assert(undeclaredRejected, "validateMemorySurface accepted an undeclared memory method");
    let forbiddenRejected = false;
    try {
      validateMemorySurface({ ...declared, "memory.promote": () => null });
    } catch {
      forbiddenRejected = true;
    }
    assert(forbiddenRejected, "validateMemorySurface accepted a forbidden method");
  });

  const doc = fs.readFileSync(docPath, "utf8");

  await check("the integration document names every canonical memory method", () => {
    for (const method of Object.keys(MEMORY_CONTRACT.methods)) {
      assert(doc.includes(method), `${method} is missing from MAESTRO_INTEGRATION_API.md`);
    }
    for (const param of ["repositoryId", "workspaceId", "headCommit", "scope"]) {
      assert(doc.includes(param), `derived parameter ${param} is not documented as client-forbidden`);
    }
  });

  await check("the integration document keeps write opt-in and promotion off the wire", () => {
    assert(doc.includes("ORQUESTRADOR_MAESTRO_BRIDGE_MEMORY_WRITE=1"), "write opt-in env is not documented");
    assert(/otimizada|opt-in/iu.test(doc), "write opt-in is not described as opt-in");
    assert(!/memory\.promote/iu.test(doc), "memory.promote must not be documented as a Bridge method");
    assert(/concorr|concurrent|lock/iu.test(doc), "write serialization/locking is not documented");
  });

  console.log("");
  if (failures.length > 0) {
    console.error(`check-memory-contract: ${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("check-memory-contract: ALL CHECKS PASSED");
}

main().catch((error) => {
  console.error(`check-memory-contract: ${error?.stack || error}`);
  process.exit(1);
});