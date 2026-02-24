# AI-arkitektur

## Koncept

Varje användare har en personlig AI-assistent. Varje projekt har en projekt-AI. Användaren kan prata med sin personliga AI eller med ett projekts AI. De två typerna har olika kontext och olika verktyg.

## Stateless med verktyg

AI-assistenterna är stateless — de startar från noll vid varje samtal. Ingen lång konversationshistorik lagras i kontexten. Istället har varje AI tillgång till verktyg som hämtar det den behöver från databasen.

Vid ett nytt samtal skickas systemprompt, de senaste meddelandena från konversationen, och en komprimerad sammanfattning av äldre meddelanden. Allt annat hämtas via verktyg.

## Proaktivitet och Sökstrategi

AI-assistenterna följer en strikt proaktiv policy för att minimera onödiga motfrågor och maximera nyttan för användaren.

### Proaktiv policy

1. **Undersök först, fråga sen** — Vid otydliga frågor ska AI:n alltid använda tillgängliga verktyg (sökning, listning) för att försöka förstå kontexten innan den ställer en förtydligande fråga.
2. **Inga generella motfrågor** — Istället för "Vilket projekt menar du?" ska AI:n söka efter aktiva projekt eller nyligen ändrade uppgifter och föreslå: "Jag hittade en uppgift i projekt X, menar du den?".
3. **Bred sökning** — Om en semantisk sökning misslyckas ska AI:n prova att lista filer eller söka i anteckningar innan den ger upp.
4. **Alltid ett förslag** — AI-assistenten ska aldrig avsluta ett svar med bara en fråga utan att ha utfört en handling eller presenterat mest sannolika information.

### Sökstrategi (Hierarki)

När en användare söker efter information (t.ex. ritningar, dokument, offerter) används följande ordning:
1. `searchFiles` — Semantisk sökning i dokumentinnehåll (OCR-text).
2. `getProjectFiles` / `listFiles` — Listning av filer för manuell matchning av filnamn.
3. `searchNotes` / `searchPersonalNotes` — Sökning i anteckningar.
4. `getProjectTasks` / `getUserTasks` — Sökning i uppgiftsbeskrivningar.

AI:n ska prova minst 2-3 olika verktyg vid otydliga sökningar innan den rapporterar att informationen saknas.

## Personlig AI

Varje användare har en egen AI-assistent som lever oberoende av projekt. Den har tillgång till en personlig databas med notiser från projekt-AI:er, sammanfattningar och personlig historik. Den vet vad som hänt sedan sist genom att läsa sin databas, inte genom att minnas.

Den personliga AI:n nås via knappen i nedre högra hörnet, oavsett var i appen användaren befinner sig.

### Systemprompt

Den personliga AI:n får en systemprompt som beskriver vem användaren är, vilken roll den har, vilka projekt den är med i, och att den ska agera som en personlig arbetsassistent. Prompten instruerar AI:n att alltid börja med att kolla olästa meddelanden från projekt-AI:er och att följa den proaktiva policyn.

Exempel: "Du är en personlig arbetsassistent åt Fredrik Anerdin. Fredrik är företagsadmin på Anerdins El och har tre aktiva projekt. Du hjälper honom med daglig planering, uppgifter och att hålla koll på vad som händer i hans projekt. Börja alltid med att kolla om det finns olästa meddelanden från projekt-AI:er. Var proaktiv: undersök med verktyg innan du ställer motfrågor. Svara på svenska, var konkret och kort."

### Verktyg

- Hämta olästa AIMessage (filtrerat på userId, read = false)
- Markera AIMessage som läst
- Skicka AIMessage till projekt-AI (riktning PERSONAL_TO_PROJECT)
- Hämta användarens uppgifter (alla projekt, filtrerat på membership)
- Hämta användarens projektlista
- Söka i filer (inom projekt användaren har tillgång till)
- Skapa och uppdatera uppgifter
- Hämta konversationssammanfattning

