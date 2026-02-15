# Fas 2: Implementation av auto-emit extension

> **INNAN DU BÖRJAR:** Läs `/workspace/plan/websocket-refactor/README.md`, `/workspace/plan/websocket-refactor/DIRIGENT.md`, och `/workspace/DEVLOG.md`

---

## Bakgrund

### Prisma Extensions

Prisma 7 stödjer "client extensions" som kan intercepta queries. Projektet använder redan detta för tenant-isolering:

```typescript
// Befintlig kod i /workspace/web/src/lib/db.ts
function createTenantExtension(tenantId: string) {
  return Prisma.defineExtension({
    query: {
      task: {
        async findMany({ args, query }) {
          // Injicerar WHERE tenantId = X automatiskt
          args.where = { ...args.where, project: { tenantId } };
          return query(args);
        },
        // ... create, update, delete
      },
    },
  });
}
```

### Vad vi ska bygga

En **ny extension** som interceptar `create`, `update`, `delete` och automatiskt emittar WebSocket-events:

```typescript
function createEmitExtension(context: EmitContext) {
  return Prisma.defineExtension({
    query: {
      task: {
        async create({ args, query }) {
          const result = await query(args);  // Kör queryn först

          // Emit efter lyckad create
          emitToRoom(projectRoom(result.projectId), SOCKET_EVENTS.taskCreated, {
            projectId: result.projectId,
            taskId: result.id,
            actorUserId: context.actorUserId,
          });

          return result;
        },
      },
    },
  });
}
```

### Socket.IO-åtkomst

Socket.IO-servern lagras globalt i `server.ts`:
```typescript
(globalThis as Record<string, unknown>).ioServer = io;
```

Emit-funktioner i `socket.ts` hämtar den:
```typescript
function getIO(): Server | null {
  return (globalThis as Record<string, unknown>).ioServer as Server | null;
}
```

---

## Mål

Implementera Prisma-extension som automatiskt emittar WebSocket-events vid CRUD-operationer.

---

## Block 2.1: Implementera auto-emit extension

**Agenttyp:** Implementation (Claude Opus — komplex logik)

### Uppgift

Skapa en Prisma-extension som interceptar `create`, `update`, `delete` och automatiskt emittar events.

### Ny fil

`/workspace/web/src/lib/db-emit-extension.ts`

### Design

```typescript
import { Prisma } from "@/generated/prisma";
import { SOCKET_EVENTS, projectRoom, userRoom, tenantRoom } from "./socket-events";
import type { EmitContext } from "./emit-context";

// Modeller som ska ha auto-emit
const EMIT_MODELS = {
  task: {
    events: { create: "taskCreated", update: "taskUpdated", delete: "taskDeleted" },
    getRoom: (record: any, ctx: EmitContext) => projectRoom(record.projectId || ctx.projectId),
  },
  file: {
    events: { create: "fileCreated", update: "fileUpdated", delete: "fileDeleted" },
    getRoom: (record: any, ctx: EmitContext) =>
      record.projectId ? projectRoom(record.projectId) : userRoom(ctx.actorUserId),
  },
  note: {
    events: { create: "noteCreated", update: "noteUpdated", delete: "noteDeleted" },
    getRoom: (record: any, ctx: EmitContext) =>
      record.projectId ? projectRoom(record.projectId) : userRoom(ctx.actorUserId),
  },
  comment: {
    events: { create: "commentCreated", update: "commentUpdated", delete: "commentDeleted" },
    getRoom: async (record: any, ctx: EmitContext, prisma: any) => {
      // Comment -> Task -> Project
      if (record.task?.projectId) return projectRoom(record.task.projectId);
      const task = await prisma.task.findUnique({ where: { id: record.taskId }, select: { projectId: true } });
      return task ? projectRoom(task.projectId) : null;
    },
  },
  timeEntry: {
    events: { create: "timeEntryCreated", update: "timeEntryUpdated", delete: "timeEntryDeleted" },
    getRoom: (record: any, ctx: EmitContext) => projectRoom(record.projectId || ctx.projectId),
  },
  noteCategory: {
    events: { create: "noteCategoryCreated", update: "noteCategoryUpdated", delete: "noteCategoryDeleted" },
    getRoom: (record: any, ctx: EmitContext) =>
      record.projectId ? projectRoom(record.projectId) : userRoom(ctx.actorUserId),
  },
  notification: {
    events: { create: "notificationNew" },
    getRoom: (record: any, ctx: EmitContext) => userRoom(record.userId),
  },
  project: {
    events: { update: "projectUpdated" },
    getRoom: (record: any, ctx: EmitContext) => tenantRoom(record.tenantId || ctx.tenantId),
  },
} as const;

export function createEmitExtension(context: EmitContext) {
  // Extension implementation
}
```

