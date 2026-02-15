# Erfarenheter från WebSocket Refactoring

> Dokumenterat under pågående arbete för framtida referens.
> Denna fil är en mall för erfarenhetsloggning i framtida projekt.

---

## Sammanfattning

**Projekt:** Ersätt manuella WebSocket emit-anrop med automatisk emission via Prisma extension.

**Omfattning:** ~40 manuella emit-anrop i ~15 filer.

**Tid:** ~2 timmar aktiv orkestrering.

**Resultat:** Lyckades (med avvikelser).

---

## Vad som gick bra

### 1. Arkitekturdesign (Fas 1)
- Claude Opus-agenten levererade en komplett och genomtänkt design för auto-emit extension
- Designen täckte edge cases (batch-operationer, cirkulära importer, fire-and-forget)
- EmitContext-typen var väl definierad från start
- **Varför det fungerade:** Opus är rätt modell för arkitektur/design

### 2. Prisma Extension Implementation (Fas 2)
- `createEmitExtension()` fungerade direkt efter implementation
- Integration med `tenantDb()` och `userDb()` var smidig
- Build passerade efter varje block
- **Varför det fungerade:** Tydlig spec från designfasen, en fil åt gången

### 3. Migrering av actions-filer (Fas 3, Block 3.1-3.4)
- Mönstret var tydligt och konsekvent
- tasks.ts, files.ts, notes.ts, time-entries.ts migrerades utan problem
- Verifieringsagenterna fångade inga fel
- **Varför det fungerade:** Enkla, upprepade ändringar med tydligt mönster

### 4. Sekventiellt arbetsflöde (när det följdes)
- Implementation → Verifiering → Commit fungerade bra
- Checkboxar i planfiler uppdaterades efter varje commit

---

## Vad som gick dåligt

### 1. Fel modellval
- Använde Claude Opus för backend-arbete istället för Gemini
- **Regel:** Frontend = Opus, Backend = Gemini, Test = Haiku
- **Konsekvens:** Onödig kostnad och långsammare svar

### 2. För många parallella agenter
- Spawnade 3+ agenter samtidigt för olika filer
- **Konsekvenser:**
  - Build-lås (`.next/lock` konflikter)
  - Svårt att spåra vilken agent som gjorde vad
  - Agenter som avslutades utan att slutföra
- **Lärdom:** Kör EN implementation åt gången, sekventiellt
- **Undantag:** Parallellt OK om filerna är helt oberoende OCH ingen build körs

### 3. Agenter som inte slutförde
- impl-remaining-1, impl-remaining-2, impl-remaining-3 avslutades tidigt
- De rapporterade bara att de "skulle läsa filer" men gjorde inte ändringarna
- fix-projects, fix-notifications hade samma problem
- **Orsak:** Gemini-agenter kan få slut på tokens och avsluta tidigt
- **Lärdom:**
  - Ge mer specifika instruktioner med exakta filnamn och radnummer
  - Verifiera alltid att agenten faktiskt gjorde ändringarna
  - Spawna ny agent istället för att försöka fortsätta en som stoppat
  - **Fallback:** Om Gemini misslyckas, använd Cursor `auto` istället

### 3b. Dirigenten gjorde för mycket manuellt arbete
- Jag körde `npm run build` själv istället för att delegera
- Jag fixade TypeScript-fel manuellt istället för att spawna agent
- **Konsekvens:** Blockerade mig själv, kunde inte koordinera andra agenter
- **Regel:** Dirigenten delegerar ALLT. Kör ALDRIG blockerande kommandon själv.
- **Undantag:** Triviala enkla ändringar (en rad) kan göras direkt

### 4. Manuella fixar krävdes
- `tool-executors.ts`: Saknade `createdById` i note.create (TypeScript-fel)
- `personal-tools.ts`: Saknade import av `tenantDb`, hade kvar 3 emit-anrop
- **Orsak:** Agenten tog bort importen men inte alla anrop, eller vice versa
- **Lärdom:** Kör alltid `grep` efter agent är klar för att verifiera

