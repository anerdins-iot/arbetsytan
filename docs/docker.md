---
title: Docker för lokal utveckling
description: Docker-setup för Next.js-projekt med databaser och tjänster
tags: [docker, nextjs, development, containers, postgresql, mariadb]
---

## Strategi: Docker för tjänster, Next.js på hosten

1. **Docker Compose används BARA för databaser och tjänster** (PostgreSQL, Redis, etc.)
2. **Next.js dev-server körs direkt på hosten** med `npm run dev` — INTE i Docker
3. **Appen ansluter till Docker-tjänsterna via `localhost`** (port-mappade)
4. **Produktion via Coolify:** Appen deployas med Dockerfile, databaser/tjänster konfigureras separat i Coolify

**Varför?**
- Hot reload fungerar betydligt bättre direkt på hosten
- Snabbare utveckling utan volume mount overhead
- Enklare debugging och verktygsintegration
- Docker används endast för vad den är bra på: isolerade tjänster

---

## Lokal utveckling

### 1. Starta databaser och tjänster

```bash
docker compose up -d
docker compose ps
```

### 2. Kör Next.js dev-server på hosten

```bash
npm install
npx prisma migrate dev
npm run dev
```

### 3. Öppna appen

```
http://localhost:3000
```

### 4. Dev-server i agent- och testmiljö (Playwright)

När en **agent** startar dev-servern för att köra Playwright-tester (eller annan verifiering) måste den kunna **stoppa servern** utan att döda sig själv. Använd **aldrig** `pkill -f "next-server"` eller liknande — det kan träffa agentens egen process eller fel processer i sandbox.

**Rätt mönster: spara PID vid start, döda endast den processen vid stopp.**

