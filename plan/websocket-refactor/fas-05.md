# Fas 5: Frontend-lyssnare och slutverifiering

> **INNAN DU BÖRJAR:** Läs `/workspace/plan/websocket-refactor/README.md`, `/workspace/plan/websocket-refactor/DIRIGENT.md`, och `/workspace/DEVLOG.md`

---

## Bakgrund

### Hur frontend-lyssnare fungerar

**Hook:** `/workspace/web/src/hooks/use-socket.ts`

```typescript
export function useSocket({
  enabled,
  onTaskCreated,
  onTaskUpdated,
  onFileCreated,
  // ... fler callbacks
}: UseSocketOptions) {
  // Skapar Socket.IO-anslutning
  // Lyssnar på events och anropar callbacks
}
```

**Användning i komponenter:**

```typescript
// I en komponent som visar uppgifter
const [taskVersion, setTaskVersion] = useState(0);

const handleTaskEvent = useCallback((event: RealtimeTaskEvent) => {
  if (event.projectId === currentProjectId) {
    setTaskVersion(v => v + 1);  // Triggar re-fetch
  }
}, [currentProjectId]);

useSocket({
  enabled: !!session,
  onTaskCreated: handleTaskEvent,
  onTaskUpdated: handleTaskEvent,
  onTaskDeleted: handleTaskEvent,
});

// useEffect som hämtar data när version ändras
useEffect(() => {
  if (taskVersion > 0) {
    refreshTasks();
  }
}, [taskVersion]);
```

### Kända problem

Vissa komponenter saknar lyssnare helt. Andra har lyssnare men uppdaterar inte sin state. Denna fas identifierar och fixar alla luckor.

---

## Mål

Säkerställa att alla frontend-komponenter lyssnar på rätt events och att hela systemet fungerar end-to-end.

---

## Block 5.1: Audit av frontend-lyssnare

**Agenttyp:** Design (Claude Opus)

### Uppgift

Kartlägg alla ställen i frontend som BORDE lyssna på WebSocket-events men kanske inte gör det.

### Analys

1. **Lista alla komponenter som visar:**
   - Tasks (kanban, lista, detalj)
   - Files (rutnät, lista)
   - Notes (lista, detalj)
   - Comments (i task-detalj)
   - Time entries (lista, summering)
   - Notifications (bell-ikon, lista)
   - Project members (lista)

2. **För varje komponent:**
   - Använder den `useSocket`?
   - Lyssnar den på rätt events?
   - Uppdaterar den sin state vid event?

3. **Identifiera gaps:**
   - Komponenter utan lyssnare
   - Lyssnare som saknar callback-implementation
   - Events som emittas men ingen lyssnar

### Leverabler

- [ ] Tabell: Komponent → Events → Status (OK/Saknas)
- [ ] Lista över komponenter att fixa
- [ ] Prioritering

---

## Block 5.2: Fixa saknade lyssnare

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Implementera saknade lyssnare baserat på audit i Block 5.1.

### Mönster att följa

```typescript
// I komponenten som visar data
const [dataVersion, setDataVersion] = useState(0);

const handleDataEvent = useCallback((event: RealtimeXxxEvent) => {
  // Kontrollera att eventet är relevant för denna vy
  if (event.projectId === currentProjectId) {
    setDataVersion(v => v + 1);
  }
}, [currentProjectId]);

const { status } = useSocket({
  enabled: !!session,
  onXxxCreated: handleDataEvent,
  onXxxUpdated: handleDataEvent,
  onXxxDeleted: handleDataEvent,
});

// useEffect som hämtar data när version ändras
useEffect(() => {
  if (dataVersion > 0) {
    refreshData();
  }
}, [dataVersion]);
```

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Alla komponenter i audit-listan har lyssnare

---

## Block 5.3: End-to-end test suite (MCP Playwright)

**Agenttyp:** Test — Claude | haiku
**Verktyg:** MCP Playwright (`mcp__playwright__*`)

> Dirigenten startar servern innan och stoppar efter.

### Uppgift

Kör en komplett testsvit via MCP Playwright som verifierar alla realtidsuppdateringar.

### Test-scenarion (Haiku-agent kör varje steg)

1. **Tasks:**
   - `browser_navigate` → Projekt → Kanban
   - Skapa task → `browser_wait_for` → dyker upp
   - `browser_take_screenshot` → `01-task-create.png`

2. **Files:**
   - Navigera till Filer
   - Ladda upp fil → `browser_wait_for` → dyker upp
   - `browser_take_screenshot` → `03-file-upload.png`

3. **Notes:**
   - Navigera till Anteckningar
   - Skapa note → `browser_wait_for` → dyker upp
   - `browser_take_screenshot` → `05-note-create.png`

4. **Comments:**
   - Öppna en task
   - Skriv kommentar → `browser_wait_for` → dyker upp
   - `browser_take_screenshot` → `07-comment-create.png`

5. **Time entries:**
   - Navigera till Tid
   - Logga tid → `browser_wait_for` → dyker upp
   - `browser_take_screenshot` → `09-time-entry.png`

### Screenshots

Sparas till `/workspace/screenshots/websocket-refactor/fas-05/`

### Rapport

