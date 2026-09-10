#!/usr/bin/env bash
set -uo pipefail

WORK_DIR="${BENCH_WORK_DIR:-/workspace}"
COMMAND="${BENCH_VERIFY_COMMAND:-}"
TIMEOUT="${BENCH_TIMEOUT:-60}"
EXPECTED_EXIT="${BENCH_EXPECTED_EXIT:-0}"

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

if [[ -z "$COMMAND" ]]; then
  echo '{"passed":false,"error":"BENCH_VERIFY_COMMAND required","exitCode":1,"testsPassed":0,"testsFailed":0,"testsTotal":0}'
  exit 1
fi

start_time=$(date +%s%N)

OUTPUT=$(timeout --signal=KILL "${TIMEOUT}s" bash -c "cd '$WORK_DIR' && $COMMAND" 2>&1) && ACTUAL_EXIT=0 || ACTUAL_EXIT=$?

end_time=$(date +%s%N)
duration_ms=$(( (end_time - start_time) / 1000000 ))

PASSED_COUNT=$(echo "$OUTPUT" | grep -c '^ok [0-9]' || true)
FAILED_COUNT=$(echo "$OUTPUT" | grep -c '^not ok [0-9]' || true)
TOTAL=$((PASSED_COUNT + FAILED_COUNT))

PASSED="false"
if [[ "$ACTUAL_EXIT" -eq "$EXPECTED_EXIT" ]]; then
  PASSED="true"
fi

TRIMMED=$(echo "$OUTPUT" | tail -c 2000)
ESCAPED=$(json_escape "$TRIMMED")

cat <<EOF
{"passed":${PASSED},"exitCode":${ACTUAL_EXIT},"expectedExitCode":${EXPECTED_EXIT},"testsPassed":${PASSED_COUNT},"testsFailed":${FAILED_COUNT},"testsTotal":${TOTAL},"durationMs":${duration_ms},"output":"${ESCAPED}","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

if [[ "$PASSED" == "true" ]]; then
  exit 0
else
  exit 1
fi
