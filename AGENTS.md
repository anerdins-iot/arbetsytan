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
| Databas | PostgreSQL + Prisma 7 + pgvector | `/docs/prisma.md` |
| Auth | Auth.js (v5) | `/docs/auth.md` |
| Validering | Zod 4 | `/docs/zod.md` |
| Styling | Tailwind CSS v4 + shadcn/ui | `/docs/tailwind.md`, `/docs/shadcn-ui.md` |
| Fillagring | MinIO (S3-kompatibel) | — |
| Betalning | Stripe | `/docs/stripe.md` |
| Deploy | Docker + Coolify | `/docs/docker.md`, `/docs/coolify.md` |
| Mobilapp | Expo SDK 54 | `/docs/expo.md` |
| React | React 19.2 | `/docs/react.md` |
| E-post | Resend | — |
| Realtid | Socket.IO (webb + mobil) | — |
| Notifikationer | Expo Push, Web Push, Resend | se `AI.md` |
| AI SDK | Vercel AI SDK (ai) | `vercel-ai-sdk.md` |
| AI | Claude, OpenAI, Mistral | se `AI.md` |
| OCR | Mistral OCR | `mistral-api.md` |
| Embeddings | OpenAI + pgvector | se `AI.md` |
| i18n | next-intl | — |

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
web/
├── src/
│   ├── app/
│   │   └── [locale]/        # Språkprefix — alla sidor under locale
│   │       ├── (auth)/      # Login, registration
│   │       ├── (dashboard)/ # Authenticated - projects, files, tasks
│   │       └── api/         # API endpoints (ej locale-prefix)
│   ├── components/          # UI components
│   │   ├── ui/              # shadcn/ui base components
│   │   └── [feature]/       # Feature-specific components
│   ├── lib/                 # Helpers, database, auth config, AI clients
│   ├── actions/             # Server Actions (all CRUD logic)
│   ├── types/               # TypeScript types
│   ├── hooks/               # Custom React hooks (client-side)
│   └── i18n/                # next-intl config, request.ts, routing.ts
├── prisma/                  # Schema, migrations, seed
├── messages/
│   ├── sv.json              # Svenska översättningar
│   └── en.json              # Engelska översättningar
└── prisma.config.ts         # Next.js projekt-root
mobile/                      # Expo-app (Fas 11)
docker-compose.yml           # Workspace root
```

## Multi-tenant

- Varje företag (tenant) har isolerad data
- **Central tenant-isolering:** Alla databasfrågor går genom en tenant-scoped Prisma-klient (`tenantDb(tenantId)`) som automatiskt injicerar `tenantId`-filter på alla queries via en Prisma client extension. Ingen kod får använda den globala Prisma-klienten direkt för tenant-data.
- `tenantId` hämtas från session (webb) eller JWT (mobil) och verifieras i `requireAuth`/`requireRole` innan den skickas till `tenantDb()`
- Prisma-extensionen i `web/src/lib/db.ts` exporterar:
  - `prisma` — global klient, ENBART för plattformsoperationer (superadmin, cron-jobb, auth-flöden utan tenant-kontext)
  - `tenantDb(tenantId)` — tenant-scoped klient som injicerar `WHERE tenantId = ?` på alla operationer
- **Projektåtkomst:** Alla operationer som tar `projectId` som input ska verifiera att användaren har tillgång till projektet via `requireProject(tenantId, projectId, userId)`. Denna funktion kontrollerar att projektet tillhör rätt tenant och att användaren är medlem i projektet (eller har Admin-roll). Returnerar projektet eller kastar ett fel.
- **AI-åtkomstkontroll:** Personliga AI-konversationer ägs av `userId` — bara ägaren har åtkomst. Projekt-AI-konversationer kräver `requireProject()`. AIMessages filtreras alltid på `userId` + `tenantId`. Alla AI-verktyg (tool calls) ärver samma åtkomstkontroll som den kontext de körs i.
- Roller per tenant: Admin, Projektledare, Montör
- Superadmin är plattformsnivå — separerad från tenant-roller
- Rättigheter är konfigurerbara per roll och tenant

## Konventioner

- Alla UI-texter via `next-intl` — aldrig hårdkodade strängar i komponenter
- Översättningar i `web/messages/sv.json` och `web/messages/en.json`
- Nytt språk läggs till genom att skapa en ny JSON-fil (t.ex. `web/messages/no.json`)
- Svenska som standardspråk, engelska som andra språk
- Routing med språkprefix: `/sv/dashboard`, `/en/dashboard`
- Användaren väljer språk i inställningar — sparas i `User.locale`
- Engelska i kod (variabelnamn, funktioner, kommentarer, mappstruktur, URLs)
- Server Components som default — `'use client'` bara vid interaktivitet
- All data via Server Actions — aldrig hårdkodad
- Alla Server Actions har auth-check via `requireAuth`/`requireRole` + `tenantDb(tenantId)` för databasåtkomst + Zod-validering
- Felhantering med tydliga felmeddelanden på svenska till användaren
- Filer lagras i MinIO, aldrig lokalt på servern
- AI-anrop via Vercel AI SDK — se `AI.md` för arkitektur, `vercel-ai-sdk.md` för SDK-docs

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
- Hårdkodade UI-texter — alla strängar via `next-intl`
- Mock-data i UI (all data från DB)
- Databasfrågor utan `tenantId`-filter
- Direkt användning av `prisma` (global klient) för tenant-data — använd alltid `tenantDb(tenantId)`
- Projektoperationer utan `requireProject()`-validering — verifiera alltid att användaren har åtkomst
- Socket.IO broadcast utan rum — emit alltid till specifika rum (`tenant:`, `project:`, `user:`), aldrig till alla
- Socket.IO-filtrering i frontend — all data filtreras i backend innan emit
- Klient-styrd rumshantering — servern bestämmer vilka rum klienten joinar
- Socket.IO-emit baserat på klient-angivet `projectId`/`tenantId` utan server-side `requireProject()`/`tenantDb()`-validering
- Direkt åtkomst till annan tenants data
- Committa `.env.local` eller hemligheter
- API-nycklar i klientkod
- `any` som TypeScript-typ

## Viktiga filer

- `web/src/lib/auth.ts` — Auth.js-konfiguration
- `web/src/lib/db.ts` — Prisma-klient
- `web/src/lib/ai/` — AI-klientkonfiguration (Claude, OpenAI, Mistral)
- `AI.md` — AI-arkitektur (personlig AI, projekt-AI, kommunikation)
- `mistral-api.md` — Mistral API och OCR-referens
- `openai-api.md` — OpenAI bildgenerering och embeddings-referens
- `vercel-ai-sdk.md` — Vercel AI SDK-referens
- `web/prisma/schema.prisma` — Databasschema
- `web/prisma/seed.ts` — Seed-data
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