### Kontextuppbyggnad

1. Systemprompt med användarens namn, roll och tenant
2. Komprimerad sammanfattning av tidigare konversationer (från Conversation.summary)
3. De senaste meddelandena i pågående konversation (från Message-tabellen)
4. AI:n hämtar resten via verktyg vid behov

## Projekt-AI

Varje projekt har en egen AI-assistent som alla projektmedlemmar delar. Den har tillgång till projektets databas — uppgifter, filer, historik, ritningar och allt som rör projektet. Den lever i projektkontexten och nås via AI-fliken i projektvyn.

### Systemprompt

Projekt-AI:n får en systemprompt som beskriver projektet — namn, adress, status, antal uppgifter, antal medlemmar. Den instrueras att hjälpa med allt som rör projektet och att notifiera relevanta användares personliga AI:er vid viktiga händelser.

Exempel: "Du är AI-assistenten för projektet Kvarnbergsskolan. Projektet är aktivt, adressen är Kvarnbergsvägen 12 i Göteborg. Det finns fyra teammedlemmar och tolv uppgifter varav tre är pågående. Du hjälper teamet med allt som rör projektet — uppgifter, filer, ritningar och planering. Om du skapar eller ändrar uppgifter som berör en specifik person, skicka ett meddelande till deras personliga AI."

### Verktyg

- Hämta projektets uppgifter (filtrerat på projectId)
- Skapa, uppdatera och tilldela uppgifter
- Hämta projektets filer
- Analysera filer (PDF, ritningar, bilder via OCR)
- Hämta projektmedlemmar
- Skicka AIMessage till användares personliga AI (riktning PROJECT_TO_PERSONAL)
- Läsa svar från personliga AI:er (AIMessage med riktning PERSONAL_TO_PROJECT)
- Generera dokument (Excel, PDF, Word)
- Hämta konversationssammanfattning

### Kontextuppbyggnad

1. Systemprompt med projektets namn, status, adress och grunddata
2. Komprimerad sammanfattning av projektkonversationen
3. De senaste meddelandena i pågående konversation
4. AI:n hämtar resten via verktyg vid behov

## Kommunikation mellan AI:er

Kommunikationen mellan AI:er är tvåvägs via AIMessage-tabellen.

### Triggers — projekt till personlig

Projekt-AI:n skickar automatiskt meddelanden till en användares personliga AI vid dessa händelser:

- En uppgift tilldelas användaren
- En deadline ändras på en uppgift som berör användaren
- En viktig fil laddas upp (t.ex. ny ritning)
- Projektets status ändras
- En annan användare lämnar en kommentar som berör dem
- Projektledaren ber AI:n meddela en specifik person

Meddelandet skapas som en AIMessage med riktning PROJECT_TO_PERSONAL, kopplad till användaren och projektet. Read sätts till false.

### Triggers — personlig till projekt

Den personliga AI:n kan skicka meddelanden tillbaka till projekt-AI:n:

- Användaren har sett och bekräftat en uppgift
- Användaren ställer en fråga om projektet via sin personliga AI
- Användaren rapporterar att en uppgift är klar eller försenad
- Användaren ber sin personliga AI uppdatera projektet

Meddelandet skapas som en AIMessage med riktning PERSONAL_TO_PROJECT, kopplad till användaren och projektet.

### Trådning

Meddelanden kan kedjas via parentId. Om projekt-AI:n skickar "Du har en ny uppgift" och den personliga AI:n svarar "Användaren börjar på måndag", blir svaret ett barn av det ursprungliga meddelandet. Detta gör det möjligt att följa konversationstrådar mellan AI:er.

### Flödesexempel

