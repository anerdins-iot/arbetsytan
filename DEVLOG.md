# DEVLOG

Löpande logg över problem, lösningar och lärdomar under bygget.
Läs denna fil innan du börjar arbeta. Skriv till den vid problem som inte är triviala.

Format per post: Problem, orsak, lösning, lärdom (max 5 rader).

---

### Konversationshistorik: tool-kort (knappar) renderas inte vid laddning (2026-02-25)
**Problem:** När användaren laddar en gammal konversation från historiken visades bara användartext; assistant-svar och tool-kort (t.ex. grossistsökning, dokument) syntes inte.
**Orsak:** Vi sparade bara assistant-meddelandets sluttext (onFinish i streamText). Tool-anrop och tool-resultat sparades inte, och vid laddning mappade vi varje meddelande till en enda text-part.
**Lösning:** (1) Sparar nu hela assistant-meddelandet (inkl. parts med tool-resultat) i toUIMessageStreamResponse onFinish som JSON (v: 1, parts). (2) I use-conversation-history och load-more: contentToParts(content, role) parsar JSON och bygger parts så tool-kort får state/output och renderas igen. (3) Embedding-pipelinen: extractTextFromMessageContent extraherar text från JSON-parts för chunking.
**Lärdom:** För att historik ska visa tool-kort måste vi persista och återhydrera message parts, inte bara sluttext.

---

