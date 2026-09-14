#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20+ is required to run check-dev-gates." >&2
  exit 1
fi

node "$SCRIPT_DIR/check-dev-gates.js" "$@"
