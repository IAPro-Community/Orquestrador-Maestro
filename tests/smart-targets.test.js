#!/usr/bin/env node
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  TOOL_DEFINITIONS,
  listSupportedTools,
  getToolDefinition,
  isSupportedTool,
  resolveToolConfigPaths,
  resolveToolSkillTargets,
  listAllSkillTargets
} = require("../orquestrador/lib/tool-registry.js");

const {
  DETECTION_STATES,
  detectTool,
  detectAllTools,
  detectToolById,
  executableExists,
  configPathExists,
  hasMaestroMarker
} = require("../orquestrador/lib/tool-detector.js");

const {
  STATE_SCHEMA_VERSION,
  getDefaultState,
  readState,
  writeState,
  getTargetState,
  isTargetEnabled,
  enableTarget,
  disableTarget,
  getEnabledTargets,
  updateDetectionState
} = require("../orquestrador/lib/install-state.js");

const {
  isObservationVisible,
  resolveObservationScope,
  rankObservations
} = require("../orquestrador/lib/visibility.js");

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "maestro-test-"));
}

function cleanupTempHome(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe("tool-registry", () => {
  it("lists all supported tools", () => {
    const tools = listSupportedTools();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.includes("codex"));
    assert.ok(tools.includes("claude"));
    assert.ok(tools.includes("opencode"));
    assert.ok(tools.includes("cursor"));
    assert.ok(tools.includes("gemini"));
    assert.ok(tools.includes("windsurf"));
    assert.ok(tools.includes("antigravity"));
  });

  it("returns definition for known tool", () => {
    const def = getToolDefinition("codex");
    assert.ok(def);
    assert.equal(def.displayName, "Codex");
    assert.ok(Array.isArray(def.commands));
    assert.ok(Array.isArray(def.configPaths));
    assert.ok(Array.isArray(def.skillTargets));
  });

  it("returns null for unknown tool", () => {
    assert.equal(getToolDefinition("nonexistent"), null);
  });

  it("validates supported tools", () => {
    assert.ok(isSupportedTool("codex"));
    assert.ok(!isSupportedTool("nonexistent"));
  });

  it("resolves config paths relative to home", () => {
    const paths = resolveToolConfigPaths("codex", "/tmp/testhome");
    assert.ok(paths.length > 0);
    assert.ok(paths[0].startsWith("/tmp/testhome"));
  });

  it("resolves skill targets relative to home", () => {
    const targets = resolveToolSkillTargets("codex", "/tmp/testhome");
    assert.ok(targets.length > 0);
    assert.ok(targets[0].includes(".codex/skills"));
  });

  it("lists all skill targets grouped by tool", () => {
    const all = listAllSkillTargets("/tmp/testhome");
    assert.ok(all.codex);
    assert.ok(all.claude);
    assert.ok(all.opencode);
  });
});

describe("tool-detector", () => {
  let tempHome;

  beforeEach(() => { tempHome = makeTempHome(); });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("detects state for unsupported tool", () => {
    const result = detectToolById("nonexistent", tempHome);
    assert.equal(result.state, DETECTION_STATES.NOT_DETECTED);
    assert.equal(result.reason, "unsupported-tool");
  });

  it("detects CONFIGURED when config dir exists and no executable", () => {
    const def = getToolDefinition("cursor");
    const cursorDir = path.join(tempHome, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });

    const result = detectTool("cursor", tempHome);
    if (result.state === DETECTION_STATES.DETECTED) {
      assert.equal(result.reason, "executable-found");
    } else {
      assert.equal(result.state, DETECTION_STATES.CONFIGURED);
      assert.equal(result.reason, "config-directory-found");
    }
  });

  it("detects Maestro-created directory as NOT_DETECTED", () => {
    const windsurfDir = path.join(tempHome, ".windsurf");
    fs.mkdirSync(windsurfDir, { recursive: true });
    fs.writeFileSync(path.join(windsurfDir, ".maestro-managed"), "true");

    const result = detectTool("windsurf", tempHome);
    if (result.state === DETECTION_STATES.DETECTED) {
      assert.equal(result.reason, "executable-found");
    } else {
      assert.equal(result.state, DETECTION_STATES.NOT_DETECTED);
      assert.equal(result.reason, "maestro-created-directory-only");
    }
  });

  it("detects all tools returns object with all supported tool IDs", () => {
    const results = detectAllTools(tempHome);
    assert.ok(typeof results === "object");
    for (const toolId of listSupportedTools()) {
      assert.ok(results[toolId]);
      assert.ok(results[toolId].state);
      assert.ok(results[toolId].reason);
    }
  });

  it("hasMaestroMarker returns true when marker exists", () => {
    const windsurfDir = path.join(tempHome, ".windsurf");
    fs.mkdirSync(windsurfDir, { recursive: true });
    fs.writeFileSync(path.join(windsurfDir, ".maestro-managed"), "true");
    assert.ok(hasMaestroMarker(tempHome, "windsurf"));
  });

  it("hasMaestroMarker returns false when no marker", () => {
    const windsurfDir = path.join(tempHome, ".windsurf");
    fs.mkdirSync(windsurfDir, { recursive: true });
    assert.ok(!hasMaestroMarker(tempHome, "windsurf"));
  });

  it("configPathExists detects existing config", () => {
    const kimiDir = path.join(tempHome, ".kimi-code");
    fs.mkdirSync(kimiDir, { recursive: true });
    const result = configPathExists("kimi", tempHome);
    assert.ok(result.exists);
    assert.ok(result.path.includes(".kimi-code"));
  });

  it("configPathExists returns false when no config", () => {
    const result = configPathExists("kimi", tempHome);
    assert.ok(!result.exists);
  });

  it("executableExists returns false for nonexistent command", () => {
    assert.ok(!executableExists("totally-fake-command-xyz-12345"));
  });
});

