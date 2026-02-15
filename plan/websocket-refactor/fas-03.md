# Fas 3: Migrera befintliga manuella emits

> **INNAN DU BÖRJAR:** Läs `/workspace/plan/websocket-refactor/README.md`, `/workspace/plan/websocket-refactor/DIRIGENT.md`, och `/workspace/DEVLOG.md`

---

## Bakgrund

### Vad ska ändras?

Alla Server Actions i `/workspace/web/src/actions/` som anropar manuella emit-funktioner ska uppdateras.

### Mönster att följa

**FÖRE (nuvarande):**
```typescript
// actions/tasks.ts
export async function createTask(projectId: string, data: TaskInput) {
  const { tenantId, userId } = await requireAuth();
  const db = tenantDb(tenantId);  // Utan emitContext

  const task = await db.task.create({ data: { ...data, projectId } });

  // Manuell emit — kan glömmas!
  emitTaskCreated(projectId, { projectId, taskId: task.id, actorUserId: userId });

  return task;
}
```

**EFTER (nytt):**
```typescript
// actions/tasks.ts
export async function createTask(projectId: string, data: TaskInput) {
  const { tenantId, userId } = await requireAuth();

  // Med emitContext — emit sker automatiskt!
  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  const task = await db.task.create({ data: { ...data, projectId } });

  // INGEN manuell emit — extension hanterar det
  return task;
}
```

### Filer att ändra

> **OBS (uppdaterat av dirigenten):** Kodanalys visade att fler filer än ursprungligt planerade innehåller manuella emit-anrop. Tabellen nedan är komplett.

| Fil | Emits som tas bort | Antal |
|-----|-------------------|-------|
| `actions/tasks.ts` | emitTaskCreatedToProject, emitTaskUpdatedToProject, emitTaskDeletedToProject | 5 |
| `actions/files.ts` | emitFileCreatedToProject, emitFileDeletedToProject | 3 |
| `actions/notes.ts` | emitNoteCreatedToProject, emitNoteUpdatedToProject, emitNoteDeletedToProject | 3 |
| `actions/personal.ts` | emitNoteCreatedToUser, emitNoteUpdatedToUser, emitNoteDeletedToUser | 4 |
| `actions/time-entries.ts` | emitTimeEntryCreatedToProject, emitTimeEntryUpdatedToProject, emitTimeEntryDeletedToProject | 3 |
| `actions/note-categories.ts` | emitNoteCategoryCreatedToTenant, emitNoteCategoryUpdatedToTenant, emitNoteCategoryDeletedToTenant | 3 |
| `actions/projects.ts` | emitProjectUpdatedToProject | 2 |
| `actions/notifications.ts` | emitNotificationToUser | 1 |
| `lib/ai/tool-executors.ts` | emitTaskCreatedToProject, emitTaskUpdatedToProject, emitTimeEntryCreatedToProject | 3 |
| `lib/ai/queue-file-analysis.ts` | emitFileUpdatedToUser, emitFileUpdatedToProject | 2 |
| `lib/ai/save-generated-document.ts` | emitFileCreatedToProject | 1 |
| `lib/ai/tools/personal-tools.ts` | emitTimeEntry*, emitNote*, emitNoteCategory*, emitProjectUpdated* | 12 |
| `lib/notification-delivery.ts` | emitNotificationToUser | 1 |

---

## Mål

Uppdatera alla befintliga Server Actions och API routes för att använda auto-emit istället för manuella emit-anrop.

---

## Block 3.1: Migrera Task-actions

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Uppdatera `actions/tasks.ts` för att använda auto-emit.

### Fil att ändra

`/workspace/web/src/actions/tasks.ts`

### Ändringar

1. **Hitta alla ställen som anropar emitTaskCreated/Updated/Deleted**
2. **Ersätt manuella emit-anrop:**

   **Före:**
   ```typescript
   const db = tenantDb(tenantId);
   const task = await db.task.create({ data: { ... } });
   emitTaskCreated(projectId, { projectId, taskId: task.id, actorUserId: userId });
   ```

   **Efter:**
   ```typescript
   const db = tenantDb(tenantId, { actorUserId: userId, projectId });
   const task = await db.task.create({ data: { ... } });
   // Emit sker automatiskt!
   ```

3. **Ta bort oanvända imports:**
   - `emitTaskCreated`, `emitTaskUpdated`, `emitTaskDeleted` från socket.ts

### Krav

- Alla task CRUD-operationer ska gå via tenantDb med emitContext
- Inga manuella emit-anrop kvar för tasks
- Behåll all övrig logik (requireAuth, validering, etc.)

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Inga manuella task-emit-anrop kvar i filen
- [ ] Grep bekräftar: `grep -r "emitTaskCreated\|emitTaskUpdated\|emitTaskDeleted" src/actions/`

### MCP Playwright-test (Haiku agent)

> Dirigenten startar servern innan test och stoppar den efter.

**Testflöde:**
1. `browser_navigate` → `http://localhost:3000/sv/login`
2. `browser_fill_form` → Logga in som `fredrik@anerdins.se` / `password123`
3. `browser_wait_for` → Dashboard laddat
4. `browser_click` → Öppna ett projekt
5. `browser_snapshot` → Notera befintliga uppgifter
6. `browser_take_screenshot` → `01-before-create.png`
7. Skapa en ny uppgift (klicka "Ny uppgift", fyll i, spara)
8. `browser_wait_for` → Uppgiften dyker upp i kanban utan sidladdning
9. `browser_take_screenshot` → `02-task-created.png`

**Screenshots:** `/workspace/screenshots/websocket-refactor/fas-03/`

---

