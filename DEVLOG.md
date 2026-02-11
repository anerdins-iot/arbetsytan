# DEVLOG

Löpande logg över problem, lösningar och lärdomar under bygget.
Läs denna fil innan du börjar arbeta. Skriv till den vid problem som inte är triviala.

Format per post: Problem, orsak, lösning, lärdom (max 5 rader).

---

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
**Orsak:** Agenten läste inte /docs/nextjs.md innan den flaggade avvikelser.
**Lösning:** Orchestratorn måste alltid inkludera "Läs relevanta /docs/*.md först" i verifieringsprompts.
**Lärdom:** Verifieringsagenter ska alltid läsa projektdokumentation innan de flaggar problem som avvikelser.

### Agenter hittar inte /docs/
**Problem:** Sub-agenter söker efter docs i fel katalog (t.ex. /workspace/web/docs/ eller /workspace/docs/web/).
**Orsak:** Orchestratorn angav inte fullständig sökväg till dokumentationen.
**Lösning:** Alltid ange `/docs/` explicit som absolut sökväg i workspace root, t.ex. "Läs `/docs/nextjs.md` (ligger i workspace root, inte i web/)".
**Lärdom:** Ange alltid fullständiga sökvägar till dokumentation. Specificera att /docs/ ligger i workspace root, utanför web/.