### 5. Tillfälliga build-fel
- `.next/lock` och filsystemfel uppstod flera gånger
- **Orsak:** Flera agenter försökte bygga samtidigt
- **Lösning:** `rm -rf .next && npm run build`

---

## Avvikelser från planen

### 1. Fler filer än ursprungligen planerat
- Planfilen hade 5 filer listade, verkligt antal var ~15
- AI-filer (tool-executors, personal-tools, queue-file-analysis, etc.) var inte med från början
- **Varför missades de?**
  - Ursprunglig plan fokuserade på `actions/`-mappen
  - Ingen systematisk grep kördes innan planen skrevs
  - `lib/ai/` och `app/api/ai/` innehöll också emit-anrop
- **Lärdom:** Kör alltid kodanalys INNAN planering:
  ```bash
  grep -r "emit[A-Z]" src/ --include="*.ts" | grep -v socket.ts
  ```

### 2. Komplexitet i personal-tools.ts
- Filen tar emot `db` som parameter via `ctx`
- Förväntad lösning fungerade inte (ctx.db har ingen emitContext)
- **Faktisk lösning:** Skapa ny `tenantDb(tenantId, { emitContext })` inuti varje funktion
- Detta avviker från mönstret där `db` skapas en gång
- **Dokumenterat i planfilen:** Ja, under Block 3.7

### 3. Saknade block i planfilen
- Block 3.6 och 3.7 lades till under implementationen
- **Viktigt:** Planfilen uppdaterades för att reflektera det faktiska arbetet
- Framtida läsare kan se exakt vad som gjordes

---

## Tekniska lärdomar

### Prisma Extension Pattern
```typescript
// Skapa extension med context
const db = tenantDb(tenantId, { actorUserId: userId, projectId });

// CRUD-operationer emittar automatiskt
await db.task.create({ data: { ... } }); // → taskCreated event

// Skippa emit vid behov
const dbNoEmit = tenantDb(tenantId, { actorUserId: userId, skipEmit: true });
```

### Rum-routing
- Task, TimeEntry, File (projekt), Note (projekt) → `project:${projectId}`
- File (personlig), Note (personlig), Notification → `user:${userId}`
- NoteCategory → `tenant:${tenantId}`

### Cirkulära importer
- `db-emit-extension.ts` läser `globalThis.ioServer` direkt
- Importerar INTE från socket.ts
- Detta undviker cirkulär import: db.ts ↔ socket.ts

---

## Rekommendationer för framtida planer

### Innan planering
1. Kör kodanalys (`grep`) för att hitta ALLA berörda filer
2. Dokumentera i planfilen: "Filer att ändra" med komplett lista
3. Identifiera komplexa fall (t.ex. filer som tar emot db via parameter)

### Under implementation
1. **Sekventiellt:** Implementation → Verifiering → Commit → Nästa block
2. **En agent i taget** för implementation
3. **Verifiera med grep** att alla ändringar verkligen gjordes
4. **Uppdatera planfilen** om nya block behövs

### Modellval
| Uppgift | Provider | Modell |
|---------|----------|--------|
| Design/arkitektur | Claude | `opus` |
| Frontend (UI/React/CSS) | Claude | `opus` |
| Backend/infrastruktur | Gemini | `gemini-3-flash-preview` |
| Verifiering (build/tsc) | Gemini | `gemini-3-flash-preview` |
| Playwright-test | Claude | `haiku` |
| Fallback | Cursor | `auto` |

### Vid problem
1. **Agent avslutar tidigt:** Spawna ny agent med mer specifika instruktioner
2. **Build-konflikt:** `rm -rf .next && npm run build`
3. **TypeScript-fel:** Läs felet, fixa manuellt eller spawna fix-agent
4. **Ofullständig migrering:** Kör `grep` för att hitta kvarvarande anrop

---

## Status vid dokumentation

