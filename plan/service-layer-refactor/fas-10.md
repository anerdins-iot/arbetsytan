# Fas 10: Test och Verifiering

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 10.1: Build och TypeScript-verifiering

- [ ] Klart

**Agenttyp:** Verifiering (Gemini 3 Flash)

### Uppgift

Grundlig build- och typkontroll av hela projektet.

### Steg

1. **Ren build:**
```bash
cd /workspace/web
rm -rf .next
npm run build
```

2. **TypeScript strict check:**
```bash
npx tsc --noEmit
```

3. **Kontrollera service-exporter:**
```bash
# Alla services exporteras via index.ts
grep "export \*" src/services/index.ts
```

Forvantad output:
```
export * from "./types";
export * from "./project-service";
export * from "./task-service";
export * from "./file-service";
export * from "./note-service";
export * from "./comment-service";
export * from "./time-entry-service";
export * from "./member-service";
```

4. **Kontrollera att duplicering ar eliminerad:**
```bash
# validateDatabaseId — ska bara finnas i services/types.ts
grep -rn "function validateDatabaseId" src/

# findMany i personal-tools.ts — bor ha minskat drastiskt
grep -c "\.findMany(" src/lib/ai/tools/personal-tools.ts
# Jamfor med fore-refaktorering (notera i planfilen)

# Direkt db.create/update/delete i personal-tools.ts — ska vara minimalt
grep -c "\.create(" src/lib/ai/tools/personal-tools.ts
grep -c "\.update(" src/lib/ai/tools/personal-tools.ts
grep -c "\.delete(" src/lib/ai/tools/personal-tools.ts
```

### Rapportering

Dokumentera:
- Antal kvarvarande `findMany` i personal-tools.ts (forvantning: ~5-10, enbart for icke-migrerade operationer som searchFiles, analyzeDocument)
- Antal kvarvarande `create/update/delete` i personal-tools.ts (forvantning: ~2-5, enbart for icke-migrerade operationer som deleteTask, movePersonalFileToProject)
- Antal service-anrop i Actions
- Antal service-anrop i AI-verktyg

---

## Block 10.2: E2E-test med Playwright — UI-floden

- [ ] Klart

**Agenttyp:** Playwright-test (Claude Haiku via MCP)

### Uppgift

Verifiera att UI fungerar som forvant efter refaktoreringen.

### Forutsattningar

- Server startad via `/workspace/start-server.sh`
- Testanvandare: `admin@example.com` / `password123`

### Testscenarier

#### 1. Projektlista
1. Navigera till `/sv/projects`
2. Verifiera att projektlistan laddas
3. Kontrollera att task-counts visas

#### 2. Projektdetalj
1. Klicka pa ett projekt
2. Verifiera att task-status-raknare visas (TODO/IN_PROGRESS/DONE)
3. Verifiera att medlemslistan laddas

#### 3. Uppgifter
1. Navigera till uppgiftslistan i ett projekt
2. Verifiera att uppgifter laddas med assignments
3. Verifiera att skapa/uppdatera uppgift fungerar

#### 4. Filer
1. Navigera till fillistan i ett projekt
2. Verifiera att filer laddas med bilder (presigned URLs fungerar)

#### 5. Anteckningar
1. Navigera till anteckningslistan
2. Verifiera att anteckningar laddas
3. Skapa en anteckning och verifiera att den dyker upp

#### 6. Kommentarer
1. Oppna en uppgift
2. Verifiera att kommentarer laddas
3. Skapa en kommentar och verifiera att den dyker upp

#### 7. Tidrapportering
1. Navigera till tidrapportering
2. Verifiera att tidsposter laddas
3. Kontrollera sammanfattningen (totalMinutes, byTask, byPerson)

### Rapportering

For varje testscenario:
- PASS: Fungerar som forvant
- FAIL: Beskriv vad som gick fel + screenshot

---

## Block 10.3: E2E-test med Playwright — AI-floden

- [ ] Klart

**Agenttyp:** Playwright-test (Claude Haiku via MCP)

### Uppgift

Verifiera att AI-agenten fungerar korrekt efter refaktoreringen.

### Forutsattningar

- Server startad
- Inloggad som `admin@example.com`

### Testscenarier

#### 1. AI-projektlista
1. Navigera till AI-chatten
2. Skriv: "Lista mina projekt"
3. Verifiera att AI svarar med projektlista

#### 2. AI-uppgifter
1. Skriv: "Visa mina uppgifter"
2. Verifiera att AI listar uppgifter med projekt

#### 3. AI-filer
1. Skriv: "Lista filer i [projektnamn]"
2. Verifiera att AI listar filer med analyser

#### 4. AI-anteckningar
1. Skriv: "Skapa en anteckning i [projektnamn] med innehallet 'Test fran AI'"
2. Verifiera att anteckningen skapas
3. Skriv: "Lista anteckningar i [projektnamn]"
4. Verifiera att den nya anteckningen syns

#### 5. AI-kommentarer
1. Skriv: "Visa kommentarer pa [uppgiftsnamn] i [projektnamn]"
2. Verifiera att kommentarer laddas

#### 6. AI-tidsrapportering
1. Skriv: "Visa tidssammanfattning for [projektnamn]"
2. Verifiera att sammanfattning visas

#### 7. AI-nya verktyg (CRUD-gap)
1. Skriv: "Visa mina notifieringar"
2. Verifiera att notifieringar laddas
3. Skriv: "Visa detaljer for projekt [id]"
4. Verifiera att projektdetaljer visas

### Rapportering

For varje testscenario:
- PASS: AI svarar korrekt
- FAIL: Beskriv felet + AI-svaret

### Efter alla tester godkanda

```bash
git add -A
git commit -m "docs: complete service layer refactor - all tests passing"
```

---

## Slutlig sammanfattning

Nar alla block i fas 10 ar godkanda, uppdatera README.md med:

1. **Status:** KLAR
2. **Statistik:**
   - Antal service-funktioner skapade
   - Antal duplicerade `findMany` eliminerade
   - Antal AI-verktyg som nu anropar Actions
   - Antal nya AI-verktyg tillagda
3. **Framgangskriterier:**
   - [x] `npm run build` utan fel
   - [x] `npx tsc --noEmit` utan fel
   - [x] Ingen duplicerad `findMany`-logik for lasoperationer
   - [x] `validateDatabaseId` definieras ENBART i `services/types.ts`
   - [x] Alla AI-skrivoperationer anropar Actions
   - [x] Alla saknade AI-verktyg implementerade
   - [x] E2E-test: UI fungerar
   - [x] E2E-test: AI fungerar
