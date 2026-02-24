# AGENTS.md

> **STOPP!** Varje docs-fil innehåller kritiska regler, breaking changes och förbjudna mönster.
> Du MÅSTE läsa relevant `/workspace/docs/*.md` INNAN du skriver kod. Att skippa detta leder till fel.

## Översikt

ArbetsYtan (AY) — kommersiell multi-tenant SaaS-plattform för hantverkare.
Projektledning med AI-assistans. Se `PROJEKT.md` för fullständig projektbeskrivning.

## Tech Stack

Läs ALLTID relevant docs-fil innan du arbetar med en komponent. Docs är single source of truth för versioner och regler.

| Komponent | Teknologi | Docs |
|-----------|-----------|------|
| Framework | Next.js 16.0.9 | `/workspace/docs/nextjs.md` |
| Databas | PostgreSQL + Prisma 7 + pgvector | `/workspace/docs/prisma.md` |
| Auth | Auth.js (v5) | `/workspace/docs/auth.md` |
| Validering | Zod 4 | `/workspace/docs/zod.md` |
| Styling | Tailwind CSS v4 + shadcn/ui | `/workspace/docs/tailwind.md`, `/workspace/docs/shadcn-ui.md` |
| Fillagring | MinIO (S3-kompatibel) | — |
| Betalning | Stripe | `/workspace/docs/stripe.md` |
| Deploy | Docker + Coolify | `/workspace/docs/docker.md`, `/workspace/docs/coolify.md` |
| Mobilapp | Expo SDK 54 | `/workspace/docs/expo.md` |
| React | React 19.2 | `/workspace/docs/react.md` |
| E-post | Resend | — |
| Realtid | Socket.IO (webb + mobil) | `/workspace/web/docs/websocket.md` |
| Notifikationer | Expo Push, Web Push, Resend | se `AI.md` |
| AI SDK | Vercel AI SDK (ai) | `vercel-ai-sdk.md` |
| AI | Claude, OpenAI, Mistral | se `AI.md` |
| OCR | Mistral OCR | `mistral-api.md` |
| Embeddings | OpenAI + pgvector | se `AI.md` |
| Kunskapsbas | KnowledgeEntity + pgvector RAG | se `AI.md` |
| i18n | next-intl | — |

## E-postsystem (Tvåvägskommunikation)

Systemet hanterar både utgående och inkommande e-post via Resend, med automatisk trådning och AI-sökning.

### Databasmodeller
- **`EmailConversation`**: Samlar meddelanden mellan en användare och en extern e-postadress. Ägs av en specifik `userId` och `tenantId` (privat).
- **`EmailMessage`**: Enskilda meddelanden (INBOUND/OUTBOUND) i en konversation.
- **`EmailLog`**: Teknisk logg för alla skickade/mottagna mail, kopplat till embeddings för AI-sökning.

### Spårning och Inkommande mail
- **Tracking Codes**: Varje konversation har en unik hex-kod (t.ex. `abc123...`).
- **Tenant Inbox Code**: Varje tenant har en unik `inboxCode` för att identifiera företaget.
- **Reply-To**: Utgående mail använder `inbox+{tenantCode}_{trackingCode}@mail.lowly.se`.
- **Webhook**: `/api/webhooks/resend` tar emot `email.received` och mappar till rätt konversation via tracking code.
- **"Övrigt"-inkorg**: Mail utan trackingCode men med giltig tenantCode skapas som `isUnassigned=true` och tilldelas tenant-admin.

### AI-verktyg för E-post
- **`searchMyEmails`**: Söker i användarens alla e-postloggar med vektor-sökning (embeddings).
- **`getConversationContext`**: Hämtar hela meddelandehistoriken för en specifik konversation.

### Realtid och Notifikationer
- **Socket.IO**: Eventet `email:new` skickas till `user:{userId}` vid inkommande mail.
- **Notifikationer**: Systemet skapar en `Notification` (typ `EMAIL_RECEIVED`) och skickar ett aviseringsmail till användarens privata adress.

## WebSocket Auto-Emit

Systemet använder en Prisma extension (`createEmitExtension`) för att automatiskt emitta WebSocket-events vid CRUD-operationer.
- **Kontext:** `tenantDb(tenantId, { actorUserId, projectId, tenantId })` krävs för auto-emit.
- **Skippa:** Använd `{ skipEmit: true }` i `EmitContext` för att tysta events för en specifik operation.
- **Routing:** Events skickas automatiskt till relevanta rum (`project:ID`, `user:ID`, `tenant:ID`) baserat på modellens data.

## Kommandon

