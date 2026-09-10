#!/usr/bin/env bash
set -euo pipefail

TASK="${BENCH_TASK:-}"
TASK_FILE="${BENCH_TASK_FILE:-}"
TIMEOUT="${BENCH_TIMEOUT:-120}"
MODEL="${BENCH_MODEL:-anthropic/claude-sonnet-4-20250514}"
VARIANT="${BENCH_VARIANT:-}"
FORMAT="${BENCH_FORMAT:-json}"
WORK_DIR="${BENCH_WORK_DIR:-/workspace}"

if [[ -z "$TASK" && -n "$TASK_FILE" && -f "$TASK_FILE" ]]; then
  TASK=$(cat "$TASK_FILE")
fi

if [[ -z "$TASK" ]]; then
  echo '{"error":"BENCH_TASK or BENCH_TASK_FILE required","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' >&2
  exit 1
fi

ARGS=("run" "$TASK" "--format" "$FORMAT" "--model" "$MODEL" "--dir" "$WORK_DIR" "--auto")

if [[ -n "$VARIANT" ]]; then
  ARGS+=("--variant" "$VARIANT")
fi

start_time=$(date +%s%N)

timeout --signal=KILL "${TIMEOUT}s" opencode "${ARGS[@]}" &
AGENT_PID=$!

cleanup() {
  kill -TERM "$AGENT_PID" 2>/dev/null || true
  wait "$AGENT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait "$AGENT_PID" || EXIT_CODE=$?
EXIT_CODE=${EXIT_CODE:-0}

end_time=$(date +%s%N)
duration_ms=$(( (end_time - start_time) / 1000000 ))

if [[ "$EXIT_CODE" -ne 0 ]]; then
  echo '{"error":"agent exited with non-zero code","exitCode":'"$EXIT_CODE"',"durationMs":'"$duration_ms"',"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' >&2
fi

exit "$EXIT_CODE"
