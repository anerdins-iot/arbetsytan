# Fas 5 — AI-assistenter

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 5.1: Vercel AI SDK-setup
**Input:** Fas 1 klar, API-nycklar för Anthropic/OpenAI/Mistral
**Output:** Fungerande AI-streaming-endpoint

- [ ] Installera `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/mistral`
- [ ] Skapa `src/lib/ai/providers.ts` med provider-konfiguration
- [ ] Skapa API-route för AI-streaming: `src/app/api/ai/chat/route.ts`
- [ ] Implementera streaming med Vercel AI SDK (använder sin egen SSE-transport, separat från Socket.IO)
- [ ] Verifiera att streaming fungerar end-to-end

**Verifiering:** Streaming fungerar, AI svarar, `npm run build` OK

### Block 5.2: Projekt-AI — Chatt och kontext
**Input:** Block 5.1 + Fas 3 + Fas 4 klara
**Output:** Fungerande projekt-AI med chattgränssnitt

- [ ] Bygga chattgränssnitt i projektfliken "AI"
- [ ] Implementera `useChat` hook på klienten
- [ ] Bygga systemprompt-generator som injicerar projektkontext
- [ ] Skapa Conversation och Message-poster i databasen
- [ ] Implementera konversationshistorik (senaste meddelanden + sammanfattning)

**Verifiering:** Chatt fungerar, meddelanden sparas i DB, kontext injiceras, åtkomst valideras via `requireProject()`, `npm run build` OK

### Block 5.3: Projekt-AI — Verktyg
**Input:** Block 5.2 klart
**Output:** AI-verktyg för projekthantering

- [ ] Definiera verktyg för projekt-AI:
  - [ ] Hämta projektets uppgifter
  - [ ] Skapa och uppdatera uppgifter
  - [ ] Hämta projektets filer
  - [ ] Söka i dokument via embeddings
  - [ ] Hämta projektmedlemmar
  - [ ] Skicka AIMessage till personlig AI

**Verifiering:** Alla verktyg anropas korrekt av AI, alla verktyg använder `tenantDb(tenantId)` + `requireProject()`, resultat returneras, `npm run build` OK

### Block 5.4: Personlig AI
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

**Verifiering:** Chattkomponent visas globalt, verktyg fungerar, konversation ägs av `userId` — bara ägaren har åtkomst, alla verktyg använder `tenantDb(tenantId)`, `npm run build` OK

### Block 5.5: AI-kommunikation
**Input:** Block 5.3 + 5.4 klara
**Output:** Fungerande kommunikation mellan AI-assistenter

- [ ] Implementera AIMessage-flöde: projekt-AI skickar till personlig AI
- [ ] Implementera AIMessage-flöde: personlig AI svarar till projekt-AI
- [ ] Trådning via parentId
- [ ] Projekt-AI triggar meddelanden vid: uppgift tilldelad, deadline ändrad, fil uppladdad, status ändrad
- [ ] Personlig AI kollar olästa meddelanden vid start

**Verifiering:** Meddelanden skickas mellan AI:er, trådar fungerar, automatiska triggers fungerar, AIMessages filtreras på `userId` + `tenantId`, `npm run build` OK

### Block 5.6: Konversationshantering
**Input:** Block 5.2 klart
**Output:** Konversationshistorik och sammanfattning

- [ ] Spara alla meddelanden i Message-tabellen
- [ ] Implementera sammanfattning/komprimering vid långt antal meddelanden
- [ ] Spara sammanfattning i Conversation.summary
- [ ] Ladda sammanfattning + senaste meddelanden vid ny session
- [ ] Visa konversationshistorik i UI (lista tidigare konversationer)

**Verifiering:** Meddelanden sparas, sammanfattning genereras, historik visas, `npm run build` OK

### Block 5.7: Dokumentanalys och generering
**Input:** Block 5.3 + Fas 4 klara
**Output:** AI kan analysera och generera dokument

- [ ] AI-verktyg: analysera PDF/ritning (anropa OCR + skicka text som kontext)
- [ ] AI-verktyg: generera Excel-dokument (skapa fil + ladda upp till MinIO)
- [ ] AI-verktyg: generera PDF-dokument
- [ ] AI-verktyg: generera Word-dokument
- [ ] Sparade dokument syns i projektets fillista

**Verifiering:** Dokument genereras korrekt, sparas i MinIO, visas i fillistan, alla verktyg använder `tenantDb(tenantId)` + `requireProject()`, `npm run build` OK

---
