#!/usr/bin/env bash
set -euo pipefail

TIMEOUT="${BENCHMARK_TIMEOUT:-300000}"
SCENARIO="${BENCHMARK_SCENARIO:-}"
CONDITION="${BENCHMARK_CONDITION:-vanilla}"

if [ -z "$SCENARIO" ]; then
  echo '{"error":"BENCHMARK_SCENARIO is required"}' >&2
  exit 1
fi

timeout --signal=SIGTERM "$((TIMEOUT / 1000))" \
  opencode --non-interactive \
    --model "${BENCHMARK_MODEL:-claude-sonnet-4-20250514}" \
    --prompt "Run benchmark scenario ${SCENARIO} under condition ${CONDITION}."

EXIT_CODE=$?

if [ "$EXIT_CODE" -eq 124 ]; then
  echo '{"status":"timeout","exitCode":124}' >&2
fi

exit "$EXIT_CODE"