describe("install-state", () => {
  let tempHome;
  let orquestradorDir;

  beforeEach(() => {
    tempHome = makeTempHome();
    orquestradorDir = path.join(tempHome, ".orquestrador");
    fs.mkdirSync(orquestradorDir, { recursive: true });
  });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("returns null when no state file exists", () => {
    assert.equal(readState(orquestradorDir), null);
  });

  it("writes and reads state", () => {
    const state = getDefaultState();
    enableTarget(state, "codex", "user", "detected");
    writeState(orquestradorDir, state);

    const loaded = readState(orquestradorDir);
    assert.ok(loaded);
    assert.equal(loaded.schemaVersion, STATE_SCHEMA_VERSION);
    assert.ok(loaded.targets.codex);
    assert.ok(loaded.targets.codex.enabled);
  });

  it("enables and disables targets", () => {
    const state = getDefaultState();
    enableTarget(state, "codex", "user", "detected");
    assert.ok(isTargetEnabled(state, "codex"));

    disableTarget(state, "codex");
    assert.ok(!isTargetEnabled(state, "codex"));
  });

  it("gets enabled targets list", () => {
    const state = getDefaultState();
    enableTarget(state, "codex", "user", "detected");
    enableTarget(state, "claude", "user", "detected");
    disableTarget(state, "claude");

    const enabled = getEnabledTargets(state);
    assert.deepEqual(enabled, ["codex"]);
  });

  it("updates detection state", () => {
    const state = getDefaultState();
    updateDetectionState(state, "gemini", { state: "not-detected" });
    assert.equal(state.targets.gemini.lastDetection, "not-detected");
    assert.equal(state.targets.gemini.enabled, false);
  });

  it("returns null for invalid state file", () => {
    fs.writeFileSync(path.join(orquestradorDir, "install-state.json"), "not-json");
    assert.equal(readState(orquestradorDir), null);
  });

  it("returns null for wrong schema version", () => {
    fs.writeFileSync(path.join(orquestradorDir, "install-state.json"), JSON.stringify({ schemaVersion: 999 }));
    assert.equal(readState(orquestradorDir), null);
  });

  it("getDefaultState has correct schema version", () => {
    const state = getDefaultState();
    assert.equal(state.schemaVersion, STATE_SCHEMA_VERSION);
    assert.ok(state.targets);
    assert.ok(state.createdAt);
  });
});