1. Projektledaren tilldelar en uppgift till montören i projekt-AI:n
2. Projekt-AI:n skapar uppgiften i databasen
3. Projekt-AI:n skickar en AIMessage till montörens personliga AI med typ "task_assigned" och beskrivning
4. Montören öppnar appen och pratar med sin personliga AI
5. Personliga AI:n ser oläst meddelande, berättar: "Du har fått en ny uppgift i Kvarnbergsprojektet — dra kabel i källaren, deadline fredag"
6. Montören säger "Jag börjar med det på måndag"
7. Personliga AI:n skickar tillbaka en AIMessage till projekt-AI:n med typ "task_acknowledged" och kommentaren
8. Nästa gång någon pratar med projekt-AI:n kan den berätta att montören planerar att börja på måndag

## Notifikationer

AI:n bestämmer om ett meddelande är tillräckligt viktigt för att trigga en notis. Inte varje AIMessage blir en notis — AI:n gör bedömningen baserat på händelsens typ och vikt.

När AI:n beslutar att en notis ska skapas, använder den ett verktyg som skapar en Notification i databasen. AI:n formulerar innehållet på svenska i en naturlig ton.

### Kanaler

Tre kanaler finns tillgängliga. Expo Push Notifications för mobilappen — appen registrerar en push-token som sparas på användaren, och backend skickar via Expos push-API. Web Push API för webbläsaren. Resend för e-post vid viktiga händelser.

AI:n väljer kanal baserat på händelsens vikt. Användaren kan i sina inställningar styra vilka kanaler som är aktiva och för vilka typer av händelser.

### Exempel

En ny uppgift med deadline imorgon — AI:n skapar en notis som går ut på alla aktiva kanaler. En fil laddas upp — AI:n skickar bara ett AIMessage till den personliga AI:n, ingen notis. En deadline ändras — AI:n bedömer och kan välja in-app plus push men inte e-post.

## Datarikt innehåll i chatt-UI

AI-chatten får aldrig rendera datarikt innehåll (listor, tabeller) direkt i chatten. Mönstret är: verktyget returnerar en `__[feature]`-payload, i chatten visas en minimal knapp (t.ex. "Hittade X — Öppna") som öppnar en Sheet-panel (höger på desktop, botten 85vh på mobil). Panelen använder samma komponenter som den dedikerade UI-sidan. Se `DEVLOG.md` (2026-02-23) för beslut och pilotimplementation (grossistsökning, rapport-/offertförhandsgranskning, dokumentsökning).

## Sammanfattning och komprimering

När en konversation blir lång (över ett konfigurerbart antal meddelanden) triggas en komprimering. AI:n sammanfattar de äldre meddelandena till en kort text som sparas i Conversation.summary. De sammanfattade meddelandena behålls i databasen men skickas inte med till AI:n — bara sammanfattningen.

Detta håller kontexten liten och kostnaderna nere, utan att tappa viktig information.

## Providers och SDK

Vercel AI SDK (npm-paketet `ai`) används som abstraktionslager för all AI-kommunikation. Det ger ett enhetligt API för streaming, tool use och strukturerade outputs oavsett vilken provider som används. Provider byts genom att ändra en rad — resten av koden är identisk.

### Providers

- **Claude** (via `@ai-sdk/anthropic`) — primär modell för chattassistenterna. Streaming, tool use, extended thinking.
- **OpenAI** (via `@ai-sdk/openai`) — bildgenerering (DALL-E) och embeddings.
- **Mistral** (via `@ai-sdk/mistral` + direkt API för OCR) — OCR på ritningar och dokument via Mistral OCR API. För OCR används Mistrals API direkt eftersom det är ett separat endpoint som inte går via chattmodellen.

### Varför Vercel AI SDK

Istället för att bygga ett eget abstraktionslager använder vi Vercel AI SDK. Det ger oss streaming med SSE inbyggt, tool use som fungerar likadant för alla providers, React hooks (useChat) som sköter hela chattflödet på klienten, stöd för strukturerade outputs med Zod, och sömlös integration med Next.js App Router. Se `vercel-ai-sdk.md` för fullständig dokumentation.

