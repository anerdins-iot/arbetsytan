#!/bin/sh
set -e

echo "Running database migrations..."
node migrate.mjs

echo "Running backfill for Tenant.slug and Membership.emailSlug (idempotent)..."
node scripts/backfill-email-slugs.js || echo "Warning: Backfill script failed (see logs above)"

# Always ensure superadmin exists if SUPERADMIN_EMAIL is configured (prod + dev)
echo "Ensuring superadmin user..."
node ensure-superadmin.mjs

if [ "$RUN_SEED" = "true" ]; then
  echo "Running database seed (dev/test data)..."
  node seed.js || echo "Warning: Seed script failed (see logs above)"
fi

echo "Starting Next.js server with Socket.IO..."
exec node server.js