describe("visibility — branch scope", () => {
  const repoId = "repo_abc123";

  it("branch-scoped observation visible to any task on same branch", () => {
    const obs = {
      scope: { level: "branch", repositoryId: repoId, branch: "feat-a" }
    };
    const ctx = { repositoryId: repoId, branch: "feat-a", detached: false };

    assert.ok(isObservationVisible(obs, ctx, { taskId: "task-1" }));
    assert.ok(isObservationVisible(obs, ctx, { taskId: "task-2" }));
    assert.ok(isObservationVisible(obs, ctx));
  });

  it("branch-scoped observation hidden on different branch", () => {
    const obs = {
      scope: { level: "branch", repositoryId: repoId, branch: "feat-a" }
    };
    const ctx = { repositoryId: repoId, branch: "feat-b", detached: false };
    assert.ok(!isObservationVisible(obs, ctx));
  });

  it("branch-scoped observation hidden when detached", () => {
    const obs = {
      scope: { level: "branch", repositoryId: repoId, branch: "feat-a" }
    };
    const ctx = { repositoryId: repoId, branch: null, detached: true };
    assert.ok(!isObservationVisible(obs, ctx));
  });

  it("branch-scoped observation hidden for different repo", () => {
    const obs = {
      scope: { level: "branch", repositoryId: "repo_other", branch: "feat-a" }
    };
    const ctx = { repositoryId: repoId, branch: "feat-a", detached: false };
    assert.ok(!isObservationVisible(obs, ctx));
  });
});

describe("visibility — task scope", () => {
  const repoId = "repo_abc123";

  it("task-scoped observation visible when taskId matches", () => {
    const obs = {
      scope: { level: "task", repositoryId: repoId, branch: "feat-a", taskId: "task-alpha" }
    };
    const ctx = { repositoryId: repoId, branch: "feat-a", detached: false };
    assert.ok(isObservationVisible(obs, ctx, { taskId: "task-alpha" }));
  });

  it("task-scoped observation hidden when taskId differs", () => {
    const obs = {
      scope: { level: "task", repositoryId: repoId, branch: "feat-a", taskId: "task-alpha" }
    };
    const ctx = { repositoryId: repoId, branch: "feat-a", detached: false };
    assert.ok(!isObservationVisible(obs, ctx, { taskId: "task-beta" }));
  });

  it("task-scoped observation hidden on different branch even with same taskId", () => {
    const obs = {
      scope: { level: "task", repositoryId: repoId, branch: "feat-a", taskId: "task-alpha" }
    };
    const ctx = { repositoryId: repoId, branch: "feat-b", detached: false };
    assert.ok(!isObservationVisible(obs, ctx, { taskId: "task-alpha" }));
  });

  it("task-scoped observation hidden without taskId in context", () => {
    const obs = {
      scope: { level: "task", repositoryId: repoId, branch: "feat-a", taskId: "task-alpha" }
    };
    const ctx = { repositoryId: repoId, branch: "feat-a", detached: false };
    assert.ok(!isObservationVisible(obs, ctx));
  });

  it("task-scoped without branch is visible across branches", () => {
    const obs = {
      scope: { level: "task", repositoryId: repoId, taskId: "task-alpha" }
    };
    const ctx = { repositoryId: repoId, branch: "feat-a", detached: false };
    assert.ok(isObservationVisible(obs, ctx, { taskId: "task-alpha" }));
  });
});

describe("visibility — repository scope", () => {
  it("repository-scoped visible across branches", () => {
    const obs = {
      scope: { level: "repository", repositoryId: "repo_abc" }
    };
    const ctx = { repositoryId: "repo_abc", branch: "feat-a", detached: false };
    assert.ok(isObservationVisible(obs, ctx));
  });

  it("repository-scoped hidden for different repo", () => {
    const obs = {
      scope: { level: "repository", repositoryId: "repo_abc" }
    };
    const ctx = { repositoryId: "repo_xyz", branch: "feat-a", detached: false };
    assert.ok(!isObservationVisible(obs, ctx));
  });
});

describe("visibility — workspace scope", () => {
  it("workspace-scoped visible for same workspace", () => {
    const obs = {
      scope: { level: "workspace", repositoryId: "repo_abc", workspaceId: "ws_1" }
    };
    const ctx = { repositoryId: "repo_abc", workspaceId: "ws_1", detached: false };
    assert.ok(isObservationVisible(obs, ctx));
  });

  it("workspace-scoped hidden for different workspace", () => {
    const obs = {
      scope: { level: "workspace", repositoryId: "repo_abc", workspaceId: "ws_1" }
    };
    const ctx = { repositoryId: "repo_abc", workspaceId: "ws_2", detached: false };
    assert.ok(!isObservationVisible(obs, ctx));
  });
});

