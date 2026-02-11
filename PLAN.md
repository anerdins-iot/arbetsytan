# Projektplan — ArbetsYtan (AY)

Detaljerad byggplan med checklistor. Varje steg markeras med `[ ]` (ej klart) eller `[x]` (klart).
Se `PROJEKT.md` för övergripande beskrivning, `AI.md` för AI-arkitektur, `UI.md` för designspråk.

### Generella regler (gäller alla faser)

- **i18n**: Alla UI-texter ska gå via `next-intl` — aldrig hårdkodade strängar. Översättningar i `messages/sv.json` och `messages/en.json`. Varje gång en ny sida eller komponent byggs ska översättningsnycklar skapas för båda språken samtidigt.

---

## Fas 1 — Projektsetup och infrastruktur

### 1.1 Utvecklingsmiljö
- [ ] Initiera Next.js 16-projekt med App Router och TypeScript
- [ ] Konfigurera Tailwind CSS v4 med CSS-variabler enligt `/docs/tailwind.md`
- [ ] Installera och konfigurera shadcn/ui med tema enligt `UI.md`
- [ ] Skapa `docker-compose.yml` med PostgreSQL, MinIO och Redis
- [ ] Konfigurera Prisma 7 med `prisma-client` provider och output
- [ ] Köra `prisma migrate dev` med hela schemat från `schema.prisma`
- [ ] Skapa `.env.local.example` med alla nödvändiga miljövariabler
- [ ] Verifiera att `npm run dev`, `npm run build` och `docker-compose up -d` fungerar

### 1.2 Internationalisering (i18n)
- [ ] Installera och konfigurera `next-intl`
- [ ] Skapa `src/i18n/request.ts` och `src/i18n/routing.ts`
- [ ] Skapa `messages/sv.json` med grundläggande nycklar (navigation, knappar, felmeddelanden)
- [ ] Skapa `messages/en.json` med samma nycklar på engelska
- [ ] Konfigurera `[locale]`-segment i App Router (flytta sidor under `app/[locale]/`)
- [ ] Konfigurera språkdetektering och default locale (sv)
- [ ] Verifiera att `/sv/` och `/en/` fungerar korrekt

### 1.3 Databasschema och seed
- [ ] Verifiera att hela schemat i `schema.prisma` migreras korrekt
- [ ] Skapa raw SQL-migrering för pgvector-extension (`CREATE EXTENSION vector`)
- [ ] Skapa raw SQL för embedding-kolumn på DocumentChunk
- [ ] Skapa `prisma/seed.ts` med testdata: tenant, användare, memberships, projekt, uppgifter
- [ ] Verifiera seed fungerar med `npx prisma db seed`

### 1.4 Grundläggande layout och routing
- [ ] Skapa root layout med Inter-typsnitt och temavariabler
- [ ] Skapa `(auth)`-grupp med layout för login/register
- [ ] Skapa `(dashboard)`-grupp med layout: sidmeny, topbar, innehåll
- [ ] Bygga sidmeny med navigation: Dashboard, Projekt, Inställningar
- [ ] Bygga topbar med användarinfo och notifikationsikon
- [ ] Implementera responsiv layout — sidmeny kollapsar på mobil
- [ ] Implementera dark mode-toggle som växlar CSS-variablerna

---

## Fas 2 — Autentisering och multi-tenant

### 2.1 Auth.js-konfiguration
- [ ] Installera och konfigurera Auth.js v5 med Credentials-provider
- [ ] Konfigurera `src/lib/auth.ts` med session-callbacks
- [ ] Skapa `proxy.ts` enligt Next.js 16-mönster (ej middleware.ts)
- [ ] Implementera lösenordshashning med bcrypt vid registrering
- [ ] Konfigurera session-strategi (cookies för webb)
- [ ] Lägga till `tenantId` och `role` i session via callbacks

