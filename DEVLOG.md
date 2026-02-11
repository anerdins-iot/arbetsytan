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