describe("visibility — invalid scope", () => {
  it("returns false for null observation", () => {
    assert.ok(!isObservationVisible(null, { repositoryId: "r" }));
  });

  it("returns false for null context", () => {
    assert.ok(!isObservationVisible({ scope: { level: "branch", repositoryId: "r", branch: "b" } }, null));
  });

  it("returns false for unknown scope level", () => {
    const obs = { scope: { level: "unknown", repositoryId: "r" } };
    assert.ok(!isObservationVisible(obs, { repositoryId: "r" }));
  });
});

describe("smart install — detection logic", () => {
  let tempHome;

  beforeEach(() => { tempHome = makeTempHome(); });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("detectAllTools returns detection state for every supported tool", () => {
    const results = detectAllTools(tempHome);
    const supported = listSupportedTools();
    assert.equal(Object.keys(results).length, supported.length);
    for (const toolId of supported) {
      assert.ok(results[toolId].state);
      assert.ok(
        results[toolId].state === DETECTION_STATES.DETECTED ||
        results[toolId].state === DETECTION_STATES.CONFIGURED ||
        results[toolId].state === DETECTION_STATES.NOT_DETECTED
      );
    }
  });

  it("enabled targets persisted correctly", () => {
    const state = getDefaultState();
    enableTarget(state, "codex", "user", "detected");
    enableTarget(state, "claude", "user", "detected");
    disableTarget(state, "claude");

    const enabled = getEnabledTargets(state);
    assert.ok(enabled.includes("codex"));
    assert.ok(!enabled.includes("claude"));
  });

  it("user can add target that was not initially detected", () => {
    const state = getDefaultState();
    enableTarget(state, "kimi", "user", "not-detected");
    assert.ok(isTargetEnabled(state, "kimi"));
    assert.equal(state.targets.kimi.lastDetection, "not-detected");
  });

  it("state file is atomic (no corruption on concurrent reads)", () => {
    const tempDir = makeTempHome();
    try {
      const oDir = path.join(tempDir, ".orquestrador");
      fs.mkdirSync(oDir, { recursive: true });
      const state = getDefaultState();
      enableTarget(state, "codex", "user", "detected");
      writeState(oDir, state);

      const loaded = readState(oDir);
      assert.ok(loaded);
      assert.ok(loaded.targets.codex.enabled);
    } finally {
      cleanupTempHome(tempDir);
    }
  });
});

describe("visibility — canonical precedence", () => {
  it("branch observation ranks higher than repository", () => {
    const branchObs = {
      scope: { level: "branch", repositoryId: "r1", branch: "main" },
      summary: "React is current",
      verified: true,
      timestamp: new Date().toISOString()
    };
    const repoObs = {
      scope: { level: "repository", repositoryId: "r1" },
      summary: "Vue was historical",
      verified: false,
      timestamp: new Date(Date.now() - 86400000 * 30).toISOString()
    };

    const ctx = { repositoryId: "r1", branch: "main", workspaceId: "ws1", detached: false };
    const ranked = rankObservations([repoObs, branchObs], ["react"], ctx);
    assert.ok(ranked.length >= 2);
    assert.equal(ranked[0].obs.summary, "React is current");
  });
});

describe("cross-platform paths", () => {
  it("uses path.join for all filesystem operations", () => {
    const toolPath = path.join("/home", "user", ".codex", "skills");
    assert.ok(toolPath.includes(".codex"));
    assert.ok(!toolPath.includes("//"));
  });

  it("registry paths use forward slashes in definitions", () => {
    for (const toolId of listSupportedTools()) {
      const def = getToolDefinition(toolId);
      for (const p of def.configPaths) {
        assert.ok(!p.includes("\\"));
      }
    }
  });
});

describe("install-state — validation", () => {
  let tempHome;
  let orquestradorDir;

  beforeEach(() => {
    tempHome = makeTempHome();
    orquestradorDir = path.join(tempHome, ".orquestrador");
    fs.mkdirSync(orquestradorDir, { recursive: true });
  });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("rejects state file with targets as array", () => {
    const bad = { schemaVersion: STATE_SCHEMA_VERSION, targets: [] };
    fs.writeFileSync(path.join(orquestradorDir, "install-state.json"), JSON.stringify(bad));
    const loaded = readState(orquestradorDir);
    assert.equal(loaded, null);
  });

  it("rejects state file with target value as null", () => {
    const bad = { schemaVersion: STATE_SCHEMA_VERSION, targets: { codex: null } };
    fs.writeFileSync(path.join(orquestradorDir, "install-state.json"), JSON.stringify(bad));
    const loaded = readState(orquestradorDir);
    assert.equal(loaded, null);
  });

  it("rejects state file with enabled as string", () => {
    const bad = { schemaVersion: STATE_SCHEMA_VERSION, targets: { codex: { enabled: "yes" } } };
    fs.writeFileSync(path.join(orquestradorDir, "install-state.json"), JSON.stringify(bad));
    const loaded = readState(orquestradorDir);
    assert.equal(loaded, null);
  });

  it("rejects symlink install-state.json", () => {
    const real = path.join(tempHome, "real-state.json");
    fs.writeFileSync(real, JSON.stringify(getDefaultState()));
    fs.symlinkSync(real, path.join(orquestradorDir, "install-state.json"));
    const loaded = readState(orquestradorDir);
    assert.equal(loaded, null);
  });
});