| Kommando | Beskrivning |
|----------|-------------|
| `docker-compose up -d` | Starta databaser och MinIO |
| `npm run build` | Produktionsbygg |
| `npm start` | Starta produktionsserver |
| `/workspace/web/scripts/start-server.sh` | Starta server för tester (dödar befintlig process automatiskt) |
| `/workspace/web/scripts/stop-server.sh` | Stoppa server efter tester |
| `npx playwright test` (i `web/`) | Köra E2E-tester (kräver att servern körs, t.ex. via start-server.sh) |
| `web/scripts/run-e2e.sh` (i `web/`) | Köra alla E2E (kräver att servern redan körs; använd t.ex. `start-server.sh` först) |
| `npx prisma migrate dev --name namn` | Skapa migration vid schema-ändringar (nya tabeller/kolumner) |
| `npx prisma migrate deploy` | Applicera migrationer i produktion |
| `npx prisma studio` | Öppna DB-gui |
| `npx prisma db seed` | Seed testdata |

**E2E i CI:** Workflow `.github/workflows/ci.yml` har ett e2e-job som kör parallellt med build-and-lint. Det använder service containers (Postgres, Redis, MinIO), inte docker-compose. Stegen: install → playwright chromium → .env → build → MinIO-bucket → migrate → seed → starta server i bakgrunden → `scripts/run-e2e.sh`. Vid stabila gröna E2E kan `continue-on-error: true` tas bort.

## Prisma: Migrationer är obligatoriska

**Nya tabeller eller kolumner i `schema.prisma` MÅSTE följas av en migration.** Annars finns inte ändringarna i databasen och appen kraschar i produktion med fel som `column does not exist` eller `relation does not exist`.

### Arbetsflöde vid schema-ändringar

1. Redigera `web/prisma/schema.prisma` (lägg till modell, kolumn, index)
2. Kör `npx prisma migrate dev --name beskrivande_namn` (t.ex. `add_email_conversations`)
3. Verifiera att migrationsfilen skapades i `web/prisma/migrations/`
4. Committa schema + migrationsfilen

### Vanliga misstag

- Bara uppdatera schema utan att skapa migration → produktion kraschar
- Glömma att committa migrationsfilen → andra får inte tabellerna

## När något strular

Vanliga fel och snabblösningar:

- **"column does not exist" / "relation does not exist"** — Schema är uppdaterat men migration saknas eller är inte körda. Kör `npx prisma migrate dev --name …` lokalt; i produktion `npx prisma migrate deploy`. Committa alltid migrationsfiler.
- **Tenant-data visas inte eller fel data** — Använd aldrig global `prisma` för tenant-data. Använd `tenantDb(tenantId)` och se till att `tenantId` kommer från session/JWT och att `requireAuth`/`requireRole` har körts.
- **"Project not found" eller åtkomst nekas** — Verifiera projektåtkomst med `requireProject(tenantId, projectId, userId)` innan alla operationer som tar `projectId`.
- **UI-strängar som inte översätts** — Alla texter ska komma från `next-intl` (useTranslations eller getTranslations). Lägg nyckel i `web/messages/sv.json` och `web/messages/en.json`.
- **Modaler/listor som "läcker" eller får horisontell scroll på mobil** — Använd `max-h-[100dvh]` eller `min-h-0` på flex-containers, `overflow-hidden` och `min-w-0` på innehåll som ska scrolla, och undvik fasta bredder som kan bli större än viewport.
- **Knappar/links för små eller svåra att träffa** — Säkerställ minst 44px touch target på interaktiva element (se `UI.md`).

### Screenshots och tillfälliga filer

Spara skärmdumpar i mappen **screenshots** med undermapp per ärende (t.ex. `screenshots/bug-123/` eller `screenshots/login-flow/`). PNG-filer som ligger direkt i repo-rot ignoreras av git (se `.gitignore`).

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
│   ├── services/            # Service Layer — gemensam affärslogik
│   ├── lib/                 # Helpers, database, auth config, AI clients
│   ├── actions/             # Server Actions (thin layer över services)
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

## Service Layer (DRY-arkitektur)

**KRITISK REGEL:** All affärslogik (DB-queries, validering) ska ligga i Service Layer. Actions och AI-verktyg är "thin layers" som anropar services och transformerar data.

```
┌─────────────────────────────────────────────────────────┐
│                      Consumers                          │
├──────────────────────┬──────────────────────────────────┤
│   Server Actions     │         AI Tools                 │
│   (src/actions/)     │   (src/lib/ai/tools/)            │
│                      │                                  │
│   + presigned URLs   │   + ocrPreview                   │
│   + revalidatePath   │   + analyses array               │
│   + UI-format        │   + AI-optimerat format          │
└──────────┬───────────┴───────────────┬──────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Service Layer                         │
│                (src/services/*.ts)                      │
│                                                         │
│   - Gemensamma DB-queries                               │
│   - Gemensam validering (validateDatabaseId)            │
│   - Gemensam felhantering                               │
│   - Returnerar "rå" data (Date, inte ISO-strängar)      │
└─────────────────────────────────────────────────────────┘
```