### Krav

1. **Intercepta rätt operationer**
   - `create`, `update`, `delete` för alla modeller i EMIT_MODELS
   - `createMany`, `updateMany`, `deleteMany` ska INTE emitta (för performance)

2. **Hantera asynkrona room-lookups**
   - Comment behöver slå upp Task för att få projectId
   - Använd `$transaction` om flera lookups behövs

3. **Skapa payload**
   ```typescript
   {
     projectId: string | null,
     [modelId]: string,  // taskId, fileId, etc.
     actorUserId: string,
     // Eventuellt mer data beroende på modell
   }
   ```

4. **Emit via globalThis.ioServer**
   - Om servern inte finns (build-fas, etc.) — logga warning men krascha inte

5. **Respektera skipEmit**
   - Om `context.skipEmit === true` — gör ingenting

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Extension exporteras korrekt
- [ ] Inga cirkulära imports

### Playwright-test

Inget — infrastruktur utan synlig effekt ännu.

---

## Block 2.2: Integrera extension i tenantDb()

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Uppdatera `tenantDb()` för att acceptera och använda EmitContext.

### Fil att ändra

`/workspace/web/src/lib/db.ts`

### Ändringar

1. **Ny signatur för tenantDb:**
   ```typescript
   export function tenantDb(
     tenantId: string,
     emitContext?: EmitContext
   ): TenantScopedClient
   ```

2. **Kedja emit-extension:**
   ```typescript
   export function tenantDb(tenantId: string, emitContext?: EmitContext): TenantScopedClient {
     let client = basePrisma.$extends(createTenantExtension(tenantId));

     if (emitContext && !emitContext.skipEmit) {
       client = client.$extends(createEmitExtension({
         ...emitContext,
         tenantId,
       }));
     }

     return client as unknown as TenantScopedClient;
   }
   ```

3. **Behåll bakåtkompatibilitet:**
   - Om `emitContext` inte skickas — fungera som innan (ingen emit)
   - Gradvis migration möjlig

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Befintlig kod som anropar `tenantDb(tenantId)` fungerar fortfarande
- [ ] Ny kod kan anropa `tenantDb(tenantId, { actorUserId, projectId })`

### Playwright-test

Inget — ingen synlig ändring ännu.

---

## Block 2.3: Integrera extension i userDb()

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Uppdatera `userDb()` för att acceptera och använda EmitContext.

### Fil att ändra

`/workspace/web/src/lib/db.ts`

### Ändringar

1. **Ny signatur för userDb:**
   ```typescript
   export function userDb(
     userId: string,
     emitContext?: Omit<EmitContext, "actorUserId">
   ): UserScopedClient
   ```

2. **Kedja emit-extension:**
   ```typescript
   export function userDb(
     userId: string,
     emitContext?: Omit<EmitContext, "actorUserId">
   ): UserScopedClient {
     let client = basePrisma.$extends(createUserExtension(userId));

     if (emitContext && !emitContext.skipEmit) {
       client = client.$extends(createEmitExtension({
         ...emitContext,
         actorUserId: userId,
       }));
     }

     return client as unknown as UserScopedClient;
   }
   ```

### Verifiering

- [ ] `npm run build` utan fel
- [ ] Befintlig kod fungerar fortfarande
- [ ] Personliga filer/notes emittar till user-rum

### Playwright-test

Inget — ingen synlig ändring ännu.

---

## Checkpoint Fas 2

Efter alla block i Fas 2:

- [ ] Block 2.1: Auto-emit extension implementerad
- [ ] Block 2.2: tenantDb() integrerad
- [ ] Block 2.3: userDb() integrerad
- [ ] Commit: `feat: Add auto-emit Prisma extension for WebSocket events`

---

## Screenshots

Inga screenshots för denna fas (infrastruktur).