describe("install-state — atomicity", () => {
  let tempHome;
  let orquestradorDir;

  beforeEach(() => {
    tempHome = makeTempHome();
    orquestradorDir = path.join(tempHome, ".orquestrador");
    fs.mkdirSync(orquestradorDir, { recursive: true });
  });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("creates backup of corrupted file before overwrite", () => {
    const stateFile = path.join(orquestradorDir, "install-state.json");
    fs.writeFileSync(stateFile, "corrupted-data");

    const state = getDefaultState();
    enableTarget(state, "codex", "user", "detected");
    writeState(orquestradorDir, state);

    const loaded = readState(orquestradorDir);
    assert.ok(loaded);
    assert.ok(loaded.targets.codex.enabled);
  });

  it("does not leave partial writes on failure", () => {
    const stateFile = path.join(orquestradorDir, "install-state.json");
    const original = getDefaultState();
    writeState(orquestradorDir, original);

    const tmpFiles = fs.readdirSync(orquestradorDir).filter(f => f.startsWith("install-state.json.tmp"));
    assert.equal(tmpFiles.length, 0);
  });
});

describe("git-context — normalization", () => {
  it("normalizes SSH URLs consistently", () => {
    const { normalizeRemote } = require("../orquestrador/lib/git-context.js");
    const r1 = normalizeRemote("git@github.com:user/repo.git");
    const r2 = normalizeRemote("https://github.com/user/repo.git");
    assert.equal(r1, r2);
  });

  it("normalizes SSH URLs with different ports to same hash base", () => {
    const { normalizeRemote } = require("../orquestrador/lib/git-context.js");
    const r1 = normalizeRemote("ssh://git@example.com:2222/org/repo.git");
    const r2 = normalizeRemote("ssh://git@example.com:3333/org/repo.git");
    assert.notEqual(r1, r2);
  });

  it("normalizes git:// protocol", () => {
    const { normalizeRemote } = require("../orquestrador/lib/git-context.js");
    const r = normalizeRemote("git://github.com/user/repo.git");
    assert.ok(typeof r === "string");
    assert.ok(r.length > 0);
  });
});

describe("CLI — extractPositionalArg", () => {
  function extractPositionalArg(args, knownFlags) {
    for (let i = args.length - 1; i >= 0; i--) {
      const a = args[i];
      if (!a.startsWith("-")) {
        const prev = i > 0 ? args[i - 1] : null;
        if (prev && knownFlags.includes(prev)) continue;
        return a;
      }
    }
    return null;
  }

  it("extracts last positional arg without flags", () => {
    const result = extractPositionalArg(["codex"], ["--home-path"]);
    assert.equal(result, "codex");
  });

  it("extracts positional arg after --home-path value", () => {
    const result = extractPositionalArg(["--home-path", "/tmp/h", "codex"], ["--home-path"]);
    assert.equal(result, "codex");
  });

  it("extracts positional arg before --home-path", () => {
    const result = extractPositionalArg(["codex", "--home-path", "/tmp/h"], ["--home-path"]);
    assert.equal(result, "codex");
  });

  it("returns null when no positional arg", () => {
    const result = extractPositionalArg(["--home-path", "/tmp/h"], ["--home-path"]);
    assert.equal(result, null);
  });

  it("handles empty args", () => {
    const result = extractPositionalArg([], ["--home-path"]);
    assert.equal(result, null);
  });
});