### 2.2 Registrering
- [ ] Bygga registreringssida med formulär: namn, e-post, lösenord, företagsnamn
- [ ] Skapa Server Action `registerUser` — validering med Zod, skapa User + Tenant + Membership(ADMIN)
- [ ] Hantera felmeddelanden på svenska (e-post redan registrerad, valideringsfel)
- [ ] Automatisk inloggning efter registrering
- [ ] Redirect till dashboard

### 2.3 Inloggning
- [ ] Bygga inloggningssida med e-post och lösenord
- [ ] Skapa Server Action `loginUser` med Zod-validering
- [ ] Felhantering: felaktiga uppgifter, låst konto
- [ ] Redirect till dashboard efter lyckad inloggning
- [ ] "Glömt lösenord"-länk (placeholder — implementeras i 2.5)

### 2.4 Session och skyddade routes
- [ ] Skapa `getSession`-hjälpfunktion som returnerar user, tenantId, role
- [ ] Skapa `requireAuth`-wrapper för Server Actions som kontrollerar session
- [ ] Skapa `requireRole`-wrapper som kräver specifik roll (ADMIN, PROJECT_MANAGER)
- [ ] Alla dashboard-sidor kontrollerar session — redirect till login om ej autentiserad
- [ ] Alla Server Actions kontrollerar auth + tenant

### 2.5 Lösenordsåterställning
- [ ] Konfigurera Resend för e-postutskick
- [ ] Bygga "Glömt lösenord"-sida med e-postfält
- [ ] Skapa Server Action som genererar VerificationToken och skickar e-post
- [ ] Bygga "Nytt lösenord"-sida som tar emot token
- [ ] Skapa Server Action som validerar token och uppdaterar lösenord

### 2.6 Inbjudningar
- [ ] Bygga inbjudningsformulär i inställningar (e-post + roll)
- [ ] Skapa Server Action `inviteUser` — skapar Invitation med token och expiresAt
- [ ] Skicka inbjudningsmail via Resend med unik länk
- [ ] Bygga accepteringssida — skapa konto och Membership med vald roll
- [ ] Hantera redan registrerade användare (koppla till befintlig User)
- [ ] Visa listan med aktiva och väntande inbjudningar i inställningar
- [ ] Server Action för att avbryta inbjudan

---

## Fas 3 — Dashboard och projekt

### 3.1 Dashboard
- [ ] Bygga dashboard-sida med tre sektioner: uppgifter, aktivitet, notifikationer
- [ ] Hämta "mina uppgifter" via Server Action filtrerat på membership + tenantId
- [ ] Visa uppgifter som lista med status, deadline och projektkoppling
- [ ] Hämta senaste aktiviteten i användarens projekt
- [ ] Visa notifikationer (olästa markerade)
- [ ] Montörs-vy: förenklad dashboard med enbart "mina uppgifter idag"

### 3.2 Projektlista
- [ ] Bygga projektlista-sida med kort för varje projekt
- [ ] Server Action `getProjects` filtrerat på tenantId
- [ ] Visa namn, status, antal uppgifter, senaste aktivitet per projekt
- [ ] "Skapa nytt projekt"-knapp och modal/sida
- [ ] Server Action `createProject` med Zod-validering + tenantId
- [ ] Sökfunktion och statusfilter (aktiv, pausad, klar, arkiverad)

### 3.3 Projektvy — Översikt
- [ ] Bygga projektvy med flik-navigation: Översikt, Uppgifter, Filer, AI
- [ ] Översiktsflik visar projektnamn, status, adress, beskrivning
- [ ] Visa antal uppgifter per status (todo, pågående, klart)
- [ ] Visa projektmedlemmar med roller
- [ ] Server Action `getProject` med tenantId-filter
- [ ] Möjlighet att redigera projektinfo (namn, adress, status, beskrivning)
- [ ] Server Action `updateProject` med auth + tenant-check

