# Fas 1 — Projektsetup och infrastruktur

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 1.1A: Next.js och Docker-setup
**Input:** Tomt projekt, `PROJEKT.md`, `/docs/nextjs.md`, `/docs/tailwind.md`, `/docs/docker.md`
**Output:** Fungerande Next.js-projekt med Docker-tjänster

- [x] Initiera Next.js 16-projekt i `web/` med `npx create-next-app@16.0.9` (App Router, TypeScript, Tailwind, ESLint)
- [x] Konfigurera Tailwind CSS v4 med CSS-variabler enligt `/docs/tailwind.md`
- [x] Installera och konfigurera shadcn/ui med tema enligt `UI.md`
- [x] Installera `socket.io` och `socket.io-client` (konfigurering i Block 6.1)
- [x] Skapa `docker-compose.yml` i workspace root med PostgreSQL, MinIO och Redis
- [x] Skapa `web/.env.local.example` med alla nödvändiga miljövariabler
- [x] Verifiera att `npm run dev`, `npm run build` (i web/) och `docker-compose up -d` fungerar

**Verifiering:** `npm run build` OK, `docker-compose up -d` OK, alla tjänster svarar

### Block 1.1B: Prisma och databas
**Input:** Block 1.1A klart, `/docs/prisma.md`
**Output:** Migrerad databas med seed-data

- [x] Flytta `prisma/schema.prisma` till `web/prisma/` (schemat finns redan i repo-root)
- [x] Komplettera schemat med hela datamodellen enligt `PROJEKT.md` och `AI.md` om något saknas
- [x] Konfigurera Prisma 7 enligt `/docs/prisma.md`:
  - Generator: `prisma-client` provider med `output = "./generated/prisma"`
  - Datasource: utan `url` (hanteras av `prisma.config.ts`)
  - `package.json`: `"type": "module"` (ESM obligatoriskt)
- [x] Skapa `web/prisma.config.ts` i web/ (Next.js projekt-root) med `defineConfig()`: schema-path, migrations-path, seed-kommando och `datasource.url` från env
- [x] Installera `@prisma/adapter-pg` och `pg` — driver adapter obligatoriskt i Prisma 7
- [x] Skapa `web/src/lib/db.ts` med PrismaPg-adapter och PrismaClient-instans (singleton-pattern)
- [x] Köra `npx prisma generate` för att generera klienten
- [x] Köra `npx prisma migrate dev` med hela schemat
- [x] Verifiera att hela schemat migreras korrekt
- [x] Skapa raw SQL-migrering för pgvector-extension (`CREATE EXTENSION vector`)
- [x] Skapa raw SQL för embedding-kolumn på DocumentChunk
- [x] Skapa `web/prisma/seed.ts` med testdata: tenant, användare, memberships, projekt, uppgifter
- [x] Verifiera seed fungerar med `npx prisma db seed`

**Verifiering:** `npx prisma migrate dev` OK, `npx prisma db seed` OK, alla tabeller skapade

### Block 1.2: Internationalisering
**Input:** Block 1.1A klart (fungerande Next.js-projekt)
**Output:** Fungerande i18n med sv/en

- [x] Installera och konfigurera `next-intl`
- [x] Skapa `web/src/i18n/request.ts` och `web/src/i18n/routing.ts`
- [x] Skapa `web/messages/sv.json` med grundläggande nycklar (navigation, knappar, felmeddelanden)
- [x] Skapa `web/messages/en.json` med samma nycklar på engelska
- [x] Konfigurera `[locale]`-segment i App Router (flytta sidor under `app/[locale]/`)
- [x] Konfigurera språkdetektering och default locale (sv)
- [x] Verifiera att `/sv/` och `/en/` fungerar korrekt

**Verifiering:** `/sv/` och `/en/` laddar korrekt, `npm run build` OK

### Block 1.3: Layout och routing
**Input:** Block 1.1A + Block 1.2 klara (Next.js + i18n)
**Output:** Grundläggande applikationslayout med navigation

- [x] Skapa root layout med Inter-typsnitt och temavariabler
- [x] Skapa `(auth)`-grupp med layout för login/register
- [x] Skapa `(dashboard)`-grupp med layout: sidmeny, topbar, innehåll
- [x] Bygga sidmeny med navigation: Dashboard, Projekt, Inställningar
- [x] Bygga topbar med användarinfo och notifikationsikon
- [x] Implementera responsiv layout — sidmeny kollapsar på mobil
- [x] Implementera dark mode-toggle som växlar CSS-variablerna

**Verifiering:** Layout renderas korrekt, responsiv design fungerar, dark mode togglar, `npm run build` OK
