# Projektplan — ArbetsYtan (AY)

Detaljerad byggplan med checklistor. Varje steg markeras med `[ ]` (ej klart) eller `[x]` (klart).
Se `PROJEKT.md` för övergripande beskrivning, `AI.md` för AI-arkitektur, `UI.md` för designspråk.

### Generella regler (gäller alla faser)

- **i18n**: Alla UI-texter ska gå via `next-intl` — aldrig hårdkodade strängar. Översättningar i `messages/sv.json` och `messages/en.json`. Varje gång en ny sida eller komponent byggs ska översättningsnycklar skapas för båda språken samtidigt.

---

## Arbetsflöde och agenter

### Modellval per uppgiftstyp

| Uppgiftstyp | Provider / Modell | Notering |
|---|---|---|
| Enkel implementation (1–2 filer) | Gemini `gemini-3-flash-preview` | Snabb och billig |
| Komplex implementation (3+ filer, frontend↔backend) | Claude `opus` | Bäst kodkvalitet |
| Felsökning | Claude `opus` | Djup analys |
| Analys / research | Cursor `auto` (2 parallella) | Snabb utforskning |
| Verifiering / granskning | Gemini `gemini-3-pro-preview` | Grundlig kontroll |

### Arbetsflöde per agentblock

Varje agentblock genomförs i tre faser:

**1. Analys**
- Spawna 1–2 forskningsagenter (Cursor `auto`) som analyserar relevanta filer, scheman och existerande kod
- Resultatet ger implementationsagenten den kontext den behöver

**2. Implementation**
- Spawna implementationsagent med rätt modell (se tabell ovan)
- Agenten får blockets specifikation, input-filer och analysresultat
- Max ~5–8 steg per block — en agent ska klara blocket utan att tappa kontext

**3. Verifiering**
- Spawna verifieringsagent (Gemini `gemini-3-pro-preview`) som kontrollerar:
  - Koden bygger utan fel (`npm run build`)
  - Inga TypeScript-fel (`npx tsc --noEmit`)
  - Funktionaliteten matchar kraven i blockets specifikation
  - Multi-tenant-filter (`tenantId`) finns på alla databasanrop
  - Alla UI-texter går via `next-intl` — inga hårdkodade strängar
  - Inga hårdkodade färger — alla färger via CSS-variabler/Tailwind
  - Inga säkerhetshål (auth-check i alla Server Actions)

### Handoff mellan block

Varje agentblock har tydliga **input** och **output**:
- **Input**: Vad som måste vara klart innan blocket kan starta (föregående blocks output)
- **Output**: Vad blocket levererar (filer, funktioner, endpoints)
- **Verifiering**: Specifika kontroller som måste passera

Nästa block kan **inte** starta innan föregående blocks verifiering är godkänd. Om verifieringen misslyckas: åtgärda med en ny implementationsagent och verifiera igen.

---

## Fas 1 — Projektsetup och infrastruktur

### Block 1.1A: Next.js och Docker-setup
**Modell:** Claude `opus` (komplex setup, 3+ filer)
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
**Modell:** Gemini `gemini-3-flash-preview` (1–2 filer)
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
**Modell:** Gemini `gemini-3-flash-preview` (2 filer + config)
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
**Modell:** Claude `opus` (komplex frontend, 3+ filer)
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

---

## Fas 2 — Autentisering och multi-tenant

### Block 2.1: Auth.js-konfiguration
**Modell:** Claude `opus` (komplex, auth + callbacks + proxy)
**Input:** Fas 1 klar, `/docs/auth.md`
**Output:** Fungerande Auth.js med session-hantering

- [ ] Installera och konfigurera Auth.js v5 med Credentials-provider
- [ ] Konfigurera `src/lib/auth.ts` med session-callbacks
- [ ] Skapa `proxy.ts` enligt Next.js 16-mönster (ej middleware.ts)
- [ ] Implementera lösenordshashning med bcrypt vid registrering
- [ ] Konfigurera session-strategi (cookies för webb)
- [ ] Lägga till `tenantId` och `role` i session via callbacks

**Verifiering:** Auth-config laddar utan fel, session-callbacks returnerar tenantId/role, `npm run build` OK

### Block 2.2: Registrering och inloggning
**Modell:** Claude `opus` (komplex, frontend + backend + auth)
**Input:** Block 2.1 klart
**Output:** Fungerande registrering och inloggningssidor

