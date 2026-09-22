"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const {
  capabilitiesFromFiles,
  capabilitiesFromStack,
  collectRoutingSignals,
  detectStack,
  verifiedMemorySkillHints
} = require("../routing-signals");

test("stack detection derives deterministic capabilities from repository manifests", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-routing-stack-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    dependencies: { react: "1", "@nestjs/core": "1", "@prisma/client": "1" }
  }), "utf8");
  fs.writeFileSync(path.join(root, "Dockerfile"), "FROM node:24\n", "utf8");
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });

  const stack = detectStack(root);
  assert.ok(stack.includes("react"));
  assert.ok(stack.includes("nestjs"));
  assert.ok(stack.includes("prisma"));
  assert.ok(stack.includes("docker"));
  assert.ok(stack.includes("github-actions"));

  const capabilities = capabilitiesFromStack(stack);
  assert.ok(capabilities.includes("frontend"));
  assert.ok(capabilities.includes("api-design"));
  assert.ok(capabilities.includes("database"));
  assert.ok(capabilities.includes("containers"));
  assert.ok(capabilities.includes("ci"));
});

test("changed files derive capability hints without selecting a skill", () => {
  const capabilities = capabilitiesFromFiles([
    "src/components/Login.tsx",
    "prisma/migrations/001.sql",
    ".github/workflows/test.yml"
  ]);
  assert.deepEqual(capabilities, ["ci", "database", "frontend"]);
});

test("only verified memory skill tags become routing hints", () => {
  const memory = {
    search(projectId, query) {
      assert.equal(query.verified, true);
      return [
        { tags: ["skill-systematic-debugging", "other"] },
        { tags: ["skill:skill-verification-before-completion"] }
      ];
    }
  };
  const hints = verifiedMemorySkillHints(memory, { repositoryId: "repo_x", branch: "main" }, "bug");
  assert.deepEqual(hints, ["skill-systematic-debugging", "skill-verification-before-completion"]);
});

test("collectRoutingSignals includes git scope and changed files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-routing-signals-"));
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { react: "1" } }), "utf8");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "ignore" });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { react: "2" } }), "utf8");

  const signals = collectRoutingSignals(root);
  assert.equal(signals.gitContext.vcs, "git");
  assert.deepEqual(signals.changedFiles, ["package.json"]);
  assert.ok(signals.stackCapabilities.includes("frontend"));
  assert.ok(signals.scopeCapabilities.includes("build-tooling"));
});
