# Fas 2: Migrera alla konsumenter

> **INNAN DU BÖRJAR:** Läs `/workspace/plan/socket-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`
>
> Läs även `/workspace/web/src/contexts/socket-context.tsx` för att förstå det nya API:et.

---

## Migreringsmönster

**Före:**
```typescript
import { useSocket } from "@/hooks/use-socket";

const { joinProjectRoom } = useSocket({
  enabled: true,
  onTaskCreated: handler,
  onTaskUpdated: handler,
});

useEffect(() => { joinProjectRoom(projectId); }, [joinProjectRoom, projectId, status]);
```

**Efter:**
```typescript
import { useSocketEvent, useJoinProjectRoom } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

useSocketEvent(SOCKET_EVENTS.taskCreated, handler);
useSocketEvent(SOCKET_EVENTS.taskUpdated, handler);

const joinProjectRoom = useJoinProjectRoom();
useEffect(() => { joinProjectRoom(projectId); }, [joinProjectRoom, projectId]);
```

---

## Block 2.1: Migrera alla 8 konsumenter + ta bort use-socket.ts

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Migrera ALLA filer nedan i samma omgång. Det är samma mönsterbyte överallt: ersätt `useSocket({...})` med individuella `useSocketEvent()`-anrop.

### Filer att ändra (8 st)

| Fil | Antal events | Noteringar |
|-----|-------------|------------|
| `components/projects/project-view.tsx` | 19 events + joinProjectRoom | Mest komplex. Behåll `useSocketStatus` + `useJoinProjectRoom` |
| `app/[locale]/(dashboard)/_components/topbar.tsx` | 1 event | Enkel |
| `components/dashboard/dashboard-realtime-wrapper.tsx` | 4 events | Enkel |
| `components/personal/personal-view.tsx` | 6 events | Enkel |
| `components/projects/projects-list-wrapper.tsx` | 3 events | Inline-lambdas → stabil callback |
| `components/settings/member-management.tsx` | 1 event | Enkel |
| `components/invitations/invitation-list.tsx` | 3 events | Enkel |
| `components/ai/personal-ai-chat.tsx` | 1 event | `enabled: open` försvinner — OK, se notering nedan |

Alla filer finns under `/workspace/web/src/`.

### Detaljerade ändringar per fil

#### project-view.tsx (19 events + joinProjectRoom)

Ersätt hela `useSocket({...})`-blocket med:

```typescript
import { useSocketEvent, useJoinProjectRoom, useSocketStatus } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

useSocketEvent(SOCKET_EVENTS.taskCreated, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.taskUpdated, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.taskDeleted, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.commentCreated, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.commentUpdated, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.commentDeleted, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.timeEntryCreated, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.timeEntryUpdated, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.timeEntryDeleted, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.fileCreated, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.fileUpdated, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.fileDeleted, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.projectUpdated, handleProjectUpdated);
useSocketEvent(SOCKET_EVENTS.noteCreated, handleNoteEvent);
useSocketEvent(SOCKET_EVENTS.noteUpdated, handleNoteEvent);
useSocketEvent(SOCKET_EVENTS.noteDeleted, handleNoteEvent);
useSocketEvent(SOCKET_EVENTS.noteCategoryCreated, handleNoteCategoryEvent);
useSocketEvent(SOCKET_EVENTS.noteCategoryUpdated, handleNoteCategoryEvent);
useSocketEvent(SOCKET_EVENTS.noteCategoryDeleted, handleNoteCategoryEvent);
useSocketEvent(SOCKET_EVENTS.projectMemberAdded, refreshProjectView);
useSocketEvent(SOCKET_EVENTS.projectMemberRemoved, refreshProjectView);

const joinProjectRoom = useJoinProjectRoom();
const status = useSocketStatus();

useEffect(() => {
  if (status !== "connected") return;
  void joinProjectRoom(project.id);
}, [joinProjectRoom, project.id, status]);
```

Behåll alla befintliga callbacks (`refreshProjectView`, `handleProjectUpdated`, etc.) oförändrade.

#### topbar.tsx (1 event)