- [ ] Bygga registreringssida med formulär: namn, e-post, lösenord, företagsnamn
- [ ] Skapa Server Action `registerUser` — validering med Zod, skapa User + Tenant + Membership(ADMIN)
- [ ] Hantera felmeddelanden på svenska (e-post redan registrerad, valideringsfel)
- [ ] Automatisk inloggning efter registrering
- [ ] Redirect till dashboard
- [ ] Bygga inloggningssida med e-post och lösenord
- [ ] Skapa Server Action `loginUser` med Zod-validering
- [ ] Felhantering: felaktiga uppgifter, låst konto
- [ ] Redirect till dashboard efter lyckad inloggning
- [ ] "Glömt lösenord"-länk (placeholder — implementeras i Block 2.4)

**Verifiering:** Registrering skapar User+Tenant+Membership, inloggning fungerar, redirect till dashboard, alla texter via i18n, `npm run build` OK

### Block 2.3: Session och skyddade routes
**Modell:** Gemini `gemini-3-flash-preview` (2 filer, hjälpfunktioner)
**Input:** Block 2.1 + 2.2 klara
**Output:** Auth-wrappers och skyddade routes

- [ ] Skapa `getSession`-hjälpfunktion som returnerar user, tenantId, role
- [ ] Skapa `requireAuth`-wrapper för Server Actions som kontrollerar session
- [ ] Skapa `requireRole`-wrapper som kräver specifik roll (ADMIN, PROJECT_MANAGER)
- [ ] Alla dashboard-sidor kontrollerar session — redirect till login om ej autentiserad
- [ ] Alla Server Actions kontrollerar auth + tenant

**Verifiering:** Oautentiserad request redirectar till login, `requireAuth` och `requireRole` fungerar, `npm run build` OK

### Block 2.4: Lösenordsåterställning
**Modell:** Claude `opus` (komplex, e-post + token + formulär)
**Input:** Block 2.2 + 2.3 klara, Resend-konto
**Output:** Fungerande lösenordsåterställningsflöde

- [ ] Konfigurera Resend för e-postutskick
- [ ] Bygga "Glömt lösenord"-sida med e-postfält
- [ ] Skapa Server Action som genererar VerificationToken och skickar e-post
- [ ] Bygga "Nytt lösenord"-sida som tar emot token
- [ ] Skapa Server Action som validerar token och uppdaterar lösenord

**Verifiering:** E-post skickas, token valideras, lösenord uppdateras, `npm run build` OK

### Block 2.5: Inbjudningar
**Modell:** Claude `opus` (komplex, e-post + registrering + roller)
**Input:** Block 2.2 + 2.3 + 2.4 klara (auth + Resend)
**Output:** Fungerande inbjudningsflöde

- [ ] Bygga inbjudningsformulär i inställningar (e-post + roll)
- [ ] Skapa Server Action `inviteUser` — skapar Invitation med token och expiresAt
- [ ] Skicka inbjudningsmail via Resend med unik länk
- [ ] Bygga accepteringssida — skapa konto och Membership med vald roll
- [ ] Hantera redan registrerade användare (koppla till befintlig User)
- [ ] Visa listan med aktiva och väntande inbjudningar i inställningar
- [ ] Server Action för att avbryta inbjudan

**Verifiering:** Inbjudan skickas via e-post, acceptering skapar Membership, tenant-filter på alla queries, `npm run build` OK

---

## Fas 3 — Dashboard och projekt

### Block 3.1: Dashboard
**Modell:** Claude `opus` (komplex, 3+ filer, frontend + data)
**Input:** Fas 1 + Fas 2 klara
**Output:** Fungerande dashboard-sida

- [ ] Bygga dashboard-sida med tre sektioner: uppgifter, aktivitet, notifikationer
- [ ] Hämta "mina uppgifter" via Server Action filtrerat på membership + tenantId
- [ ] Visa uppgifter som lista med status, deadline och projektkoppling
- [ ] Hämta senaste aktiviteten i användarens projekt
- [ ] Visa notifikationer (olästa markerade)
- [ ] Montörs-vy: förenklad dashboard med enbart "mina uppgifter idag"

**Verifiering:** Dashboard renderas, data filtreras på tenantId, montörs-vy visas för rätt roll, `npm run build` OK

### Block 3.2: Projektlista och skapande
**Modell:** Claude `opus` (komplex, frontend + backend)
**Input:** Fas 2 klar (auth + layout)
**Output:** Projektlista-sida med CRUD

- [ ] Bygga projektlista-sida med kort för varje projekt
- [ ] Server Action `getProjects` filtrerat på tenantId
- [ ] Visa namn, status, antal uppgifter, senaste aktivitet per projekt
- [ ] "Skapa nytt projekt"-knapp och modal/sida
- [ ] Server Action `createProject` med Zod-validering + tenantId
- [ ] Sökfunktion och statusfilter (aktiv, pausad, klar, arkiverad)

**Verifiering:** Projektlista visar data, filter fungerar, skapande fungerar, tenantId-filter på alla queries, `npm run build` OK

