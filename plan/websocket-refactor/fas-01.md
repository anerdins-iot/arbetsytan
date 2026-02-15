# Fas 1: Design och grundstruktur

> **INNAN DU BÖRJAR:** Läs `/workspace/plan/websocket-refactor/README.md` och `/workspace/plan/websocket-refactor/DIRIGENT.md`

---

## Bakgrund

### Nuvarande struktur (som ska ändras)

**`/workspace/web/src/lib/socket.ts`** — Manuella emit-funktioner:
```typescript
export function emitTaskCreated(projectId: string, payload: RealtimeTaskEvent) {
  const io = getIO();
  if (io) {
    io.to(projectRoom(projectId)).emit(SOCKET_EVENTS.taskCreated, payload);
  }
}
```

**`/workspace/web/src/actions/tasks.ts`** — Manuell anrop:
```typescript
const task = await db.task.create({ data });
emitTaskCreated(projectId, { projectId, taskId: task.id, actorUserId: userId });
```

**`/workspace/web/src/lib/db.ts`** — Prisma-klienter:
```typescript
export function tenantDb(tenantId: string): TenantScopedClient {
  return basePrisma.$extends(createTenantExtension(tenantId));
}
```

### Önskad struktur (efter refaktorering)

```typescript
// Ny signatur — emitContext är valfri för bakåtkompatibilitet
export function tenantDb(tenantId: string, emitContext?: EmitContext): TenantScopedClient {
  let client = basePrisma.$extends(createTenantExtension(tenantId));

  if (emitContext) {
    client = client.$extends(createEmitExtension(emitContext));
  }

  return client;
}

// Användning — emit sker automatiskt
const db = tenantDb(tenantId, { actorUserId: userId, projectId });
const task = await db.task.create({ data });
// Inget manuellt emitTaskCreated() behövs!
```

---

## Mål

Designa arkitekturen för auto-emit systemet och skapa grundläggande infrastruktur.

---

## Block 1.1: Arkitekturdesign

**Agenttyp:** Design (Claude Opus)

### Uppgift

Designa det kompletta auto-emit systemet med följande krav:

1. **Prisma Extension API**
   - Hur ska `tenantDb()` och `userDb()` utökas?
   - Vilka parametrar behövs (actorUserId, projectId, etc.)?
   - Hur undviker vi cirkulära imports?

2. **Event-routing**
   - Hur bestäms rätt rum för varje modell?
   - Hur hanteras modeller med dubbel tillhörighet (File: project ELLER user)?

3. **Payload-struktur**
   - Vad ska inkluderas i varje event?
   - Minimal payload vs full objekt?

4. **Opt-out mekanik**
   - Finns det fall där vi INTE vill emitta? (batch-operationer, migrations)
   - Hur implementeras opt-out?

### Leverabler

- [ ] TypeScript-interface för EmitContext
- [ ] TypeScript-interface för alla event-payloads
- [ ] Diagram över dataflöde
- [ ] Lista över edge cases

### Verifiering

Ingen kod att bygga — design-review av dirigenten.

---

## Block 1.2: Centralisera event-definitioner

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Konsolidera alla event-definitioner till en enda källa.

### Filer att ändra

- `/workspace/web/src/lib/socket-events.ts` — Utöka med alla event-typer
- `/workspace/web/server.ts` — Ta bort duplicerade definitioner, importera från socket-events
- `/workspace/web/src/lib/socket.ts` — Importera från socket-events

### Krav

1. **SOCKET_EVENTS** ska innehålla ALLA event-strängar:
   ```typescript
   export const SOCKET_EVENTS = {
     // Tasks
     taskCreated: "task:created",
     taskUpdated: "task:updated",
     taskDeleted: "task:deleted",

     // Files
     fileCreated: "file:created",
     fileUpdated: "file:updated",
     fileDeleted: "file:deleted",

     // Notes
     noteCreated: "note:created",
     noteUpdated: "note:updated",
     noteDeleted: "note:deleted",

     // Comments (NYA)
     commentCreated: "comment:created",
     commentUpdated: "comment:updated",
     commentDeleted: "comment:deleted",

     // Time entries
     timeEntryCreated: "timeEntry:created",
     timeEntryUpdated: "timeEntry:updated",
     timeEntryDeleted: "timeEntry:deleted",

     // Note categories
     noteCategoryCreated: "noteCategory:created",
     noteCategoryUpdated: "noteCategory:updated",
     noteCategoryDeleted: "noteCategory:deleted",

     // Notifications
     notificationNew: "notification:new",

     // Projects
     projectUpdated: "project:updated",

     // Rooms
     projectJoin: "project:join",
   } as const;
   ```

2. **Payload-typer** för varje event (utöka befintliga)

3. **Room-helpers** ska ligga i socket-events.ts:
   ```typescript
   export const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;
   export const projectRoom = (projectId: string) => `project:${projectId}`;
   export const userRoom = (userId: string) => `user:${userId}`;
   ```

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Inga duplicerade event-definitioner i server.ts
- [ ] socket-events.ts är single source of truth

### Playwright-test

Inget — ingen UI-ändring.

---

## Block 1.3: Skapa EmitContext-typ och helpers

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Skapa infrastrukturen för emit-context som ska skickas med till db-klienterna.

### Ny fil

`/workspace/web/src/lib/emit-context.ts`

### Innehåll

```typescript
/**
 * Context för automatisk WebSocket-emit.
 * Skickas till tenantDb() och userDb() för att möjliggöra auto-emit.
 */
export type EmitContext = {
  /** Användaren som utför operationen */
  actorUserId: string;

  /** Projekt-context (för projekt-scoped operationer) */
  projectId?: string;

  /** Tenant-context (för tenant-scoped operationer) */
  tenantId?: string;

  /** Inaktivera auto-emit (för batch-operationer, migrations, etc.) */
  skipEmit?: boolean;
};

/**
 * Bestäm rätt rum för en modell baserat på context.
 */
export function getTargetRoom(
  model: string,
  context: EmitContext,
  record: Record<string, unknown>
): string | null {
  // Implementation kommer i Block 2.1
  return null;
}

/**
 * Skapa minimal payload för ett event.
 */
export function createEventPayload(
  model: string,
  operation: "created" | "updated" | "deleted",
  record: Record<string, unknown>,
  context: EmitContext
): Record<string, unknown> {
  // Implementation kommer i Block 2.1
  return {};
}
```

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Typen exporteras korrekt
- [ ] Inga cirkulära imports

### Playwright-test

Inget — ingen UI-ändring.

---

## Checkpoint Fas 1

Efter alla block i Fas 1:

- [x] Block 1.1: Arkitekturdesign klar
- [x] Block 1.2: Event-definitioner centraliserade
- [x] Block 1.3: EmitContext-typ skapad
- [x] Commit: `refactor: Centralize WebSocket event definitions and create EmitContext type`

---

## Screenshots

Inga screenshots för denna fas (ingen UI-ändring).
