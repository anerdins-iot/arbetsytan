# Fas 1 — Projektsetup och infrastruktur

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 1.1A: Next.js och Docker-setup
**Input:** Tomt projekt, `PROJEKT.md`, `/docs/nextjs.md`, `/docs/tailwind.md`, `/docs/docker.md`
**Output:** Fungerande Next.js-projekt med Docker-tjänster

- [ ] Initiera Next.js 16-projekt med App Router och TypeScript
- [ ] Konfigurera Tailwind CSS v4 med CSS-variabler enligt `/docs/tailwind.md`
- [ ] Installera och konfigurera shadcn/ui med tema enligt `UI.md`
- [ ] Skapa `docker-compose.yml` med PostgreSQL, MinIO och Redis
- [ ] Skapa `.env.local.example` med alla nödvändiga miljövariabler
- [ ] Verifiera att `npm run dev`, `npm run build` och `docker-compose up -d` fungerar

**Verifiering:** `npm run build` OK, `docker-compose up -d` OK, alla tjänster svarar

### Block 1.1B: Prisma och databas
**Input:** Block 1.1A klart, `schema.prisma`, `/docs/prisma.md`
**Output:** Migrerad databas med seed-data

- [ ] Konfigurera Prisma 7 med `prisma-client` provider och output
- [ ] Köra `prisma migrate dev` med hela schemat från `schema.prisma`
- [ ] Verifiera att hela schemat i `schema.prisma` migreras korrekt
- [ ] Skapa raw SQL-migrering för pgvector-extension (`CREATE EXTENSION vector`)
- [ ] Skapa raw SQL för embedding-kolumn på DocumentChunk
- [ ] Skapa `prisma/seed.ts` med testdata: tenant, användare, memberships, projekt, uppgifter
- [ ] Verifiera seed fungerar med `npx prisma db seed`

**Verifiering:** `prisma migrate dev` OK, `prisma db seed` OK, alla tabeller skapade

### Block 1.2: Internationalisering
**Input:** Block 1.1A klart (fungerande Next.js-projekt)
**Output:** Fungerande i18n med sv/en

- [ ] Installera och konfigurera `next-intl`
- [ ] Skapa `src/i18n/request.ts` och `src/i18n/routing.ts`
- [ ] Skapa `messages/sv.json` med grundläggande nycklar (navigation, knappar, felmeddelanden)
- [ ] Skapa `messages/en.json` med samma nycklar på engelska
- [ ] Konfigurera `[locale]`-segment i App Router (flytta sidor under `app/[locale]/`)
- [ ] Konfigurera språkdetektering och default locale (sv)
- [ ] Verifiera att `/sv/` och `/en/` fungerar korrekt

**Verifiering:** `/sv/` och `/en/` laddar korrekt, `npm run build` OK

### Block 1.3: Layout och routing
**Input:** Block 1.1A + Block 1.2 klara (Next.js + i18n)
**Output:** Grundläggande applikationslayout med navigation

- [ ] Skapa root layout med Inter-typsnitt och temavariabler
- [ ] Skapa `(auth)`-grupp med layout för login/register
- [ ] Skapa `(dashboard)`-grupp med layout: sidmeny, topbar, innehåll
- [ ] Bygga sidmeny med navigation: Dashboard, Projekt, Inställningar
- [ ] Bygga topbar med användarinfo och notifikationsikon
- [ ] Implementera responsiv layout — sidmeny kollapsar på mobil
- [ ] Implementera dark mode-toggle som växlar CSS-variablerna

**Verifiering:** Layout renderas korrekt, responsiv design fungerar, dark mode togglar, `npm run build` OK