### Block 3.3: Projektvy — Översikt
**Modell:** Claude `opus` (komplex, fliknavigation + CRUD)
**Input:** Block 3.2 klart
**Output:** Projektvy med flikar och översikt

- [ ] Bygga projektvy med flik-navigation: Översikt, Uppgifter, Filer, AI
- [ ] Översiktsflik visar projektnamn, status, adress, beskrivning
- [ ] Visa antal uppgifter per status (todo, pågående, klart)
- [ ] Visa projektmedlemmar med roller
- [ ] Server Action `getProject` med tenantId-filter
- [ ] Möjlighet att redigera projektinfo (namn, adress, status, beskrivning)
- [ ] Server Action `updateProject` med auth + tenant-check

**Verifiering:** Projektvy renderas, fliknavigation fungerar, redigering sparas, tenantId-filter, `npm run build` OK

### Block 3.4: Kanban-board
**Modell:** Claude `opus` (komplex, drag-and-drop + CRUD)
**Input:** Block 3.3 klart
**Output:** Fungerande kanban med uppgiftshantering

- [ ] Bygga kanban-board med tre kolumner: Att göra, Pågående, Klart
- [ ] Server Action `getTasks` filtrerat på projectId + tenantId
- [ ] Drag-and-drop för att flytta uppgifter mellan kolumner
- [ ] Server Action `updateTaskStatus` som uppdaterar status
- [ ] Skapa ny uppgift — modal med titel, beskrivning, prioritet, deadline
- [ ] Server Action `createTask` med Zod-validering
- [ ] Tilldela uppgift till projektmedlem
- [ ] Server Action `assignTask` som skapar TaskAssignment

**Verifiering:** Kanban renderas, drag-and-drop fungerar, uppgifter skapas/uppdateras, tenantId-filter, `npm run build` OK

### Block 3.5: Uppgiftsdetalj och filtrering
**Modell:** Claude `opus` (komplex, detaljvy + filter)
**Input:** Block 3.4 klart
**Output:** Uppgiftsdetalj-vy med redigering och filtrering

- [ ] Uppgiftsdetalj-vy med redigering av alla fält
- [ ] Server Action `updateTask` och `deleteTask`
- [ ] Filtrera uppgifter på tilldelad person, prioritet, status

**Verifiering:** Detaljvy renderas, redigering sparar, filtrering fungerar, `npm run build` OK

### Block 3.6: Kommentarer
**Modell:** Gemini `gemini-3-flash-preview` (enkel, 1–2 filer)
**Input:** Block 3.5 klart (uppgiftsdetalj finns)
**Output:** Kommentarsfunktionalitet på uppgifter

- [ ] Bygga kommentarsfält i uppgiftsdetalj-vyn
- [ ] Server Action `createComment` med Zod-validering + auth
- [ ] Visa kommentarer kronologiskt med författare och tid
- [ ] Server Action `updateComment` och `deleteComment` (bara egen kommentar)
- [ ] Trigga notis till tilldelade personer vid ny kommentar

**Verifiering:** Kommentarer skapas/visas/raderas, auth-check, tenantId-filter, `npm run build` OK

### Block 3.7: Teamhantering
**Modell:** Gemini `gemini-3-flash-preview` (enkel, 1–2 filer)
**Input:** Block 3.3 klart (projektvy finns)
**Output:** Team-hantering i projektvyn

- [ ] Visa projektmedlemmar i projektvyn
- [ ] Lägga till befintliga teammedlemmar (från tenant) till projekt
- [ ] Ta bort medlem från projekt
- [ ] Server Actions med roller-check (bara admin/projektledare kan hantera)

**Verifiering:** Medlemmar visas/läggs till/tas bort, rollcheck fungerar, `npm run build` OK

### Block 3.8: Aktivitetslogg
**Modell:** Claude `opus` (komplex, loggning + UI + paginering)
**Input:** Block 3.3 + 3.4 klara (projektvy + uppgifter)
**Output:** Aktivitetslogg-system

- [ ] Logga alla viktiga händelser i ActivityLog: uppgift skapad/ändrad/klar, fil uppladdad, medlem tillagd, status ändrad
- [ ] Visa aktivitetslogg i projektöversikten (senaste händelserna)
- [ ] Fullständig aktivitetslogg-sida per projekt med filtrering och paginering
- [ ] Server Action `getActivityLog` filtrerat på projectId + tenantId
- [ ] Inkludera aktör (vem), action, entity och metadata i varje post

**Verifiering:** Händelser loggas vid alla CRUD-operationer, paginering fungerar, tenantId-filter, `npm run build` OK

### Block 3.9: Global sökning
**Modell:** Claude `opus` (komplex, sökning + grupperade resultat)
**Input:** Block 3.2 + 3.4 klara (projekt + uppgifter)
**Output:** Global sökfunktion