| Steg | Kommando |
|------|----------|
| **Starta** | `cd /workspace/web && npm run dev & echo $! > .dev-server.pid` (justera sökväg om appen inte ligger i `web/`) |
| **Vänta** | Vänta tills servern svarar (t.ex. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` tills du får 200) |
| **Kör tester** | Kör Playwright eller annan verifiering |
| **Stoppa** | `kill -TERM $(cat /workspace/web/.dev-server.pid) 2>/dev/null; rm -f /workspace/web/.dev-server.pid` |

- Lägg **`.dev-server.pid`** i `.gitignore` så att filen inte committas.
- Samma agent som startar servern ska stoppa den (inom samma session). Lämna aldrig servern igång efter test — det blockerar framtida agenter.
- Om porten redan är upptagen: rapportera felet, försök inte döda andras processer.

Projekt med plan/README eller verifieringskrav bör kopiera detta mönster (och hänvisa till denna doc).

---

## docker-compose.yml

### Endast tjänster (rekommenderat)

```yaml
# docker-compose.yml
services:
  # ─────────────────────────────────────────
  # PostgreSQL Database
  # ─────────────────────────────────────────
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
      # Init scripts körs vid första start
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ─────────────────────────────────────────
  # Redis (för cache/sessions)
  # ─────────────────────────────────────────
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # ─────────────────────────────────────────
  # Next.js App (valfri — för att testa prod-build lokalt)
  # Startas BARA med: docker compose --profile prod up -d --build
  # ─────────────────────────────────────────
  app:
    profiles: [prod]
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/myapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
```

**OBS:** `app`-servicen har `profiles: [prod]` och startar INTE vid vanlig `docker compose up -d`. Den aktiveras bara explicit — se "Testa produktionsbygget lokalt" nedan.

### Med MariaDB istället för PostgreSQL

```yaml
services:
  db:
    image: mariadb:11
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: myapp
      MYSQL_USER: app
      MYSQL_PASSWORD: secret
    volumes:
      - mariadb_data:/var/lib/mysql
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  mariadb_data:
```

---

## Environment Variables

### Struktur

```
.env                 # Gemensamma defaults (committad)
.env.local           # Lokala overrides (gitignored)
.env.development     # Development-specifika
.env.production      # Production-specifika
```

### .env (lokal utveckling)

```bash
# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database (localhost — appen körs på hosten)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myapp

# Redis
REDIS_URL=redis://localhost:6379

# Auth
AUTH_SECRET=development-secret-change-in-production
```

**VIKTIGT:** Använd `localhost` i DATABASE_URL för lokal utveckling (Next.js på hosten). Använd service-namn (`db:5432`) bara om appen körs i en Docker-container.

---

## Dockerfile för Next.js (Produktion)

### Multi-stage build

```dockerfile
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

# Dummy DATABASE_URL krävs vid build — Next.js prerenderar sidor och kör
# prisma generate utan att behöva en riktig databasanslutning.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXT_TELEMETRY_DISABLED=1

# Generera Prisma Client explicit — postinstall körs inte med --ignore-scripts
RUN npx prisma generate

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

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# ⚠️ Om Prisma: OBLIGATORISKT — utan denna rad kraschar appen vid start
COPY --from=builder /app/prisma/generated ./prisma/generated

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

> **⚠️ De tre vanligaste Docker-felen:**
> 1. Glömd `output: 'standalone'` i next.config.ts → `.next/standalone` skapas aldrig
> 2. Glömd `COPY prisma/generated` i runner → appen kraschar med "Cannot find module"
> 3. Glömd `--ignore-scripts` i deps → oväntade postinstall-skript i CI/CD

**Kräver i `next.config.ts`:**

```typescript
const nextConfig = {
  output: 'standalone',
}
```

> **Viktigt: Build-time dependencies**
>
> Next.js prerenderar sidor vid `npm run build`. Om dessa sidor använder Prisma (eller andra runtime-beroenden) krävs:
>
> - **Dummy `DATABASE_URL`** — Prisma Client behöver en giltig connection string vid build, men ansluter inte faktiskt. Sätt `ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"` i builder-stage.
> - **Prisma CLI, Tailwind, PostCSS, tsx** och andra paket som behövs vid build måste finnas tillgängliga i builder-stage. Om `npm ci` körs med `--ignore-scripts` eller `--omit=dev` hamnar `devDependencies` inte i `node_modules`. Flytta dessa till `dependencies`, eller kör `npm ci` utan `--omit=dev` i deps-stage.
> - **`npx prisma generate`** måste köras explicit i builder-stage eftersom `postinstall`-scriptet inte körs med `--ignore-scripts`.

---

### ⛔ Checklista för Dockerfile — Verifiera ALLA punkter

> **Varje punkt nedan har orsakat build-/runtime-fel i testning. Missa INGEN.**

- [ ] `output: 'standalone'` i `next.config.ts` — **UTAN DETTA GENERERAS INGEN standalone-mapp**
- [ ] `npm ci --ignore-scripts` i deps-stage — **postinstall körs INTE, det är meningen**
- [ ] Runner kopierar `.next/standalone` — **ALDRIG node_modules**
- [ ] `CMD ["node", "server.js"]` — **ALDRIG `npm start`**
- [ ] Build-kritiska paket (Tailwind, PostCSS, Prisma) i `dependencies` (INTE devDependencies)

**Om Prisma används (alla tre krävs):**
- [ ] `ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"` i builder-stage
- [ ] `RUN npx prisma generate` explicit i builder (efter `COPY . .`) — postinstall körs inte med --ignore-scripts
- [ ] `COPY --from=builder /app/prisma/generated ./prisma/generated` i runner — **UTAN DENNA KRASCHAR APPEN**

---

## Testa produktionsbygget lokalt

Bygg och kör appen som container för att verifiera att Dockerfile fungerar:

```bash
# Starta allt (db + redis + app)
docker compose --profile prod up -d --build

# Öppna appen
open http://localhost:3000

# Visa logs
docker compose --profile prod logs -f app

# Stäng ner (inklusive app)
docker compose --profile prod down
```

**OBS:** Vid lokal prod-test använder appen `db:5432` (Docker-internt), inte `localhost:5432`. Detta hanteras av `environment` i docker-compose.yml.

---

## Produktion (Coolify)

I produktion deployas appen via **Coolify** med Dockerfile. Ingen separat compose-fil behövs.

**Setup i Coolify:**
1. **Appen** — Lägg till som "Dockerfile"-resurs, pekar på repots `Dockerfile`
2. **PostgreSQL** — Lägg till som separat tjänst i samma Coolify-projekt
3. **Redis** — Lägg till som separat tjänst i samma Coolify-projekt
4. **Miljövariabler** — Sätt `DATABASE_URL`, `REDIS_URL` etc. i Coolify's UI, pekar på de interna tjänstnamnen

Se `/workspace/docs/coolify.md` för detaljerad Coolify-konfiguration.

---

## Database Management

### Init-script

```sql
-- docker/init.sql
-- Körs endast vid första start (tom volume)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### PostgreSQL med pgvector

Standard `postgres:16-alpine` innehåller **inte** pgvector-extension. Använd `pgvector/pgvector`-imagen istället:

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    # Resten samma som vanlig postgres-config
    shm_size: '1g'  # Krävs för HNSW-index
```

Efter start, aktivera extension i din init-script eller via Prisma:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**HNSW-index kräver shared memory:** Sätt `shm_size: '1g'` eller högre i compose-filen, annars får du fel vid indexering.

### Prisma (körs från hosten)

```bash
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npx prisma studio
```

**OBS:** Prisma körs direkt från hosten. DATABASE_URL i `.env` pekar på `localhost:5432`.

### Backup och restore

```bash
# Backup PostgreSQL
docker compose exec db pg_dump -U postgres myapp > backup.sql

# Restore
docker compose exec -T db psql -U postgres myapp < backup.sql

# Backup MariaDB
docker compose exec db mariadb-dump -u root -proot myapp > backup.sql
```

---

## Vanliga Kommandon

```bash
# Starta tjänster (db, redis)
docker compose up -d

# Visa logs
docker compose logs -f [service]

# SQL-shell
docker compose exec db psql -U postgres myapp

# Stoppa allt
docker compose down

# Stoppa och ta bort volumes
docker compose down -v

# Rensa allt
docker compose down --rmi all -v
```

---

## Healthcheck för Node.js Alpine

Alpine-baserade images inkluderar inte `curl` eller `wget` — att lägga till dem ökar image-storleken onödigt. Använd Node.js inbyggda `http`-modul istället:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

**Viktigt:** Health-endpointen (`/api/health`) ska returnera 200 så länge **containern själv** är frisk, oberoende av externa tjänster (databas, Redis, etc.). Detta låter containern starta medan problem med externa dependencies undersöks separat.

---

## MinIO

**CPU-krav:** Sedan november 2023 kräver MinIO x86-64-v2-instruktioner. Äldre CPU:er (särskilt virtualiserade miljöer och vissa cloud-providers) får felet:

```
Fatal glibc error: CPU does not support x86-64-v2
```

**Lösning:** Använd `-cpuv1`-taggen för äldre CPU:er:

```yaml
services:
  minio:
    image: minio/minio:RELEASE.2025-01-01T00-00-00Z-cpuv1
    # ...
```

Moderna servrar (fysiska maskiner, nya VPS:er) behöver inte cpuv1-taggen — använd standard-imagen.

---

## Felsökning

### Database connection refused

**1. Kontrollera att db är uppe:**
```bash
docker compose ps
docker compose exec db pg_isready -U postgres
```

**2. Kontrollera hostname** — använd `localhost:5432` för Next.js på hosten, `db:5432` för Next.js i container.

**3. Kontrollera .env** — DATABASE_URL ska peka på `localhost` för lokal utveckling.

### Port already in use

```bash
lsof -i :5432

# Ändra port i docker-compose
ports:
  - "5433:5432"
```

Uppdatera DATABASE_URL: `postgresql://postgres:postgres@localhost:5433/myapp`

### node_modules problem

```bash
rm -rf node_modules package-lock.json
npm install
```

### Prisma Client out of sync

```bash
npx prisma generate
```

---

## Exempel: Komplett projekt

```
my-nextjs-app/
├── docker/
│   └── init.sql
├── prisma/
│   └── schema.prisma
├── src/
│   └── app/
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml      # Databaser + valfri prod-app (profiles)
├── Dockerfile              # Produktions-build
├── next.config.ts
└── package.json
```

### Arbetsflöde

```bash
# 1. Starta databaser
docker compose up -d

# 2. Installera dependencies
npm install

# 3. Kör Prisma migrations
npx prisma migrate dev

# 4. Starta Next.js dev-server
npm run dev

# 5. Öppna appen
open http://localhost:3000
```

När du är klar:
```bash
docker compose down
```