## Block 3.2: Migrera File-actions

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Uppdatera `actions/files.ts` och `actions/personal.ts` för att använda auto-emit.

### Filer att ändra

- `/workspace/web/src/actions/files.ts`
- `/workspace/web/src/actions/personal.ts`
- `/workspace/web/src/lib/ai/queue-file-analysis.ts`

### Ändringar

1. **files.ts:**
   - Ersätt manuella `emitFileCreated/Updated/Deleted` med emitContext
   - Projekt-filer går via `tenantDb(tenantId, { actorUserId, projectId })`

2. **personal.ts:**
   - Lägg till emitContext för personliga filer
   - `userDb(userId, { skipEmit: false })` — auto-emit till user-rum

3. **queue-file-analysis.ts:**
   - Ersätt manuella `emitFileUpdatedToUser/Project`
   - `userDb(userId)` och `tenantDb(tenantId, { actorUserId: userId, projectId })` med emit

### Krav

- Alla fil-operationer emittar automatiskt
- Personliga filer → user-rum
- Projekt-filer → project-rum

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Inga manuella file-emit-anrop kvar
- [ ] Grep bekräftar

### MCP Playwright-test (Haiku agent)

**Testflöde:**
1. `browser_navigate` → Logga in
2. Navigera till "Personligt" → Filer
3. `browser_take_screenshot` → `03-files-before.png`
4. Öppna AI-chatten och ladda upp en fil
5. `browser_wait_for` → Filen dyker upp automatiskt i fillistan
6. `browser_take_screenshot` → `04-file-uploaded.png`

**Screenshots:** `/workspace/screenshots/websocket-refactor/fas-03/`

---

## Block 3.3: Migrera Note-actions

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Uppdatera `actions/notes.ts` och personliga note-operationer.

### Filer att ändra

- `/workspace/web/src/actions/notes.ts`

### Ändringar

1. Ersätt alla manuella `emitNoteCreated/Updated/Deleted`
2. Projektnotes → `tenantDb(tenantId, { actorUserId, projectId })`
3. Personliga notes → `userDb(userId)`

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Inga manuella note-emit-anrop kvar

### MCP Playwright-test (Haiku agent)

**Testflöde:**
1. `browser_navigate` → Logga in
2. Navigera till ett projekt → Anteckningar
3. `browser_take_screenshot` → `05-notes-before.png`
4. Skapa en ny anteckning
5. `browser_wait_for` → Anteckningen dyker upp utan sidladdning
6. `browser_take_screenshot` → `06-note-created.png`

**Screenshots:** `/workspace/screenshots/websocket-refactor/fas-03/`

---

## Block 3.4: Migrera TimeEntry-actions

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Uppdatera `actions/time-entries.ts`.

### Fil att ändra

- `/workspace/web/src/actions/time-entries.ts`

### Ändringar

1. Ersätt manuella emit-anrop
2. `tenantDb(tenantId, { actorUserId, projectId })`

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Inga manuella timeEntry-emit-anrop kvar

### MCP Playwright-test (Haiku agent)

**Testflöde:**
1. `browser_navigate` → Logga in
2. Navigera till ett projekt → Tid
3. `browser_take_screenshot` → `07-time-before.png`
4. Registrera tid på en uppgift
5. `browser_wait_for` → Tidsposten dyker upp
6. `browser_take_screenshot` → `08-time-logged.png`

**Screenshots:** `/workspace/screenshots/websocket-refactor/fas-03/`

---

## Block 3.5: Rensa upp socket.ts

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Ta bort alla manuella emit-funktioner som nu är ersatta av auto-emit.

### Fil att ändra

- `/workspace/web/src/lib/socket.ts`

### Ändringar

1. **Ta bort följande funktioner:**
   - `emitTaskCreated`, `emitTaskUpdated`, `emitTaskDeleted`
   - `emitFileCreated`, `emitFileUpdated`, `emitFileDeleted`
   - `emitFileCreatedToUser`, `emitFileUpdatedToUser`, `emitFileDeletedToUser`
   - `emitFileCreatedToProject`, `emitFileUpdatedToProject`, `emitFileDeletedToProject`
   - `emitNoteCreated`, `emitNoteUpdated`, `emitNoteDeleted`
   - `emitNoteCategoryCreated`, `emitNoteCategoryUpdated`, `emitNoteCategoryDeleted`
   - `emitTimeEntryCreated`, `emitTimeEntryUpdated`, `emitTimeEntryDeleted`

2. **Behåll:**
   - `emitNotification` — om den används separat
   - `emitProjectUpdated` — om den används separat
   - Grundläggande `getIO()` och rum-funktioner

3. **Eventuellt:**
   - Flytta kvarvarande emit-funktioner till socket-events.ts eller db-emit-extension.ts

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Inga oanvända exports
- [ ] Alla tidigare användare av funktionerna är uppdaterade

### Playwright-test

Inget — cleanup utan ny funktionalitet.

---

## Checkpoint Fas 3

Efter alla block i Fas 3:

- [ ] Block 3.1: Task-actions migrerade
- [ ] Block 3.2: File-actions migrerade
- [ ] Block 3.3: Note-actions migrerade
- [ ] Block 3.4: TimeEntry-actions migrerade
- [ ] Block 3.5: socket.ts städad
- [ ] Commit: `refactor: Migrate all actions to use auto-emit instead of manual emits`

---

## Screenshots

```
/workspace/screenshots/websocket-refactor/fas-03/
├── task-01-before-create.png
├── task-02-task-created.png
├── file-01-files-before.png
├── file-02-file-uploaded.png
├── note-01-notes-before.png
├── note-02-note-created.png
├── time-01-time-before.png
└── time-02-time-logged.png
```