- [ ] Bygga sökfält i topbar som söker över alla tillgängliga resurser
- [ ] Sök i projektnamn och beskrivningar
- [ ] Sök i uppgiftstitlar och beskrivningar
- [ ] Sök i filnamn och OCR-extraherad text (via embeddings för semantisk sökning)
- [ ] Server Action `globalSearch` filtrerat på tenantId + användarens projekt
- [ ] Visa sökresultat grupperat per typ (projekt, uppgifter, filer) med djuplänkar
- [ ] Debounce och minst 2 tecken innan sökning triggas

**Verifiering:** Sökning returnerar resultat grupperade per typ, tenantId-filter, debounce fungerar, `npm run build` OK

---

## Fas 4 — Filhantering

### Block 4.1: MinIO-integration och uppladdning
**Modell:** Claude `opus` (komplex, MinIO + presigned URLs + upload-komponent)
**Input:** Fas 1 klar (Docker med MinIO), Fas 2 klar (auth)
**Output:** Fungerande filuppladdning till MinIO

- [ ] Konfigurera MinIO-klient i `src/lib/minio.ts`
- [ ] Skapa bucket per tenant eller per projekt (välj strategi)
- [ ] Generera presigned URL:er för uppladdning
- [ ] Generera presigned URL:er för nedladdning/visning
- [ ] Bygga uppladdningskomponent med drag-and-drop
- [ ] Stöd för flera filer samtidigt
- [ ] Visa uppladdningsförlopp
- [ ] Server Action `uploadFile` — validera typ/storlek, spara metadata i DB, ladda upp till MinIO
- [ ] Stöd för filtyper: PDF, bilder (JPG/PNG/WEBP), dokument (DOCX, XLSX)
- [ ] Maxstorlek per fil och per tenant

**Verifiering:** Filer laddas upp till MinIO, metadata sparas i DB, presigned URLs fungerar, tenantId-filter, `npm run build` OK

### Block 4.2: Fillista och förhandsgranskning
**Modell:** Claude `opus` (komplex, preview + lightbox + viewer)
**Input:** Block 4.1 klart
**Output:** Fillista med förhandsgranskning

- [ ] Bygga filfliken i projektvyn med rutnätsvisning
- [ ] Miniatyrbilder för bilder, ikon för dokument
- [ ] Server Action `getFiles` filtrerat på projectId + tenantId
- [ ] Klick öppnar förhandsgranskning — PDF i inbyggd viewer, bilder i lightbox
- [ ] Nedladdningslänk via presigned URL
- [ ] Server Action `deleteFile` — radera från MinIO och DB

**Verifiering:** Filer visas, förhandsgranskning fungerar, radering rensar MinIO + DB, tenantId-filter, `npm run build` OK

### Block 4.3: OCR-pipeline
**Modell:** Claude `opus` (komplex, AI-integration + chunkning)
**Input:** Block 4.1 klart, Mistral API-nyckel
**Output:** Automatisk OCR vid filuppladdning

- [ ] Skapa `src/lib/ai/ocr.ts` med Mistral OCR-integration
- [ ] Vid uppladdning av PDF/bild: trigga OCR automatiskt
- [ ] Spara extraherad text i `File.ocrText`
- [ ] Chunka texten (500–1000 tokens per chunk)
- [ ] Spara chunks i DocumentChunk med metadata (sidnummer, position)
- [ ] Visa OCR-text kopplat till filen i UI

**Verifiering:** OCR körs vid upload, text sparas, chunks skapas, text visas i UI, `npm run build` OK

### Block 4.4: Embeddings-pipeline
**Modell:** Claude `opus` (komplex, vektordatabas + sökning)
**Input:** Block 4.3 klart, OpenAI API-nyckel
**Output:** Semantisk sökning i dokument

- [ ] Skapa `src/lib/ai/embeddings.ts` med OpenAI embeddings-integration
- [ ] Efter chunkning: generera embedding per chunk via OpenAI API
- [ ] Spara vektor i DocumentChunk.embedding (raw SQL)
- [ ] Skapa SQL-funktion för cosine similarity-sökning
- [ ] Skapa `searchDocuments`-funktion filtrerat på projectId + tenantId
- [ ] Bakgrundsbearbetning — använd queue eller async job (ej blockera upload)

**Verifiering:** Embeddings genereras, vektorsökning returnerar relevanta resultat, tenantId-filter, `npm run build` OK

---

## Fas 5 — AI-assistenter

### Block 5.1: Vercel AI SDK-setup
**Modell:** Gemini `gemini-3-flash-preview` (enkel, 2 filer)
**Input:** Fas 1 klar, API-nycklar för Anthropic/OpenAI/Mistral
**Output:** Fungerande AI-streaming-endpoint