### Server Action "was not found" + markdown i e-postförhandsgranskning (2026-02-25)
**Problem:** Efter deploy eller vid flera instanser: "Server Action ... was not found on the server" vid Skicka e-post från personlig AI. Förhandsgranskningen visade rå markdown (t.ex. ### Rubrik) istället för formaterad text.
**Lösning:** (1) NEXT_SERVER_ACTIONS_ENCRYPTION_KEY i .env (base64, t.ex. `openssl rand -base64 32`) så att action-IDs är stabila över byggen. (2) EmailPreviewCard använder nu ReactMarkdown + remarkGfm för "Meddelande"-sektionen så att användaren ser formaterad text. Utgående mail konverterade redan markdown → html/text i send-email.ts.
**Lärdom:** Self-hosted/deploy kräver NEXT_SERVER_ACTIONS_ENCRYPTION_KEY; dokumentera i Coolify/env.

---

### Inkommande e-post: "(Inget innehåll)" på svar (2026-02-25)
**Problem:** Svar på utskickade mail visades som "(Inget innehåll)" i konversationsvyn.
**Orsak:** Resend skickar inte e-postkropp (html/text) i webhooken `email.received` – bara metadata. Vi sparade alltid null för body.
**Lösning:** Efter webhook-anrop hämtar vi innehållet via Resend Received Emails API (`resend.emails.receiving.get(email_id)`). I webhook-routern anrikar vi payload med `html`/`text` innan `processInboundEmail`. I `email-inbound.ts` sätter vi `EmailMessage.bodyText` till avledd text från HTML när endast HTML finns (så sökning/preview fungerar).
**Lärdom:** Resend webhooks inkluderar aldrig body – alltid två steg: webhook → API-anrop för att hämta html/text.

---

### ARKITEKTURBESLUT: AI-chatt ska aldrig rendera datarikt innehåll (2026-02-23)

**Beslut (godkänt av användaren):** AI-chattflödet ska ALDRIG rendera produktlistor, tabeller eller annat datarikt innehåll direkt. Det hackar och buggar.

**Mönster för alla AI-verktyg med datarikt output:**
1. Verktyget returnerar `__[feature]: { query, products/items, count }` i sitt svar
2. AI-modellen får max 10 poster i sin kontext (för att kunna resonera), aldrig alla
3. I chatten renderas BARA en minimal knapp-komponent: "Hittade X [saker] — [Öppna]"
4. Knappen öppnar en Sheet-panel (side="right" desktop, side="bottom" mobil 85vh)
5. Panelen använder EXAKT SAMMA komponenter som den dedikerade UI-sidan (ingen duplicering)

**Pilotimplementation: Grossistsökning (implementerad 2026-02-23)**
- `WholesalerSearchResultButton` — minimal knapp i chattflödet
- `WholesalerSearchPanel` — Sheet-panel med sökfält + produktlista
- `WholesalerSearchResults` — delad komponent (används av sök-UI-sidan OCH panelen)
- `ProductCard` — återanvänds oförändrad i båda kontexterna
- Status: agenten `wholesaler-panel-ui` (Opus) kör just nu och bygger detta

Mönstret appliceras på övriga dataintensiva verktyg (rapport/offert/dokumentsökning är implementerade; andra kan följa samma mönster vid behov).

**Mobilkrav:** Bottom sheet på mobil, touch-targets minst 44px, native scroll i panelen.

**Verifiering (2026-02-24):** Följer mönstret fullt ut (knapp + Sheet right/bottom 85vh): grossistsökning (`__wholesalerSearch`), rapportförhandsgranskning (`__reportPreview`), offertförhandsgranskning (`__quotePreview`), dokumentsökning (`__searchResults`). Alla fyra använder nu Sheet (höger desktop, botten mobil 85vh). Verktyg som returnerar listor utan __[feature]-payload (t.ex. listQuotes, getShoppingLists, listTasks, listTimeEntries) ger fortfarande data till modellen som kan skriva ut i text; för full paritet bör de antingen returnera __[feature]-payload + knapp/panel eller systemprompt begränsa att aldrig räkna upp poster.

## 2026-02-15: createTimeEntry – ID-validering och projektnamn i svar

**Problem:** createTimeEntry (personlig AI) kunde spara tid i fel projekt eftersom AI:n valde projectId själv; användaren såg ingen tydlig bekräftelse om vilket projekt posten skapades i.

**Lösning:** Tidig validering av projectId och taskId med validateDatabaseId (filnamn/namn avvisas). Efter create inkluderas projektnamn i svaret (projectName + tydlig message: "Tidsrapport på X min loggad i projekt \"Projektnamn\".").

**Lärdom:** AI-verktyg som tar ID:n bör validera dem tidigt och returnera kontext (t.ex. projektnamn) så att användaren ser var posten hamnade.

---

## 2026-02-15: WebSocket Auto-Emit Refactoring

**Problem:** ~40 manuella emit-anrop spridda över 15+ filer. Svårt att underhålla och lätt att missa events.

**Lösning:** Prisma extension (`createEmitExtension`) som automatiskt emittar WebSocket-events efter CRUD-operationer.

**Resultat:**
- Alla manuella emit-anrop borttagna
- Konsekvent event-emission
- Enklare att lägga till nya modeller

**Filer:**
- `lib/db-emit-extension.ts` — Prisma extension
- `lib/socket-events.ts` — Event-definitioner
- `hooks/use-socket.ts` — Frontend-hook

---

### Projekt-AI skickade inget AIMessage vid task create/assign (Fas 5)
**Problem:** Efter att projekt-AI skapade eller tilldelade en uppgift visade personlig AI "Du har inga olästa meddelanden från projekt-AI:er" — PROJECT_TO_PERSONAL-flödet syntes inte.
**Orsak:** Projekt-AI använde bara createTask utan assignee; det fanns inget assignTask-verktyg som anropade sendProjectToPersonalAIMessage. Trigger fanns i actions/tasks.ts för UI men användes aldrig från AI-verktygen.
**Lösning:** createTask i project-tools.ts fick valfri assigneeMembershipId och anropar sendProjectToPersonalAIMessage vid tilldelning. Nytt verktyg assignTask(taskId, membershipId) med samma trigger. Systemprompt för projekt-AI utökad så att den använder assigneeMembershipId eller assignTask när någon ska tilldelas.
**Lärdom:** Alla triggers i AI.md (task_assigned etc.) måste anropas från AI-verktygen, inte bara från UI-actions.

---

### Docker healthcheck: använd Node.js istället för curl/wget (Coolify deployment)
**Problem:** Coolify markerade container som `exited:unhealthy` trots att Next.js-servern körs. HEALTHCHECK var kommenterad för att curl/wget inte fanns i node:22-alpine.
**Orsak:** Cirkulärt beroende: healthcheck-verktyg saknades, så healthcheck disabled → container kunde inte rapporteras healthy → Coolify höll den exited.
**Lösning:** HEALTHCHECK använder Node.js built-in HTTP-modul istället: `CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"`. /api/health returnerar alltid 200, även om DB är down, vilket låter containern starta medan DB-fel undersöks separat.
**Lärdom:** Använd aldrig curl/wget för HEALTHCHECK i alpine-baserade images; Node.js är alltid tillgängligt. Design health-endpoints för att returnera 200 för container-hälsa (oberoende av tjänstdependenser).

---

### Auth.js proxy: importera endast auth.config (Block 2.1)
**Problem:** proxy.ts ska importera endast från auth.config (ej auth.ts) enligt Next.js 16-mönster, men behöva kombinera med next-intl.
**Orsak:** Edge-kompatibilitet kräver att proxy inte laddar Prisma/DB; auth.config innehåller inga DB-imports.
**Lösning:** proxy.ts importerar NextAuth och authConfig från auth.config, kör NextAuth(authConfig) lokalt och exporterar default auth((req) => intlMiddleware(req)). API och getSession använder auth.ts (PrismaAdapter, Credentials).
**Lärdom:** Splitta config (auth.config.ts) och full instans (auth.ts). Proxy använder endast config för att undvika DB på edge.

### Expo stödjer inte httpOnly cookies
**Problem:** Antagande att Expo/React Native stödjer httpOnly cookies för autentisering.
**Orsak:** React Native har ingen webbläsare med inbyggt cookie-stöd. httpOnly cookies kräver en browser-kontext.
**Lösning:** JWT Bearer tokens för mobilappen (lagrade i expo-secure-store), cookies för webben. Dual auth-strategi i Auth.js.
**Lärdom:** Verifiera alltid plattformsbegränsningar — anta inte att webb-patterns fungerar i mobil.

### MinIO startar inte i vissa miljöer
**Problem:** MinIO-container avslutas med exitkod 127 och felmeddelande "Fatal glibc error: CPU does not support x86-64-v2".
**Orsak:** Officiella MinIO-imagen (baserad på UBI 9) kräver x86-64-v2 CPU-instruktioner sedan nov 2023. Gäller alla miljöer utan dessa instruktioner.
**Lösning:** Använd `-cpuv1`-taggen, t.ex. `minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1`. MinIO publicerar cpuv1-varianter för varje release som fungerar på äldre CPU:er.
**Lärdom:** Testa Docker-tjänster i målmiljön tidigt — CPU-krav kan variera mellan images. Sök efter `-cpuv1`-taggar om x86-64-v2-fel uppstår.

### pgvector kräver Postgres-image med extension
**Problem:** Migration för pgvector (CREATE EXTENSION vector) misslyckades med "extension vector is not available" på postgres:16-alpine.
**Orsak:** Standard Postgres-imagen innehåller inte pgvector; extension måste vara installerad i den körande Postgres-instansen.
**Lösning:** Bytt db-service i docker-compose.yml till pgvector/pgvector:pg16 så att pgvector finns tillgänglig. Embedding-kolumnen på DocumentChunk läggs till via raw SQL-migration (Prisma har ingen native vektor-typ).
**Lärdom:** För pgvector använd en image som inkluderar extension (t.ex. pgvector/pgvector:pg16). Använd `Unsupported("vector(1536)")` i Prisma-schemat för embedding-kolumnen — se posten nedan.

### Prisma droppar pgvector embedding-kolumnen vid migrate dev
**Problem:** `npx prisma migrate dev` genererade en migration som droppade `DocumentChunk.embedding` eftersom kolumnen inte fanns i schemat (lades till via raw SQL).
**Orsak:** Prisma jämför schemat med databasen och ser kolumnen som "drift" som ska tas bort.
**Lösning:** Deklarera kolumnen i schemat med `embedding Unsupported("vector(1536)")?`. Prisma inkluderar kolumnen i sin diffberäkning utan att försöka hantera den som en vanlig typ. Vektorsökningar görs fortfarande via `$queryRaw`.
**Lärdom:** Använd alltid `Unsupported("typ")` för databastyper som Prisma inte stödjer nativt (t.ex. pgvector). Hantera aldrig sådana kolumner enbart via raw SQL-migrationer — det skapar schema-drift.

### Landningssida saknade bilder i planen
**Problem:** Block 10.1 (Landningssida) specificerade sektioner men glömde bort bildgenerering.
**Orsak:** Fokus på struktur och innehåll, men visuella assets förbisågs.
**Lösning:** La till punkter för AI-bildgenerering med `generate_image` och integration i komponenter.
**Lärdom:** Inkludera alltid visuella assets (bilder, ikoner, illustrationer) i planering av UI-block. En landningssida utan bilder är ofullständig.

### Verifieringsagent flaggade falskt problem (middleware.ts)
**Problem:** Cursor-agent flaggade att proxy.ts borde heta middleware.ts, men i Next.js 16 är proxy.ts korrekt.
**Orsak:** Agenten läste inte /workspace/docs/nextjs.md innan den flaggade avvikelser.
**Lösning:** Orchestratorn måste alltid inkludera "Läs relevanta /workspace/docs/*.md först" i verifieringsprompts.
**Lärdom:** Verifieringsagenter ska alltid läsa projektdokumentation innan de flaggar problem som avvikelser.

### Agenter hittar inte docs
**Problem:** Sub-agenter söker efter docs i fel katalog (t.ex. /workspace/web/docs/ eller /docs/).
**Orsak:** Orchestratorn angav inte fullständig sökväg till dokumentationen.
**Lösning:** Alltid ange `/workspace/docs/` explicit som absolut sökväg, t.ex. "Läs `/workspace/docs/nextjs.md`".
**Lärdom:** Ange alltid fullständiga sökvägar till dokumentation. Docs ligger i `/workspace/docs/`.

### Parallella testagenter krockar på dev-server
**Problem:** Två testagenter spawnas parallellt och båda försöker starta `npm run dev` på samma port.
**Orsak:** Orchestratorn koordinerade inte delad resurs (dev-server) mellan testagenter.
**Lösning:** Antingen starta dev-servern själv innan testagenter spawnas, kör testagenter sekventiellt, eller instruera att använda samma körande server.
**Lärdom:** Testagenter som behöver samma tjänst (dev-server, databas) måste dela resursen. Orkestern ansvarar för att starta delade tjänster före agenter.

### Testagenter måste äga hela server-livscykeln
**Problem:** Agenter startar dev-server men kan inte döda den. Servern hänger sig, blockerar framtida agenter.
**Orsak:** Processer startade av en agent kan inte dödas av orkestern eller andra agenter i sandbox-miljön.
**Lösning:** Agenten som kör Playwright-tester ansvarar för att STARTA och STOPPA servern inom samma session. Orkestern startar aldrig servern åt agenter. Servern får aldrig lämnas igång efter test.
**Lärdom:** Den som startar en process äger den. Testagent = startar server → kör tester → stoppar server. Allt i samma agent.

### pkill dödar agenten tillsammans med dev-servern
**Problem:** När agenten stoppar dev-servern med `pkill -f "next-server"` (eller liknande) dör agentens egen process också — webbappen och agenten avslutas.
**Orsak:** `pkill -f` matchar processer på kommandoradens text; i sandbox kan agentens process eller processgrupp matcha eller påverkas när barnprocesser dödas.
**Lösning:** Använd aldrig pkill. Vid start: spara PID i fil (`npm run dev & echo $! > .dev-server.pid`). Vid stopp: döda endast den PID:en (`kill -TERM $(cat /workspace/web/.dev-server.pid)`). Se plan/README.md under "Dev-server och Playwright-tester".
**Lärdom:** Stoppa dev-server alltid med PID-baserad kill (sparad i .dev-server.pid), aldrig med pkill eller killall.

### Låst konto-hantering saknades i implementation (Block 2.2)
**Problem:** Block 2.2 implementerade UI för låst konto men backend saknades helt.
**Orsak:** Planen hade "låst konto" som en punkt men specificerade inte databasschema eller logik.
**Lösning:** Uppdaterat `plan/fas-02.md` med explicit krav: lägg till `lockedAt DateTime?` och `failedLoginAttempts Int @default(0)` i User-modellen, lås konto efter 5 misslyckade försök.
**Lärdom:** Avvikelser från planen ska resultera i planuppdatering, inte bara en TODO. Om något saknas i backend måste det specificeras i planen och implementeras.

### Orkestern sa "kan läggas till senare" istället för att uppdatera planen
**Problem:** Vid verifiering flaggades att låst konto-backend saknades. Orkestern noterade det som "icke-blockerande avvikelse" och skrev en TODO i DEVLOG istället för att uppdatera planen.
**Orsak:** Orkestern förstod inte att avvikelser alltid kräver planuppdatering — inte framskjutning.
**Lösning:** Aldrig säga "kan läggas till senare" eller skapa TODOs för saknade funktioner. Om något i planen inte implementerades: uppdatera planen med explicit krav och implementera det direkt.
**Lärdom:** "Kan läggas till senare" är inte tillåtet. Avvikelser = planuppdatering + implementation. Inga TODOs för saknad funktionalitet.

### Orkestern glömde checka av boxar i planfilen
**Problem:** Flera block committades utan att checkboxarna i planfilen uppdaterades från `[ ]` till `[x]`.
**Orsak:** Orkestern fokuserade på commits och nästa steg, glömde att planfilen är sanningskällan för progress.
**Lösning:** Efter varje commit: uppdatera planfilen med `[x]` på alla genomförda punkter INNAN nästa block startar.
**Lärdom:** Planfilen är sanningskällan. Checkboxar måste uppdateras som del av commit-processen, inte som efterarbete.

### Next.js 16 dynamiska routes kräver explicit opt-out från prerendering
**Problem:** Build-fel "Uncached data was accessed outside of Suspense" på dynamiska routes som `/invite/[token]`.
**Orsak:** Next.js 16 försöker prerendera alla sidor vid build. Dynamiska routes med `[token]` eller liknande som gör databasanrop eller session-check misslyckas eftersom Next.js inte vet vilka tokens som finns.
**Lösning:** Lägg till `export const dynamic = 'force-dynamic'` i page.tsx för dynamiska routes som inte ska prerenderas. Alternativt: `export function generateStaticParams() { return [] }` för att säga att inga statiska varianter ska genereras.
**Lärdom:** Alla dynamiska routes i Next.js 16 som gör dataåtkomst behöver explicit `dynamic = 'force-dynamic'` eller tom `generateStaticParams`.

### Turbopack build krachar med ENOENT i sandbox-miljö (Block 3.1)
**Problem:** `npm run build` (Turbopack default) ger `ENOENT: no such file or directory, open '.next/static/.../_buildManifest.js.tmp...'` konsekvent.
**Orsak:** Troligen filsystem-/race condition i sandbox-miljön. Turbopack skriver temporära filer som inte hinner skapas/skrivas korrekt.
**Lösning:** Bygg med webpack-flaggan: `npx next build --webpack`. Producerar identiskt resultat.
**Lärdom:** Om Turbopack-build krachar med ENOENT i sandbox, använd `--webpack` som fallback. Problemet är miljöspecifikt, inte kodrelaterat.

### cacheComponents: true är inkompatibelt med export const dynamic (Block 3.1)
**Problem:** `export const dynamic = 'force-dynamic'` ger build-fel med `cacheComponents: true` i next.config.ts.
**Orsak:** Next.js 16 med cacheComponents ersätter det gamla route segment config-systemet. `export const dynamic` stöds inte längre.
**Lösning:** Ta bort `export const dynamic`. Sidor som gör databasanrop renderas ändå dynamiskt med cacheComponents (de har inga `'use cache'`-direktiv). Använd `<Suspense>` vid behov.
**Lärdom:** Med `cacheComponents: true` — använd aldrig `export const dynamic`. Dynamisk rendering sker automatiskt för sidor utan `'use cache'`. DEVLOG-posten ovan om `force-dynamic` gäller alltså INTE längre med cacheComponents aktiverat.

### "use server"-filer får inte exportera konstanter (Block 3.8)
**Problem:** Build-fel: `A "use server" file can only export async functions, found object`.
**Orsak:** `src/lib/activity-log.ts` markerades med `"use server"` men exporterade även action/entity-konstanter.
**Lösning:** Tog bort `"use server"` från helper-filen och behöll endast async-anropet till `tenantDb()` i funktionen.
**Lärdom:** Använd `"use server"` endast i filer som enbart exporterar async Server Actions; vanliga helpers med konstanter ska inte markeras.

### Tenant-extension: nästlad where och Comment-modell (Block 3.10)
**Problem:** Dashboard och projektvy kraschade med PrismaClientValidationError: "Unknown argument `task.project`" / ogiltig filter på Comment.
**Orsak:** mergeWhereTenantId använde relationPath som literal nyckel (`"task.project": { tenantId }`) istället för nästlat objekt. Comment har ingen direkt project-relation utan task.project.
**Lösning:** Introducerade nestedTenantFilter() som bygger `task: { project: { tenantId } }` från "task.project". Separerat Comment i egen extension med path "task.project".
**Lärdom:** Nästlade Prisma-filtren måste vara objekt, inte punktnotation som nyckel. Modeller med indirekt tenant-koppling (Comment → Task → Project) behöver egen relationPath.

### Socket.IO i App Router: build triggar API-route och kan ge EADDRINUSE (Block 6.1)
**Problem:** `next build` körde `/api/socket` under static generation, vilket försökte starta Socket.IO-servern flera gånger och gav `EADDRINUSE`.
**Orsak:** API-route för lazy init kördes även i buildfasen med flera workers/processer.
**Lösning:** I `/api/socket` returnera tidigt när `NEXT_PHASE === "phase-production-build"` och hoppa över serverstart i build.
**Lärdom:** Runtime-init (ports/listeners) måste vara build-säkert i Next.js App Router; guarda mot buildfas innan side effects.

### Fas 8 export validerade bort seed-projekt (Block 8.3)
**Problem:** Exportknappar i projektets tidflik gav valideringsfel istället för nedladdning i testmiljön.
**Orsak:** `src/actions/export.ts` accepterade bara `uuid/cuid`, men seeddata använder ID-format som `seed-project-1`.
**Lösning:** Uppdaterade `idSchema` till ett säkert generiskt ID-format (`[A-Za-z0-9_-]`) och behöll behörighetskontroll via `requireProject()`.
**Lärdom:** ID-formatvalidering måste spegla faktisk datakälla (inklusive seeddata), annars blockeras legitima flöden trots korrekt auth.

### web-push saknade TypeScript-typer i Next.js build (Block 6.2)
**Problem:** `npm run build` stoppade på `Could not find a declaration file for module 'web-push'` trots installerat paket.
**Orsak:** `web-push` exponerar inte inbyggda typer i den här setupen och `@types/web-push` löste inte importen via Turbopack/TS.
**Lösning:** Lade till lokal deklarationsfil `src/types/web-push.d.ts` med minsta API-signaturer som används (`setVapidDetails`, `sendNotification`).
**Lärdom:** För JS-bibliotek utan stabila typer i Next.js 16/Turbopack, lös med lokal `.d.ts` istället för att blockera bygget.

### Fas 7 E2E: port kan vara upptagen utan HTTP-svar
**Problem:** Run-script för Playwright kunde fastna i readiness-loop trots att port 3000 redan var låst av annan `next-server`.
**Orsak:** Kontroll via `curl` fångade bara HTTP-svar, inte "lyssnar men svarar inte"-fall.
**Lösning:** Uppdaterade scriptet att även kontrollera aktiv listener med `ss -ltn "( sport = :3000 )"` och avbryta direkt.
**Lärdom:** I agentmiljö ska port-check verifiera både HTTP-respons och socket-listener för att undvika hängande testkörningar.

### AI SDK v6 useChat transport (Block 5.2)
**Problem:** Build-fel: `'api' does not exist in type 'UseChatOptions'` i project-ai-chat.tsx.
**Orsak:** I AI SDK v6 tar useChat inte längre `api` och `body` direkt i UseChatOptions; API:et är transport-baserat.
**Lösning:** Använd `transport: new DefaultChatTransport({ api: '/api/ai/chat', body: () => ({ ... }) })` från paketet `ai`. Custom fetch för att läsa X-Conversation-Id och X-Sources flyttas in i transport-options. body kan vara en funktion (Resolvable) för dynamiskt innehåll.
**Lärdom:** Vid useChat med egen endpoint och body i AI SDK v6: importera DefaultChatTransport från `ai` och skicka transport istället för api/body.

### "use server"-filer får bara exportera async-funktioner (Block 5.5/5.6)
**Problem:** Build-fel "Only async functions are allowed to be exported in a use server file" när MESSAGE_SUMMARY_THRESHOLD och RECENT_MESSAGES_AFTER_SUMMARY exporterades från conversations.ts.
**Orsak:** Next.js "use server" filer får endast exportera async Server Actions, inga konstanter eller typer (typer kan exporteras i vissa versioner; konstanter inte).
**Lösning:** Flyttade MESSAGE_SUMMARY_THRESHOLD och RECENT_MESSAGES_AFTER_SUMMARY till web/src/lib/ai/conversation-config.ts. conversations.ts importerar RECENT_MESSAGES_AFTER_SUMMARY därifrån; chat-route och summarize-conversation importerar MESSAGE_SUMMARY_THRESHOLD.
**Lärdom:** Konstanter som behövs av både Server Actions och API/lib ska ligga i en vanlig modul utan "use server".

### Zod 4 + AI SDK 6 + Anthropic: tool input_schema.type saknas (Block 5.8)
**Problem:** Anthropic API returnerar 400: `tools.0.custom.input_schema.type: Field required` när AI-verktyg används.
**Orsak:** Två problem: (1) AI SDK v6 kräver `inputSchema` istället för `parameters` i tool-definitioner. (2) Zod 4:s JSON Schema kan sakna `type: "object"` på toppnivå.
**Lösning:** Byt `parameters` till `inputSchema` i alla tool()-anrop. Använd `toolInputSchema()` wrapper som tar bort `$schema` och säkerställer `type: "object"`. Verktyg är nu aktiverade och fungerar.
**Lärdom:** I AI SDK v6 heter det `inputSchema`, inte `parameters`. SDK:n ignorerar `parameters` tyst vilket ger tomma scheman till Anthropic.

### Designavvikelser från UI.md (verifiering efter Fas 10)
**Problem:** Gemini-verifiering flaggade fyra designavvikelser mot UI.md:
1. Saknad rubrikfont — bara Inter används, UI.md specificerar "tyngre typsnitt för rubriker"
2. Orange accentfärg underutnyttjad — definierad men knappt synlig på CTAs/knappar
3. Hårdkodade färger — komponenter använder text-blue-500, text-green-500 istället för tema-variabler
4. CTA-länkar — Pricing/CTA-sektioner länkar till "/" istället för /register
**Orsak:** Implementation fokuserade på funktionalitet, visuell polering prioriterades ner.
**Lösning:** Lägga till rubrikfont (t.ex. display/serif), använda accent-färg på primära CTAs, migrera hårdkodade färger till tema-variabler, fixa alla CTA-länkar.
**Lärdom:** Verifiera design mot UI.md efter varje fas som innehåller UI-arbete, inte bara i slutet.

---

### AI-verktyg generateProjectReport kräver endast OpenAI (Block 8.2)
**Problem:** Block 8.2 specificerade AI-verktyg för rapportgenerering, men ANTHROPIC_API_KEY och MISTRAL_API_KEY saknades i miljön.
**Orsak:** Utvecklingsmiljön har endast OPENAI_API_KEY konfigurerad. Verktyget skulle inte kunna köras om det krävde Claude/Mistral.
**Lösning:** Implementerade `generateProjectReport` i project-tools.ts med OpenAI (`gpt-4o`) för textgenerering via `generateText` från AI SDK. Verktyget hämtar projektdata (uppgifter, status, tidsrapporter, medlemmar), genererar en AI-sammanfattning och sparar som PDF till MinIO. Graceful error om API-nyckel saknas.
**Lärdom:** AI-verktyg som behöver text-generering kan använda vilken provider som helst via AI SDK — OpenAI räcker för grundläggande rapportgenerering. Implementera alltid graceful degradation om API-nycklar saknas.

---

### Agenter ska använda produktionsserver, inte dev-server
**Problem:** `npm run dev` med Turbopack ger instabila builds och ENOENT-fel i sandbox-miljön. Hot reload behövs inte för agenter.
**Orsak:** Turbopack har race conditions med filsystemet i containermiljöer.
**Lösning:** Agenter kör `npm start` istället (produktionsserver). Nya skript skapade: `/workspace/web/scripts/start-server.sh` (dödar befintlig process på porten automatiskt, startar server, väntar tills redo) och `stop-server.sh`. Build körs alltid innan tester så cachen finns.
**Lärdom:** Agenter behöver inte hot reload — produktionsservern är snabbare och stabilare.
**TODO:** `/workspace/docs/docker.md` avsnitt "4. Dev-server i agent- och testmiljö" behöver uppdateras till att peka på de nya skripten istället för manuella PID-kommandon. Docs-mappen är read-only så detta måste göras externt.

### MinIO filuppladdning: net::ERR_CERT_AUTHORITY_INVALID (testrapport 2026-02-13)
**Problem:** Filuppladdning från webbläsaren misslyckas med SSL/certifikatfel (net::ERR_CERT_AUT). Presigned URLs pekar på MinIO-endpoint som webbläsaren inte litar på.
**Orsak:** S3_PUBLIC_ENDPOINT eller S3_ENDPOINT används för presigned URL. Om det är HTTPS med självsignerat cert eller fel cert accepterar webbläsaren inte anropet.
**Lösning:** I dev: använd HTTP (t.ex. S3_ENDPOINT=http://localhost:9000) och sätt inte S3_PUBLIC_ENDPOINT. I produktion: MinIO bakom proxy med giltigt TLS-certifikat, eller S3_PUBLIC_ENDPOINT med publik HTTPS-URL som webbläsaren litar på. Kommentar i .env.local.example tillagd.
**Lärdom:** Presigned URLs anropas från webbläsaren; certifikatet måste vara betrott. Lokal dev = HTTP, produktion = giltig HTTPS.

---

### Server Action "not found" vid e-postutskick (2026-02-15)
**Problem:** `Server Action "601ed28a..." was not found on the server` vid e-postutskick från AI-chat.
**Orsak:** Build/cache-mismatch. Klientens JavaScript refererar till gammalt Server Action ID som inte finns i den körande servern efter kodändringar.
**Lösning:**
1. Hard refresh i webbläsaren (Ctrl+Shift+R)
2. Eller: rensa browser-cache
3. Eller: `npm run build && npm start`
**Prevention:** start-server.sh kör nu alltid `npm run build` före `npm start` så att servern alltid har senaste build-versionen.

---

### Prisma 7: schema hade tre felaktiga generators med prisma-client-js (2026-02-23)
**Problem:** TypeScript-build misslyckades med massiva typfel. Auth.js PrismaAdapter vägrade ta emot custom-genererad PrismaClient (TS2345).
**Orsak:** schema.prisma hade tre generators med `provider = "prisma-client-js"` (gammal Prisma 6-syntax). Prisma 7 kräver `provider = "prisma-client"`. Utan korrekt generator genererades aldrig TypeScript-typer korrekt.
**Lösning:**
1. Fixade schema till en enda generator: `provider = "prisma-client"` + `output = "../generated/prisma"`
2. Körde `prisma db pull` + `prisma generate` för att regenerera hela klienten (37 modeller)
3. Löste Auth.js PrismaAdapter-typkonflikten via tsconfig.json path alias: `"@prisma/client": ["./generated/prisma/client.ts"]` — ingen cast behövdes
**Lärdom:** Prisma 7 kräver `provider = "prisma-client"`. Typkonflikter med tredjepartsbibliotek som importerar `@prisma/client` löses via tsconfig path alias utan casts.

---

### Container sätter ANTHROPIC_API_KEY="" (tom sträng) — dotenv överskriver inte (2026-02-23)
**Problem:** Servern returnerade 503 för alla AI-anrop trots att ANTHROPIC_API_KEY fanns i .env.
**Orsak:** Container-miljön hade `ANTHROPIC_API_KEY=` (tom sträng) satt som env-variabel. `dotenv.config()` överskriver INTE befintliga env-variabler — tomma strängar räknas som "satta".
**Lösning:** Starta servern med `set -a; source .env; set +a` innan serverprocessen startas, så att .env-värden tvingade in i miljön och överskriver tomma container-värden. Uppdaterade `scripts/start-server.sh` med detta mönster.
**Lärdom:** I containermiljöer kan API-nycklar vara tomma strängar i env. Använd `set -a; source .env; set +a` för att säkerställa att .env-värden vinner. `dotenv.config({ override: true })` är alternativet i Node.js-koden.

---

### RAG debug modal: åäö visas som mojibake (atob + UTF-8) (2026-02-23)
**Problem:** RAG debug-modalen visade `fÃ¥retaget`, `tÃ¤nker` etc. istället för `företaget`, `tänker`.
**Orsak:** `atob()` returnerar en Latin-1 binärsträng, inte UTF-8. Svenska tecken (åäö) är multibyte i UTF-8 och korrumperas vid direkt `atob()`-decode.
**Lösning:** Ersätte `JSON.parse(atob(debugCtx))` med `Uint8Array.from(atob(debugCtx), c => c.charCodeAt(0))` + `new TextDecoder().decode(bytes)`. Backend kodar med `Buffer.from(json, 'utf-8').toString('base64')`.
**Lärdom:** `atob()` är INTE UTF-8-safe. För base64-kodad JSON med icke-ASCII-tecken: använd alltid `TextDecoder` på klientsidan.

---

### Silent image upload i AI-chatten (2026-02-23)
**Problem/Feature:** Bilder uppladdade i chatten triggade automatiskt OcrReviewDialog och skapade en fil-post som syntes i filfliken.
**Lösning:** Ny `chatMode=true`-parameter i upload-routen hoppar över systemmeddelande-skapandet. `imageFileIds`-array i chat-requesten hämtar filerna från MinIO, konverterar till base64 och injicerar som AI SDK vision-parts i sista user-meddelandet. AI:n analyserar bilden och ställer en följdfråga. FolderPlus-knapp på skickade bilder öppnar OcrReviewDialog via nytt GET-endpoint `/api/ai/upload/file-info`.
**Lärdom:** AI SDK v6 stödjer `{ type: "image", image: "data:..." }` parts direkt i `content`-arrayen för modelMessages — ingen extra konfiguration behövs för Claude vision.

---

### Resend inbound email: webhook triggas inte trots Verified MX (2026-02-23)
**Problem:** `email.received` webhook triggades aldrig trots att MX-recorden var Verified i Resend.
**Orsak:** Resend kräver en explicit disable/enable-cykel på webhook efter att MX verifieras. Utan detta aktiveras inte inbound routing för webhook-events.
**Lösning:** Disable → Enable på webhook i Resend-dashboarden. Events börjar triggas direkt.
**Lärdom:** Efter MX-verifiering i Resend: alltid disable/enable webhook för att aktivera `email.received`.

---

### Resend webhook: INVALID_SIGNATURE — Svix signerar id.timestamp.body (2026-02-23)
**Problem:** Alla webhook-anrop gav 401 INVALID_SIGNATURE.
**Orsak:** Handrullad HMAC signerade bara `rawBody`. Svix signerar `svix-id.svix-timestamp.rawBody` med base64-avkodad `whsec_`-nyckel.
**Lösning:** Ersatte handrullad HMAC med `new Webhook(secret).verify()` från `svix`-paketet i `/api/webhooks/resend/route.ts`.
**Lärdom:** Använd alltid Svix SDK för webhook-verifiering, aldrig handrullad HMAC.

---

### Resend webhook: 500 på email.delivered — EmailLog saknar resendMessageId (2026-02-23)
**Problem:** `email.delivered` webhook gav 500 WEBHOOK_HANDLER_FAILED.
**Orsak:** `updateEmailStatus` kastade P2025 (record not found) när mail skickats utan EmailLog-post.
**Lösning:** Fånga P2025 tyst i `updateEmailStatus` — returnera utan fel om ingen EmailLog finns.
**Lärdom:** Webhook-handlers ska aldrig kasta 500 på "not found" — ignorera tyst och returnera 200.

---

### Resend inbound: tenant hittades inte för inboxCode (2026-02-23)
**Problem:** `processInboundEmail` loggade "tenant not found" — mail kom fram men skapade inget meddelande.
**Orsak:** `inboxCode` i databasen var `null` (ej satt på tenant), kod föll tillbaka på `tenantId` (t.ex. `seed-tenant-1`). Men sökningen gjordes med `findUnique({ where: { inboxCode } })` — hittade ingenting.
**Lösning:** `findFirst({ where: { OR: [{ inboxCode }, { id: tenantCode }] } })` — söker på båda.
**Permanent fix:** Se till att alla tenants har `inboxCode` satt i databasen (inte null).