### Direkt API-åtkomst

Mistral OCR (modell `mistral-ocr-2512`) anropas direkt via Mistrals REST API eller deras TypeScript SDK (`@mistralai/mistralai`). OCR-endpointen är separat från chattmodellen och hanterar PDF:er, bilder och tekniska ritningar. Se `mistral-api.md` för fullständig dokumentation.

OpenAI:s bildgenererings-API anropas direkt via OpenAI SDK för att skapa bilder. Se `openai-api.md` för fullständig dokumentation.

## Realtidskommunikation

Socket.IO används för all realtidskommunikation — både på webben och i mobilappen (Expo). Vercel AI SDK använder sin egen SSE-transport för AI-streaming, separat från Socket.IO.

### Användningsområden

- Live-notifikationer — in-app-notiser visas direkt utan att användaren behöver ladda om
- Statusuppdateringar — uppgifter, projekt och andra ändringar som görs av teammedlemmar
- AI-streaming — hanteras av Vercel AI SDK via sin inbyggda SSE-transport (ej Socket.IO)

### Varför Socket.IO

Konsekvent transport för webb och mobil. React Native stödjer inte SSE/EventSource nativt, men Socket.IO fungerar på båda plattformar med samma API. Socket.IO ger automatisk återanslutning, rum per tenant, och autentisering via session (webb) eller JWT (mobil).

### Säkerhetsmodell

All filtrering sker i backend — klienten väljer aldrig vilken data den tar emot. Principen är: servern bestämmer vad som skickas, klienten renderar det den får.

**Autentisering vid anslutning:**
- Webb: session-cookie valideras vid `connection`-eventet. Ogiltig session → anslutning avvisas.
- Mobil: JWT skickas via `auth`-parameter vid anslutning. Ogiltig token → anslutning avvisas.
- `tenantId`, `userId` och `role` extraheras vid anslutning och lagras på socket-objektet. Dessa värden används för all filtrering — klienten kan aldrig skicka eller överskriva dem.

**Rumsstruktur (server-hanterad):**
- `tenant:{tenantId}` — alla events för en tenant (projektstatus, teamändringar)
- `project:{projectId}` — projektspecifika events (uppgifter, filer, statusändringar)
- `user:{userId}` — personliga events (notifikationer, AI-meddelanden)
- Servern placerar klienten i rum baserat på verifierad session — ALDRIG baserat på klientens request. Vid anslutning joinar klienten `tenant:{tenantId}` och `user:{userId}`. Projektrum joinas först efter `requireProject()`-validering.

**Emit-regler:**
- Backend emittar alltid till specifika rum — aldrig broadcast till alla.
- Data som emittas har redan filtrerats via `tenantDb(tenantId)` — klienten får aldrig ofiltrerad data.
- Känslig data (t.ex. andra tenants information) kan aldrig läcka eftersom emit-target alltid är ett rum som är scopat till tenant/projekt/användare.

### Implementation

Socket.IO-servern skapas i `web/src/lib/socket.ts`. Klienten ansluter via `useSocket`-hook vid inloggning. Events skickas med typ (t.ex. "notification", "task-update", "project-update") och data i JSON-format. Alla rum hanteras av servern — klienten kan inte joina rum själv.

## Mobilautentisering

Webappen använder cookies via Auth.js — det är standardbeteendet och fungerar direkt. Mobilappen (Expo) kan däremot inte använda httpOnly cookies på samma sätt, eftersom React Native inte har en webbläsare med inbyggt cookie-stöd.

### Strategi

Webben använder cookies som vanligt via Auth.js. Mobilappen använder JWT Bearer tokens. Vid inloggning i mobilappen anropas ett API-endpoint som returnerar en JWT. Token lagras säkert i expo-secure-store på enheten. Varje API-anrop från mobilappen skickar token i Authorization-headern.

