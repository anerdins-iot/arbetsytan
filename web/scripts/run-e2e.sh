#!/usr/bin/env bash
# Run all Playwright E2E tests.
# Requires: server on http://localhost:3000, DB seeded (admin@example.com / password123).
# Browsers: if PLAYWRIGHT_BROWSERS_PATH is set and missing, we install there; else we unset
# and ensure Chromium is in default cache (so "Executable doesn't exist" is avoided).
set -e
cd "$(dirname "$0")/.."

if [ -n "$PLAYWRIGHT_BROWSERS_PATH" ]; then
  if [ ! -d "$PLAYWRIGHT_BROWSERS_PATH/chromium-1208" ] && [ ! -d "$PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-1208" ]; then
    echo "Installing Chromium to $PLAYWRIGHT_BROWSERS_PATH..."
    npx playwright install chromium
  fi
else
  unset PLAYWRIGHT_BROWSERS_PATH
  # Ensure Chromium is available (idempotent; quick if already installed)
  npx playwright install chromium
fi

npx playwright test
exit $?
