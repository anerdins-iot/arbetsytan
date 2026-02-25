#!/bin/sh
set -e

echo "Running database migrations..."
node migrate.mjs

echo "Running backfill for Tenant.slug and Membership.emailSlug (idempotent)..."
npx tsx scripts/backfill-email-slugs.ts || echo "Warning: Backfill script failed (see logs above)"

if [ "$RUN_SEED" = "true" ]; then
  echo "Running database seed..."
  node seed.mjs || echo "Warning: Seed script failed (see logs above)"
fi

echo "Starting Next.js server with Socket.IO..."
exec npx tsx server.ts