### 3.4 Uppgifter — Kanban
- [ ] Bygga kanban-board med tre kolumner: Att göra, Pågående, Klart
- [ ] Server Action `getTasks` filtrerat på projectId + tenantId
- [ ] Drag-and-drop för att flytta uppgifter mellan kolumner
- [ ] Server Action `updateTaskStatus` som uppdaterar status
- [ ] Skapa ny uppgift — modal med titel, beskrivning, prioritet, deadline
- [ ] Server Action `createTask` med Zod-validering
- [ ] Tilldela uppgift till projektmedlem
- [ ] Server Action `assignTask` som skapar TaskAssignment
- [ ] Uppgiftsdetalj-vy med redigering av alla fält
- [ ] Server Action `updateTask` och `deleteTask`
- [ ] Filtrera uppgifter på tilldelad person, prioritet, status

### 3.5 Kommentarer på uppgifter
- [ ] Bygga kommentarsfält i uppgiftsdetalj-vyn
- [ ] Server Action `createComment` med Zod-validering + auth
- [ ] Visa kommentarer kronologiskt med författare och tid
- [ ] Server Action `updateComment` och `deleteComment` (bara egen kommentar)
- [ ] Trigga notis till tilldelade personer vid ny kommentar

### 3.6 Teamhantering
- [ ] Visa projektmedlemmar i projektvyn
- [ ] Lägga till befintliga teammedlemmar (från tenant) till projekt
- [ ] Ta bort medlem från projekt
- [ ] Server Actions med roller-check (bara admin/projektledare kan hantera)

### 3.7 Aktivitetslogg
- [ ] Logga alla viktiga händelser i ActivityLog: uppgift skapad/ändrad/klar, fil uppladdad, medlem tillagd, status ändrad
- [ ] Visa aktivitetslogg i projektöversikten (senaste händelserna)
- [ ] Fullständig aktivitetslogg-sida per projekt med filtrering och paginering
- [ ] Server Action `getActivityLog` filtrerat på projectId + tenantId
- [ ] Inkludera aktör (vem), action, entity och metadata i varje post

### 3.8 Global sökning
- [ ] Bygga sökfält i topbar som söker över alla tillgängliga resurser
- [ ] Sök i projektnamn och beskrivningar
- [ ] Sök i uppgiftstitlar och beskrivningar
- [ ] Sök i filnamn och OCR-extraherad text (via embeddings för semantisk sökning)
- [ ] Server Action `globalSearch` filtrerat på tenantId + användarens projekt
- [ ] Visa sökresultat grupperat per typ (projekt, uppgifter, filer) med djuplänkar
- [ ] Debounce och minst 2 tecken innan sökning triggas

---

## Fas 4 — Filhantering

### 4.1 MinIO-integration
- [ ] Konfigurera MinIO-klient i `src/lib/minio.ts`
- [ ] Skapa bucket per tenant eller per projekt (välj strategi)
- [ ] Generera presigned URL:er för uppladdning
- [ ] Generera presigned URL:er för nedladdning/visning

### 4.2 Filuppladdning
- [ ] Bygga uppladdningskomponent med drag-and-drop
- [ ] Stöd för flera filer samtidigt
- [ ] Visa uppladdningsförlopp
- [ ] Server Action `uploadFile` — validera typ/storlek, spara metadata i DB, ladda upp till MinIO
- [ ] Stöd för filtyper: PDF, bilder (JPG/PNG/WEBP), dokument (DOCX, XLSX)
- [ ] Maxstorlek per fil och per tenant

### 4.3 Fillista och förhandsgranskning
- [ ] Bygga filfliken i projektvyn med rutnätsvisning
- [ ] Miniatyrbilder för bilder, ikon för dokument
- [ ] Server Action `getFiles` filtrerat på projectId + tenantId
- [ ] Klick öppnar förhandsgranskning — PDF i inbyggd viewer, bilder i lightbox
- [ ] Nedladdningslänk via presigned URL
- [ ] Server Action `deleteFile` — radera från MinIO och DB