```markdown
## E2E Test Report — WebSocket Auto-Emit

**Datum:** YYYY-MM-DD
**Utförare:** Haiku test-agent via MCP Playwright

### Resultat

| Scenario | Status | Screenshot |
|----------|--------|------------|
| Task create | PASS/FAIL | 01-task-create.png |
| File upload | PASS/FAIL | 03-file-upload.png |
| Note create | PASS/FAIL | 05-note-create.png |
| Comment create | PASS/FAIL | 07-comment-create.png |
| Time entry | PASS/FAIL | 09-time-entry.png |

### Avvikelser

[Lista eventuella problem]

### Slutsats

[GODKÄNT / UNDERKÄNT]
```

---

## Block 5.4: Mobil-verifiering

**Agenttyp:** Implementation (Cursor Auto) — om testbar

### Uppgift

Verifiera att mobilappen får WebSocket-events.

### Om testbar

1. Starta Expo-appen i simulator/emulator
2. Logga in
3. Gör en ändring på webben
4. Verifiera att ändringen syns i appen

### Om ej testbar

Dokumentera vad som behövs för att testa:
- Expo-miljö setup
- Simulator/emulator
- Nätverkskonfiguration

---

## Block 5.5: Dokumentation

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Uppdatera projektdokumentation.

### Filer att uppdatera

1. **AGENTS.md:**
   - Lägg till sektion om auto-emit
   - Förklara tenantDb/userDb med emitContext

2. **DEVLOG.md:**
   - Dokumentera refaktoreringen
   - Lösningar på eventuella problem

3. **Ny fil — `/workspace/docs/websocket.md`:**
   ```markdown
   # WebSocket och Realtidsuppdatering

   ## Översikt

   ArbetsYtan använder Socket.IO för realtidsuppdatering...

   ## Auto-Emit

   Alla CRUD-operationer emittar automatiskt events...

   ## Användning

   ```typescript
   // Med auto-emit
   const db = tenantDb(tenantId, { actorUserId: userId, projectId });
   await db.task.create({ data: { ... } });
   // Event emittas automatiskt!

   // Utan auto-emit (bakåtkompatibelt)
   const db = tenantDb(tenantId);
   await db.task.create({ data: { ... } });
   // Inget event
   ```

   ## Events

   | Event | Rum | Payload |
   |-------|-----|---------|
   | task:created | project:X | { projectId, taskId, actorUserId } |
   | ... | ... | ... |
   ```

### Verifiering

- [ ] Dokumentation är korrekt och komplett
- [ ] Kodexempel fungerar

---

## Block 5.6: Städning

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Ta bort gammal kod och städa upp.

### Checklista

1. **Oanvända imports:**
   - Kör `npm run build` och fixa warnings
   - Sök efter imports av borttagna emit-funktioner

2. **Gammal kod:**
   - Ta bort kommenterad kod
   - Ta bort TODO-kommentarer som är klara

3. **Konsistens:**
   - Alla emitContext-användningar följer samma mönster
   - Alla komponenter använder samma socket-hook-mönster

### Verifiering

- [ ] `npm run build` utan varningar
- [ ] Inga oanvända exports
- [ ] Konsistent kodstil

---

## Checkpoint Fas 5

Efter alla block i Fas 5:

- [x] Block 5.1: Audit klar — Identifierade 7 komponenter utan lyssnare
- [x] Block 5.2: Saknade lyssnare fixade — ProjectView (onFileUpdated), Dashboard (wrapper), InvitationList, MemberManagement
- [x] Block 5.3: E2E test suite passerar — 6 screenshots sparade
- [x] Block 5.4: Mobil dokumenterad (ej testbar i denna miljö, se nedan)
- [x] Block 5.5: Dokumentation uppdaterad — `/workspace/web/docs/websocket.md`, AGENTS.md, DEVLOG.md
- [x] Block 5.6: Städning klar
- [ ] Commit: `feat: Add frontend real-time listeners and documentation`

### Block 5.4: Mobil-verifiering (Dokumentation)

**Status:** Ej testbar i denna miljö.

**Krav för mobiltest:**
1. Expo CLI installerat
2. iOS Simulator eller Android Emulator
3. Nätverkskonfiguration så att mobilappen kan nå samma backend som webben
4. Testanvändare med samma tenant

**Mobilappens WebSocket-integration:**
- Använder samma `useSocket`-hook via Expo
- Token-baserad autentisering via `mobileToken` prop
- Lyssnar på samma events som webben

**Rekommendation:** Testa manuellt i staging-miljö innan production-deploy.

---

## Screenshots

```
/workspace/screenshots/websocket-refactor/fas-05/
├── e2e-01-task-create-before.png
├── e2e-02-task-create-after.png
├── e2e-03-task-status-before.png
├── e2e-04-task-status-after.png
├── e2e-05-file-upload-before.png
├── e2e-06-file-upload-after.png
├── e2e-07-note-create-before.png
├── e2e-08-note-create-after.png
├── e2e-09-comment-before.png
├── e2e-10-comment-after.png
├── e2e-11-time-entry-before.png
└── e2e-12-time-entry-after.png
```

---

## Slutlig verifiering

### Framgångskriterier (från README.md)

- [x] Alla CRUD-operationer på listade modeller emittar automatiskt
- [x] Inga manuella emit-anrop behövs
- [x] E2E-tester bekräftar realtidsuppdatering
- [x] Bygger utan fel
- [ ] Mobilapp får events (verifierat eller dokumenterat)

### Definition of Done

1. Alla checkboxar i fas 1-5 är ifyllda
2. Alla commits pushade till main
3. Alla Playwright-tester passerar
4. Dokumentation uppdaterad
5. DEVLOG.md innehåller eventuella lärdomar
