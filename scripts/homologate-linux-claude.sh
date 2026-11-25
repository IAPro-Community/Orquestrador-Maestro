#!/usr/bin/env bash
# Homologation for issue #44 on Linux/Unix with Claude Code.
#
# Runs the seven acceptance items against a throwaway HOME so the real user
# home is never mutated, and writes a machine-readable EVIDENCE.json.
#
# Usage:
#   bash scripts/homologate-linux-claude.sh [--output DIR]
#
# Exit code: 0 only when every case passes.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT_DIR/bin/orquestrador-maestro.js"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
OUTPUT_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --output) OUTPUT_DIR="${2:-}"; shift 2 ;;
    --output=*) OUTPUT_DIR="${1#*=}"; shift ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$NODE_BIN" ]; then
  echo "node is required" >&2
  exit 2
fi

OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/.homologation/linux-claude}"
mkdir -p "$OUTPUT_DIR"
RESULTS_FILE="$OUTPUT_DIR/.cases.tsv"
: > "$RESULTS_FILE"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maestro-homologation-XXXXXX")"
TEMP_HOME="$WORK_DIR/home"
mkdir -p "$TEMP_HOME"
REAL_HOME="${HOME:-}"
LOG_DIR="$OUTPUT_DIR/logs"
mkdir -p "$LOG_DIR"
CASES_RUN=0
CASES_FAILED=0