### Service-filer

| Service | Funktioner |
|---------|-----------|
| `services/types.ts` | `ServiceContext`, `PaginationOptions`, `validateDatabaseId` |
| `services/project-service.ts` | `getProjectsCore`, `getProjectDetailCore` |
| `services/task-service.ts` | `getProjectTasksCore`, `getUserTasksCore` |
| `services/file-service.ts` | `getProjectFilesCore`, `getPersonalFilesCore` |
| `services/note-service.ts` | `getProjectNotesCore`, `getPersonalNotesCore` |
| `services/comment-service.ts` | `getCommentsCore` |
| `services/time-entry-service.ts` | `getTimeEntriesCore`, `getMyTimeEntriesCore`, `getTimeSummaryCore` |
| `services/member-service.ts` | `getProjectMembersCore`, `getAvailableMembersCore` |
| `services/index.ts` | Re-exports |

### Regler för Service Layer

1. **Läsoperationer** — Actions och AI-verktyg anropar `*Core`-funktioner från services
2. **Skrivoperationer** — AI-verktyg anropar Actions direkt (inte egen DB-logik)
3. **Validering** — `validateDatabaseId` finns ENBART i `services/types.ts`
4. **Returvärden** — Services returnerar råa Date-objekt, consumers transformerar till ISO-strängar vid behov
5. **Ingen duplicering** — Samma `findMany`-logik får INTE finnas i både Actions och AI-verktyg

### Checklista vid ny entitet

1. Skapa service FÖRST (`src/services/{entity}-service.ts`)
2. Implementera `get{Entity}Core` funktioner
3. Exportera från `src/services/index.ts`
4. Implementera Actions som anropar service
5. Implementera AI-verktyg som anropar service (läs) eller Actions (skriv)

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

- Tailwind CSS v4 — se `/workspace/docs/tailwind.md`
- shadcn/ui för alla baskomponenter — se `/workspace/docs/shadcn-ui.md`
- Design tokens i CSS-variabler — inga hårdkodade färger/spacing
- Responsiv design — mobil först
- Stöd för dark mode
- **Touch targets:** Interaktiva element måste ha minst 44px klick-/touch-yta (tillgänglighet, se `UI.md`).

**AI-chatt och datarikt innehåll:** AI-chatten får aldrig rendera datarikt innehåll (listor, tabeller) direkt i chatten. Använd mönstret knapp + Sheet-panel med samma komponenter som på den vanliga UI-sidan (se `DEVLOG.md` 2026-02-23). Mönstret är implementerat för t.ex. grossistsökning, rapport-/offertförhandsgranskning och dokumentsökning.

## CRUD-paritet: AI + UI

**KRITISK REGEL:** Alla funktioner som byggs MÅSTE ha fullständig CRUD-åtkomst i BÅDE AI och UI.

| Funktion | UI-åtkomst | AI-åtkomst |
|----------|-----------|------------|
| Projekt | Skapa, läs, uppdatera, arkivera | `createProject`, `listProjects`, `updateProject`, `archiveProject` |
| Uppgifter | Skapa, läs, uppdatera, radera | `createTask`, `listTasks`, `updateTask`, `deleteTask` |
| Kommentarer | Skapa, läs, uppdatera, radera | `addComment`, `listComments`, `updateComment`, `deleteComment` |
| Tidrapporter | Skapa, läs, uppdatera, radera | `logTime`, `listTimeEntries`, `updateTimeEntry`, `deleteTimeEntry` |
| Filer | Ladda upp, läs, radera | `uploadFile`, `listFiles`, `deleteFile` |
| Anteckningar | Skapa, läs, uppdatera, radera | `createNote`, `listNotes`, `updateNote`, `deleteNote` |
| Projektmedlemmar | Lägg till, ta bort, lista | `addMember`, `removeMember`, `listMembers` |
| E-post | Läsa, svara, arkivera | `searchMyEmails`, `getConversationContext` |
| Rapport | — | `generateProjectReport` |

### Checklista vid ny funktionalitet

1. **Prisma-modell** — Skapa/uppdatera schema, **skapa migration** (`npx prisma migrate dev --name ...`). Utan migration finns inte tabeller/kolumner i databasen → appen kraschar.
2. **Service Layer** — Skapa `src/services/{entity}-service.ts` med `get{Entity}Core` funktioner
3. **Server Actions** — CRUD-funktioner i `web/src/actions/` som anropar services för läsning
4. **UI-komponenter** — Dialoger, formulär, listor i `web/src/components/`
5. **AI-verktyg** — Motsvarande tools i `web/src/lib/ai/tools/`
   - Läsoperationer: Anropa services
   - Skrivoperationer: Anropa Actions
   - Projekt-AI: `project-tools.ts`
   - Personlig AI: `personal-tools.ts`
   - Delad logik: `shared-tools.ts`
