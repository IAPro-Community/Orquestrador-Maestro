#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_DIR="${BENCHMARK_EVIDENCE:-/workspace/evidence}"

if [ ! -d "$EVIDENCE_DIR" ]; then
  echo '{"error":"Evidence directory not found","path":"'"$EVIDENCE_DIR"'"}' >&2
  exit 1
fi

PASS=0
FAIL=0
TOTAL=0

for run_dir in "$EVIDENCE_DIR"/*/; do
  [ -d "$run_dir" ] || continue
  TOTAL=$((TOTAL + 1))

  REPORT_FILE="${run_dir}run-report.json"
  if [ -f "$REPORT_FILE" ]; then
    ACCEPTED=$(node -e "
      const fs = require('fs');
      const r = JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
      console.log(r.results?.accepted ? 'true' : 'false');
    " "$REPORT_FILE" 2>/dev/null || echo "false")

    if [ "$ACCEPTED" = "true" ]; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
    fi
  else
    FAIL=$((FAIL + 1))
  fi
done

RESULT=$(node -e "
  const result = {
    verified: true,
    totalRuns: ${TOTAL},
    passed: ${PASS},
    failed: ${FAIL},
    acceptanceRate: ${TOTAL} > 0 ? (${PASS} / ${TOTAL}) : 0,
    timestamp: new Date().toISOString()
  };
  console.log(JSON.stringify(result, null, 2));
")

echo "$RESULT"
