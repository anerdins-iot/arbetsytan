---
title: Prisma ORM 7
description: Breaking changes, migration guide och best practices för Prisma 7 med Next.js
tags: [prisma, orm, database, postgresql, nextjs]
---

## Breaking Changes från Prisma 6

### 1. Rust-Free Arkitektur (Kritisk!)

Prisma 7 har **helt byggts om i TypeScript** och tar bort Rust-beroenden:

- **90% mindre bundle-storlek**
- **3x snabbare queries**
- **Bättre edge-kompatibilitet** (Vercel Edge, Cloudflare Workers)

### 2. Nytt Generator Provider

```prisma
// ❌ Gammalt (deprecated)
generator client {
  provider = "prisma-client-js"
}

// ✅ Nytt i Prisma 7
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma"  // ← OBLIGATORISKT i Prisma 7
}
```

### 3. Driver Adapters Obligatoriskt

Prisma 7 kräver **explicita driver adapters** för alla databaser:

```bash
npm install @prisma/adapter-pg pg
```

```typescript
// lib/prisma.ts
import { PrismaClient } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
})

export const prisma = new PrismaClient({ adapter })
```

### 4. Ny prisma.config.ts (Obligatorisk)

Database URL flyttar **från `schema.prisma` till `prisma.config.ts`**:

```typescript
// prisma.config.ts (projekt-root)
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
```

**schema.prisma ska INTE ha url längre:**

```prisma
// ❌ Gammalt
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ✅ Nytt - utan url
datasource db {
  provider = "postgresql"
}
```

### 5. ESM Obligatoriskt

Prisma 7 kräver ES Modules:

```json
// package.json
{
  "type": "module"
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2023",
    "moduleResolution": "bundler"
  }
}
```

### 6. Minimum-krav

| Krav | Version |
|------|---------|
| Node.js | 20.19+ (rekommenderat 22.x) |
| TypeScript | 5.4+ (rekommenderat 5.9.x) |
| Node 18 | **Stöds inte längre** |

### 7. SSL-certifikat Ändrat

Ogiltiga SSL-certifikat avvisas nu som standard. Om du får `P1010: User was denied access`:

```typescript
// prisma.config.ts
export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
    // Eller sätt NODE_EXTRA_CA_CERTS environment variable
  },
})
```

### 8. CLI-ändringar

| Gammalt | Nytt |
|---------|------|
| `prisma db execute --url` | Borttaget - läser från `prisma.config.ts` |
| `prisma migrate diff --from-url` | `--from-config-datasource` |
| `prisma migrate diff --to-url` | `--to-config-datasource` |
| Auto-generate efter migrate | Kör `prisma generate` manuellt |
| Auto-seed efter migrate | Kör `prisma db seed` manuellt |

### 9. Borttagna Features

- **Client Middleware** - Använd Client Extensions istället
- **Metrics preview** - Borttaget
- **MongoDB** - Stöds inte i v7, fortsätt med v6

---

## Nya Features i Prisma 7

### Mapped Enums

Efterlängtad feature - `@map` för enum-värden:

```prisma
enum OrderStatus {
  PENDING   @map("pending")
  SHIPPED   @map("shipped")
  DELIVERED @map("delivered")
}
```

**Obs:** Det finns en känd bugg med mapped enums i v7.0-7.2. Använd temporärt string literals:

```typescript
// Workaround för bugg
await prisma.order.create({
  data: {
    status: 'pending' as OrderStatus
  }
})
```

### SQL Comments

Lägg till metadata i SQL-queries för observability:

```typescript
import { PrismaClient } from './generated/prisma/client'

const prisma = new PrismaClient({
  adapter,
  log: ['query'],
  // SQL comments för tracing
})
```

### Ny Prisma Studio

Omdesignad och mycket mindre:

```bash
npx prisma studio
npx prisma studio --url "postgresql://..."  # Remote database
```

### Förbättrad Type-checking

- **~98% färre typer** för schema-evaluering
- **~45% färre typer** för query-evaluering
- **70% snabbare** full type check

---

## Migration från Prisma 6

### Steg 1: Uppdatera Paket

```bash
npm install prisma@7 @prisma/adapter-pg pg
```

> **OBS:** `prisma` måste vara i `dependencies` (inte `devDependencies`) i Prisma 7. Paketet `@prisma/client` behöver inte installeras separat — `prisma generate` skapar klienten i output-mappen.