- [ ] Installera `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/mistral`
- [ ] Skapa `src/lib/ai/providers.ts` med provider-konfiguration
- [ ] Skapa API-route för AI-streaming: `src/app/api/ai/chat/route.ts`
- [ ] Implementera SSE-streaming med Vercel AI SDK
- [ ] Verifiera att streaming fungerar end-to-end

**Verifiering:** Streaming fungerar, AI svarar, SSE-events skickas, `npm run build` OK

### Block 5.2: Projekt-AI — Chatt och kontext
**Modell:** Claude `opus` (komplex, AI + verktyg + UI)
**Input:** Block 5.1 + Fas 3 + Fas 4 klara
**Output:** Fungerande projekt-AI med chattgränssnitt

- [ ] Bygga chattgränssnitt i projektfliken "AI"
- [ ] Implementera `useChat` hook på klienten
- [ ] Bygga systemprompt-generator som injicerar projektkontext
- [ ] Skapa Conversation och Message-poster i databasen
- [ ] Implementera konversationshistorik (senaste meddelanden + sammanfattning)

**Verifiering:** Chatt fungerar, meddelanden sparas i DB, kontext injiceras, `npm run build` OK

### Block 5.3: Projekt-AI — Verktyg
**Modell:** Claude `opus` (komplex, tool calling)
**Input:** Block 5.2 klart
**Output:** AI-verktyg för projekthantering

- [ ] Definiera verktyg för projekt-AI:
  - [ ] Hämta projektets uppgifter
  - [ ] Skapa och uppdatera uppgifter
  - [ ] Hämta projektets filer
  - [ ] Söka i dokument via embeddings
  - [ ] Hämta projektmedlemmar
  - [ ] Skicka AIMessage till personlig AI

**Verifiering:** Alla verktyg anropas korrekt av AI, tenantId-filter i alla verktyg, resultat returneras, `npm run build` OK

### Block 5.4: Personlig AI
**Modell:** Claude `opus` (komplex, global komponent + verktyg)
**Input:** Block 5.2 klart (AI-infrastruktur)
**Output:** Global personlig AI-assistent

- [ ] Bygga chattkomponent i nedre högra hörnet (global, alla sidor)
- [ ] Bygga systemprompt-generator med användarens kontext
- [ ] Definiera verktyg för personlig AI:
  - [ ] Hämta olästa AIMessages
  - [ ] Markera AIMessages som lästa
  - [ ] Skicka AIMessage till projekt-AI
  - [ ] Hämta användarens uppgifter (alla projekt)
  - [ ] Hämta projektlista
  - [ ] Söka i filer
  - [ ] Skapa och uppdatera uppgifter

**Verifiering:** Chattkomponent visas globalt, verktyg fungerar, tenantId-filter, `npm run build` OK

### Block 5.5: AI-kommunikation
**Modell:** Claude `opus` (komplex, meddelandeflöde mellan AI:er)
**Input:** Block 5.3 + 5.4 klara
**Output:** Fungerande kommunikation mellan AI-assistenter

- [ ] Implementera AIMessage-flöde: projekt-AI skickar till personlig AI
- [ ] Implementera AIMessage-flöde: personlig AI svarar till projekt-AI
- [ ] Trådning via parentId
- [ ] Projekt-AI triggar meddelanden vid: uppgift tilldelad, deadline ändrad, fil uppladdad, status ändrad
- [ ] Personlig AI kollar olästa meddelanden vid start

**Verifiering:** Meddelanden skickas mellan AI:er, trådar fungerar, automatiska triggers fungerar, `npm run build` OK

### Block 5.6: Konversationshantering
**Modell:** Gemini `gemini-3-flash-preview` (enkel, 1–2 filer)
**Input:** Block 5.2 klart
**Output:** Konversationshistorik och sammanfattning

- [ ] Spara alla meddelanden i Message-tabellen
- [ ] Implementera sammanfattning/komprimering vid långt antal meddelanden
- [ ] Spara sammanfattning i Conversation.summary
- [ ] Ladda sammanfattning + senaste meddelanden vid ny session
- [ ] Visa konversationshistorik i UI (lista tidigare konversationer)

**Verifiering:** Meddelanden sparas, sammanfattning genereras, historik visas, `npm run build` OK

### Block 5.7: Dokumentanalys och generering
**Modell:** Claude `opus` (komplex, filgenerering + MinIO-integration)
**Input:** Block 5.3 + Fas 4 klara
**Output:** AI kan analysera och generera dokument

- [ ] AI-verktyg: analysera PDF/ritning (anropa OCR + skicka text som kontext)
- [ ] AI-verktyg: generera Excel-dokument (skapa fil + ladda upp till MinIO)
- [ ] AI-verktyg: generera PDF-dokument
- [ ] AI-verktyg: generera Word-dokument
- [ ] Sparade dokument syns i projektets fillista

