#!/usr/bin/env bash
# Explicit local publication, separate from validation. Does not create/move tags
# or bypass hosted CI; caller must record approval and exceptions in #86.
set -euo pipefail
[[ "$#" -eq 4 && "$4" == "--confirm" ]] || { echo "Usage: bash scripts/publish-local-release.sh EVIDENCE_DIR FULL_SHA SHA256 --confirm" >&2; exit 2; }
evidence="$(cd "$1" && pwd -P)"
sha="$2"
checksum="$3"
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$checksum" =~ ^[0-9a-f]{64}$ ]] || { echo "Invalid explicit authorization"; exit 1; }
cd "$(git rev-parse --show-toplevel)"
[[ "$(git rev-parse HEAD)" == "$sha" && -z "$(git status --porcelain)" ]] || { echo "Clean authorized SHA required"; exit 1; }
version="$(node scripts/check-release-version.js)"
[[ "$version" == 1.* ]] || { echo "Local publication supports only the current 1.x line"; exit 1; }
branch="$(node scripts/release-branch-policy.js "$version" "$(git branch --show-current)")"
git fetch origin "$branch"
[[ "$(git rev-parse "origin/$branch")" == "$sha" ]] || { echo "Official release branch is not the authorized SHA"; exit 1; }
artifact="$(node scripts/check-local-release-evidence.js "$evidence" "$sha" "$checksum")"
tag="v$version"
repo="IAPro-Community/Orquestrador-Maestro"
[[ "$(gh api "repos/$repo/git/ref/heads/$branch" --jq '.object.sha')" == "$sha" ]] || { echo "GitHub official branch does not match authorization"; exit 1; }
# Confirm the tag on GitHub directly, not merely an arbitrary local remote.
tag_object="$(gh api "repos/$repo/git/ref/tags/$tag" --jq 'select(.object.type=="tag") | .object.sha')"
[[ "$tag_object" =~ ^[0-9a-f]{40}$ ]] || { echo "Annotated remote tag required"; exit 1; }
tag_commit="$(gh api "repos/$repo/git/tags/$tag_object" --jq 'select(.object.type=="commit") | .object.sha')"
[[ "$tag_commit" == "$sha" ]] || { echo "Remote tag does not match authorization"; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/authorized"
cp "$artifact" "$work/authorized/$(basename "$artifact")"
artifact="$work/authorized/$(basename "$artifact")"
[[ "$(node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' "$artifact")" == "$checksum" ]] || { echo "Artifact changed after evidence validation"; exit 1; }
# Never overwrite an existing GitHub release. Fail before npm effects if its
# metadata or assets do not match the authorized package.
existing=false
if gh api "repos/$repo/releases/tags/$tag" >"$work/existing.json" 2>"$work/gh-error"; then
  existing=true
  node -e 'const r=require(process.argv[1]);if(r.draft||r.tag_name!==process.argv[2]||r.prerelease!==process.argv[2].includes("-"))throw Error("Existing release metadata differs")' "$work/existing.json" "$tag"
  gh release download "$tag" --repo "$repo" --dir "$work" --pattern "$(basename "$artifact")"
  existing_sha="$(node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' "$work/$(basename "$artifact")")"
  [[ "$existing_sha" == "$checksum" ]] || { echo "Existing GitHub release asset differs"; exit 1; }
  gh release download "$tag" --repo "$repo" --dir "$work" --pattern package.sha256
  [[ "$(cat "$work/package.sha256")" == "$checksum" ]] || { echo "Existing GitHub release checksum differs"; exit 1; }
elif ! grep -q 'HTTP 404' "$work/gh-error"; then
  echo "Unable to establish GitHub release state; refusing publication" >&2
  exit 1
fi
# Review the exact SHA, version, checksum and exceptions in #86 before calling.
# The operator's local confirmation is an administrative decision, not a
# cryptographic CI attestation. This script does not run package code.
printf '%s\n' "$checksum" >"$work/package.sha256"
[[ "$(gh api "repos/$repo/git/ref/heads/$branch" --jq '.object.sha')" == "$sha" ]]
bash scripts/publish-validated-npm.sh "$artifact" "$checksum" "$version"
[[ "$(gh api "repos/$repo/git/tags/$tag_object" --jq '.object.sha')" == "$sha" ]]
[[ "$(gh api "repos/$repo/git/ref/tags/$tag" --jq '.object.sha')" == "$tag_object" ]]
if [[ "$existing" == true ]]; then
  echo "Existing GitHub release asset matches; no overwrite."
  exit 0
fi
node - "$version" <<'NODE' >"$work/release-notes.md"
const version=process.argv[2],lines=require("node:fs").readFileSync("CHANGELOG.md","utf8").split(/\r?\n/);
const start=lines.findIndex(line=>line==="## "+version||line.startsWith("## "+version+" "));
if(start<0)throw Error("Missing changelog");
const end=lines.findIndex((line,i)=>i>start&&line.startsWith("## "));
console.log(lines.slice(start+1,end<0?undefined:end).join("\n").trim());
NODE
flags=(--latest)
if [[ "$version" == *-* ]]; then flags=(--prerelease --latest=false); fi
[[ "$(node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' "$artifact")" == "$checksum" ]]
gh release create "$tag" "$artifact" "$work/package.sha256" --repo "$repo" --verify-tag --title "Orquestrador Maestro $tag" --notes-file "$work/release-notes.md" "${flags[@]}"
echo "Authorized publication complete for $sha $checksum"
