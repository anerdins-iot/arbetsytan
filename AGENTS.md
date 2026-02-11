# AGENTS.md

> **STOPP!** Varje docs-fil innehåller kritiska regler, breaking changes och förbjudna mönster.
> Du MÅSTE läsa relevant `/docs/*.md` INNAN du skriver kod. Att skippa detta leder till fel.

## Översikt

ArbetsYtan (AY) — kommersiell multi-tenant SaaS-plattform för hantverkare.
Projektledning med AI-assistans. Se `PROJEKT.md` för fullständig projektbeskrivning.

## Tech Stack

Läs ALLTID relevant docs-fil innan du arbetar med en komponent. Docs är single source of truth för versioner och regler.

| Komponent | Teknologi | Docs |
|-----------|-----------|------|
| Framework | Next.js 16.0.9 | `/docs/nextjs.md` |
| Databas | PostgreSQL + Prisma 7 | `/docs/prisma.md` |
| Auth | Auth.js (v5) | `/docs/auth.md` |
| Validering | Zod 4 | `/docs/zod.md` |
| Styling | Tailwind CSS v4 + shadcn/ui | `/docs/tailwind.md`, `/docs/shadcn-ui.md` |
| Fillagring | MinIO (S3-kompatibel) | — |
| Betalning | Stripe | `/docs/stripe.md` |
| Deploy | Docker + Coolify | `/docs/docker.md`, `/docs/coolify.md` |
| Mobilapp | Expo SDK 54 | `/docs/expo.md` |
| React | React 19.2 | `/docs/react.md` |
| E-post | Resend | — |
| Notifikationer | Expo Push, Web Push, Resend | se `AI.md` |
| AI | Claude, OpenAI, Mistral | se `AI.md` |

## Kommandon

| Kommando | Beskrivning |
|----------|-------------|
| `docker-compose up -d` | Starta databaser och MinIO |
| `npm run dev` | Dev-server |
| `npm run build` | Produktionsbygg |
| `npx prisma migrate dev` | Kör migrations |
| `npx prisma studio` | Öppna DB-gui |
| `npx prisma db seed` | Seed testdata |

## Arkitektur

```
src/
├── app/              # App Router (pages, layouts, API routes)
│   ├── (auth)/       # Login, registration
│   ├── (dashboard)/  # Authenticated - projects, files, tasks
│   └── api/          # API endpoints
├── components/       # UI components
│   ├── ui/           # shadcn/ui base components
│   └── [feature]/    # Feature-specific components
├── lib/              # Helpers, database, auth config, AI clients
├── actions/          # Server Actions (all CRUD logic)
├── types/            # TypeScript types
└── hooks/            # Custom React hooks (client-side)
```

## Multi-tenant

- Varje företag (tenant) har isolerad data
- Alla databasfrågor MÅSTE filtreras på `tenantId`
- Roller per tenant: Admin, Projektledare, Montör
- Superadmin är plattformsnivå — separerad från tenant-roller
- Rättigheter är konfigurerbara per roll och tenant

## Konventioner

- Svenska i UI-texter
- Engelska i kod (variabelnamn, funktioner, kommentarer, mappstruktur, URLs)
- Server Components som default — `'use client'` bara vid interaktivitet
- All data via Server Actions — aldrig hårdkodad
- Alla Server Actions har auth-check + tenant-check + Zod-validering
- Felhantering med tydliga felmeddelanden på svenska till användaren
- Filer lagras i MinIO, aldrig lokalt på servern
- AI-anrop via abstraktionslager i `src/lib/ai/` — se `AI.md` för arkitektur

## Design

Läs `UI.md` för designspråk, färger, typsnitt och visuella riktlinjer. Läs ALLTID denna fil innan du bygger UI-komponenter.

- Tailwind CSS v4 — se `/docs/tailwind.md`
- shadcn/ui för alla baskomponenter — se `/docs/shadcn-ui.md`
- Design tokens i CSS-variabler — inga hårdkodade färger/spacing
- Responsiv design — mobil först
- Stöd för dark mode

## Förbjudet

- Hårdkodade färger eller spacing — se `/docs/tailwind.md`
- `@apply` i CSS — se `/docs/tailwind.md`
- `useEffect` för data fetching — se `/docs/react.md`
- `redirectToCheckout` — se `/docs/stripe.md`
- `middleware.ts` — använd `proxy.ts`, se `/docs/nextjs.md`
- `prisma-client-js` som provider — se `/docs/prisma.md`
- Mock-data i UI (all data från DB)
- Databasfrågor utan `tenantId`-filter
- Direkt åtkomst till annan tenants data
- Committa `.env.local` eller hemligheter
- API-nycklar i klientkod
- `any` som TypeScript-typ

## Viktiga filer

- `src/lib/auth.ts` — Auth.js-konfiguration
- `src/lib/db.ts` — Prisma-klient
- `src/lib/ai/` — AI-klientkonfiguration (Claude, OpenAI, Mistral)
- `AI.md` — AI-arkitektur (personlig AI, projekt-AI, kommunikation)
- `prisma/schema.prisma` — Databasschema
- `prisma/seed.ts` — Seed-data
- `PROJEKT.md` — Fullständig projektbeskrivning och faser
- `UI.md` — Designspråk, färger, typsnitt
- `DEVLOG.md` — Löpande erfarenhetslogg

## DEVLOG.md

Alla som arbetar i projektet MÅSTE:
1. Läsa `DEVLOG.md` innan arbetet börjar
2. Skriva till `DEVLOG.md` vid problem som inte är triviala
3. Format: Problem, orsak, lösning, lärdom (max 5 rader per post)

## Deployment

Appen deployas via Coolify med Docker. Se `/docs/coolify.md`.
PostgreSQL, MinIO och Redis konfigureras som separata tjänster i Coolify.