**Verifiering:** Dokument genereras korrekt, sparas i MinIO, visas i fillistan, `npm run build` OK

---

## Fas 6 — Notifikationer och realtid

### Block 6.1: In-app-notifikationer och SSE
**Modell:** Claude `opus` (komplex, SSE + realtid + UI)
**Input:** Fas 2 klar (auth), Fas 3 klar (dashboard)
**Output:** Fungerande notifikationssystem med SSE

- [ ] Skapa API-route för SSE: `src/app/api/sse/route.ts`
- [ ] Klienten ansluter med EventSource vid inloggning
- [ ] Skapa `createNotification`-funktion som sparar i DB + skickar via SSE
- [ ] Visa notifikationsklocka i topbar med antal olästa
- [ ] Bygga notifikationspanel med lista och "markera som läst"
- [ ] Server Action `markNotificationRead`

**Verifiering:** SSE-anslutning fungerar, notifikationer visas i realtid, markering fungerar, tenantId-filter, `npm run build` OK

### Block 6.2: Push och e-postnotifikationer
**Modell:** Claude `opus` (komplex, Web Push API + Resend)
**Input:** Block 6.1 klart, Resend konfigurerat (Block 2.4)
**Output:** Push- och e-postnotifikationer

- [ ] Implementera Web Push API — service worker, subscription, VAPID-nycklar
- [ ] Skicka push-notis vid viktiga händelser (AI bedömer vikt)
- [ ] Exponera push-subscription-registrering i inställningar
- [ ] Skicka e-post via Resend vid kritiska händelser
- [ ] Mallar för: uppgift tilldelad, deadline imorgon, projektstatusändring
- [ ] Inställningar per användare: vilka händelser triggar e-post

**Verifiering:** Push-notis skickas, e-post skickas, inställningar sparas, `npm run build` OK

### Block 6.3: Realtidsuppdateringar
**Modell:** Gemini `gemini-3-flash-preview` (enkel, bygger på befintlig SSE)
**Input:** Block 6.1 klart (SSE fungerar)
**Output:** Realtidsuppdateringar av UI

- [ ] SSE-events för uppgiftsändringar (annan teammedlem uppdaterar)
- [ ] SSE-events för nya filer
- [ ] SSE-events för projektstatusändringar
- [ ] Klienten lyssnar och uppdaterar UI i realtid

**Verifiering:** UI uppdateras vid ändringar från annan användare, `npm run build` OK

### Block 6.4: Påminnelser vid inaktivitet
**Modell:** Claude `opus` (komplex, bakgrundsjobb + AI-bedömning)
**Input:** Block 6.1 + 6.2 klara
**Output:** Automatiska påminnelser

- [ ] Bakgrundsjobb som kontrollerar uppgifter med deadline som inte uppdaterats
- [ ] Konfigurerbar tröskel (t.ex. 2 dagar utan aktivitet innan deadline)
- [ ] Skicka påminnelse till tilldelad person via notifikationssystemet
- [ ] AI bedömer allvarlighetsgrad och väljer kanal (in-app, push, e-post)

**Verifiering:** Påminnelser triggas vid inaktivitet, rätt kanal väljs, tenantId-filter, `npm run build` OK

---

## Fas 7 — Inställningar och administration

### Block 7.1: Företags- och användarinställningar
**Modell:** Claude `opus` (komplex, 3+ sektioner + roller)
**Input:** Fas 2 klar (auth + roller)
**Output:** Inställningssidor

- [ ] Bygga inställningssida med sektioner
- [ ] Företagsuppgifter: namn, organisationsnummer, adress
- [ ] Server Action `updateTenant` med admin-check
- [ ] Lista alla användare i tenant med roll
- [ ] Ändra roll på befintlig användare
- [ ] Ta bort användare (avsluta membership)
- [ ] Visa inbjudningar (aktiva, väntande, utgångna)

**Verifiering:** Inställningar sparas, rollcheck fungerar, admin-only åtkomst, tenantId-filter, `npm run build` OK

### Block 7.2: Rättighetshantering
**Modell:** Claude `opus` (komplex, permissions-system)
**Input:** Block 7.1 klart
**Output:** Konfigurerbart rättighetssystem

- [ ] Definiera konfigurerbara rättigheter per roll
- [ ] UI för att ändra rättigheter per roll
- [ ] Spara i Membership.permissions (JSON)
- [ ] Alla Server Actions respekterar permissions

**Verifiering:** Rättigheter sparas och respekteras, alla Server Actions kontrollerar permissions, `npm run build` OK

### Block 7.3: Personliga inställningar
**Modell:** Gemini `gemini-3-flash-preview` (enkel, 1–2 filer)
**Input:** Fas 2 klar (auth)
**Output:** Profil- och preferenssida

