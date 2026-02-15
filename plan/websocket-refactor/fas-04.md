# Fas 4: Lägg till saknade events

> **INNAN DU BÖRJAR:** Läs `/workspace/plan/websocket-refactor/README.md`, `/workspace/plan/websocket-refactor/DIRIGENT.md`, och `/workspace/DEVLOG.md`

---

## Bakgrund

### Modeller som saknar WebSocket-events idag

Analysen i Fas 0 identifierade följande luckor:

| Modell | Problem | Konsekvens |
|--------|---------|------------|
| Comment | Inga events | Kommentarer på uppgifter visas inte i realtid |
| Invitation | Inga events | Nya teammedlemmar syns inte direkt |
| Project (delete) | Inget event | Användare i raderat projekt hänger kvar |

### Kommentarer — Datamodell

```prisma
model Comment {
  id        String   @id @default(cuid())
  content   String
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id])
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Rum:** Comment → Task → Project → `project:X`

### Var visas kommentarer?

Kommentarer visas i uppgiftsdetalj-vyn. Hitta komponenten via:
```bash
grep -r "comment" /workspace/web/src/components/
```

---

## Mål

Implementera WebSocket-events för modeller som saknar realtidsuppdatering: Comments, Invitations, Project-delete.

---

## Block 4.1: Comment-events (Design)

**Agenttyp:** Design (Claude Opus)

### Uppgift

Designa hur kommentarer ska uppdateras i realtid.

### Frågor att besvara

1. **UI-komponent:** Var visas kommentarer? Vilken komponent ska lyssna?
2. **Payload:** Vad behövs? Hela kommentaren eller bara ID?
3. **Rum:** Comment → Task → Project — är project-rum rätt?
4. **Scroll-beteende:** Ska nya kommentarer auto-scrollas till?

### Leverabler

- [ ] Komponentdiagram
- [ ] Payload-specifikation
- [ ] UI-beteende-specifikation

---

## Block 4.2: Comment-events (Frontend)

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Lägg till lyssnare för comment-events i frontend.

### Filer att ändra

- `/workspace/web/src/hooks/use-socket.ts` — Lägg till comment-callbacks
- Relevant komponent där kommentarer visas (hitta via grep)

### Ändringar

1. **use-socket.ts:**
   ```typescript
   onCommentCreated?: (event: RealtimeCommentEvent) => void;
   onCommentUpdated?: (event: RealtimeCommentEvent) => void;
   onCommentDeleted?: (event: RealtimeCommentEvent) => void;
   ```

2. **socket-events.ts:**
   ```typescript
   export type RealtimeCommentEvent = {
     projectId: string;
     taskId: string;
     commentId: string;
     actorUserId: string;
     comment?: {
       id: string;
       content: string;
       authorName: string;
       createdAt: string;
     };
   };
   ```

3. **Komponent som visar kommentarer:**
   - Lägg till socket-lyssnare
   - Uppdatera kommentarlistan vid event

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Nya event-typer exporteras

### MCP Playwright-test (Haiku agent)

> OBS: MCP Playwright stödjer tabs via `browser_tabs`. Testa i en flik.

**Testflöde:**
1. `browser_navigate` → Logga in
2. Navigera till ett projekt → Öppna en uppgift
3. `browser_take_screenshot` → `01-task-open.png`
4. Skriv en kommentar i kommentarsfältet
5. `browser_click` → Skicka kommentar
6. `browser_wait_for` → Kommentaren visas
7. `browser_take_screenshot` → `02-comment-added.png`

**Screenshots:** `/workspace/screenshots/websocket-refactor/fas-04/`

---

## Block 4.3: Comment-events (Backend)

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Uppdatera `actions/comments.ts` för att använda auto-emit.

### Fil att ändra

- `/workspace/web/src/actions/comments.ts`

### Ändringar

1. **createComment:**
   ```typescript
   // Hämta task för att få projectId
   const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true } });

   const dbWithEmit = tenantDb(tenantId, { actorUserId: userId, projectId: task.projectId });
   const comment = await dbWithEmit.comment.create({ ... });
   ```

2. **updateComment och deleteComment:**
   - Samma mönster — hämta projectId via task

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Kommentarer emittar till project-rum

### MCP Playwright-test

Samma som Block 4.2.

---

## Block 4.4: Invitation-events (Design)

**Agenttyp:** Design (Claude Opus)

### Uppgift

Designa hur inbjudningar och nya medlemmar ska uppdateras i realtid.

### Frågor att besvara

1. **När ska event skickas?**
   - När inbjudan skickas?
   - När inbjudan accepteras?
   - Båda?

2. **Till vem?**
   - Inbjudan skickad → tenant-admin
   - Inbjudan accepterad → alla i tenant/project

3. **UI-uppdatering:**
   - Vilka komponenter ska uppdateras?
   - Medlemslista i projekt?
   - Användarhantering i inställningar?

### Leverabler

- [ ] Event-specifikation
- [ ] Rum-routing
- [ ] UI-komponenter att uppdatera

---

## Block 4.5: Project-delete event

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Lägg till event när ett projekt raderas.

### Filer att ändra

- `/workspace/web/src/actions/projects.ts`
- `/workspace/web/src/lib/socket-events.ts`
- `/workspace/web/src/hooks/use-socket.ts`

### Ändringar

1. **socket-events.ts:**
   ```typescript
   export const SOCKET_EVENTS = {
     // ...existing
     projectDeleted: "project:deleted",
   };

   export type RealtimeProjectDeletedEvent = {
     tenantId: string;
     projectId: string;
     actorUserId: string;
   };
   ```

2. **use-socket.ts:**
   ```typescript
   onProjectDeleted?: (event: RealtimeProjectDeletedEvent) => void;
   ```

3. **projects.ts:**
   - Vid delete: emit `projectDeleted` till tenant-rum
   - Användare som har projektet öppet ska navigeras bort

4. **Frontend-hantering:**
   - Om användaren är på det raderade projektet → navigera till dashboard
   - Visa toast: "Projektet har raderats"

### Verifiering

- [ ] `npm run build` utan fel

### MCP Playwright-test (Haiku agent)

**Testflöde:**
1. `browser_navigate` → Logga in som admin
2. Navigera till ett projekt
3. `browser_take_screenshot` → `03-project-open.png`
4. Radera projektet
5. `browser_wait_for` → Navigeras till dashboard
6. `browser_take_screenshot` → `04-project-deleted.png`

**Screenshots:** `/workspace/screenshots/websocket-refactor/fas-04/`

---

## Checkpoint Fas 4

Efter alla block i Fas 4:

- [x] Block 4.1: Comment-design klar
- [x] Block 4.2: Comment-frontend implementerad
- [x] Block 4.3: Comment-backend implementerad
- [ ] Block 4.4: Invitation-design — **SKIPPED** (lägre prioritet, kan läggas till senare)
- [x] Block 4.5: Project-archive redirect implementerad (använder projectUpdated med newStatus)
- [ ] Commit: `feat: Add real-time updates for comments and project archiving`

### Avvikelser från plan

1. **Block 4.4 (Invitation-events) skippades** — Invitations är ett separat flöde med låg prioritet för realtidsuppdatering. Kan läggas till i framtida iteration.

2. **Block 4.5 ändrades från "delete" till "archive"** — Projektet har ingen delete-funktion, bara archive. Frontend reagerar nu på `projectUpdated` med `newStatus: "ARCHIVED"` och navigerar användaren till projektlistan.

---

## Screenshots

```
/workspace/screenshots/websocket-refactor/fas-04/
├── comment-01-task-open.png
├── comment-02-comment-added.png
├── comment-03-other-tab-sees-comment.png
├── project-01-project-open.png
├── project-02-project-deleted.png
└── project-03-redirected-to-dashboard.png
```
