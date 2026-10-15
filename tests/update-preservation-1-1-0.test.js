"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

function runInstaller(home) {
  return spawnSync("bash", [path.join(ROOT, "scripts", "install.sh"), "--home-path", home, "--force", "--skip-skill-sync", "--non-interactive"], { encoding: "utf8" });
}

test("1.1.0 (#39): fresh install with --skip-skill-sync still creates native roots + maestro skill", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-fresh-"));
  const res = runInstaller(home);
  assert.equal(res.status, 0, `installer failed: ${res.stderr?.slice(0, 2000)}`);
  for (const rel of [".codex/skills", ".opencode/skills", ".agents/skills", ".claude/skills", ".cursor/skills", ".gemini/skills", ".windsurf/skills", ".antigravity-skills/skills"]) {
    assert.ok(fs.existsSync(path.join(home, rel)), `native root must exist even with --skip-skill-sync: ${rel}`);
  }
  assert.ok(fs.existsSync(path.join(home, ".agents", "skills", "orquestrador-maestro", "SKILL.md")), "freebuff maestro skill must exist even with --skip-skill-sync");
  const maestroRoot = fs.existsSync(path.join(home, ".orquestrador-maestro")) ? path.join(home, ".orquestrador-maestro") : path.join(home, ".orquestrador");
  assert.ok(fs.existsSync(path.join(maestroRoot, "MANAGED_FILES.json")), "MANAGED_FILES.json must be recorded");
});

test("1.1.0 (#38): update preserves custom core files and custom native skills", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-preserve-"));
  assert.equal(runInstaller(home).status, 0);
  const maestroRoot = fs.existsSync(path.join(home, ".orquestrador-maestro")) ? path.join(home, ".orquestrador-maestro") : path.join(home, ".orquestrador");
  // Custom user files inside core + custom native skill.
  fs.writeFileSync(path.join(maestroRoot, "WORKLOG.md"), "# user worklog\n", "utf8");
  fs.mkdirSync(path.join(maestroRoot, "templates"), { recursive: true });
  fs.writeFileSync(path.join(maestroRoot, "templates", "user.md"), "user template\n", "utf8");
  const customSkill = path.join(home, ".agents", "skills", "minha-skill");
  fs.mkdirSync(customSkill, { recursive: true });
  fs.writeFileSync(path.join(customSkill, "SKILL.md"), "---\nname: minha-skill\ndescription: user custom\n---\n", "utf8");
  // Second install = update path (merge, preserve).
  const res2 = runInstaller(home);
  assert.equal(res2.status, 0, `update failed: ${res2.stderr?.slice(0, 2000)}`);
  assert.ok(fs.existsSync(path.join(maestroRoot, "WORKLOG.md")), "WORKLOG.md must survive update");
  assert.ok(fs.existsSync(path.join(maestroRoot, "templates", "user.md")), "templates/user.md must survive update");
  assert.ok(fs.existsSync(path.join(customSkill, "SKILL.md")), "custom native skill must survive update (preserve by default)");
  const manifest2 = JSON.parse(fs.readFileSync(path.join(maestroRoot, "MANAGED_FILES.json"), "utf8"));
  assert.equal(manifest2.version, 2, "upgraded manifests must track source ownership");
  assert.equal(Object.hasOwn(manifest2.files, "WORKLOG.md"), false, "custom files must not become managed");
  assert.equal(Object.hasOwn(manifest2.files, "templates/user.md"), false, "custom nested files must not become managed");


  // Managed files must be REFRESHED on update (not just preserved).
  const managedFile = path.join(maestroRoot, "rules.md");
  const originalContent = fs.readFileSync(managedFile, "utf8");
  // Corrupt the managed file, then re-install — update must restore it from snapshot.
  fs.writeFileSync(managedFile, "CORRUPTED\n", "utf8");
  const res3 = runInstaller(home);
  assert.equal(res3.status, 0, `re-install after corruption failed: ${res3.stderr?.slice(0, 2000)}`);
  assert.notEqual(fs.readFileSync(managedFile, "utf8"), "CORRUPTED\n", "managed file must be refreshed from snapshot on update");
  assert.equal(fs.readFileSync(path.join(maestroRoot, "WORKLOG.md"), "utf8"), "# user worklog\n", "custom file must survive a third install");
  assert.equal(fs.readFileSync(path.join(maestroRoot, "templates", "user.md"), "utf8"), "user template\n", "custom nested file must survive a third install");
  assert.ok(fs.existsSync(path.join(customSkill, "SKILL.md")), "custom skill must survive a third install");

});

test("1.1.0: sync --apply preserves extra-native without --prune", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-sync-"));
  assert.equal(runInstaller(home).status, 0);
  const extra = path.join(home, ".agents", "skills", "extra-user-skill");
  fs.mkdirSync(extra, { recursive: true });
  fs.writeFileSync(path.join(extra, "SKILL.md"), "---\nname: extra-user-skill\ndescription: x\n---\n", "utf8");
  const maestroRoot = fs.existsSync(path.join(home, ".orquestrador-maestro")) ? path.join(home, ".orquestrador-maestro") : path.join(home, ".orquestrador");
  const sync = path.join(maestroRoot, "sync-skills.sh");
  const res = spawnSync("bash", [sync, "--apply", "--home-path", home, "--only", "agents"], { encoding: "utf8" });
  assert.equal(res.status, 0, `sync failed: ${res.stderr?.slice(0, 2000)}`);
  assert.ok(fs.existsSync(path.join(extra, "SKILL.md")), "extra skill must be preserved without --prune");
  assert.match(res.stdout, /extra-native/);
  assert.doesNotMatch(res.stdout, /offloaded/);
});
