"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createBridge } = require("../index");

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-route-"));
  const root = path.join(base, "project");
  const frontend = path.join(base, "frontend");
  const backend = path.join(base, "backend");
  fs.mkdirSync(root);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Route Tests");
  git("config", "user.email", "test@example.local");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Rules\nDelegate through Maestro.\n");
  git("add", "AGENTS.md");
  git("commit", "-qm", "initial");
  git("worktree", "add", "-qb", "feature/frontend", frontend);
  git("worktree", "add", "-qb", "feature/backend", backend);
  const content = "Frontend and backend work in isolated agent worktrees";
  const artifact = {
    id: "composer-1", version: 1, content,
    sha256: crypto.createHash("sha256").update(content).digest("hex")
  };
  const proposal = { tasks: [
    { id: "frontend-task", title: "Implement frontend form validation",
      objective: "Create accessible form handling with validation",
      dependsOn: [], acceptanceCriteria: ["Invalid form has accessible error"],
      requiredCapabilities: ["frontend"] },
    { id: "backend-task", title: "Implement backend endpoint validation",
      objective: "Reject invalid payloads and test contracts",
      dependsOn: [], acceptanceCriteria: ["Invalid payload returns 400"],
      requiredCapabilities: ["backend"] }
  ] };
  const assignments = [
    { taskId: "frontend-task", providerId: "agy", model: "frontend-model",
      sandbox: "enabled", worktreePath: frontend },
    { taskId: "backend-task", providerId: "opencode", model: "backend-model",
      sandbox: "none", worktreePath: backend }
  ];
  const counters = { detect: 0, execute: 0 };
  const providers = {
    get(name) {
      if (!["agy", "opencode"].includes(name)) return null;
      return { id: name,
        async detect() { counters.detect++; return { installed: true }; },
        async capabilities() { return { sandboxControl: name === "agy" }; },
        async execute() { counters.execute++; throw Error("Preview must never execute"); }
      };
    }
  };
  const close = () => fs.rmSync(base, { recursive: true, force: true });
  return { root, frontend, backend, artifact, proposal, assignments, providers, counters, close };
}
function call(bridge, method, params) {
  return bridge.handle({ jsonrpc: "2.0", id: 8, method, params });
}

test("AGY+OpenCode routes remain distinct and worktree-isolated, with zero dispatch", async () => {
  const f = setup();
  try {
    const bridge = createBridge({ projectRoot: f.root, services: { providerRegistry: f.providers } });
    const init = await call(bridge, "initialize", { protocolVersion: 1 });
    assert.equal(init.result.capabilities.plansRoutePreview, true);
    const reply = await call(bridge, "plans.routePreview", {
      projectPath: f.root, artifact: f.artifact,
      proposal: f.proposal, assignments: f.assignments
    });
    assert.equal(reply.error, undefined, JSON.stringify(reply.error));
    assert.equal(reply.result.ready, true);
    assert.equal(reply.result.previewOnly, true);
    assert.equal(reply.result.executable, false);
    assert.equal(reply.result.approvalRequired, true);
    assert.deepEqual(reply.result.assignments.map(a => a.providerId), ["agy", "opencode"]);
    assert.deepEqual(reply.result.assignments.map(a => a.model), ["frontend-model", "backend-model"]);
    assert.deepEqual(reply.result.assignments.map(a => a.status), ["READY_FOR_REVIEW", "READY_FOR_REVIEW"]);
    assert.notEqual(reply.result.assignments[0].workspaceId, reply.result.assignments[1].workspaceId);
    assert.equal(f.counters.detect, 2);
    assert.equal(f.counters.execute, 0, "Provider execution is forbidden during preview");
    assert.ok(!JSON.stringify(reply.result).includes(f.frontend), "Do not project local worktree paths");
  } finally { f.close(); }
});

test("Same checkout for independent agents is blocked, dependent work could reuse a worktree", async () => {
  const f = setup();
  try {
    const bridge = createBridge({ projectRoot: f.root, services: { providerRegistry: f.providers } });
    const reply = await call(bridge, "plans.routePreview", {
      artifact: f.artifact, proposal: f.proposal,
      assignments: f.assignments.map(a => ({ ...a, worktreePath: f.frontend }))
    });
    assert.equal(reply.result.ready, false);
    assert.ok(reply.result.blockers.some(b => b.code === "SHARED_WORKTREE_CONFLICT"));
    assert.equal(f.counters.execute, 0);
    const dependent = { tasks: [
      f.proposal.tasks[0],
      { ...f.proposal.tasks[1], dependsOn: ["frontend-task"] }
    ] };
    const retry = await call(bridge, "plans.routePreview", {
      artifact: f.artifact, proposal: dependent,
      assignments: f.assignments.map(a => ({ ...a, worktreePath: f.frontend }))
    });
    assert.equal(retry.result.ready, true);
  } finally { f.close(); }
});