### Auth.js-konfiguration

Auth.js konfigureras med dubbla strategier — session-baserad för webb och JWT för mobil. API-routes kontrollerar först Authorization-headern (mobil) och faller tillbaka på session-cookies (webb). En gemensam hjälpfunktion abstraherar detta så att resten av koden inte behöver bry sig om vilken klient som anropar.

## Kunskapsbas och Proaktiv Kontextinjicering (RAG)

AI-assistenterna är utrustade med ett automatiskt kunskapsbasystem som bygger en personlig minnesbas för varje användare och injicerar relevant kontext i varje svar — utan att AI:n behöver "fråga".

### Pre-retrieval RAG

Varje meddelande som skickas till AI:n triggar automatiskt en semantisk sökning *innan* `streamText` anropas. AI:n får alltid relevant kontext utan att behöva bestämma sig för att söka.

Flöde per request:
1. De tre senaste användarmeddelandena konkateneras till en sökfråga (täcker uppföljningsfrågor som "Och kontaktpersonen?")
2. En enda embedding genereras för frågan
3. Tre pgvector-sökkällor genomsöks parallellt med 500ms timeout:
   - **KnowledgeEntity** — entiteter extraherade från konversationer (projekt, uppgifter, preferenser, kontakter)
   - **MessageChunk** — semantiska bitar av tidigare konversationer
   - **DocumentChunk** — filinnehåll (ritningar, PDF:er, dokument)
4. Resultaten rankas efter cosine similarity och injiceras i systempromptens kunskapsblock
5. Om sökningen överskrider 500ms → fallback till tidsbaserad hämtning

Implementerat i `web/src/lib/ai/unified-search.ts` (`searchAllSources`) och integrerat i `web/src/app/api/ai/chat/route.ts`.

### Kunskapsextraktion

Efter varje konversation (i `onFinish`, fire-and-forget) analyserar en LLM konversationstransskriptet och extraherar strukturerade entiteter:

- **Entitetstyper:** `project`, `task`, `user`, `preference`, `common_question`
- **Konfidensfiltrering:** Endast entiteter med confidence ≥ 0.7 sparas
- **Embedding per entitet:** Varje entitet får en pgvector-embedding för semantisk sökning
- **TTL:** Entiteter som inte setts på 90 dagar rensas automatiskt (1% sannolikhet per request)

Implementerat i `web/src/lib/ai/knowledge-extractor.ts`.

### Datamodell

Ny tabell `KnowledgeEntity`:
- `tenantId` — multi-tenant isolering
- `entityType` — typ av entitet
- `entityId` — kort identifierare (t.ex. "Bergström Bygg")
- `metadata` — JSON med detaljer (inkl. `userId` för per-användare isolering)
- `embedding vector` — pgvector-kolumn för semantisk sökning
- `confidence` — extraktionssäkerhet (0–1)
- `lastSeen` — används för TTL-rensning

### RAG Debug Modal

För felsökning och insyn: varje AI-svar har en info-ikon (ⓘ) som öppnar en modal med vad sökningen hittade — källtyp, text och similarity-poäng. Aktiverat via `X-Debug-Context`-header (base64-kodad JSON, UTF-8-safe via `TextDecoder` i frontend).

### Multi-tenant-isolering

- `KnowledgeEntity` filtreras på `tenantId` + `metadata->>'userId'` — ingen användare ser en annan användares kunskapsbas
- `MessageChunk` filtreras på `tenantId` + `userId`
- `DocumentChunk` filtreras på `tenantId` + `projectId` (accessibla projekt för användaren)

## Bilduppladdning via AI Vision (Silent Mode)

Bilder som användaren laddar upp i AI-chatten hanteras annorlunda än vanliga filer — de skickas via Claude vision istället för att visas som filbilagor.

### Flöde

