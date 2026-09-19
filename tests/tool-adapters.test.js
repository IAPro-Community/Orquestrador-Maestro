const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const os = require("node:os");

const repoRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(repoRoot, "orquestrador", "TOOL_ADAPTERS.json");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

test("adapter manifest protects private state categories", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(manifest.policy.neverManage.includes("auth"));
  assert.ok(manifest.policy.neverManage.includes("sessions"));
  assert.ok(manifest.adapters.freebuff);
  assert.equal(manifest.adapters.freebuff.command, "freebuff");
  assert.ok(manifest.adapters.freebuff.config.project.includes(".agents/skills"));
  assert.ok(manifest.adapters.freebuff.capabilities.includes("mcp"));
  for (const [id, adapter] of Object.entries(manifest.adapters)) {
    assert.ok(adapter.command, id);
    assert.ok(Array.isArray(adapter.config.global), id);
    assert.ok(Array.isArray(adapter.config.project), id);
  }
});

test("adapters validate command succeeds", () => {
  const result = spawnSync(process.execPath, [cliPath, "adapters", "validate"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Manifesto válido/iu);
});

test("adapters paths exposes only declared destinations", () => {
  const result = spawnSync(process.execPath, [cliPath, "adapters", "paths", "junie"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.project, [".junie/config.json", ".junie/mcp", ".junie/skills", ".junie/commands", ".junie/agents"]);
  assert.equal(Object.prototype.hasOwnProperty.call(output, "sessions"), false);
});

test("render dry-run does not create files", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-adapter-"));
  fs.writeFileSync(path.join(project, "AGENTS.md"), "# Projeto\n", "utf8");
  const result = spawnSync(process.execPath, [cliPath, "adapters", "render", "junie", "--project-path", project, "--dry-run"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /planejado\t\.junie[\\/]config\.json/);
  assert.equal(fs.existsSync(path.join(project, ".junie")), false);
});

test("render applies safe files and preserves existing config", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-adapter-"));
  const configDir = path.join(project, ".junie");
  fs.mkdirSync(configDir, { recursive: true });
  const original = "{\"model\":\"operator-owned\"}\n";
  fs.writeFileSync(path.join(configDir, "config.json"), original, "utf8");
  const result = spawnSync(process.execPath, [cliPath, "adapters", "render", "junie", "--project-path", project, "--apply"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(configDir, "config.json"), "utf8"), original);
  assert.equal(fs.existsSync(path.join(project, ".junie", "skills", "orquestrador-maestro", "SKILL.md")), true);
});

test("render applies Goose and OpenHands project artifacts", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-adapter-"));
  for (const adapter of ["goose", "openhands"]) {
    const result = spawnSync(process.execPath, [cliPath, "adapters", "render", adapter, "--project-path", project, "--apply"], { encoding: "utf8" });
    assert.equal(result.status, 0, `${adapter}: ${result.stderr}`);
  }
  assert.equal(fs.existsSync(path.join(project, ".agents", "skills", "orquestrador-maestro", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(project, ".agents", "agents", "orquestrador-maestro.md")), true);
  assert.equal(fs.existsSync(path.join(project, ".openhands", "mcp.json")), false);
});
