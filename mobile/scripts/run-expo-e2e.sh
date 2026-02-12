#!/bin/bash
# Run Expo Web E2E tests with Playwright
# This script starts Expo web server, runs Playwright tests, and stops the server
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$MOBILE_DIR/.expo-web.pid"
PORT=8081

cd "$MOBILE_DIR"

# ── Cleanup function ──
cleanup() {
  echo "Stopping Expo web server..."
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    kill -TERM "$PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Server (PID $PID) stopped."
  fi
}
trap cleanup EXIT

# ── Check if port is already in use ──
if ss -ltn "( sport = :$PORT )" 2>/dev/null | grep -q ":$PORT"; then
  echo "ERROR: Port $PORT is already in use. Cannot start Expo web server."
  exit 1
fi

# ── Start Expo web server ──
echo "Starting Expo web server on port $PORT..."
npx expo start --web --no-dev --port "$PORT" &
echo $! > "$PID_FILE"
echo "Server started with PID $(cat "$PID_FILE")"

# ── Wait for server to be ready ──
echo "Waiting for server to be ready..."
MAX_WAIT=120
WAIT_COUNT=0
while ! curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" 2>/dev/null | grep -q "200\|304"; do
  WAIT_COUNT=$((WAIT_COUNT + 1))
  if [ "$WAIT_COUNT" -ge "$MAX_WAIT" ]; then
    echo "ERROR: Server did not start within ${MAX_WAIT}s"
    exit 1
  fi
  sleep 1
  # Also verify process is still alive
  if [ -f "$PID_FILE" ] && ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "ERROR: Server process died unexpectedly"
    exit 1
  fi
done
echo "Server is ready."

# ── Create screenshot directory ──
mkdir -p "$MOBILE_DIR/../screenshots/fas-11"

# ── Run Playwright tests ──
echo "Running Playwright tests..."
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/workspace/.playwright-browsers}"
npx playwright test --config "$MOBILE_DIR/playwright.config.ts" --reporter=list
TEST_EXIT=$?

echo "Tests completed with exit code: $TEST_EXIT"
exit $TEST_EXIT
