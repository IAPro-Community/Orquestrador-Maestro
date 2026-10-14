#!/bin/bash
set -e

# 1.1.0 (CONT-02): parity with validate-skills.ps1 — both run public check + validate.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/public-skill-catalog.js" check
node "$SCRIPT_DIR/skill-catalog.js" validate