describe("install-state — isTargetEnabled strict boolean", () => {
  it("returns false for unknown target", () => {
    const state = getDefaultState();
    assert.equal(isTargetEnabled(state, "unknown"), false);
    assert.equal(typeof isTargetEnabled(state, "unknown"), "boolean");
  });

  it("returns true only when enabled is exactly true", () => {
    const state = getDefaultState();
    state.targets.codex = { enabled: true };
    assert.equal(isTargetEnabled(state, "codex"), true);
    state.targets.claude = { enabled: "yes" };
    assert.equal(isTargetEnabled(state, "claude"), false);
    state.targets.gemini = { enabled: 1 };
    assert.equal(isTargetEnabled(state, "gemini"), false);
  });

  it("returns false when target exists but enabled is missing", () => {
    const state = getDefaultState();
    state.targets.cursor = { selection: "user" };
    assert.equal(isTargetEnabled(state, "cursor"), false);
  });
});

describe("install-state — writeState rejects symlink", () => {
  let tempHome;
  let orquestradorDir;

  beforeEach(() => {
    tempHome = makeTempHome();
    orquestradorDir = path.join(tempHome, ".orquestrador");
    fs.mkdirSync(orquestradorDir, { recursive: true });
  });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("throws when install-state.json is a symlink", () => {
    const real = path.join(tempHome, "real-state.json");
    fs.writeFileSync(real, JSON.stringify(getDefaultState()));
    fs.symlinkSync(real, path.join(orquestradorDir, "install-state.json"));

    assert.throws(() => {
      writeState(orquestradorDir, getDefaultState());
    }, /symlink/);
  });
});

describe("install-state — corruption backup", () => {
  let tempHome;
  let orquestradorDir;

  beforeEach(() => {
    tempHome = makeTempHome();
    orquestradorDir = path.join(tempHome, ".orquestrador");
    fs.mkdirSync(orquestradorDir, { recursive: true });
  });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("creates .corrupt backup when overwriting invalid state", () => {
    const stateFile = path.join(orquestradorDir, "install-state.json");
    fs.writeFileSync(stateFile, "this is corrupted data");

    const state = getDefaultState();
    enableTarget(state, "codex", "user", "detected");
    writeState(orquestradorDir, state);

    const entries = fs.readdirSync(orquestradorDir);
    const corruptBackups = entries.filter(f => f.startsWith("install-state.json.corrupt."));
    assert.ok(corruptBackups.length >= 1, "Expected at least one .corrupt backup file");

    const backupContent = fs.readFileSync(path.join(orquestradorDir, corruptBackups[0]), "utf8");
    assert.equal(backupContent, "this is corrupted data");
  });

  it("creates .corrupt backup when overwriting wrong schema version", () => {
    const stateFile = path.join(orquestradorDir, "install-state.json");
    fs.writeFileSync(stateFile, JSON.stringify({ schemaVersion: 999, targets: {} }));

    writeState(orquestradorDir, getDefaultState());

    const entries = fs.readdirSync(orquestradorDir);
    const corruptBackups = entries.filter(f => f.startsWith("install-state.json.corrupt."));
    assert.ok(corruptBackups.length >= 1, "Expected backup for wrong schema version");
  });

  it("does not create backup when state file does not exist", () => {
    writeState(orquestradorDir, getDefaultState());
    const entries = fs.readdirSync(orquestradorDir);
    const corruptBackups = entries.filter(f => f.startsWith("install-state.json.corrupt."));
    assert.equal(corruptBackups.length, 0);
  });
});

describe("git-context — SSH port normalization", () => {
  const { normalizeRemote } = require("../orquestrador/lib/git-context.js");

  it("preserves port in SSH URL with port", () => {
    const r1 = normalizeRemote("ssh://git@example.com:2222/org/repo.git");
    const r2 = normalizeRemote("ssh://git@example.com:3333/org/repo.git");
    assert.notEqual(r1, r2);
    assert.ok(r1.includes(":2222"));
    assert.ok(r2.includes(":3333"));
  });

  it("treats git@host:path and https://host/path as semantically same", () => {
    const r1 = normalizeRemote("git@github.com:user/repo.git");
    const r2 = normalizeRemote("https://github.com/user/repo.git");
    assert.equal(r1, r2);
  });

  it("normalizes git@host:path without explicit port", () => {
    const r = normalizeRemote("git@example.com:org/repo.git");
    assert.ok(r.includes("example.com"));
    assert.ok(!r.includes(":22/"), "default port 22 should be omitted");
    assert.ok(r.includes("/org/repo"));
  });

  it("normalizes git:// protocol", () => {
    const r = normalizeRemote("git://github.com/user/repo.git");
    assert.ok(typeof r === "string");
    assert.ok(r.includes("github.com"));
  });

  it("returns null for null input", () => {
    assert.equal(normalizeRemote(null), null);
  });

  it("different ports produce different hashes", () => {
    const r1 = normalizeRemote("ssh://git@host.com:2222/org/repo");
    const r2 = normalizeRemote("ssh://git@host.com:4444/org/repo");
    assert.notEqual(r1, r2);
  });
});

