#!/usr/bin/env bash
# Minimal smoke test for Soriku IDE browser app.
# Usage: ./scripts/smoke-test.sh [port]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-3000}"
URL="http://127.0.0.1:${PORT}/"
LOG="$(mktemp -t soriku-ide-smoke.XXXXXX.log)"
PID=""

cleanup() {
  if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
    kill "${PID}" 2>/dev/null || true
    wait "${PID}" 2>/dev/null || true
  fi
  rm -f "${LOG}"
}
trap cleanup EXIT

cd "${ROOT}/applications/browser"

yarn -s start --hostname=127.0.0.1 --port="${PORT}" >"${LOG}" 2>&1 &
PID=$!

deadline=$((SECONDS + 90))
ready=0
while (( SECONDS < deadline )); do
  if curl -sf "${URL}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "${PID}" 2>/dev/null; then
    echo "Smoke test failed: browser process exited early. Log:" >&2
    cat "${LOG}" >&2
    exit 1
  fi
  sleep 1
done

if [[ "${ready}" -ne 1 ]]; then
  echo "Smoke test failed: timed out waiting for ${URL}" >&2
  cat "${LOG}" >&2
  exit 1
fi

html="$(curl -sf "${URL}")"
if ! grep -q '<title>Soriku IDE</title>' <<<"${html}"; then
  echo "Smoke test failed: expected <title>Soriku IDE</title>" >&2
  echo "Received:" >&2
  grep -o '<title>[^<]*</title>' <<<"${html}" >&2 || true
  exit 1
fi

echo "Smoke test passed: ${URL} returns Soriku IDE title"