1. Användaren väljer en bild i chatinputen
2. Frontend laddar upp till `/api/ai/upload` med `chatMode=true` — inget systemmeddelande skapas, filen sparas dock i MinIO och DB
3. Frontend visar en thumbnail i inputfältet (blob URL) och väntar på att användaren skickar meddelandet
4. Vid submit skickas `imageFileIds: [id1, id2, ...]` med i chat-requesten till `/api/ai/chat`
5. Backend hämtar filerna från MinIO, konverterar till base64 data URLs
6. Base64-data injiceras som `{ type: "image", image: "data:..." }` parts i sista user-meddelandet (AI SDK format)
7. Claude analyserar bilden via vision och instrueras att beskriva vad den ser och ställa EN konkret följdfråga
8. Konversationen (inkl. bildbeskrivningen) extraheras sedan av `knowledge-extractor.ts` → bildens kontext indexeras i KnowledgeEntity

### UI

- Thumbnails visas i inputfältet, kan tas bort med hover-X
- Skickade bilder visas i konversationen med en **FolderPlus**-knapp
- FolderPlus öppnar OcrReviewDialog via GET `/api/ai/upload/file-info?fileId=xxx` för att spara bilden till ett projekt

### Relevanta filer

- `web/src/app/api/ai/upload/route.ts` — `chatMode` parameter
- `web/src/app/api/ai/upload/file-info/route.ts` — metadata-endpoint för OcrReviewDialog
- `web/src/app/api/ai/chat/route.ts` — `imageFileIds` hantering + vision-injektion
- `web/src/components/ai/personal-ai-chat.tsx` — thumbnail UI, `pendingImageFileIdsRef`, `chatImageMap`

## Embeddings och semantisk sökning

AI-assistenterna behöver kunna söka i dokument, ritningar och projekthistorik baserat på betydelse — inte bara exakta ord. Detta löses med embeddings och vektorsökning.

### Flöde

1. En fil laddas upp till MinIO (PDF, bild, dokument)
2. Filen skickas genom Mistral OCR som extraherar texten
3. Texten delas upp i chunks (mindre textbitar, typiskt 500–1000 tokens)
4. Varje chunk skickas till OpenAI:s embeddings-API som returnerar en vektor
5. Vektorn sparas i databasen tillsammans med texten, kopplad till filen och projektet

### Sökning

När AI-assistenten behöver hitta information — t.ex. "vad står det om elinstallationen i ritningen?" — omvandlas frågan till en vektor via samma embeddings-API. Databasen söker efter de chunks vars vektorer liknar frågevektorn mest (cosine similarity). De mest relevanta chunksarna skickas som kontext till Claude, som formulerar svaret.

### Vad som embeddas

- Filinnehåll efter OCR-extraktion (ritningar, PDF:er, dokument)
- Uppgiftsbeskrivningar och kommentarer
- Konversationssammanfattningar (så att personliga AI:n kan hitta relevant historik)
- Kunskapsentiteter (KnowledgeEntity) extraherade från konversationshistorik

### Lagring — pgvector

Vektorer lagras i PostgreSQL via pgvector-extensionen. Ingen separat vektordatabas behövs. En DocumentChunk-modell i schemat kopplar varje chunk till sin fil och sitt projekt. Chunken innehåller den extraherade texten, vektorn, metadata (sidnummer, position) och en referens till källfilen. KnowledgeEntity-tabellen har också en pgvector-embedding-kolumn.

### Multi-tenant-isolering

Alla vektorsökningar filtreras på projektId och tenantId. En tenant kan aldrig söka i en annan tenants dokument. Detta sker via WHERE-villkor i SQL-frågan tillsammans med vektorsökningen.

## Datamodell

Se `web/prisma/schema.prisma` för tabellstruktur. AI-relaterade modeller: Conversation, Message, AIMessage, AIDirection, Notification, NotificationChannel, DocumentChunk, ConversationType, AIProvider, MessageRole.