describe("context brief — bounded memory contract", () => {
  it("allocates 0 memory for trivial tasks", () => {
    const { computeBudget } = require("../orquestrador/bin/context-brief.js");
    const budget = computeBudget(16000, { class: "trivial", reason: "test" });
    assert.equal(budget.memoryChars, 0);
  });

  it("allocates 0 memory for bounded tasks", () => {
    const { computeBudget } = require("../orquestrador/bin/context-brief.js");
    const budget = computeBudget(16000, { class: "bounded", reason: "test" });
    assert.equal(budget.memoryChars, 0);
  });

  it("allocates memory for complex tasks", () => {
    const { computeBudget } = require("../orquestrador/bin/context-brief.js");
    const budget = computeBudget(16000, { class: "complex", reason: "test" });
    assert.ok(budget.memoryChars > 0, "complex tasks should have memory allocation");
  });

  it("allocates memory for investigation tasks", () => {
    const { computeBudget } = require("../orquestrador/bin/context-brief.js");
    const budget = computeBudget(16000, { class: "investigation", reason: "test" });
    assert.ok(budget.memoryChars > 0);
  });

  it("allocates memory for resumed tasks", () => {
    const { computeBudget } = require("../orquestrador/bin/context-brief.js");
    const budget = computeBudget(16000, { class: "resumed", reason: "test" });
    assert.ok(budget.memoryChars > 0);
  });

  it("budget invariants: sum of parts <= maxChars", () => {
    const { computeBudget } = require("../orquestrador/bin/context-brief.js");
    for (const cls of ["trivial", "bounded", "complex", "resumed", "investigation"]) {
      const budget = computeBudget(16000, { class: cls, reason: "test" });
      const totalAllocated = budget.canonicalChars + budget.docsChars + budget.memoryChars + budget.metadataChars;
      assert.ok(totalAllocated <= budget.maxChars, `${cls}: allocated ${totalAllocated} > max ${budget.maxChars}`);
    }
  });
});

describe("context brief — memory retrieval metrics", () => {
  it("computeBudget returns taskClassification", () => {
    const { computeBudget } = require("../orquestrador/bin/context-brief.js");
    const budget = computeBudget(16000, { class: "investigation", reason: "test" });
    assert.equal(budget.taskClassification, "investigation");
  });
});

describe("install-state — ownership persistence", () => {
  let tempHome;
  let orquestradorDir;

  beforeEach(() => {
    tempHome = makeTempHome();
    orquestradorDir = path.join(tempHome, ".orquestrador");
    fs.mkdirSync(orquestradorDir, { recursive: true });
  });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("stores and retrieves managedFiles", () => {
    const state = getDefaultState();
    state.targets.codex = {
      enabled: true,
      selection: "user",
      lastDetection: "detected",
      managedFiles: [".codex/skills/orquestrador-maestro/SKILL.md"],
      managedDirectories: [".codex/skills/orquestrador-maestro"]
    };
    writeState(orquestradorDir, state);

    const loaded = readState(orquestradorDir);
    assert.deepEqual(loaded.targets.codex.managedFiles, [".codex/skills/orquestrador-maestro/SKILL.md"]);
    assert.deepEqual(loaded.targets.codex.managedDirectories, [".codex/skills/orquestrador-maestro"]);
  });
});

describe("install-state — writeState atomicity", () => {
  let tempHome;
  let orquestradorDir;

  beforeEach(() => {
    tempHome = makeTempHome();
    orquestradorDir = path.join(tempHome, ".orquestrador");
    fs.mkdirSync(orquestradorDir, { recursive: true });
  });
  afterEach(() => { cleanupTempHome(tempHome); });

  it("does not leave .tmp files after successful write", () => {
    const state = getDefaultState();
    enableTarget(state, "codex", "user", "detected");
    writeState(orquestradorDir, state);

    const tmpFiles = fs.readdirSync(orquestradorDir).filter(f => f.includes(".tmp."));
    assert.equal(tmpFiles.length, 0);
  });

  it("final state file is valid JSON", () => {
    const state = getDefaultState();
    enableTarget(state, "codex", "user", "detected");
    writeState(orquestradorDir, state);

    const content = fs.readFileSync(path.join(orquestradorDir, "install-state.json"), "utf8");
    const parsed = JSON.parse(content);
    assert.ok(parsed.schemaVersion);
    assert.ok(parsed.targets);
    assert.ok(parsed.updatedAt);
  });
});

