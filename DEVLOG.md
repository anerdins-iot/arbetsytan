# DEVLOG

Löpande logg över problem, lösningar och lärdomar under bygget.
Läs denna fil innan du börjar arbeta. Skriv till den vid problem som inte är triviala.

Format per post: Problem, orsak, lösning, lärdom (max 5 rader).

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
