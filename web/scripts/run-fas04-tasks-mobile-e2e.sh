#!/usr/bin/env bash
# Run project Tasks tab E2E test (mobile viewport).
# Requires: server on http://localhost:3000, DB seeded (admin@example.com / password123).
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$ROOT/../.playwright-browsers}"
if [ ! -d "$PLAYWRIGHT_BROWSERS_PATH/chromium-1208" ] && [ ! -d "$PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-1208" ]; then
  npx playwright install chromium 2>/dev/null || true
fi
npx playwright test e2e/fas-04-project-tasks-mobile.spec.ts --project=mobile
exit $?
