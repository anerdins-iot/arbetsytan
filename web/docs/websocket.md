# WebSocket och Realtidsuppdatering

## Översikt

ArbetsYtan använder Socket.IO för realtidsuppdatering av data. Systemet har en automatisk emit-mekanism via Prisma extensions som gör att CRUD-operationer automatiskt skickar events till relevanta klienter.

## Auto-Emit System

### Hur det fungerar

1. **Prisma Extension**: `createEmitExtension()` i `db-emit-extension.ts` skapar en extension som interceptar alla create/update/delete-operationer
2. **EmitContext**: Kontext som innehåller `actorUserId`, `projectId`, `tenantId`
3. **Automatisk routing**: Events skickas till rätt rum baserat på modelltyp

### Användning

```typescript
// Med auto-emit (rekommenderat)
const db = tenantDb(tenantId, { 
  actorUserId: userId, 
  projectId,
  tenantId 
});
await db.task.create({ data: { ... } });
// Event emittas automatiskt till project:${projectId}

// Utan auto-emit (bakåtkompatibelt)
const db = tenantDb(tenantId);
await db.task.create({ data: { ... } });
// Inget event skickas

// Explicit skippa emit
const db = tenantDb(tenantId, { 
  actorUserId: userId, 
  skipEmit: true 
});
```

## Events

### Task Events
| Event | Rum | Payload |
|-------|-----|---------|
| task:created | project:X | { projectId, taskId, actorUserId } |
| task:updated | project:X | { projectId, taskId, actorUserId } |
| task:deleted | project:X | { projectId, taskId, actorUserId } |

### File Events
| Event | Rum | Payload |
|-------|-----|---------|
| file:created | project:X / user:Y | { projectId, fileId, actorUserId, fileName, ocrText, url } |
| file:updated | project:X / user:Y | { projectId, fileId, actorUserId, fileName, ocrText, url } |
| file:deleted | project:X / user:Y | { projectId, fileId, actorUserId } |

### Note Events
| Event | Rum | Payload |
|-------|-----|---------|
| note:created | project:X / user:Y | { noteId, projectId, title, category, createdById } |
| note:updated | project:X / user:Y | { noteId, projectId, title, category, createdById } |
| note:deleted | project:X / user:Y | { noteId, projectId, title, category, createdById } |

### Comment Events
| Event | Rum | Payload |
|-------|-----|---------|
| comment:created | project:X | { projectId, commentId, taskId, actorUserId } |
| comment:updated | project:X | { projectId, commentId, taskId, actorUserId } |
| comment:deleted | project:X | { projectId, commentId, taskId, actorUserId } |

### Invitation Events
| Event | Rum | Payload |
|-------|-----|---------|
| invitation:created | tenant:X | { tenantId, invitationId, email, role, status, actorUserId } |
| invitation:updated | tenant:X | { tenantId, invitationId, email, role, status, actorUserId } |
| invitation:deleted | tenant:X | { tenantId, invitationId, email, role, status, actorUserId } |

### Membership Events
| Event | Rum | Payload |
|-------|-----|---------|
| membership:created | tenant:X | { tenantId, membershipId, userId, role, actorUserId } |

## Frontend-lyssnare

### useSocket Hook

```typescript
import { useSocket } from "@/hooks/use-socket";

function MyComponent() {
  const handleTaskEvent = useCallback((event) => {
    if (event.projectId === currentProjectId) {
      router.refresh(); // Hämta ny data
    }
  }, [currentProjectId]);

  useSocket({
    enabled: !!session,
    onTaskCreated: handleTaskEvent,
    onTaskUpdated: handleTaskEvent,
    onTaskDeleted: handleTaskEvent,
  });
}
```

## Rum-routing

| Modell | Rum |
|--------|-----|
| Task, Comment, TimeEntry | project:${projectId} |
| File (projekt) | project:${projectId} |
| File (personlig) | user:${userId} |
| Note (projekt) | project:${projectId} |
| Note (personlig) | user:${userId} |
| Notification | user:${userId} |
| NoteCategory | tenant:${tenantId} |
| Project | tenant:${tenantId} |
| Invitation, Membership | tenant:${tenantId} |
