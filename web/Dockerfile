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

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma generated client — without this the app crashes at startup
COPY --from=builder /app/generated ./generated

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