### Steg 2: Skapa prisma.config.ts

```typescript
// prisma.config.ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

type Env = {
  DATABASE_URL: string
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
})
```

### Steg 3: Uppdatera schema.prisma

```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma"  // ← OBLIGATORISKT i Prisma 7
}

datasource db {
  provider = "postgresql"
  // Ta bort url = env("DATABASE_URL")
}

// Resten av ditt schema...
```

### Steg 4: Uppdatera package.json

```json
{
  "type": "module",
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  }
}
```

> **⚠️ Undvik `"postinstall": "prisma generate"`** — det fungerar inte i Docker multi-stage builds där `npm install` körs med `--ignore-scripts`. Kör istället `npx prisma generate` som ett explicit steg i din Dockerfile eller ditt build-script.

### Steg 5: Uppdatera Prisma Client

```typescript
// lib/prisma.ts
import { PrismaClient } from '../prisma/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
})

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

### Steg 6: Uppdatera Imports

```typescript
// ❌ Gammalt
import { PrismaClient } from '@prisma/client'

// ✅ Nytt
import { PrismaClient } from '../prisma/generated/prisma/client'
// Eller med path alias:
import { PrismaClient } from '@/prisma/generated/prisma/client'
```

### Steg 7: Generera Client

```bash
npx prisma generate
```

---

## Exempel

### Pagination

```typescript
export async function getPaginatedProducts(page: number, pageSize: number = 10) {
  const skip = (page - 1) * pageSize

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count(),
  ])

  return {
    products,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}
```

### Full-text Search (PostgreSQL)

```prisma
// schema.prisma
model Product {
  id          String @id @default(cuid())
  name        String
  description String

  @@index([name, description], type: Gin)
}
```

```typescript
export async function searchProducts(query: string) {
  return prisma.product.findMany({
    where: {
      OR: [
        { name: { search: query } },
        { description: { search: query } },
      ],
    },
  })
}
```

---

## Docker

### Prisma Generate i Multi-stage Builds

`npx prisma generate` måste köras explicit i Dockerfile efter `COPY . .` — förlita dig inte på `postinstall`-script eftersom `--ignore-scripts` ofta används i builder-steget:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate
RUN npm run build
```

### Dummy DATABASE_URL för Build-steget

Om Next.js prerenderar sidor som anropar Prisma behövs en giltig `DATABASE_URL` redan vid build. Sätt en dummy-URL i builder-stage:

```dockerfile
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npm run build
```

Den riktiga `DATABASE_URL` sätts sedan som environment variable i runtime-containern.

### Seed-kommando

Seed-kommandot i `prisma.config.ts` kräver `npx`-prefix:

```typescript
seed: 'npx tsx prisma/seed.ts',
```

---

## Felsökning

### Turbopack & Module Resolution (Next.js 16)

> ⚠️ **VIKTIGT:** Använd BARA `prisma-client-js` som tillfällig workaround vid specifika Turbopack module resolution-fel. Standard är ALLTID `prisma-client`.

Om du får module resolution-fel med Turbopack:

```prisma
// Workaround i schema.prisma
generator client {
  provider = "prisma-client-js"  // Tillfällig fix för Turbopack
}
```

**Alternativt (rekommenderas)**, konfigurera Next.js istället för att byta provider:

```typescript
// next.config.ts
const nextConfig = {
  experimental: {
    turbo: {
      resolveAlias: {
        '@prisma/client': './prisma/generated/prisma/client',
      },
    },
  },
}
```

### "Cannot find module '@prisma/client'"

```bash
# Generera om klienten
npx prisma generate
```

### "P1010: User was denied access"

SSL-certifikat-problem. Lägg till i connection string:

```
?sslmode=require&sslaccept=accept_invalid_certs
```

### "The datasource property is required"

Skapa `prisma.config.ts` med `datasource.url`.

### Hot-reload Skapar Multipla Connections

Se [Singleton Pattern](#singleton-pattern-kritiskt-för-nextjs) ovan.

---

## Referenser

- [Prisma 7 Release Blog](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [prisma.config.ts Reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference)
- [Next.js Integration Guide](https://www.prisma.io/docs/guides/nextjs)
- [Prisma 7.2.0 Release](https://www.prisma.io/blog/announcing-prisma-orm-7-2-0)
