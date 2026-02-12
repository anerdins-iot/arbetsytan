#!/bin/sh
set -e

echo "Running database migrations..."
node migrate.mjs || echo "Warning: Migration script failed (see logs above)"

echo "Starting Next.js server..."
exec node server.js
