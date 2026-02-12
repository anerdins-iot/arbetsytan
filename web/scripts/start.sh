#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma || echo "Migration failed or skipped"

echo "Starting Next.js server..."
exec node server.js