- [ ] Profilsida: namn, e-post, profilbild
- [ ] Byta lösenord
- [ ] Notifikationsinställningar: vilka kanaler (in-app, push, e-post) per händelsetyp
- [ ] Dark mode-preferens
- [ ] Språkval (svenska/engelska) — sparas i User.locale

**Verifiering:** Profil uppdateras, lösenord byts, preferenser sparas, `npm run build` OK

---

## Fas 8 — Tidrapportering och export

### Block 8.1: Tidrapportering
**Modell:** Claude `opus` (komplex, UI + CRUD + summering)
**Input:** Fas 3 klar (projekt + uppgifter)
**Output:** Fungerande tidrapporteringssystem

- [ ] Bygga tidrapporteringsvy i projektet (ny flik eller del av uppgiftsvyn)
- [ ] Snabb tidsregistrering: välj uppgift, ange minuter/timmar, datum och valfri beskrivning
- [ ] Server Action `createTimeEntry` med Zod-validering + auth
- [ ] Visa tidslista per projekt med summa per dag/vecka
- [ ] Visa tidslista per användare (mina tider)
- [ ] Server Action `updateTimeEntry` och `deleteTimeEntry` (bara egna poster)
- [ ] Summering: totalt per projekt, per uppgift, per person

**Verifiering:** Tider registreras/uppdateras/raderas, summering korrekt, tenantId-filter, `npm run build` OK

### Block 8.2: Export och rapporter
**Modell:** Claude `opus` (komplex, PDF/Excel-generering + MinIO)
**Input:** Block 8.1 + Fas 4 klara (tidsdata + MinIO)
**Output:** Export-funktionalitet

- [ ] Exportera projektsammanställning som PDF (uppgifter, status, tider, medlemmar)
- [ ] Exportera tidrapport som Excel (filtrerat på period, projekt, person)
- [ ] Exportera uppgiftslista som Excel
- [ ] AI-verktyg: generera sammanfattande projektrapport (text + data)
- [ ] Nedladdning via presigned URL från MinIO (genererade filer sparas)

**Verifiering:** PDF och Excel genereras korrekt, nedladdning fungerar, tenantId-filter, `npm run build` OK

---

## Fas 9 — Betalning (Stripe)

### Block 9.1: Stripe-setup och trial
**Modell:** Claude `opus` (komplex, Stripe API + webhooks)
**Input:** Fas 2 klar (registrering), `/docs/stripe.md`
**Output:** Stripe-integration med trial

- [ ] Konfigurera Stripe med produkter och priser
- [ ] Skapa webhook-endpoint `src/app/api/stripe/webhook/route.ts`
- [ ] Hantera events: checkout.session.completed, invoice.paid, customer.subscription.updated/deleted
- [ ] Vid registrering: skapa Stripe Customer + 14-dagars trial
- [ ] Spara stripeCustomerId på Tenant
- [ ] Skapa Subscription-post i DB

**Verifiering:** Webhook tar emot events, trial skapas vid registrering, Subscription sparas i DB, `npm run build` OK

### Block 9.2: Prenumerationshantering
**Modell:** Claude `opus` (komplex, Stripe Portal + statushantering)
**Input:** Block 9.1 klart
**Output:** Faktureringssida med prenumerationshantering

- [ ] Bygga faktureringssida i inställningar
- [ ] Visa aktuell plan, status och nästa fakturadatum
- [ ] "Uppgradera/Ändra plan"-knapp → Stripe Customer Portal
- [ ] Hantera misslyckade betalningar (status PAST_DUE)
- [ ] Vid CANCELED: begränsa åtkomst men behåll data
- [ ] Räkna antal aktiva memberships per tenant
- [ ] Uppdatera Stripe-prenumeration vid tillägg/borttagning av användare
- [ ] Visa kostnad per användare i inställningar

**Verifiering:** Faktureringssida visar korrekt info, Customer Portal öppnas, användare räknas korrekt, `npm run build` OK

---

## Fas 10 — Landningssida

### Block 10.1: Landningssida
**Modell:** Claude `opus` (komplex, 3+ sektioner + responsiv + SEO)
**Input:** Fas 1 klar (Next.js + i18n)
**Output:** Publik landningssida

- [ ] Bygga hero-sektion med rubrik, beskrivning och "Kom igång gratis"-knapp
- [ ] Bygga funktionssektion med rutnät: projekthantering, filer, AI, team
- [ ] Bygga "Så fungerar det" i tre steg
- [ ] Bygga prissättningssektion med planer
- [ ] Bygga socialt bevis-sektion (placeholder-citat)
- [ ] Bygga footer med kontaktinfo och länkar
- [ ] Responsiv design — mobil först
- [ ] SEO: metadata, Open Graph, sitemap

