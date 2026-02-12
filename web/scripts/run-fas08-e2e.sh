#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PID_FILE="${ROOT}/.dev-server.pid"
SCREENSHOT_DIR="${ROOT}/../screenshots/fas-08"

cleanup() {
  if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE")"
    if kill -0 "$PID" 2>/dev/null; then
      echo "Stopping dev server (PID $PID)..."
      kill -TERM "$(cat "$PID_FILE")" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}
trap cleanup EXIT

if command -v curl >/dev/null 2>&1; then
  check_port() {
    curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 --max-time 2 http://localhost:3000 2>/dev/null || true
  }
else
  check_port() {
    (echo >/dev/tcp/localhost/3000) 2>/dev/null && echo "200" || echo ""
  }
fi

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Dev server already running (PID $OLD_PID). Stop it first or remove $PID_FILE."
    exit 1
  fi
  rm -f "$PID_FILE"
fi

STATUS="$(check_port)"
if [ "$STATUS" = "200" ] || [ "$STATUS" = "304" ]; then
  echo "Port 3000 is already in use. Refusing to start another server."
  exit 1
fi

if command -v ss >/dev/null 2>&1; then
  if ss -ltn "( sport = :3000 )" | awk 'NR > 1 { found=1 } END { exit(found ? 0 : 1) }'; then
    echo "Port 3000 has an existing listener. Refusing to start another server."
    exit 1
  fi
fi

mkdir -p "$SCREENSHOT_DIR"

echo "Starting dev server..."
npm run dev &
echo $! >"$PID_FILE"
echo "Dev server PID: $(cat "$PID_FILE")"

echo "Waiting for server on http://localhost:3000..."
for i in $(seq 1 120); do
  STATUS="$(check_port)"
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "304" ]; then
    echo "Server is up."
    break
  fi
  if [ "$i" -eq 120 ]; then
    echo "Server did not start in time."
    exit 1
  fi
  sleep 1
done

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$ROOT/../.playwright-browsers}"
npx playwright install chromium 2>/dev/null || true
npx playwright test e2e/fas-08-time-export.spec.ts --project=chromium
