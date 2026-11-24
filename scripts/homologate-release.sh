#!/usr/bin/env bash
# Run from a clean checkout as an ordinary user. Does not create tags or publish.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
expected="${1:-}"
[[ "$expected" =~ ^[0-9a-f]{40}$ ]] || { echo "Usage: bash scripts/homologate-release.sh FULL_SHA" >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$expected" ]] || { echo "HEAD differs from requested SHA" >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Clean checkout required" >&2; exit 1; }
command -v pwsh >/dev/null || { echo "PowerShell is required for full public and skill validation; no degraded release evidence" >&2; exit 1; }
version="$(node scripts/check-release-version.js)"
branch=main
[[ "$version" != 1.* ]] || branch=v1
git fetch origin "$branch"
git merge-base --is-ancestor "origin/$branch" "$expected" || { echo "Candidate must descend from release line" >&2; exit 1; }
artifact="$(mktemp -d "${TMPDIR:-/tmp}/maestro-release.XXXXXXXX")"
echo "Evidence directory: $artifact"
npm ci
VERIFY_BASE_REF="origin/$branch" npm run verify:pr
npm run skills:contract-audit:strict
npm run validate:paths
pwsh -NoProfile -File scripts/validate-public.ps1
pwsh -NoProfile -File scripts/validate-skills.ps1
npm audit --audit-level=high
npm ci --prefix site
npm audit --prefix site --audit-level=high
[[ "$(git rev-parse HEAD)" == "$expected" && -z "$(git status --porcelain)" ]] || { echo "Checkout changed during validation" >&2; exit 1; }
npm pack --json --pack-destination "$artifact" > "$artifact/pack.json"
tarball="$(node -e 'const p=require(process.argv[1]);if(p.length!==1||!p[0].filename.endsWith(".tgz"))process.exit(1);process.stdout.write(p[0].filename)' "$artifact/pack.json")"
[[ "$tarball" != */* && -f "$artifact/$tarball" ]]
smoke="$(mktemp -d "${TMPDIR:-/tmp}/maestro-smoke.XXXXXXXX")"
trap 'rm -rf "$smoke"' EXIT
mkdir -p "$smoke/home"
npm install --global --prefix "$smoke/prefix" "$artifact/$tarball"
cli="$smoke/prefix/bin/orquestrador-maestro"
[[ "$("$cli" version)" == "$version" ]]
"$cli" install --home-path "$smoke/home" --non-interactive --skip-desktop-plugin
"$cli" verify --home-path "$smoke/home"
ORQUESTRADOR_MAESTRO_SKIP_CLI_UPDATE=1 "$cli" update --home-path "$smoke/home" --non-interactive --skip-desktop-plugin
"$cli" verify --home-path "$smoke/home"
[[ "$(git rev-parse HEAD)" == "$expected" && -z "$(git status --porcelain)" ]]
node - "$artifact" "$tarball" "$expected" "$version" <<'NODE'
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), os = require("node:os");
const [dir, file, sha, version] = process.argv.slice(2);
const bytes = fs.readFileSync(path.join(dir, file));
const report = {
  schemaVersion: 1, status: "LOCAL_GATES_PASSED", sha, version,
  platform: process.platform, arch: process.arch, node: process.version,
  createdAt: new Date().toISOString(),
  artifact: { filename: file, sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    integrity: "sha512-" + crypto.createHash("sha512").update(bytes).digest("base64") },
  checks: ["check-release-version", "verify:pr", "skills:contract-audit:strict", "validate:paths", "validate-public.ps1", "validate-skills.ps1",
    "npm audit", "site npm ci/audit", "tarball install/verify/update/verify"],
  notCovered: ["other OS/Node versions", "CodeQL", "real provider homologation", "registry publication", "maintainer authorization"]
};
fs.writeFileSync(path.join(dir, "EVIDENCE.json"), JSON.stringify(report, null, 2) + "\n", {flag:"wx"});
console.log(JSON.stringify(report, null, 2));
NODE
echo "Local gates passed; no tag, npm publication or GitHub release created."
