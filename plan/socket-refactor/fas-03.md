# Fas 3: E2E-testning med Playwright (MCP + Haiku)

> **INNAN DU BÖRJAR:** Läs `/workspace/plan/socket-refactor/README.md`

---

## Förutsättningar

- Servern startas av **dirigenten** innan test via `start-server.sh`
- Servern stoppas av **dirigenten** efter test via `stop-server.sh`
- Testanvändare: `admin@example.com` / `password123`
- Screenshots sparas till `/workspace/screenshots/socket-refactor/`

---

## Testplan

Varje test nedan kan köras av en **separat Haiku-agent** parallellt. De testar att realtidsuppdateringar fortfarande fungerar efter refaktoreringen.

---

## Test 3.1: Dashboard — Notifikationer i topbar

**Agent:** Haiku

### Flöde

1. `browser_navigate` → `http://localhost:3000/sv/login`
2. `browser_fill_form` → Logga in som `admin@example.com` / `password123`
3. `browser_wait_for` → Dashboard laddat
4. `browser_snapshot` → Verifiera att topbar renderas
5. `browser_take_screenshot` → `01-dashboard-loaded.png`

### Godkänt om

- Sidan laddas utan fel
- Topbar syns med notifikationsikon
- Inga konsol-fel relaterade till socket

---

## Test 3.2: Projektvy — Tasks realtid

**Agent:** Haiku

### Flöde

1. Logga in (som ovan)
2. `browser_navigate` → Navigera till ett befintligt projekt
3. `browser_snapshot` → Notera befintliga uppgifter
4. `browser_take_screenshot` → `02-project-tasks-before.png`
5. `browser_click` → Skapa en ny uppgift (om möjligt via UI)
6. `browser_wait_for` → Uppgiften syns i listan
7. `browser_take_screenshot` → `03-project-tasks-after.png`

### Godkänt om

- Projektvyn laddas
- Tasks visas
- Skapande av task fungerar (UI reagerar)

---

## Test 3.3: Personligt — Filer & Anteckningar

**Agent:** Haiku

### Flöde

1. Logga in
2. `browser_navigate` → `http://localhost:3000/sv/personal`
3. `browser_snapshot` → Verifiera att personal-view renderas
4. `browser_take_screenshot` → `04-personal-view.png`
5. Klicka på "Anteckningar"-fliken
6. `browser_take_screenshot` → `05-personal-notes.png`
7. Klicka på "Filer"-fliken
8. `browser_take_screenshot` → `06-personal-files.png`

### Godkänt om

- Personal-view laddas utan fel
- Flikar fungerar
- Inga konsol-fel

---

## Test 3.4: Projektlista — Realtidsuppdatering

**Agent:** Haiku

### Flöde

1. Logga in
2. `browser_navigate` → `http://localhost:3000/sv/projects`
3. `browser_snapshot` → Verifiera att projektlistan renderas
4. `browser_take_screenshot` → `07-projects-list.png`

### Godkänt om

- Projektlistan laddas
- Projekt visas korrekt
- Inga konsol-fel

---

## Test 3.5: Inbjudningar & Medlemmar

**Agent:** Haiku

### Flöde

1. Logga in
2. `browser_navigate` → `http://localhost:3000/sv/settings`
3. `browser_snapshot` → Verifiera inställningssidan
4. `browser_take_screenshot` → `08-settings.png`
5. Navigera till team/medlemmar om möjligt
6. `browser_take_screenshot` → `09-members.png`

### Godkänt om

- Inställningssidan laddas
- Inga konsol-fel relaterade till socket

---

## Test 3.6: AI Chat — Socket-anslutning

**Agent:** Haiku

### Flöde

1. Logga in
2. `browser_navigate` → Dashboard
3. Klicka på AI-chat-knappen i topbar
4. `browser_wait_for` → Chat-panelen öppnas
5. `browser_take_screenshot` → `10-ai-chat-open.png`

### Godkänt om

- AI-chatten öppnas
- Inga konsol-fel
- Socket-anslutningen är stabil (ingen fladdring)

---

## Test 3.7: Console-log verifiering

**Agent:** Haiku

### Flöde

1. Logga in
2. Navigera runt: Dashboard → Projekt → Personligt → Inställningar
3. `browser_console_messages` → Samla alla konsol-meddelanden
4. Granska: finns det socket-relaterade fel?

### Godkänt om

- Inga `WebSocket`-fel i konsolen
- Inga `socket.io`-fel i konsolen
- Inga `useSocketEvent`-fel
- Max EN "connected"-logg (bekräftar att bara en anslutning skapas)

---

## Screenshots

```
/workspace/screenshots/socket-refactor/
├── 01-dashboard-loaded.png
├── 02-project-tasks-before.png
├── 03-project-tasks-after.png
├── 04-personal-view.png
├── 05-personal-notes.png
├── 06-personal-files.png
├── 07-projects-list.png
├── 08-settings.png
├── 09-members.png
└── 10-ai-chat-open.png
```

---

## Checkpoint Fas 3

- [x] Test 3.1: Dashboard — UI OK, WebSocket ERR_CONNECTION_REFUSED (stale build, löst med rebuild)
- [x] Test 3.2: Projektvy — UI OK, task skapades, samma WS-timing-problem (stale build)
- [x] Test 3.3: Personligt — GODKÄNT, inga konsolfel
- [x] Test 3.4: Projektlista + Inställningar — GODKÄNT, inga konsolfel
- [x] Test 3.5: (slog ihop med 3.4)
- [x] Test 3.6: AI Chat — GODKÄNT, skapade uppgift via AI som dök upp i kanban utan siduppdatering (4→5 tasks)
- [x] Test 3.7: Console-log — 0 fel, 0 varningar i alla tester efter rebuild
- [x] Screenshots sparade i `/workspace/screenshots/socket-refactor/`

### Utredning: WebSocket ERR_CONNECTION_REFUSED

**Problem:** Test 3.1 och 3.2 rapporterade ERR_CONNECTION_REFUSED för WebSocket.
**Orsak:** Testerna kördes mot en **stale build** som inte innehöll den nya SocketProvider-koden.
**Lösning:** Rebuild (`npm run build`) → alla efterföljande tester GODKÄNDA med fungerande WebSocket-anslutning.
**Verifiering:** Debug-loggar bekräftade: `[SocketProvider] Connected! Socket ID: yp-nf...`