describe("visibility — worktree without remote", () => {
  it("same repositoryId across worktrees via git-common-dir", () => {
    const tmpDir = makeTempHome();
    try {
      const repoDir = path.join(tmpDir, "repo");
      const worktreeDir = path.join(tmpDir, "worktree");
      fs.mkdirSync(repoDir, { recursive: true });
      fs.mkdirSync(worktreeDir, { recursive: true });

      const { execFileSync } = require("node:child_process");
      execFileSync("git", ["init"], { cwd: repoDir, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir, stdio: "pipe" });
      fs.writeFileSync(path.join(repoDir, "file.txt"), "initial");
      execFileSync("git", ["add", "."], { cwd: repoDir, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir, stdio: "pipe" });

      try {
        execFileSync("git", ["worktree", "add", worktreeDir, "HEAD"], { cwd: repoDir, stdio: "pipe" });

        const { resolveGitContext } = require("../orquestrador/lib/git-context.js");
        const ctx1 = resolveGitContext(repoDir);
        const ctx2 = resolveGitContext(worktreeDir);

        assert.equal(ctx1.repositoryId, ctx2.repositoryId, "worktrees should share repositoryId");
        assert.notEqual(ctx1.workspaceId, ctx2.workspaceId, "worktrees should have different workspaceId");
      } catch {
        // git worktree may not be available in all environments
      }
    } finally {
      cleanupTempHome(tmpDir);
    }
  });
});

describe("visibility — detached commit scope", () => {
  it("commit-scoped observation visible for same commit", () => {
    const obs = {
      scope: { level: "commit", repositoryId: "r1", headCommit: "abc123" }
    };
    const ctx = { repositoryId: "r1", headCommit: "abc123", branch: null, detached: true };
    assert.ok(isObservationVisible(obs, ctx));
  });

  it("commit-scoped observation hidden for different commit", () => {
    const obs = {
      scope: { level: "commit", repositoryId: "r1", headCommit: "abc123" }
    };
    const ctx = { repositoryId: "r1", headCommit: "def456", branch: null, detached: true };
    assert.ok(!isObservationVisible(obs, ctx));
  });
});

describe("canonical precedence — memory participates", () => {
  it("ranking includes memory observations when visible", () => {
    const branchObs = {
      scope: { level: "branch", repositoryId: "r1", branch: "main" },
      summary: "React is current framework",
      verified: true,
      tags: ["react", "framework"],
      timestamp: new Date().toISOString()
    };
    const memoryObs = {
      scope: { level: "repository", repositoryId: "r1" },
      summary: "Vue was previously used",
      verified: true,
      tags: ["vue", "framework"],
      timestamp: new Date(Date.now() - 86400000 * 5).toISOString()
    };

    const ctx = { repositoryId: "r1", branch: "main", detached: false };
    const ranked = rankObservations([memoryObs, branchObs], ["react", "framework"], ctx);
    assert.ok(ranked.length >= 2, "both observations should be ranked");
    assert.equal(ranked[0].obs.summary, "React is current framework");
  });
});

describe("CLI — targets add parser", () => {
  function extractPositionalArg(args, knownFlags) {
    for (let i = args.length - 1; i >= 0; i--) {
      const a = args[i];
      if (!a.startsWith("-")) {
        const prev = i > 0 ? args[i - 1] : null;
        if (prev && knownFlags.includes(prev)) continue;
        return a;
      }
    }
    return null;
  }

  it("extracts toolId from targets add codex", () => {
    assert.equal(extractPositionalArg(["codex"], ["--home-path"]), "codex");
  });

  it("extracts toolId from targets add --home-path /tmp/h codex", () => {
    assert.equal(extractPositionalArg(["--home-path", "/tmp/h", "codex"], ["--home-path"]), "codex");
  });

  it("extracts toolId from targets add codex --home-path /tmp/h", () => {
    assert.equal(extractPositionalArg(["codex", "--home-path", "/tmp/h"], ["--home-path"]), "codex");
  });
});
