#!/bin/sh
set -e

echo "Running Prisma migrations..."
cd /app/prisma-deploy
NODE_PATH=/app/prisma-deploy/node_modules node /app/prisma-deploy/node_modules/prisma/build/index.js migrate deploy 2>&1 || echo "Warning: Prisma migrate deploy failed"
cd /app

echo "Starting Next.js server..."
exec node server.js
