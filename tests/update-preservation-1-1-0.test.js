"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runInstaller: runNativeInstaller, runSkillSync } = require("./test-helpers.js");

function runInstaller(home, extraArgs = [], skipSkillSync = true) {
  const onlyIndex = extraArgs.indexOf("--only");
  const only = onlyIndex >= 0 ? [extraArgs[onlyIndex + 1]] : [];
  return runNativeInstaller(home, { force: true, skipSkillSync, only });
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

  const partialHome = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-partial-"));
  const partial = runInstaller(partialHome, ["--only", "codex"], false);
  assert.equal(partial.status, 0, `partial install failed: ${partial.stderr?.slice(0, 2000)}`);
  for (const rel of [".codex/skills", ".opencode/skills", ".agents/skills", ".claude/skills", ".cursor/skills", ".gemini/skills", ".windsurf/skills", ".antigravity-skills/skills"]) {
    assert.ok(fs.existsSync(path.join(partialHome, rel)), `every native root must exist after --only codex: ${rel}`);
  }
  for (const rel of [".codex/skills", ".opencode/skills", ".agents/skills", ".claude/skills", ".cursor/skills", ".gemini/skills", ".windsurf/skills", ".antigravity-skills/skills"]) {
    assert.ok(fs.existsSync(path.join(partialHome, rel, "orquestrador-maestro", "SKILL.md")), `shared skill must exist in ${rel}`);
  }
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
  assert.equal(manifest2.version, 3, "upgraded manifests must track source ownership and overrides");
  assert.equal(Object.hasOwn(manifest2.files, "WORKLOG.md"), false, "custom files must not become managed");
  assert.equal(Object.hasOwn(manifest2.files, "templates/user.md"), false, "custom nested files must not become managed");


  // A customized official file remains active. The current package copy and
  // a file-level report are kept beside the rollback snapshot for review.
  const managedFile = path.join(maestroRoot, "rules.md");
  fs.writeFileSync(managedFile, "# user-customized rules\n", "utf8");
  const res3 = runInstaller(home);
  assert.equal(res3.status, 0, `re-install after customization failed: ${res3.stderr?.slice(0, 2000)}`);
  assert.equal(fs.readFileSync(managedFile, "utf8"), "# user-customized rules\n", "managed customization must remain active");
  assert.equal(fs.readFileSync(path.join(maestroRoot, "WORKLOG.md"), "utf8"), "# user worklog\n", "custom file must survive a third install");
  assert.equal(fs.readFileSync(path.join(maestroRoot, "templates", "user.md"), "utf8"), "user template\n", "custom nested file must survive a third install");
  assert.ok(fs.existsSync(path.join(customSkill, "SKILL.md")), "custom skill must survive a third install");
  const backups = fs.readdirSync(path.join(home, ".orquestrador-public-backups")).sort();
  const latestBackup = path.join(home, ".orquestrador-public-backups", backups.at(-1));
  const reportPath = path.join(latestBackup, "update-artifacts", "update-report.json");
  assert.ok(fs.existsSync(reportPath), "update must write a before/after report beside the rollback snapshot");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.ok(report.preservedManagedOverrides.some((entry) => entry.path === "rules.md"));
  assert.ok(fs.existsSync(path.join(latestBackup, "update-artifacts", "upstream-overrides", "rules.md")));
  assert.equal(report.versions.current.managedFiles, 3);

});

test("1.1.0: sync --apply preserves extra-native without --prune", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-sync-"));
  assert.equal(runInstaller(home).status, 0);
  const extra = path.join(home, ".agents", "skills", "extra-user-skill");
  fs.mkdirSync(extra, { recursive: true });
  fs.writeFileSync(path.join(extra, "SKILL.md"), "---\nname: extra-user-skill\ndescription: x\n---\n", "utf8");
  const maestroRoot = fs.existsSync(path.join(home, ".orquestrador-maestro")) ? path.join(home, ".orquestrador-maestro") : path.join(home, ".orquestrador");
  const sync = path.join(maestroRoot, "sync-skills.sh");
  const res = runSkillSync(sync, home, { only: "agents" });
  assert.equal(res.status, 0, `sync failed: ${res.stderr?.slice(0, 2000)}`);
  assert.ok(fs.existsSync(path.join(extra, "SKILL.md")), "extra skill must be preserved without --prune");
  assert.match(res.stdout, /extra-native/);
  assert.doesNotMatch(res.stdout, /offloaded/);
});


test("legacy v1 manifest listing a personal file never loses that file on staged upgrade", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-legacy-upgrade-"));
  assert.equal(runInstaller(home).status, 0, "initial installation must succeed");
  const maestroRoot = fs.existsSync(path.join(home, ".orquestrador-maestro"))
    ? path.join(home, ".orquestrador-maestro") : path.join(home, ".orquestrador");
  const worklog = path.join(maestroRoot, "WORKLOG.md");
  const personal = path.join(maestroRoot, "templates", "user-preserved.md");
  fs.writeFileSync(worklog, "personal worklog\n");
  fs.mkdirSync(path.dirname(personal), { recursive: true });
  fs.writeFileSync(personal, "personal template\n");

  const manifest = JSON.parse(fs.readFileSync(path.join(maestroRoot, "MANAGED_FILES.json"), "utf8"));
  manifest.version = 1;
  manifest.files = Object.fromEntries(Object.entries(manifest.files).map(([rel, metadata]) => [rel, { sha256: metadata.sourceSha256 }]));
  manifest.files["WORKLOG.md"] = { sha256: "0".repeat(64) };
  manifest.files["templates/user-preserved.md"] = { sha256: "0".repeat(64) };
  fs.writeFileSync(path.join(maestroRoot, "MANAGED_FILES.json"), JSON.stringify(manifest));

  const upgrade = runInstaller(home);
  assert.equal(upgrade.status, 0, upgrade.stderr?.slice(0, 2500));
  assert.equal(fs.readFileSync(worklog, "utf8"), "personal worklog\n");
  assert.equal(fs.readFileSync(personal, "utf8"), "personal template\n");
  assert.equal(JSON.parse(fs.readFileSync(path.join(maestroRoot, "MANAGED_FILES.json"), "utf8")).version, 3);

  const third = runInstaller(home);
  assert.equal(third.status, 0, third.stderr?.slice(0, 2500));
  assert.equal(fs.readFileSync(worklog, "utf8"), "personal worklog\n");
  assert.equal(fs.readFileSync(personal, "utf8"), "personal template\n");
});
