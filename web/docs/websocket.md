# WebSocket — Realtidsuppdateringar

## Varför?

Utan WebSocket måste användaren ladda om sidan för att se ändringar som andra gjort. Med realtidsuppdateringar syns nya uppgifter, filer, kommentarer etc. direkt — utan sidladdning.

Systemet bygger på **Socket.IO** och har två sidor:

1. **Backend (emit)** — Skickar events automatiskt när data ändras i databasen
2. **Frontend (lyssna)** — Tar emot events och uppdaterar vyn

---

## Backend: Automatisk emit

### Hur det fungerar

En Prisma extension (`db-emit-extension.ts`) interceptar alla `create`, `update`, `delete` och `upsert`-operationer. Efter att databasoperationen lyckats skickas automatiskt ett Socket.IO-event till rätt "rum".

Det enda utvecklaren behöver göra är att skicka med en `EmitContext` när databasanslutningen skapas:

```typescript
// Auto-emit aktivt — events skickas automatiskt
const db = tenantDb(tenantId, { actorUserId: userId, projectId });
await db.task.create({ data: { title: "Ny uppgift", projectId } });
// → Socket.IO event "task:created" skickas till room "project:<projectId>"

// Utan context — inga events (bakåtkompatibelt)
const db = tenantDb(tenantId);
await db.task.create({ data: { title: "Ny uppgift", projectId } });
// → Inget event skickas

// Explicit avstängt — för batch/migrering/seed
const db = tenantDb(tenantId, { actorUserId: userId, skipEmit: true });
```

### EmitContext

| Fält | Krävs | Beskrivning |
|------|-------|-------------|
| `actorUserId` | Ja | Vem som utför operationen |
| `projectId` | Nej | Projektscope — behövs för task, comment, timeEntry |
| `tenantId` | Nej | Fylls i automatiskt av `tenantDb()` |
| `skipEmit` | Nej | `true` för att stänga av emit helt |

### Rum-routing

Events skickas till olika "rum" beroende på modelltyp. Klienter som gått med i ett rum tar emot alla events för det rummet.

| Modell | Rum | Logik |
|--------|-----|-------|
| Task, Comment, TimeEntry | `project:<id>` | Alltid projektscope |
| File, Note | `project:<id>` eller `user:<id>` | Beroende på om de tillhör ett projekt eller är personliga |
| Notification | `user:<id>` | Alltid till mottagaren |
| NoteCategory, Project | `tenant:<id>` | Organisation-scope |
| Invitation, Membership | `tenant:<id>` | Organisation-scope |

### Event-format

Events följer mönstret `modell:operation`, t.ex. `task:created`, `file:updated`, `note:deleted`.

Alla events definieras i `socket-events.ts` via `SOCKET_EVENTS`-objektet. Lägg till nya events där.

---

## Frontend: Ta emot events

### useSocket-hooken

`useSocket` (`hooks/use-socket.ts`) hanterar Socket.IO-anslutningen och exponerar callbacks per event-typ:

```typescript
import { useSocket } from "@/hooks/use-socket";

function KanbanBoard({ projectId }: { projectId: string }) {
  const handleTaskChange = useCallback(() => {
    router.refresh(); // Hämtar ny data från servern
  }, []);

  const { joinProjectRoom } = useSocket({
    enabled: !!session,
    onTaskCreated: handleTaskChange,
    onTaskUpdated: handleTaskChange,
    onTaskDeleted: handleTaskChange,
  });

  // VIKTIGT: Gå med i projektets rum för att ta emot events
  useEffect(() => {
    if (projectId) {
      joinProjectRoom(projectId);
    }
  }, [projectId, joinProjectRoom]);
}
```

### Viktigt att veta

1. **`joinProjectRoom(projectId)`** — Klienten måste explicit gå med i ett projekts rum för att ta emot projekt-events. Utan detta kommer inga events fram. User- och tenant-rum joinas automatiskt vid anslutning.

2. **Wrappa callbacks i `useCallback`** — Alla callbacks som skickas till `useSocket` bör vara stabila referens (via `useCallback`). Annars kommer Socket.IO-anslutningen att kopplas ned och upp vid varje re-render.

3. **`router.refresh()`** — Det vanligaste mönstret. Istället för att uppdatera lokal state med event-datan, triggar vi en server-side refresh som hämtar korrekt data via Server Components.

---

## Lägga till en ny modell

Om en ny Prisma-modell behöver realtidsuppdateringar:

1. **`socket-events.ts`** — Lägg till event-namn och TypeScript-typ
2. **`db-emit-extension.ts`** — Lägg till modellen i `EMIT_MODELS` och en `case` i `getEventInfo()` som bestämmer rum och payload
3. **`use-socket.ts`** — Lägg till callback i `UseSocketOptions` och registrera lyssnaren med `connection.on()`
4. **Komponenten** — Använd `useSocket` med den nya callbacken

---

## Felsökning

- **Events skickas inte** — Kontrollera att `EmitContext` skickas med till `tenantDb()`. Utan context → ingen emit.
- **Frontend tar inte emot** — Kontrollera att `joinProjectRoom()` anropas. Kontrollera att `enabled` är `true`.
- **Anslutningen fladdrar** — Callbacks till `useSocket` saknar troligen `useCallback`.
- **Emit under build** — `getIO()` returnerar `null` vid build-time, så emit skipas automatiskt. Inga specialfall behövs.
