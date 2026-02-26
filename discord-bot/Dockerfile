# syntax=docker/dockerfile:1
# Discord bot — Node.js, no HTTP port (Gateway only)
# Multi-stage: deps → build → runtime

# ─────────────────────────────────────────────
# Stage 1: Dependencies
# ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ─────────────────────────────────────────────
# Stage 2: Build (prisma generate + tsc)
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy DATABASE_URL for prisma generate (no DB connection needed at build)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────────────────
# Stage 3: Runtime
# ─────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bot

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated

USER bot

# No EXPOSE — bot uses Discord Gateway, not HTTP
# Healthcheck: process alive (PID 1 is our node process)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD kill -0 1 || exit 1

CMD ["node", "dist/src/index.js"]
