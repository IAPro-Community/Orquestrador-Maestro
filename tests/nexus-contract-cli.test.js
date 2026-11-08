"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const cli = path.join(repoRoot, "bin", "orquestrador-maestro.js");

function run(input, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input
  });
}

test("advise --json uses Maestro Router v3 and returns a safe recommendation contract", () => {
  const result = run(JSON.stringify({
    version: "1.0.0",
    context: { project_id: "project-test", agent_id: "agent-test" },
    intent: "frontend-design",
    scope: "project",
    lifecycle: "TASK"
  }), "advise", "--json");
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.version, require("../package.json").version);
  assert.equal(response.mode, "ASSIST");
  assert.equal(response.lifecycle, "TASK");
  assert.ok(response.recommended.some((item) => item.skills.includes("skill-open-design-ui")));
  assert.equal(response.recommended[0].apply.startsWith("skill:"), true);
  assert.equal(Object.hasOwn(response.recommended[0], "path"), false);
  assert.match(response.explanation, /Nenhuma ação foi executada/u);
});

test("advise --json returns no fabricated recommendation for unmatched intent", () => {
  const result = run(JSON.stringify({
    version: "1.0.0",
    context: { project_id: "project-test" },
    intent: "qzxv-unmatched-intent-93824",
    scope: "project",
    lifecycle: "TASK"
  }), "advise", "--json");
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.deepEqual(response.recommended, []);
  assert.match(response.explanation, /não encontrou skill canônica/u);
});

test("verify --json evaluates supplied results without executing commands or opening evidence", () => {
  const result = run(JSON.stringify({
    version: "1.0.0",
    lifecycle: "VERIFY",
    project_id: "project-test",
    mission_id: "run-test",
    changed_paths: ["src/example.js"],
    checks: ["PASS: npm test (exit 0)"],
    evidence_refs: ["evidence://run-test/tests"],
    risk_signals: []
  }), "verify", "--json");
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.lifecycle, "VERIFY");
  assert.equal(response.passed, true);
  assert.deepEqual(response.required_actions, []);
  assert.match(response.explanation, /não executou comandos nem abriu referências/u);
});

test("verify --json fails closed when checks are not explicit PASS results or risk clearance is missing", () => {
  const result = run(JSON.stringify({
    version: "1.0.0",
    lifecycle: "VERIFY",
    checks: ["npm test"],
    evidence_refs: ["evidence://run-test/tests"],
    risk_signals: ["manual review required"]
  }), "verify", "--json");
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.passed, false);
  assert.equal(response.required_actions.length, 2);
});

test("verify --json does not treat a failed check with evidence as passed", () => {
  const result = run(JSON.stringify({
    version: "1.0.0",
    lifecycle: "VERIFY",
    checks: ["FAIL: npm test (exit 1)"],
    evidence_refs: ["evidence://run-test/tests"],
    risk_signals: []
  }), "verify", "--json");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).passed, false);
});

test("verify --json keeps malformed requests out of the legacy installer verifier", () => {
  const result = run("{not-json", "verify", "--json");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSON inválido/u);
});