```typescript
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

useSocketEvent(SOCKET_EVENTS.notificationNew, handleRealtimeNotification);
```

#### dashboard-realtime-wrapper.tsx (4 events)

```typescript
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

useSocketEvent(SOCKET_EVENTS.taskCreated, refresh);
useSocketEvent(SOCKET_EVENTS.taskUpdated, refresh);
useSocketEvent(SOCKET_EVENTS.taskDeleted, refresh);
useSocketEvent(SOCKET_EVENTS.notificationNew, refresh);
```

#### personal-view.tsx (6 events)

```typescript
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

useSocketEvent(SOCKET_EVENTS.noteCreated, handlePersonalNoteEvent);
useSocketEvent(SOCKET_EVENTS.noteUpdated, handlePersonalNoteEvent);
useSocketEvent(SOCKET_EVENTS.noteDeleted, handlePersonalNoteEvent);
useSocketEvent(SOCKET_EVENTS.fileCreated, handlePersonalFileEvent);
useSocketEvent(SOCKET_EVENTS.fileUpdated, handlePersonalFileEvent);
useSocketEvent(SOCKET_EVENTS.fileDeleted, handlePersonalFileEvent);
```

#### projects-list-wrapper.tsx (3 events)

**OBS:** Inline-lambdas måste ersättas med stabil callback:

```typescript
import { useCallback } from "react";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

const refresh = useCallback(() => router.refresh(), [router]);

useSocketEvent(SOCKET_EVENTS.projectCreated, refresh);
useSocketEvent(SOCKET_EVENTS.projectUpdated, refresh);
useSocketEvent(SOCKET_EVENTS.projectArchived, refresh);
```

#### member-management.tsx (1 event)

```typescript
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

useSocketEvent(SOCKET_EVENTS.membershipCreated, refresh);
```

#### invitation-list.tsx (3 events)

```typescript
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

useSocketEvent(SOCKET_EVENTS.invitationCreated, refresh);
useSocketEvent(SOCKET_EVENTS.invitationUpdated, refresh);
useSocketEvent(SOCKET_EVENTS.invitationDeleted, refresh);
```

#### personal-ai-chat.tsx (1 event)

```typescript
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

useSocketEvent(SOCKET_EVENTS.fileUpdated, handleFileUpdated);
```

**Notering:** Gamla `enabled: open` försvinner. Socketen lever nu i Provider och är alltid aktiv. Handleren körs alltid, men det är OK — `handleFileUpdated` uppdaterar bara lokal state för uppladdade filer, och om panelen är stängd finns inga filer att matcha.

### Fil att ta bort

Ta bort `/workspace/web/src/hooks/use-socket.ts` helt.

### Krav

- Ingen fil importerar `useSocket` från `@/hooks/use-socket` efter migreringen
- Alla events registreras via `useSocketEvent` med event-namn från `SOCKET_EVENTS`
- Inga inline-lambdas som argument till `useSocketEvent`
- `project-view.tsx` behåller `joinProjectRoom` + `useSocketStatus`

---

## Block 2.2: Verifiering

**Agenttyp:** Verifiering (Gemini 3 Flash)

> Du är en GRANSKARE. Du får INTE ändra några filer. Läs, analysera och rapportera.

### Kontrollpunkter

- [ ] `hooks/use-socket.ts` borttagen
- [ ] `grep -r "from.*use-socket" src/` → inga träffar
- [ ] `grep -r "useSocket" src/` → inga träffar
- [ ] Alla 8 konsumenter använder `useSocketEvent` från `@/contexts/socket-context`
- [ ] `project-view.tsx` har `useJoinProjectRoom` + `useSocketStatus`
- [ ] Inga inline-lambdas som argument till `useSocketEvent`
- [ ] `npm run build` utan fel
- [ ] `npx tsc --noEmit` utan fel

### Rapportera

GODKÄNT eller UNDERKÄNT med lista över avvikelser.

---

## Checkpoint Fas 2

- [x] Block 2.1: Alla 8 konsumenter migrerade + use-socket.ts borttagen
- [x] Block 2.2: Verifiering godkänd (Gemini)
- [ ] Commit
