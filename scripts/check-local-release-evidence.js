"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { checkReleaseVersion } = require("./check-release-version");
const REQUIRED_CHECKS = [
  "check-release-version", "verify:pr", "skills:contract-audit:strict", "validate:paths",
  "validate-public.ps1", "validate-skills.ps1", "npm audit", "site npm ci/audit",
  "tarball install/verify/update/verify", "benchmark typecheck/tests"
];
function checkEvidence({dir, sha, checksum, version}) {
  if (!/^[0-9a-f]{40}$/.test(sha || "") || !/^[0-9a-f]{64}$/.test(checksum || "")) throw Error("Full SHA and artifact SHA-256 required");
  const root = path.resolve(dir);
  const evidencePath = path.join(root,"EVIDENCE.json");
  const info = fs.lstatSync(evidencePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 64*1024) throw Error("Invalid evidence file");
  const row = JSON.parse(fs.readFileSync(evidencePath,"utf8"));
  const name = "iapro-orquestrador-maestro-cli-"+version+".tgz";
  if (row.schemaVersion !== 1 || row.status !== "LOCAL_GATES_PASSED" ||
      row.sha !== sha || row.version !== version || row.artifact?.filename !== name ||
      row.artifact?.sha256 !== checksum || !Array.isArray(row.checks) ||
      REQUIRED_CHECKS.some(check=>!row.checks.includes(check))) throw Error("Evidence does not match authorized SHA, version, checksum or required gates");
  const file = path.join(root,name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256*1024*1024) throw Error("Invalid evidence artifact");
  const bytes = fs.readFileSync(file);
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  const integrity = "sha512-"+crypto.createHash("sha512").update(bytes).digest("base64");
  if (actual !== checksum || integrity !== row.artifact.integrity) throw Error("Artifact integrity mismatch");
  return file;
}
if (require.main === module) {
  try {
    const [dir,sha,checksum] = process.argv.slice(2);
    const version = checkReleaseVersion(path.resolve(__dirname,".."));
    console.log(checkEvidence({dir,sha,checksum,version}));
  } catch(error) { console.error("Local release gate: "+error.message); process.exitCode=1; }
}
module.exports = { checkEvidence, REQUIRED_CHECKS };