### 4.4 OCR-pipeline
- [ ] Skapa `src/lib/ai/ocr.ts` med Mistral OCR-integration
- [ ] Vid uppladdning av PDF/bild: trigga OCR automatiskt
- [ ] Spara extraherad text i `File.ocrText`
- [ ] Chunka texten (500–1000 tokens per chunk)
- [ ] Spara chunks i DocumentChunk med metadata (sidnummer, position)
- [ ] Visa OCR-text kopplat till filen i UI

### 4.5 Embeddings-pipeline
- [ ] Skapa `src/lib/ai/embeddings.ts` med OpenAI embeddings-integration
- [ ] Efter chunkning: generera embedding per chunk via OpenAI API
- [ ] Spara vektor i DocumentChunk.embedding (raw SQL)
- [ ] Skapa SQL-funktion för cosine similarity-sökning
- [ ] Skapa `searchDocuments`-funktion filtrerat på projectId + tenantId
- [ ] Bakgrundsbearbetning — använd queue eller async job (ej blockera upload)

---

## Fas 5 — AI-assistenter

### 5.1 Vercel AI SDK-setup
- [ ] Installera `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/mistral`
- [ ] Skapa `src/lib/ai/providers.ts` med provider-konfiguration
- [ ] Skapa API-route för AI-streaming: `src/app/api/ai/chat/route.ts`
- [ ] Implementera SSE-streaming med Vercel AI SDK
- [ ] Verifiera att streaming fungerar end-to-end

### 5.2 Projekt-AI
- [ ] Bygga chattgränssnitt i projektfliken "AI"
- [ ] Implementera `useChat` hook på klienten
- [ ] Bygga systemprompt-generator som injicerar projektkontext
- [ ] Skapa Conversation och Message-poster i databasen
- [ ] Implementera konversationshistorik (senaste meddelanden + sammanfattning)
- [ ] Definiera verktyg för projekt-AI:
  - [ ] Hämta projektets uppgifter
  - [ ] Skapa och uppdatera uppgifter
  - [ ] Hämta projektets filer
  - [ ] Söka i dokument via embeddings
  - [ ] Hämta projektmedlemmar
  - [ ] Skicka AIMessage till personlig AI

### 5.3 Personlig AI
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

### 5.4 AI-kommunikation
- [ ] Implementera AIMessage-flöde: projekt-AI skickar till personlig AI
- [ ] Implementera AIMessage-flöde: personlig AI svarar till projekt-AI
- [ ] Trådning via parentId
- [ ] Projekt-AI triggar meddelanden vid: uppgift tilldelad, deadline ändrad, fil uppladdad, status ändrad
- [ ] Personlig AI kollar olästa meddelanden vid start

### 5.5 Konversationshantering
- [ ] Spara alla meddelanden i Message-tabellen
- [ ] Implementera sammanfattning/komprimering vid långt antal meddelanden
- [ ] Spara sammanfattning i Conversation.summary
- [ ] Ladda sammanfattning + senaste meddelanden vid ny session
- [ ] Visa konversationshistorik i UI (lista tidigare konversationer)

### 5.6 Dokumentanalys och generering
- [ ] AI-verktyg: analysera PDF/ritning (anropa OCR + skicka text som kontext)
- [ ] AI-verktyg: generera Excel-dokument (skapa fil + ladda upp till MinIO)
- [ ] AI-verktyg: generera PDF-dokument
- [ ] AI-verktyg: generera Word-dokument
- [ ] Sparade dokument syns i projektets fillista

---

## Fas 6 — Notifikationer och realtid

### 6.1 In-app-notifikationer
- [ ] Skapa API-route för SSE: `src/app/api/sse/route.ts`
- [ ] Klienten ansluter med EventSource vid inloggning
- [ ] Skapa `createNotification`-funktion som sparar i DB + skickar via SSE
- [ ] Visa notifikationsklocka i topbar med antal olästa
- [ ] Bygga notifikationspanel med lista och "markera som läst"
- [ ] Server Action `markNotificationRead`

