#!/usr/bin/env bash
set -euo pipefail

KEEP_TEMP=false
FULL=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --keep-temp)
      KEEP_TEMP=true
      ;;
    --full)
      FULL=true
      ;;
    --help|-h)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Error: unknown parameter: $1" >&2
      exit 1
      ;;
  esac
  shift
done

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)"
TEMP_HOME="$(mktemp -d "${TMPDIR:-/tmp}/orquestrador-install-test.XXXXXX")"

cleanup() {
  if [ "$KEEP_TEMP" = true ]; then
    echo "TempHome kept: $TEMP_HOME"
  else
    rm -rf "$TEMP_HOME"
  fi
}
trap cleanup EXIT

INSTALL_ARGS=(--home-path "$TEMP_HOME")
VERIFY_ARGS=(--home-path "$TEMP_HOME")
if [ "$FULL" != true ]; then
  INSTALL_ARGS+=(--core-only --skip-skill-sync)
  VERIFY_ARGS+=(--core-only)
else
  mkdir -p "$TEMP_HOME/.codex/sessions"
  printf 'personal-session-must-survive\n' > "$TEMP_HOME/.codex/sessions/personal.jsonl"
fi

bash "$REPO_ROOT/install.sh" "${INSTALL_ARGS[@]}" --dry-run
bash "$REPO_ROOT/install.sh" "${INSTALL_ARGS[@]}"

if [ "$FULL" = true ]; then
  if find "$TEMP_HOME/.orquestrador-public-backups" -path '*/.codex__profile/sessions/personal.jsonl' -print -quit 2>/dev/null | grep -q .; then
    echo "Error: installer backed up a personal Codex session." >&2
    exit 1
  fi
  if [ ! -f "$TEMP_HOME/.codex/sessions/personal.jsonl" ]; then
    echo "Error: installer removed a personal Codex session." >&2
    exit 1
  fi
fi

bash "$REPO_ROOT/scripts/verify-install.sh" "${VERIFY_ARGS[@]}"
bash "$REPO_ROOT/install.sh" --home-path "$TEMP_HOME" --list-targets
bash "$REPO_ROOT/install.sh" --home-path "$TEMP_HOME" --uninstall --dry-run
bash "$REPO_ROOT/install.sh" --home-path "$TEMP_HOME" --uninstall

if [ "$FULL" = true ]; then
  if find "$TEMP_HOME/.orquestrador-public-backups" -path '*/.codex__profile/sessions/personal.jsonl' -print -quit 2>/dev/null | grep -q .; then
    echo "Error: uninstaller backed up a personal Codex session." >&2
    exit 1
  fi
  if [ ! -f "$TEMP_HOME/.codex/sessions/personal.jsonl" ]; then
    echo "Error: uninstaller removed a personal Codex session." >&2
    exit 1
  fi
fi

if [ -e "$TEMP_HOME/.orquestrador-maestro" ] || [ -e "$TEMP_HOME/.orquestrador" ]; then
  echo "Error: uninstall left a Maestro core directory behind." >&2
  exit 1
fi
if [ -e "$TEMP_HOME/AGENTS.md" ]; then
  echo "Error: uninstall left AGENTS.md behind." >&2
  exit 1
fi

echo "Installer smoke test passed."
