#!/bin/sh
set -e

echo "Running database migrations..."
node migrate.mjs || echo "Warning: Migration script failed (see logs above)"

if [ "$RUN_SEED" = "true" ]; then
  echo "Running database seed..."
  node seed.mjs || echo "Warning: Seed script failed (see logs above)"
fi

echo "Starting Next.js server..."
exec node server.js
