#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20+ is required to run compact-worklog." >&2
  exit 1
fi

node "$REPO_ROOT/orquestrador/bin/dev-context-tools.js" compact-worklog "$@"