test("Unavailable AGY blocks only AGY; OpenCode must not silently turn into Codex", async () => {
  const f = setup();
  try {
    const providers = { get(id) {
      if (id === "agy") return { id, detect: async () => ({ installed: false }),
        capabilities: async () => ({ sandboxControl: true }) };
      return f.providers.get(id);
    } };
    const bridge = createBridge({ projectRoot: f.root, services: { providerRegistry: providers } });
    const result = await call(bridge, "plans.routePreview", {
      artifact: f.artifact, proposal: f.proposal, assignments: f.assignments
    });
    assert.equal(result.result.ready, false);
    assert.deepEqual(result.result.assignments.map(a => a.status), ["BLOCKED", "READY_FOR_REVIEW"]);
    assert.equal(result.result.blockers[0].code, "PROVIDER_UNAVAILABLE");
    assert.deepEqual(result.result.assignments.map(a => a.providerId), ["agy", "opencode"]);
    assert.equal(f.counters.execute, 0);
  } finally { f.close(); }
});

test("Fail closed on forged assignment, foreign checkout, unsupported sandbox or invalid artifact", async () => {
  const f = setup();
  const foreign = path.join(path.dirname(f.root), "foreign");
  fs.mkdirSync(foreign);
  try {
    execFileSync("git", ["init", "-q", foreign], { stdio: "pipe" });
    const bridge = createBridge({ projectRoot: f.root, services: { providerRegistry: f.providers } });
    const baseline = { artifact: f.artifact, proposal: f.proposal, assignments: f.assignments };
    const rejected = [
      { ...baseline, assignments: [f.assignments[0]] },
      { ...baseline, assignments: [f.assignments[0], f.assignments[0]] },
      { ...baseline, assignments: [{ ...f.assignments[0], providerId: "codex" }, f.assignments[1]] },
      { ...baseline, assignments: [{ ...f.assignments[0], worktreePath: foreign }, f.assignments[1]] },
      { ...baseline, assignments: [{ ...f.assignments[0], model: "../unsafe" }, f.assignments[1]] },
      { ...baseline, artifact: { ...f.artifact, sha256: "0".repeat(64) } },
      { ...baseline, unsafeFallback: true }
    ];
    for (const params of rejected) {
      const r = await call(bridge, "plans.routePreview", params);
      // A nonregistered but syntactically permitted provider is BLOCKED,
      // rather than reporting the task as ready or performing any fallback.
      if (params.assignments?.[0]?.providerId === "codex") {
        assert.equal(r.result?.ready, false);
        assert.ok(r.result.blockers.some(b => b.code === "PROVIDER_NOT_REGISTERED"));
      } else {
        assert.equal(r.error?.code, -32602, JSON.stringify(params).slice(0,220));
      }
    }
    const unsupported = await call(bridge, "plans.routePreview", {
      ...baseline, assignments: [f.assignments[0], { ...f.assignments[1], sandbox: "read-only" }]
    });
    assert.equal(unsupported.result.ready, false);
    assert.equal(unsupported.result.assignments[1].code, "SANDBOX_NOT_SUPPORTED");
    assert.equal(f.counters.execute, 0);
  } finally { f.close(); }
});


test("registered future adapters work without editing a hardcoded provider allowlist", async () => {
  const f = setup();
  try {
    const providers = {
      get(name) {
        if (name === "custom-provider") return {
          id: name,
          detect: async () => ({ installed: true }),
          capabilities: async () => ({ sandboxControl: false }),
          execute: async () => { throw Error("preview must never execute"); }
        };
        return f.providers.get(name);
      }
    };
    const bridge = createBridge({ projectRoot: f.root, services: { providerRegistry: providers } });
    const reply = await call(bridge, "plans.routePreview", {
      artifact: f.artifact,
      proposal: f.proposal,
      assignments: [
        { ...f.assignments[0], providerId: "custom-provider", sandbox: "none" },
        f.assignments[1]
      ]
    });
    assert.equal(reply.error, undefined, JSON.stringify(reply.error));
    assert.equal(reply.result.ready, true);
    assert.equal(reply.result.assignments[0].providerId, "custom-provider");
    assert.equal(reply.result.assignments[1].providerId, "opencode");
    assert.equal(f.counters.execute, 0);
    const forged = await call(bridge, "plans.routePreview", {
      artifact: f.artifact,
      proposal: f.proposal,
      assignments: [
        { ...f.assignments[0], providerId: "../forged" }, f.assignments[1]
      ]
    });
    assert.equal(forged.error?.code, -32602);
  } finally { f.close(); }
});
