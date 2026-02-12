# Fas 5 — AI-assistenter

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 5.1: Vercel AI SDK-setup
**Input:** Fas 1 klar, API-nycklar för Anthropic/OpenAI/Mistral
**Output:** Fungerande AI-streaming-endpoint

- [x] Installera `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/mistral`
- [x] Skapa `web/src/lib/ai/providers.ts` med provider-konfiguration
- [x] Skapa API-route för AI-streaming: `web/src/app/api/ai/chat/route.ts`
- [x] Implementera streaming med Vercel AI SDK (använder sin egen SSE-transport, separat från Socket.IO)
- [x] Verifiera att streaming fungerar end-to-end

**Verifiering:** Streaming fungerar, AI svarar, `npm run build` OK

### Block 5.2: Projekt-AI — Chatt och kontext
**Input:** Block 5.1 + Fas 3 + Fas 4 klara
**Output:** Fungerande projekt-AI med chattgränssnitt

- [x] Bygga chattgränssnitt i projektfliken "AI"
- [x] Implementera `useChat` hook på klienten
- [x] Bygga systemprompt-generator som injicerar projektkontext
- [x] Skapa Conversation och Message-poster i databasen
- [x] Implementera konversationshistorik (senaste meddelanden + sammanfattning)

**Verifiering:** Chatt fungerar, meddelanden sparas i DB, kontext injiceras, åtkomst valideras via `requireProject()`, `npm run build` OK

### Block 5.3: Projekt-AI — Verktyg
**Input:** Block 5.2 klart
**Output:** AI-verktyg för projekthantering

- [x] Definiera verktyg för projekt-AI:
  - [x] Hämta projektets uppgifter
  - [x] Skapa och uppdatera uppgifter
  - [x] Hämta projektets filer
  - [x] Söka i dokument via embeddings
  - [x] Hämta projektmedlemmar
  - [x] Skicka AIMessage till personlig AI

**Verifiering:** Alla verktyg anropas korrekt av AI, alla verktyg använder `tenantDb(tenantId)` + `requireProject()`, resultat returneras, `npm run build` OK

### Block 5.4: Personlig AI
**Input:** Block 5.2 klart (AI-infrastruktur)
**Output:** Global personlig AI-assistent

- [x] Bygga chattkomponent i nedre högra hörnet (global, alla sidor)
- [x] Bygga systemprompt-generator med användarens kontext
- [x] Definiera verktyg för personlig AI:
  - [x] Hämta olästa AIMessages
  - [x] Markera AIMessages som lästa
  - [x] Skicka AIMessage till projekt-AI
  - [x] Hämta användarens uppgifter (alla projekt)
  - [x] Hämta projektlista
  - [x] Söka i filer
  - [x] Skapa och uppdatera uppgifter

**Verifiering:** Chattkomponent visas globalt, verktyg fungerar, konversation ägs av `userId` — bara ägaren har åtkomst, alla verktyg använder `tenantDb(tenantId)`, `npm run build` OK

### Block 5.5: AI-kommunikation
**Input:** Block 5.3 + 5.4 klara
**Output:** Fungerande kommunikation mellan AI-assistenter

- [x] Implementera AIMessage-flöde: projekt-AI skickar till personlig AI
- [x] Implementera AIMessage-flöde: personlig AI svarar till projekt-AI
- [x] Trådning via parentId
- [x] Projekt-AI triggar meddelanden vid: uppgift tilldelad, deadline ändrad, fil uppladdad, status ändrad
- [x] Personlig AI kollar olästa meddelanden vid start

**Verifiering:** Meddelanden skickas mellan AI:er, trådar fungerar, automatiska triggers fungerar, AIMessages filtreras på `userId` + `tenantId`, `npm run build` OK

### Block 5.6: Konversationshantering
**Input:** Block 5.2 klart
**Output:** Konversationshistorik och sammanfattning

- [x] Spara alla meddelanden i Message-tabellen
- [x] Implementera sammanfattning/komprimering vid långt antal meddelanden
- [x] Spara sammanfattning i Conversation.summary
- [x] Ladda sammanfattning + senaste meddelanden vid ny session
- [x] Visa konversationshistorik i UI (lista tidigare konversationer)

**Verifiering:** Meddelanden sparas, sammanfattning genereras, historik visas, `npm run build` OK

### Block 5.7: Dokumentanalys och generering
**Input:** Block 5.3 + Fas 4 klara
**Output:** AI kan analysera och generera dokument

- [x] AI-verktyg: analysera PDF/ritning (anropa OCR + skicka text som kontext)
- [x] AI-verktyg: generera Excel-dokument (skapa fil + ladda upp till MinIO)
- [x] AI-verktyg: generera PDF-dokument
- [x] AI-verktyg: generera Word-dokument
- [x] Sparade dokument syns i projektets fillista

**Verifiering:** Dokument genereras korrekt, sparas i MinIO, visas i fillistan, alla verktyg använder `tenantDb(tenantId)` + `requireProject()`, `npm run build` OK

### Block 5.8: Playwright-test för Fas 5
**Input:** Block 5.1–5.7 klara
**Output:** Screenshots och verifiering av AI-funktioner

- [x] Starta dev-server med PID-fil
- [x] Logga in och navigera till ett projekt
- [x] Öppna AI-fliken, ta screenshot av chattgränssnittet
- [x] Skicka ett meddelande och vänta på svar, ta screenshot
- [x] Testa ett AI-verktyg (t.ex. "visa uppgifter"), verifiera verktygsanrop
- [x] Navigera till personlig AI (globalt), ta screenshot
- [x] Skicka meddelande till personlig AI, ta screenshot
- [x] Verifiera att konversationshistorik visas
- [x] Spara alla screenshots i `screenshots/fas-05/`
- [x] Stoppa dev-server

**Verifiering:** Alla screenshots sparade, AI svarar, verktyg fungerar, inga konsolfel

---