cleanup() {
  if [ "${KEEP_HOMOLOGATION_HOME:-0}" != "1" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

record() {
  # $1 = id, $2 = PASS|FAIL, $3 = detail (single line, tabs stripped)
  local detail
  detail="$(printf '%s' "${3:-}" | tr '\t\n' '  ' | cut -c1-600)"
  printf '%s\t%s\t%s\n' "$1" "$2" "$detail" >> "$RESULTS_FILE"
  CASES_RUN=$((CASES_RUN + 1))
  if [ "$2" != "PASS" ]; then
    CASES_FAILED=$((CASES_FAILED + 1))
  fi
  printf '  %-32s %s %s\n' "$1" "$2" "$detail"
}

run_cli() {
  # Runs the CLI with an isolated PATH that never contains pwsh/powershell.
  PATH="$SANDBOX_BIN" "$NODE_BIN" "$CLI" "$@"
}

build_sandbox_bin() {
  SANDBOX_BIN="$WORK_DIR/bin"
  mkdir -p "$SANDBOX_BIN"
  # Mirror every executable of the current PATH EXCEPT PowerShell. Keeping the
  # real CLIs (claude, codex, opencode) preserves tool detection, so the
  # evidence reflects a real home; only PowerShell is removed.
  local dir cmd path base
  local IFS_SAVE="$IFS"
  IFS=':'
  for dir in $PATH; do
    [ -d "$dir" ] || continue
    for path in "$dir"/*; do
      [ -f "$path" ] && [ -x "$path" ] || continue
      base="$(basename "$path")"
      case "$base" in
        pwsh|powershell|pwsh.exe|powershell.exe) continue ;;
      esac
      [ -e "$SANDBOX_BIN/$base" ] && continue
      ln -sf "$path" "$SANDBOX_BIN/$base" 2>/dev/null || true
    done
  done
  IFS="$IFS_SAVE"
  # Commands that may live outside the PATH entries (defensive, non-fatal).
  for cmd in node npm git bash sh env grep sed awk cat head tail mkdir rm cp mv sort find \
             dirname basename ls uname id which tar gzip curl python3 expr tr cut wc date \
             sleep chmod touch diff cmp; do
    path="$(command -v "$cmd" 2>/dev/null || true)"
    if [ -n "$path" ] && [ ! -e "$SANDBOX_BIN/$cmd" ]; then ln -sf "$path" "$SANDBOX_BIN/$cmd"; fi
  done
}

echo "homologate-linux-claude — issue #44 acceptance"
echo "repo:   $ROOT_DIR"
echo "output: $OUTPUT_DIR"
echo "home:   $TEMP_HOME (throwaway)"
echo ""

build_sandbox_bin
if PATH="$SANDBOX_BIN" command -v pwsh >/dev/null 2>&1; then
  echo "sandbox still exposes pwsh; the portable-doctor case would be meaningless" >&2
  exit 2
fi

# Claude Code is not installed on most CI runners. When the operator opts in
# explicitly, a stub executable keeps the install/detection path realistic and
# the evidence states plainly that a stub was used instead of the real CLI.
CLAUDE_EVIDENCE="unavailable"
install_claude_stub() {
  # Remove the mirrored symlink first: writing through it would touch the real
  # Claude Code installation.
  rm -f "$SANDBOX_BIN/claude"
  printf '#!/bin/sh\necho "claude-code stub for homologation"\n' > "$SANDBOX_BIN/claude"
  chmod +x "$SANDBOX_BIN/claude"
}
if [ "${MAESTRO_HOMOLOGATION_FORCE_STUB:-0}" = "1" ]; then
  install_claude_stub
  CLAUDE_EVIDENCE="stub (forced fake claude executable; real Claude Code CLI absent)"
elif command -v claude >/dev/null 2>&1; then
  CLAUDE_EVIDENCE="$(claude --version 2>/dev/null | head -1 || echo present)"
elif [ "${MAESTRO_HOMOLOGATION_FAKE_CLAUDE:-0}" = "1" ]; then
  install_claude_stub
  CLAUDE_EVIDENCE="stub (fake claude executable; real Claude Code CLI absent)"
fi
echo "claude:  $CLAUDE_EVIDENCE"

########## Case 1: install into a throwaway HOME without sudo ##########
if run_cli install --home-path "$TEMP_HOME" --non-interactive \
    --skip-skill-sync --skip-community-skills --skip-desktop-plugin \
    > "$LOG_DIR/install.log" 2>&1; then
  if grep -q "sudo" "$LOG_DIR/install.log"; then
    record "install-into-temp-home" "FAIL" "install output mentioned sudo"
  else
    record "install-into-temp-home" "PASS" "exit 0, no sudo mentioned"
  fi
else
  record "install-into-temp-home" "FAIL" "install exited non-zero; see logs/install.log"
fi

########## Case 2: npm prefix diagnostic without sudo or prefix mutation ##########
readonly_prefix="$WORK_DIR/readonly-prefix"
mkdir -p "$readonly_prefix"
chmod 555 "$readonly_prefix"
prefix_before="unreadable"
guidance="$("$NODE_BIN" -e '
const { npmPermissionHint } = require(process.argv[1]);
const hint = npmPermissionHint({ stderr: "npm error code EACCES" });
if (!hint || /sudo\s+npm\s+install\s+-g/iu.test(hint)) process.exit(1);
process.stdout.write(hint);
' "$ROOT_DIR/orquestrador/lib/install-diagnostics.js" 2>/dev/null)"
guidance_status=$?
if npm_config_prefix="$readonly_prefix" run_cli doctor --home-path "$TEMP_HOME" \
    > "$LOG_DIR/doctor-prefix.log" 2>&1; then
  if [ "$guidance_status" -ne 0 ] || [ -z "$guidance" ]; then
    record "npm-prefix-diagnostic" "FAIL" "EACCES guidance is missing or recommends sudo"
  elif grep -qi "sudo" "$LOG_DIR/doctor-prefix.log"; then
    record "npm-prefix-diagnostic" "FAIL" "diagnostic told the user to run sudo"
  elif [ -w "$readonly_prefix" ] && [ "$(id -u)" != "0" ]; then
    record "npm-prefix-diagnostic" "FAIL" "prefix still writable; the read-only setup was ineffective"
  else
    record "npm-prefix-diagnostic" "PASS" "EACCES guidance is actionable; doctor survives an unwritable prefix without sudo"
  fi
else
  record "npm-prefix-diagnostic" "FAIL" "doctor failed with an unwritable npm prefix; see logs/doctor-prefix.log"
fi
chmod 755 "$readonly_prefix" 2>/dev/null || true

########## Case 3: doctor runs on Unix without PowerShell ##########
if run_cli doctor --home-path "$TEMP_HOME" > "$LOG_DIR/doctor-portable.log" 2>&1; then
  if grep -q "modo portável" "$LOG_DIR/doctor-portable.log" \
      && grep -q "Install verification passed" "$LOG_DIR/doctor-portable.log"; then
    record "doctor-portable-unix" "PASS" "native Unix fallback used; install verification passed"
  else
    record "doctor-portable-unix" "FAIL" "doctor did not report the portable Unix path; see logs/doctor-portable.log"
  fi
else
  record "doctor-portable-unix" "FAIL" "doctor exited non-zero without PowerShell; see logs/doctor-portable.log"
fi

########## Case 4: targets add + targets list --json coherence ##########
run_cli targets add claude --home-path "$TEMP_HOME" --non-interactive > "$LOG_DIR/targets-add.log" 2>&1
targets_status=$?
if run_cli targets list --json --home-path "$TEMP_HOME" > "$LOG_DIR/targets-list.json" 2> "$LOG_DIR/targets-list.err"; then
  coherence="$("$NODE_BIN" -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const detection = new Set(["detected", "configured", "not-detected", "missing"]);
const configuration = new Set(["present", "absent", "partial", "maestro-managed"]);
const enabled = new Set(["yes", "no"]);
const problems = [];
if (report.schemaVersion !== 1) problems.push("schemaVersion != 1");
if (!Array.isArray(report.targets) || report.targets.length === 0) problems.push("no targets");
for (const target of report.targets || []) {
  if (!detection.has(String(target.Detection))) problems.push(target.ToolId + ": bad Detection");
  if (!configuration.has(String(target.Configuration))) problems.push(target.ToolId + ": bad Configuration");
  if (!enabled.has(String(target.Enabled))) problems.push(target.ToolId + ": bad Enabled");
  if (typeof target.DetectionReason !== "string" || target.DetectionReason.length === 0) {
    problems.push(target.ToolId + ": missing DetectionReason");
  }
}
const claude = (report.targets || []).find((t) => t.ToolId === "claude");
if (!claude) problems.push("claude target missing");
else {
  if (claude.Enabled !== "yes") problems.push("claude not enabled after targets add");
  if (claude.Detection !== "detected" && claude.Detection !== "configured") {
    problems.push("claude detection regressed to " + claude.Detection + " after targets add");
  }
  if (claude.Configuration !== "maestro-managed") {
    problems.push("claude configuration is " + claude.Configuration + ", expected maestro-managed");
  }
}
process.stdout.write(problems.length === 0 ? "ok" : problems.join("; "));
' "$LOG_DIR/targets-list.json")"
  if [ "$targets_status" -ne 0 ]; then
    record "targets-json-coherent" "FAIL" "targets add claude exited $targets_status"
  elif [ "$coherence" = "ok" ]; then
    record "targets-json-coherent" "PASS" "detection/configuration/enabled coherent; claude enabled"
  else
    record "targets-json-coherent" "FAIL" "$coherence"
  fi
else
  record "targets-json-coherent" "FAIL" "targets list --json failed; see logs/targets-list.err"
fi

########## Case 5: Claude skill content is host-neutral ##########
claude_skill="$TEMP_HOME/.claude/skills/orquestrador-maestro/SKILL.md"
if [ -f "$claude_skill" ]; then
  problems=""
  grep -q "Codex is the orquestrador" "$claude_skill" && problems="$problems codex-specific-role"
  grep -q "~/.codex/skills" "$claude_skill" && problems="$problems codex-skill-root"
  grep -q "active client" "$claude_skill" || problems="$problems missing-host-neutral-wording"
  if [ -z "$problems" ]; then
    record "claude-skill-host-neutral" "PASS" "host-neutral wording, no Codex-only role or skill root"
  else
    record "claude-skill-host-neutral" "FAIL" "$problems"
  fi
else
  record "claude-skill-host-neutral" "FAIL" "~/.claude/skills/orquestrador-maestro/SKILL.md missing"
fi

########## Case 6: no absolute user home path leaks into generated files ##########
leaked=""
if [ -n "$REAL_HOME" ] && [ "$REAL_HOME" != "/" ]; then
  leaked="$(grep -rIl -- "$REAL_HOME" "$TEMP_HOME" 2>/dev/null | head -5 | tr '\n' ' ')"
fi
if [ -z "$leaked" ]; then
  record "no-absolute-user-paths" "PASS" "no real-home path in generated files"
else
  record "no-absolute-user-paths" "FAIL" "absolute user path in: $leaked"
fi

########## Case 7: Claude hooks stay textual ##########
settings="$TEMP_HOME/.claude/settings.json"
hooks_doc="$TEMP_HOME/.claude/hooks.md"
problems=""
[ -f "$hooks_doc" ] || problems="$problems missing-hooks.md"
if [ -f "$settings" ] && grep -q '"hooks"' "$settings"; then
  problems="$problems executable-hooks-registered"
fi
grep -q "not a registered Claude Code executable hook" "$hooks_doc" 2>/dev/null \
  || problems="$problems hooks-doc-not-explicit"
if [ -z "$problems" ]; then
  record "claude-hooks-textual" "PASS" "hooks remain textual guidance; no executable hooks installed"
else
  record "claude-hooks-textual" "FAIL" "$problems"
fi

########## Case 8: new-session notice is emitted ##########
if grep -qi "sessão nova" "$LOG_DIR/install.log" || grep -qi "sessão nova" "$LOG_DIR/doctor-portable.log"; then
  record "new-session-notice" "PASS" "install/doctor tell the operator to open a new Claude session"
else
  record "new-session-notice" "FAIL" "no new-session guidance in install or doctor output"
fi

########## EVIDENCE.json ##########
repository_sha="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
repository_branch="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || echo unknown)"
package_version="$("$NODE_BIN" -e 'try{process.stdout.write(require(process.argv[1]).version)}catch{process.stdout.write("unknown")}' "$ROOT_DIR/package.json")"
node_version="$("$NODE_BIN" --version)"
pwsh_version="$(command -v pwsh >/dev/null 2>&1 && pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()' 2>/dev/null || echo unavailable)"
claude_version="$CLAUDE_EVIDENCE"

export MAESTRO_EVIDENCE_SHA="$repository_sha"
export MAESTRO_EVIDENCE_BRANCH="$repository_branch"
export MAESTRO_EVIDENCE_VERSION="$package_version"
export MAESTRO_EVIDENCE_OS="$(uname -srm 2>/dev/null || echo unknown)"
export MAESTRO_EVIDENCE_NODE="$node_version"
export MAESTRO_EVIDENCE_PWSH="$pwsh_version"
export MAESTRO_EVIDENCE_CLAUDE="$claude_version"
export MAESTRO_EVIDENCE_HOME="$TEMP_HOME"

"$NODE_BIN" -e '
const fs = require("node:fs");
const [resultsFile, outFile] = process.argv.slice(1);
const cases = fs.readFileSync(resultsFile, "utf8").split("\n").filter(Boolean).map((line) => {
  const [id, status, detail] = line.split("\t");
  return { id, status, detail: detail || "" };
});
const failed = cases.filter((item) => item.status !== "PASS");
const evidence = {
  schemaVersion: 1,
  issue: 44,
  generatedAt: new Date().toISOString(),
  repository: {
    sha: process.env.MAESTRO_EVIDENCE_SHA,
    branch: process.env.MAESTRO_EVIDENCE_BRANCH,
    packageVersion: process.env.MAESTRO_EVIDENCE_VERSION
  },
  environment: {
    platform: process.platform,
    arch: process.arch,
    os: process.env.MAESTRO_EVIDENCE_OS,
    node: process.env.MAESTRO_EVIDENCE_NODE,
    powershell: process.env.MAESTRO_EVIDENCE_PWSH,
    claude: process.env.MAESTRO_EVIDENCE_CLAUDE,
    isolatedPathWithoutPowerShell: true,
    throwawayHome: process.env.MAESTRO_EVIDENCE_HOME
  },
  cases,
  totals: { cases: cases.length, passed: cases.length - failed.length, failed: failed.length },
  verdict: failed.length === 0 ? "PASS" : "FAIL"
};
fs.writeFileSync(outFile, JSON.stringify(evidence, null, 2) + "\n", "utf8");
' "$RESULTS_FILE" "$OUTPUT_DIR/EVIDENCE.json"

echo ""
echo "evidence: $OUTPUT_DIR/EVIDENCE.json"
echo "cases: $CASES_RUN, failed: $CASES_FAILED"
if [ "$CASES_FAILED" -ne 0 ]; then
  echo "homologate-linux-claude: FAIL"
  exit 1
fi
echo "homologate-linux-claude: PASS"