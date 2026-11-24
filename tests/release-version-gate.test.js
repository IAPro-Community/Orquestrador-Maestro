"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { checkReleaseVersion } = require("../scripts/check-release-version");

test("release version gate validates all manifests and refuses stale versions", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-release-version-"));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const version = "1.2.0-rc.2";
  const files = {
    "package.json": JSON.stringify({version}),
    "package-lock.json": JSON.stringify({version, packages:{"":{version}}}),
    "plugins/maestro-openai/plugin.json": JSON.stringify({version}),
    "plugins/maestro-openai/.codex-plugin/plugin.json": JSON.stringify({version}),
    "docs/product/CAPABILITY_MATRIX.json": JSON.stringify({product:{packageVersion:version}}),
    "scripts/bootstrap-install.sh": 'PACKAGE_VERSION="'+version+'"\n',
    "scripts/bootstrap-install.ps1": '$packageVersion = "'+version+'"\n',
    "CHANGELOG.md": "## "+version+" - 2026-01-01\n"
  };
  function write(name, content) {
    const destination = path.join(root, name);
    fs.mkdirSync(path.dirname(destination), {recursive:true});
    fs.writeFileSync(destination, content);
  }
  for (const [name, content] of Object.entries(files)) write(name,content);
  assert.equal(checkReleaseVersion(root, version),version);
  assert.throws(() => checkReleaseVersion(root, "1.2.0"), /Requested version/);
  for (const [name, content] of Object.entries(files)) {
    if (name === "package.json") continue;
    write(name, content.replaceAll(version,"1.2.0-rc.20"));
    assert.throws(() => checkReleaseVersion(root, version), /mismatch|Missing changelog/);
    write(name, content);
  }
});
