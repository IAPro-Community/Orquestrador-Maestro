"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runInstaller, runVerifier } = require("./test-helpers.js");

test("update replaces an untracked v1 skill policy with v2 and verifies the installed core", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-policy-migration-"));
  const initial = runInstaller(home, { force: true, skipSkillSync: true });
  assert.equal(initial.status, 0, `initial install failed: ${initial.stderr?.slice(0, 2000)}`);

  const maestroRoot = path.join(home, ".orquestrador");
  const policyPath = path.join(maestroRoot, "SKILL_INSTALL_POLICY.json");
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  policy.version = 1;
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
  fs.rmSync(path.join(maestroRoot, "MANAGED_FILES.json"));

  const update = runInstaller(home, { force: true, skipSkillSync: true });
  assert.equal(update.status, 0, `update failed: ${update.stderr?.slice(0, 2500)}`);
  assert.equal(JSON.parse(fs.readFileSync(policyPath, "utf8")).version, 2);

  const verify = runVerifier(home, { skipToolProfiles: true });
  assert.equal(verify.status, 0, `core verification failed: ${verify.stdout?.slice(0, 2500)} ${verify.stderr?.slice(0, 1200)}`);

  const backupRoot = path.join(home, ".orquestrador-public-backups");
  const backups = fs.readdirSync(backupRoot).sort();
  const latestBackup = path.join(backupRoot, backups.at(-1));
  const report = JSON.parse(fs.readFileSync(path.join(latestBackup, "update-artifacts", "update-report.json"), "utf8"));
  assert.deepEqual(report.migratedPackageFiles, [{
    path: "SKILL_INSTALL_POLICY.json",
    fromVersion: 1,
    toVersion: 2
  }]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(latestBackup, ".orquestrador", "SKILL_INSTALL_POLICY.json"), "utf8")).version, 1);
});
