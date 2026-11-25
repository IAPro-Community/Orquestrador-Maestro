#!/usr/bin/env bash
# Shared registry publication engine. Call ONLY from an already authorized
# release workflow or scripts/publish-local-release.sh. No authorization bypass.
set -euo pipefail
[[ "$#" -eq 3 ]] || { echo "Usage: publish-validated-npm.sh TARBALL SHA256 VERSION" >&2; exit 2; }
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
artifact="$1"
expected="$2"
expected_version="$3"
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo "Invalid expected checksum" >&2; exit 1; }
[[ -f "$artifact" && ! -L "$artifact" ]] || { echo "Invalid release artifact" >&2; exit 1; }
sha256() { node -e 'const fs=require("node:fs"),crypto=require("node:crypto"); console.log(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$1"; }
[[ "$(sha256 "$artifact")" == "$expected" ]] || { echo "Artifact checksum mismatch" >&2; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
TARBALL="$(basename "$artifact")"
[[ "$TARBALL" =~ ^iapro-orquestrador-maestro-cli-[0-9A-Za-z.-]+\.tgz$ ]] || { echo "Invalid tarball name" >&2; exit 1; }
cp "$artifact" "$work/$TARBALL"
cd "$work"
[[ "$(sha256 "$TARBALL")" == "$expected" ]]
export npm_config_registry=https://registry.npmjs.org/
export npm_config_fetch_retries=0
export npm_config_fetch_timeout=30000
export npm_config_ignore_scripts=true
scope_registry="$(npm config get @iapro:registry)"
[[ "$scope_registry" == "undefined" || "$scope_registry" == "null" || "$scope_registry" == "https://registry.npmjs.org/" || "$scope_registry" == "https://registry.npmjs.org" ]] || { echo "Unexpected scope registry" >&2; exit 1; }
version="$(tar -xOf "$TARBALL" package/package.json | node -e 'const p=JSON.parse(require("node:fs").readFileSync(0,"utf8"));if(p.name!=="@iapro/orquestrador-maestro-cli")throw Error("Unexpected package");if(p.publishConfig?.registry&&!/^https:\/\/registry\.npmjs\.org\/?$/.test(p.publishConfig.registry))throw Error("Unexpected publish registry");process.stdout.write(p.version)')"
[[ "$version" == "$expected_version" && "$TARBALL" == "iapro-orquestrador-maestro-cli-$version.tgz" ]] || { echo "Artifact version mismatch" >&2; exit 1; }

dist_tag="latest"
case "$version" in
  *-alpha.*) dist_tag="alpha" ;;
  *-beta.*) dist_tag="beta" ;;
  *-rc.*) dist_tag="next" ;;
  *-*) dist_tag="next" ;;
esac
echo "Publishing $version with npm dist-tag $dist_tag"
package="@iapro/orquestrador-maestro-cli"
update_dist_tag() {
  local tag_name="$1" current_version
  current_version="$(npm view "$package" "dist-tags.$tag_name" --prefer-online)"
  node "$script_dir/release-channel-policy.js" "$tag_name" "$current_version" "$version"
  if [[ "$current_version" == "$version" ]]; then
    echo "npm dist-tag $tag_name already points to $version."
    return 0
  fi
  if npm dist-tag add "$package@$version" "$tag_name"; then
    return 0
  fi
  if [[ -n "${NODE_AUTH_TOKEN:-}" ]]; then
    echo "Retrying dist-tag update with the configured npm-release token."
    env -u ACTIONS_ID_TOKEN_REQUEST_URL -u ACTIONS_ID_TOKEN_REQUEST_TOKEN npm dist-tag add "$package@$version" "$tag_name"
  else
    return 1
  fi
}
artifact_integrity="$(node -e "const fs=require('node:fs'),crypto=require('node:crypto'); console.log('sha512-'+crypto.createHash('sha512').update(fs.readFileSync(process.argv[1])).digest('base64'))" "./$TARBALL")"
registry_value() {
  node -e "let value=JSON.parse(process.argv[1]); if(Array.isArray(value)&&value.length===1)value=value[0]; if(typeof value!=='string')throw new Error('Invalid registry response'); process.stdout.write(value)" "$1"
}
# A failed registry request is not proof that a version is absent.
err_file="$work/registry-error"
if published_integrity="$(npm view "$package@$version" dist.integrity --json --prefer-online 2>"$err_file")"; then
  published_integrity="$(registry_value "$published_integrity")"
  [[ "$published_integrity" == "$artifact_integrity" ]] || { echo "Existing version differs from validated artifact"; exit 1; }
elif grep -qE '(^|[^A-Z0-9])E404([^A-Z0-9]|$)' "$err_file"; then
  # All channels are staged before promotion, including RCs.
  publish_tag=staged
  npm publish "./$TARBALL" --registry=https://registry.npmjs.org/ --ignore-scripts --access public --tag "$publish_tag"
else
  echo "Registry lookup failed; refusing to publish."
  exit 1
fi
rm -f "$err_file"

# Registry propagation can lag behind successful npm publish. Never
# publish twice; confirm exact integrity and retrieve the same bytes.
deadline=$((SECONDS + 1200))
delay=5
while true; do
  if raw="$(npm view "$package@$version" dist.integrity --json --prefer-online 2>/dev/null)" &&
     actual="$(registry_value "$raw" 2>/dev/null)"; then
    [[ "$actual" == "$artifact_integrity" ]] || { echo "Registry integrity mismatch"; exit 1; }
    break
  fi
  (( SECONDS < deadline )) || { echo "Timed out waiting for npm registry visibility"; exit 1; }
  sleep "$delay"
  delay=$((delay < 30 ? delay * 2 : 30))
done
registry_dir="$work/registry"
mkdir "$registry_dir"
while ! npm pack "$package@$version" --ignore-scripts --prefer-online --pack-destination "$registry_dir" >/dev/null 2>&1; do
  (( SECONDS < deadline )) || { echo "Timed out fetching registry tarball"; exit 1; }
  sleep 15
done
[[ "$(sha256 "$registry_dir/$TARBALL")" == "$expected" ]] || { echo "Registry tarball checksum mismatch" >&2; exit 1; }
# The identical tarball was smoke-tested before authorization. Do not run
# package code or lifecycle scripts in the credential-bearing process.

# Re-read and validate each channel immediately before promotion.
update_dist_tag "$dist_tag"
confirm_tag() {
  local tag_name="$1" deadline=$((SECONDS + 1200)) current
  while true; do
    current="$(npm view "$package" "dist-tags.$tag_name" --prefer-online 2>/dev/null || true)"
    [[ "$current" == "$version" ]] && return 0
    (( SECONDS < deadline )) || { echo "Timed out confirming dist-tag $tag_name"; return 1; }
    sleep 15
  done
}
confirm_tag "$dist_tag"
# Graduate RC users only if next still targets this release line.
if [[ "$dist_tag" == latest ]]; then
  next_version="$(npm view "$package" dist-tags.next --prefer-online)"
  if [[ "$next_version" == "$version"-rc.* ]]; then
    update_dist_tag next
    confirm_tag next
  fi
fi
if [[ "$version" == "1.0.0" ]]; then
  update_dist_tag beta
  confirm_tag beta
fi