- **Fas 1:** Klar — `8a80913` feat: Add auto-emit Prisma extension for WebSocket events
- **Fas 2:** Klar — `8035042` refactor: Migrate all actions to use auto-emit instead of manual emits
- **Fas 3:** Klar — (ingår i Fas 2 commit)
- **Fas 4:** Klar — `9c83c8a` feat: Add real-time updates for comments and project archiving
- **Fas 4:** Klar — `0551f06` feat: Add real-time updates for invitations and memberships
- **Fas 5:** Klar — `8a75c43` feat: Add frontend real-time listeners and documentation

**Totalt:** 5 commits, ~40 emit-anrop migrerade, E2E-tester passerade.

---

## Playwright-testning via MCP

**Datum:** 2026-02-15

### Vad som testades

E2E-tester kördes via MCP Playwright-verktyg med en Haiku sub-agent. Testerna verifierade att WebSocket-events emitteras korrekt och att frontend uppdateras i realtid.

### Testresultat

| Scenario | Status | Observation |
|----------|--------|-------------|
| Login | PASS | Session etablerad |
| Task create | PASS | Task dök upp omedelbart i kanban |
| Note create | PASS | Anteckning synlig direkt i lista |
| Files tab | PASS | Filer visas korrekt |
| Comment create | PASS | Kommentar synlig direkt i task-dialog |

### Screenshots

7 screenshots sparades i `/workspace/screenshots/websocket-refactor/fas-05/`:
- `e2e-01-before-task.png` — Kanban före task-skapande
- `e2e-02-after-task.png` — Task dyker upp i realtid
- `e2e-03-before-note.png` — Anteckningar före
- `e2e-04-after-note.png` — Anteckning dyker upp i realtid
- `e2e-05-files-tab.png` — Filer-fliken
- `e2e-06-before-comment.png` — Task-dialog före kommentar
- `e2e-07-after-comment.png` — Kommentar dyker upp i realtid

### Lärdomar från Playwright-testning

1. **MCP Playwright fungerar bra för E2E** — Haiku-agenter kan navigera, fylla formulär, klicka och vänta på element
2. **Screenshots är värdefulla** — Visuell verifiering av realtidsuppdateringar
3. **Server-hantering** — Dirigenten startar/stoppar server, test-agenten fokuserar på browser-interaktion
4. **Modellval:** Haiku är kostnadseffektivt för repetitiva test-scenarion

---

---

## KRITISK REGEL: Planen är ett kontrakt

**Hoppa ALDRIG över planerade block utan explicit godkännande från användaren.**

Planen är inte ett förslag. Den är ett kontrakt för vad som ska levereras.

**Om något verkar onödigt eller har lägre prioritet:**
1. FRÅGA användaren först: "Block X verkar ha lägre prioritet. Ska jag implementera det eller hoppa över?"
2. VÄNTA på svar. Agera ALDRIG på egen bedömning.
3. DOKUMENTERA beslutet i planfilen med användarens godkännande.

**Varför detta är kritiskt:**
- Produktionsmiljöer förväntar sig komplett leverans
- Andra delar av systemet kan bero på funktioner som verkar "lågprioriterade"
- Användaren har valt att inkludera blocket av en anledning
- Att skippa utan godkännande bryter förtroendet

**Konsekvens:** Inkomplett leverans, oväntade buggar, förlorat förtroende.

**Historik:** 2026-02-15 — Orkestern skippade Block 4.4 (Invitation-events) utan att fråga. Detta var ett allvarligt fel som korrigerades efter tillrättavisning.

---

## Ändringslogg för denna fil

| Datum | Ändring |
|-------|---------|
| 2026-02-15 | Första version skapad under pågående arbete |
| 2026-02-15 | Lade till tekniska lärdomar och rekommendationer |
| 2026-02-15 | Lade till kritisk regel om att aldrig skippa planerade block |
| 2026-02-15 | Uppdaterade status — alla faser klara, E2E-tester dokumenterade |