### 6.2 Push-notifikationer
- [ ] Implementera Web Push API — service worker, subscription, VAPID-nycklar
- [ ] Skicka push-notis vid viktiga händelser (AI bedömer vikt)
- [ ] Exponera push-subscription-registrering i inställningar

### 6.3 E-postnotifikationer
- [ ] Skicka e-post via Resend vid kritiska händelser
- [ ] Mallar för: uppgift tilldelad, deadline imorgon, projektstatusändring
- [ ] Inställningar per användare: vilka händelser triggar e-post

### 6.4 Realtidsuppdateringar
- [ ] SSE-events för uppgiftsändringar (annan teammedlem uppdaterar)
- [ ] SSE-events för nya filer
- [ ] SSE-events för projektstatusändringar
- [ ] Klienten lyssnar och uppdaterar UI i realtid

### 6.5 Påminnelser vid inaktivitet
- [ ] Bakgrundsjobb som kontrollerar uppgifter med deadline som inte uppdaterats
- [ ] Konfigurerbar tröskel (t.ex. 2 dagar utan aktivitet innan deadline)
- [ ] Skicka påminnelse till tilldelad person via notifikationssystemet
- [ ] AI bedömer allvarlighetsgrad och väljer kanal (in-app, push, e-post)

---

## Fas 7 — Inställningar och administration

### 7.1 Företagsinställningar
- [ ] Bygga inställningssida med sektioner
- [ ] Företagsuppgifter: namn, organisationsnummer, adress
- [ ] Server Action `updateTenant` med admin-check

### 7.2 Användarhantering
- [ ] Lista alla användare i tenant med roll
- [ ] Ändra roll på befintlig användare
- [ ] Ta bort användare (avsluta membership)
- [ ] Visa inbjudningar (aktiva, väntande, utgångna)

### 7.3 Rättighetshantering
- [ ] Definiera konfigurerbara rättigheter per roll
- [ ] UI för att ändra rättigheter per roll
- [ ] Spara i Membership.permissions (JSON)
- [ ] Alla Server Actions respekterar permissions

### 7.4 Användarens egna inställningar
- [ ] Profilsida: namn, e-post, profilbild
- [ ] Byta lösenord
- [ ] Notifikationsinställningar: vilka kanaler (in-app, push, e-post) per händelsetyp
- [ ] Dark mode-preferens
- [ ] Språkval (svenska/engelska) — sparas i User.locale

---

## Fas 8 — Tidrapportering och export

### 8.1 Tidrapportering
- [ ] Bygga tidrapporteringsvy i projektet (ny flik eller del av uppgiftsvyn)
- [ ] Snabb tidsregistrering: välj uppgift, ange minuter/timmar, datum och valfri beskrivning
- [ ] Server Action `createTimeEntry` med Zod-validering + auth
- [ ] Visa tidslista per projekt med summa per dag/vecka
- [ ] Visa tidslista per användare (mina tider)
- [ ] Server Action `updateTimeEntry` och `deleteTimeEntry` (bara egna poster)
- [ ] Summering: totalt per projekt, per uppgift, per person

### 8.2 Export och rapporter
- [ ] Exportera projektsammanställning som PDF (uppgifter, status, tider, medlemmar)
- [ ] Exportera tidrapport som Excel (filtrerat på period, projekt, person)
- [ ] Exportera uppgiftslista som Excel
- [ ] AI-verktyg: generera sammanfattande projektrapport (text + data)
- [ ] Nedladdning via presigned URL från MinIO (genererade filer sparas)

---

## Fas 9 — Betalning (Stripe)

### 9.1 Stripe-setup
- [ ] Konfigurera Stripe med produkter och priser
- [ ] Skapa webhook-endpoint `src/app/api/stripe/webhook/route.ts`
- [ ] Hantera events: checkout.session.completed, invoice.paid, customer.subscription.updated/deleted

### 9.2 Trial och registrering
- [ ] Vid registrering: skapa Stripe Customer + 14-dagars trial
- [ ] Spara stripeCustomerId på Tenant
- [ ] Skapa Subscription-post i DB

