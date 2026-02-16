# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────
# Stage 1: Dependencies
# ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ─────────────────────────────────────────────
# Stage 2: Builder
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy env vars for build — Next.js pre-renders pages and evaluates modules
# that validate these at import time. No actual connections are made.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXT_TELEMETRY_DISABLED=1
ENV STRIPE_SECRET_KEY="sk_dummy_build_only"
ENV AUTH_SECRET="dummy-auth-secret-for-build"
ENV S3_ENDPOINT="http://localhost:9000"
ENV S3_ACCESS_KEY="dummy"
ENV S3_SECRET_KEY="dummy"
ENV S3_BUCKET="dummy"
ENV S3_REGION="us-east-1"
ENV OPENAI_API_KEY="dummy-build-only"

# Generate Prisma Client explicitly (postinstall skipped with --ignore-scripts)
RUN npx prisma generate

# Build with webpack fallback for sandbox/CI compatibility
RUN npm run build

# ─────────────────────────────────────────────
# Stage 3: Runner (Production)
# ─────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy package files for tsx
COPY --from=builder /app/package.json ./package.json

# Copy node_modules (needed for tsx and socket.io)
COPY --from=builder /app/node_modules ./node_modules

# Copy custom server and its runtime dependencies (tsx resolves imports at runtime)
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/lib/socket-events.ts ./src/lib/socket-events.ts
COPY --from=builder /app/src/lib/redis-pubsub.ts ./src/lib/redis-pubsub.ts

# Copy public assets
COPY --from=builder /app/public ./public

# Copy Next.js build output (not standalone - we use custom server)
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# Copy Prisma generated client
COPY --from=builder /app/generated ./generated

# Copy migration SQL files and runner scripts
COPY --from=builder /app/prisma/migrations ./prisma/migrations
COPY --from=builder /app/migrate.mjs ./migrate.mjs
COPY --from=builder /app/seed.mjs ./seed.mjs

# Entrypoint script: run migrations then start server
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check: test if Next.js server is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["/app/docker-entrypoint.sh"]