**Verifiering:** Alla sektioner renderas, responsiv design fungerar, SEO-metadata finns, alla texter via i18n, `npm run build` OK

---

## Fas 11 — Mobilapp (Expo)

### Block 11.1: Expo-setup och auth
**Modell:** Claude `opus` (komplex, nytt projekt + auth-flöde)
**Input:** Fas 2 klar (auth-endpoints), `/docs/expo.md`
**Output:** Expo-projekt med autentisering

- [ ] Initiera Expo SDK 54-projekt med TypeScript
- [ ] Konfigurera Expo Router v6 för navigation
- [ ] Implementera JWT-autentisering med expo-secure-store
- [ ] Skapa API-klient som skickar Bearer token
- [ ] Inloggningsskärm

**Verifiering:** App startar, inloggning fungerar mot backend, token sparas säkert

### Block 11.2: Grundläggande skärmar
**Modell:** Claude `opus` (komplex, 5+ skärmar)
**Input:** Block 11.1 klart
**Output:** Alla grundskärmar

- [ ] Dashboard med "mina uppgifter"
- [ ] Projektlista
- [ ] Projektvy med uppgifter och filer
- [ ] AI-chatt (personlig + projekt)
- [ ] Inställningar

**Verifiering:** Alla skärmar renderas, data hämtas från API, navigation fungerar

### Block 11.3: Mobilspecifikt
**Modell:** Claude `opus` (komplex, push + kamera + offline)
**Input:** Block 11.2 klart
**Output:** Mobilspecifika funktioner

- [ ] Push-notifikationer via Expo Push API
- [ ] Kamera-integration för bilduppladdning direkt
- [ ] Offline-stöd för uppgiftslistan (cache)

**Verifiering:** Push-notifikationer fungerar, kamera laddar upp bilder, offline-cache fungerar

### Block 11.4: Build och distribution
**Modell:** Gemini `gemini-3-flash-preview` (enkel, konfiguration)
**Input:** Block 11.2 + 11.3 klara
**Output:** Buildkonfiguration och distribution

- [ ] Konfigurera EAS Build för Android och iOS
- [ ] Testflight (iOS) och intern testning (Android)
- [ ] App Store och Google Play-publicering

**Verifiering:** EAS Build lyckas, appen installeras på testenheter

---

## Fas 12 — Deploy och produktion

### Block 12.1: Docker och Coolify
**Modell:** Claude `opus` (komplex, Docker + Coolify + infrastruktur)
**Input:** Hela appen klar, `/docs/docker.md`, `/docs/coolify.md`
**Output:** Produktionsdeploy

- [ ] Skapa produktions-Dockerfile för Next.js
- [ ] Konfigurera multi-stage build
- [ ] Testa lokalt med `docker build` och `docker run`
- [ ] Konfigurera Coolify med GitHub-integration
- [ ] Konfigurera PostgreSQL som separat tjänst i Coolify
- [ ] Konfigurera MinIO som separat tjänst
- [ ] Konfigurera Redis som separat tjänst
- [ ] Sätta miljövariabler i Coolify
- [ ] Konfigurera domän och SSL
- [ ] Verifiera automatisk deploy vid push till main

**Verifiering:** Docker-image bygger, deploy lyckas, appen svarar på domän med SSL

### Block 12.2: Övervakning
**Modell:** Gemini `gemini-3-flash-preview` (enkel, 1–2 filer)
**Input:** Block 12.1 klart
**Output:** Grundläggande övervakning

- [ ] Felrapportering (Sentry eller liknande)
- [ ] Healthcheck-endpoint
- [ ] Loggning av viktiga händelser

**Verifiering:** Sentry fångar fel, healthcheck svarar 200, loggar skrivs

---

## Sammanfattning per fas

| Fas | Beskrivning | Steg | Agentblock |
|-----|-------------|------|------------|
| 1 | Setup och infrastruktur | 28 | 4 |
| 2 | Autentisering och multi-tenant | 30 | 5 |
| 3 | Dashboard, projekt, kommentarer, aktivitetslogg, sökning | 45 | 9 |
| 4 | Filhantering | 23 | 4 |
| 5 | AI-assistenter | 31 | 7 |
| 6 | Notifikationer, realtid och påminnelser | 20 | 4 |
| 7 | Inställningar och administration | 15 | 3 |
| 8 | Tidrapportering och export | 12 | 2 |
| 9 | Betalning (Stripe) | 13 | 2 |
| 10 | Landningssida | 8 | 1 |
| 11 | Mobilapp (Expo) | 14 | 4 |
| 12 | Deploy och produktion | 11 | 2 |
| **Totalt** | | **250** | **47** |