### 9.3 Prenumerationshantering
- [ ] Bygga faktureringssida i inställningar
- [ ] Visa aktuell plan, status och nästa fakturadatum
- [ ] "Uppgradera/Ändra plan"-knapp → Stripe Customer Portal
- [ ] Hantera misslyckade betalningar (status PAST_DUE)
- [ ] Vid CANCELED: begränsa åtkomst men behåll data

### 9.4 Användarbaserad prissättning
- [ ] Räkna antal aktiva memberships per tenant
- [ ] Uppdatera Stripe-prenumeration vid tillägg/borttagning av användare
- [ ] Visa kostnad per användare i inställningar

---

## Fas 10 — Landningssida

### 10.1 Publika sidor
- [ ] Bygga hero-sektion med rubrik, beskrivning och "Kom igång gratis"-knapp
- [ ] Bygga funktionssektion med rutnät: projekthantering, filer, AI, team
- [ ] Bygga "Så fungerar det" i tre steg
- [ ] Bygga prissättningssektion med planer
- [ ] Bygga socialt bevis-sektion (placeholder-citat)
- [ ] Bygga footer med kontaktinfo och länkar
- [ ] Responsiv design — mobil först
- [ ] SEO: metadata, Open Graph, sitemap

---

## Fas 11 — Mobilapp (Expo)

### 11.1 Expo-setup
- [ ] Initiera Expo SDK 54-projekt med TypeScript
- [ ] Konfigurera Expo Router v6 för navigation
- [ ] Implementera JWT-autentisering med expo-secure-store
- [ ] Skapa API-klient som skickar Bearer token

### 11.2 Grundläggande skärmar
- [ ] Inloggningsskärm
- [ ] Dashboard med "mina uppgifter"
- [ ] Projektlista
- [ ] Projektvy med uppgifter och filer
- [ ] AI-chatt (personlig + projekt)
- [ ] Inställningar

### 11.3 Mobilspecifikt
- [ ] Push-notifikationer via Expo Push API
- [ ] Kamera-integration för bilduppladdning direkt
- [ ] Offline-stöd för uppgiftslistan (cache)

### 11.4 Build och distribution
- [ ] Konfigurera EAS Build för Android och iOS
- [ ] Testflight (iOS) och intern testning (Android)
- [ ] App Store och Google Play-publicering

---

## Fas 12 — Deploy och produktion

### 12.1 Docker
- [ ] Skapa produktions-Dockerfile för Next.js
- [ ] Konfigurera multi-stage build
- [ ] Testa lokalt med `docker build` och `docker run`

### 12.2 Coolify-deploy
- [ ] Konfigurera Coolify med GitHub-integration
- [ ] Konfigurera PostgreSQL som separat tjänst i Coolify
- [ ] Konfigurera MinIO som separat tjänst
- [ ] Konfigurera Redis som separat tjänst
- [ ] Sätta miljövariabler i Coolify
- [ ] Konfigurera domän och SSL
- [ ] Verifiera automatisk deploy vid push till main

### 12.3 Övervakning
- [ ] Felrapportering (Sentry eller liknande)
- [ ] Healthcheck-endpoint
- [ ] Loggning av viktiga händelser

---

## Sammanfattning per fas

| Fas | Beskrivning | Steg |
|-----|-------------|------|
| 1 | Setup och infrastruktur | 28 |
| 2 | Autentisering och multi-tenant | 30 |
| 3 | Dashboard, projekt, kommentarer, aktivitetslogg, sökning | 45 |
| 4 | Filhantering | 23 |
| 5 | AI-assistenter | 31 |
| 6 | Notifikationer, realtid och påminnelser | 20 |
| 7 | Inställningar och administration | 15 |
| 8 | Tidrapportering och export | 12 |
| 9 | Betalning (Stripe) | 13 |
| 10 | Landningssida | 8 |
| 11 | Mobilapp (Expo) | 14 |
| 12 | Deploy och produktion | 11 |
| **Totalt** | | **250** |