6. **Översättningar** — Texter i `messages/sv.json` och `messages/en.json`
7. **Seed-data** — Testdata i `prisma/seed.ts`

### AI-verktyg som MÅSTE finnas

**Projekt-AI** (arbetar inom ett projekt):
- Uppgifter: create, list, update, delete, assign, complete
- Kommentarer: add, list, update, delete
- Tid: log, list, update, delete
- Filer: list, search, delete
- Anteckningar: create, list, update, delete
- Medlemmar: list, add, remove
- E-post: searchMyEmails, getConversationContext
- Rapport: generateProjectReport

**Personlig AI** (användarens alla projekt):
- Alla ovanstående verktyg med `projectId` som parameter
- Översikt: listProjects, searchAcrossProjects
- E-post: searchMyEmails (global), getConversationContext
- Personliga anteckningar: create, list, update, delete (utan projektkontext)

## Förbjudet

- Hårdkodade färger eller spacing — se `/workspace/docs/tailwind.md`
- `@apply` i CSS — se `/workspace/docs/tailwind.md`
- `useEffect` för data fetching — se `/workspace/docs/react.md`
- `redirectToCheckout` — se `/workspace/docs/stripe.md`
- `middleware.ts` — använd `proxy.ts`, se `/workspace/docs/nextjs.md`
- `prisma-client-js` som provider — se `/workspace/docs/prisma.md`
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
- **Duplicerad DB-logik** — `findMany` för samma data får INTE finnas i både Actions och AI-verktyg. Använd Service Layer.
- **`validateDatabaseId` utanför services** — funktionen finns ENBART i `src/services/types.ts`
- **AI-verktyg med egen DB-skrivlogik** — skrivoperationer ska anropa Actions, inte köra egen `create/update/delete`
- **Schema-ändringar utan migration** — Nya tabeller eller kolumner i `schema.prisma` MÅSTE följas av `npx prisma migrate dev --name ...`. Utan migration finns inte ändringarna i databasen → appen kraschar i produktion.

## Viktiga filer

- `web/src/services/` — Service Layer med gemensam affärslogik (DRY)
- `web/src/lib/auth.ts` — Auth.js-konfiguration
- `web/src/lib/db.ts` — Prisma-klient
- `web/src/lib/ai/` — AI-klientkonfiguration (Claude, OpenAI, Mistral)
- `web/src/lib/ai/unified-search.ts` — Unified semantic search (KnowledgeEntity + MessageChunk + DocumentChunk)
- `web/src/lib/ai/knowledge-extractor.ts` — Kunskapsextraktion från konversationer (fire-and-forget)
- `web/src/components/ai/rag-debug-modal.tsx` — Debug-modal för RAG-sökresultat
- `web/src/app/api/ai/upload/route.ts` — Filuppladdning för AI-chatten (inkl. `chatMode=true` för silent image upload)
- `web/src/app/api/ai/upload/file-info/route.ts` — Filmetadata-endpoint för OcrReviewDialog (FolderPlus-knapp)
- `web/src/components/ai/personal-ai-chat.tsx` — Personlig AI-chatt med bilduppladdning, thumbnails och RAG debug
- `AI.md` — AI-arkitektur (personlig AI, projekt-AI, kommunikation, RAG)
- `mistral-api.md` — Mistral API och OCR-referens
- `openai-api.md` — OpenAI bildgenerering och embeddings-referens
- `vercel-ai-sdk.md` — Vercel AI SDK-referens
- `web/prisma/schema.prisma` — Databasschema
- `web/prisma/seed.ts` — Seed-data
- `PROJEKT.md` — Fullständig projektbeskrivning och faser
- `UI.md` — Designspråk, färger, typsnitt
- `DEVLOG.md` — Löpande erfarenhetslogg
- `plan/service-layer-refactor/` — Plan för DRY-refaktorering

## DEVLOG.md

Alla som arbetar i projektet MÅSTE:
1. Läsa `DEVLOG.md` innan arbetet börjar
2. Skriva till `DEVLOG.md` vid problem som inte är triviala
3. Format: Problem, orsak, lösning, lärdom (max 5 rader per post)

## Deployment

Appen deployas via Coolify med Docker. Se `/workspace/docs/coolify.md`.
PostgreSQL, MinIO och Redis konfigureras som separata tjänster i Coolify.
