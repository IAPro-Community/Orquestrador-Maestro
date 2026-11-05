#!/usr/bin/env node
"use strict";

// Offline, cross-platform P0 smoke. No credentials/provider dispatch.
// Output is deliberately UNSIGNED and does not constitute homologation.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

function run(binary, args, cwd, timeout = 600000) {
  const start = Date.now();
  const r = spawnSync(binary, args, {
    cwd, encoding: "utf8", windowsHide: true, shell: false,
    timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "1" }
  });
  return {
    ok: !r.error && r.status === 0,
    exitCode: r.status, errorCode: r.error?.code || null,
    signal: r.signal || null, elapsedMs: Date.now() - start,
    stdoutBytes: Buffer.byteLength(r.stdout || ""),
    stderrBytes: Buffer.byteLength(r.stderr || "")
  };
}

function git(root, args) {
  const r = spawnSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 10000
  });
  if (r.status !== 0 || r.error) throw Error("git check failed: " + args[0]);
  return String(r.stdout || "").trim();
}

function inspect(root, branch, expectedVersion, filename) {
  const current = git(root, ["branch", "--show-current"]);
  const sha = git(root, ["rev-parse", "HEAD"]);
  if (current !== branch) throw Error("Branch mismatch: expected " + branch);
  if (git(root, ["status", "--porcelain", "--untracked-files=normal"])) {
    throw Error("Worktree is dirty; preserve changes before testing");
  }
  const raw = fs.readFileSync(path.join(root, filename), "utf8");
  const version = filename.endsWith(".json") ? JSON.parse(raw).version : raw.trim();
  if (version !== expectedVersion) throw Error("Version mismatch: " + branch);
  return { branch, sha, version };
}

function parse(argv) {
  const options = { nexus: null, full: false, capture: false, output: null };
  for (const value of argv) {
    if (value === "--full") options.full = true;
    else if (value === "--capture") options.capture = true;
    else if (value.startsWith("--nexus=")) options.nexus = path.resolve(value.slice(8));
    else if (value.startsWith("--output=")) options.output = path.resolve(value.slice(9));
    else throw Error("Unsupported argument: " + value);
  }
  if (options.capture && !options.nexus) throw Error("--capture requires --nexus");
  return options;
}

function tests(options, maestroRoot) {
  const steps = [
    ["maestro-runs", "node", [
      "--test",
      "runtime/runs/__tests__/application-submission-ports.test.js",
      "runtime/runs/__tests__/submission-worker.test.js",
      "runtime/runs/__tests__/submission-supervisor.test.js",
      "runtime/runs/__tests__/reconciliation.test.js",
      "runtime/runs/__tests__/manifest-admission.test.js"
    ], maestroRoot],
    ["maestro-bridge", "node", [
      "--test",
      "runtime/bridge/__tests__/submission-status.test.js",
      "runtime/bridge/__tests__/cli-real-stdio-contract.test.js"
    ], maestroRoot]
  ];
  if (options.full) steps.push(["maestro-all", "node", ["scripts/run-tests.js"], maestroRoot]);
  if (options.nexus) {
    const root = options.nexus;
    steps.push(
      ["nexus-version", "go", ["run", "./scripts/verify-version-contract.go", "."], root],
      ["nexus-go", "go", ["test", "./internal/nexus", "./internal/control/handoff"], root],
      ["nexus-format", "bun", ["run", "--cwd", "web", "format:check"], root],
      ["nexus-types", "bun", ["run", "--cwd", "web", "typecheck"], root],
      ["nexus-work", "bun", ["run", "--cwd", "web", "vitest", "run",
        "src/features/work/maestroComposeFlow.test.ts",
        "src/features/work/maestroRoutingDraft.test.ts"
      ], root]
    );
    if (options.full) steps.push(
      ["nexus-web-go", "go", ["test", "./internal/control/web"], root],
      ["nexus-web-all", "bun", ["run", "--cwd", "web", "test"], root],
      ["nexus-build", "bun", ["run", "--cwd", "web", "build"], root]
    );
    if (options.capture) steps.push(
      ["nexus-capture", "bun", ["run", "--cwd", "web", "docs:capture"], root],
      ["nexus-docs", "node", ["scripts/docs-verify.mjs"], root]
    );
  }
  return steps;
}

function main() {
  const options = parse(process.argv.slice(2));
  const maestroRoot = path.resolve(__dirname, "..");
  const maestro = inspect(maestroRoot, "release/v1.1.2", "1.1.2", "package.json");
  const nexus = options.nexus
    ? inspect(options.nexus, "release/v1.0.0-beta.12", "1.0.0-beta.12", "VERSION")
    : null;
  if (nexus && JSON.parse(fs.readFileSync(path.join(options.nexus, "web/package.json"), "utf8")).version
      !== nexus.version) throw Error("Nexus VERSION/package mismatch");
  const report = {
    schemaVersion: 1, kind: "LOCAL_SMOKE_UNATTESTED",
    createdAt: new Date().toISOString(), platform: process.platform,
    arch: process.arch, node: process.version, maestro, nexus,
    full: options.full, visualRequested: options.capture,
    realProvidersTested: false, nativeDeviceAttested: false,
    approvedForRelease: false, steps: [], passed: false
  };
  const steps = tests(options, maestroRoot);
  const destination = options.output || path.join(os.tmpdir(),
    "p0-qa-" + maestro.sha.slice(0, 12) + "-" + Date.now() + ".json");
  try {
    for (const [id, binary, args, cwd] of steps) {
      process.stdout.write("RUN " + id + " ... ");
      const result = run(binary, args, cwd);
      report.steps.push({ id, binary, args, ...result });
      console.log(result.ok ? "PASS" : "FAIL");
      if (!result.ok) break;
    }
    report.passed = report.steps.length === steps.length &&
      report.steps.every((step) => step.ok);
    if (report.passed && options.capture) {
      const manifest = JSON.parse(fs.readFileSync(
        path.join(options.nexus, "docs/assets/screenshots/manifest.json"), "utf8"));
      if (manifest.source_sha !== nexus.sha || manifest.captures.some((item) =>
        item.id !== "VIS-011" && (item.source_sha !== nexus.sha || item.status !== "PASS"))) {
        report.passed = false;
        report.visualError = "CAPTURE_SOURCE_OR_STATUS_MISMATCH";
      }
    }
  } finally {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const payload = JSON.stringify(report, null, 2) + "\n";
    fs.writeFileSync(destination, payload, { flag: "wx" });
    const digest = crypto.createHash("sha256").update(payload).digest("hex");
    console.log("Local checks: " + (report.passed ? "PASS" : "FAIL"));
    console.log("Evidence: " + destination + " SHA256: " + digest);
    console.log("Not signed; no real-provider/native-device release approval.");
  }
  if (!report.passed) process.exitCode = 1;
}

try { main(); }
catch (error) {
  // Never dump unredacted logs; run the failed command locally for diagnosis.
  console.error("Local QA blocked: " + String(error?.message || error).slice(0, 400));
  process.exitCode = 1;
}
