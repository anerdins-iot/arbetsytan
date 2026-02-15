# Fas 8: Lagg till saknade AI-verktyg (CRUD-gap)

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Bakgrund

12 operationer finns i Actions men saknar AI-verktyg. Dessa ska laggas till for att AI-agenten ska ha fullstandig CRUD-paritet.

| # | Operation | Action-fil | Rad |
|---|-----------|-----------|-----|
| 1 | unassignTask | tasks.ts | ~456 |
| 2 | toggleNotePin | notes.ts | 259 |
| 3 | togglePersonalNotePin | personal.ts | 233 |
| 4 | updateAutomation | automations.ts | 280 |
| 5 | pauseAutomation | automations.ts | 366 |
| 6 | resumeAutomation | automations.ts | 400 |
| 7 | getAutomation (detalj) | automations.ts | 254 |
| 8 | getNotifications | notifications.ts | 80 |
| 9 | markNotificationRead | notifications.ts | 159 |
| 10 | markAllNotificationsRead | notifications.ts | 179 |
| 11 | getMyTimeEntries | time-entries.ts | 203 |
| 12 | getProject (detalj) | projects.ts | 206 |

---

## Block 8.1: Task och Note AI-verktyg

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Lagg till 3 nya AI-verktyg i `personal-tools.ts`:
1. `unassignTask`
2. `toggleNotePin`
3. `togglePersonalNotePin`

### Las forst

- `src/actions/tasks.ts` — `unassignTask()` (hitta i filen, runt rad 456)
- `src/actions/notes.ts` rad 259-290 — `toggleNotePin()`
- `src/actions/personal.ts` rad 233-254 — `togglePersonalNotePin()`

### Nya verktyg att lagga till

#### `unassignTask`

```typescript
import { unassignTask as unassignTaskAction } from "@/actions/tasks";

const unassignTask = tool({
  description: "Ta bort en tilldelning fran en uppgift. Kraver projectId, taskId och membershipId.",
  inputSchema: toolInputSchema(z.object({
    projectId: z.string().describe("Projektets ID"),
    taskId: z.string().describe("Uppgiftens ID"),
    membershipId: z.string().describe("MembershipId for den som ska tas bort (fran listMembers)"),
  })),
  execute: async ({ projectId: pid, taskId, membershipId }) => {
    const result = await unassignTaskAction(pid, taskId, membershipId);
    if (!result.success) return { error: result.error || "Kunde inte ta bort tilldelningen." };
    return { message: "Tilldelningen har tagits bort." };
  },
});
```

#### `toggleNotePin`

```typescript
import { toggleNotePin as toggleNotePinAction } from "@/actions/notes";

const toggleNotePin = tool({
  description: "Fasta/lossa en projektanteckning. Fastade anteckningar visas overst.",
  inputSchema: toolInputSchema(z.object({
    projectId: z.string().describe("Projektets ID"),
    noteId: z.string().describe("Anteckningens ID"),
  })),
  execute: async ({ projectId: pid, noteId }) => {
    const result = await toggleNotePinAction(pid, noteId);
    if (!result.success) return { error: result.error || "Kunde inte andra fastnalsstatus." };
    return {
      isPinned: result.isPinned,
      message: result.isPinned ? "Anteckningen ar nu fastad." : "Anteckningen ar inte langre fastad.",
    };
  },
});
```

#### `togglePersonalNotePin`

```typescript
import { togglePersonalNotePin as togglePersonalNotePinAction } from "@/actions/personal";

const togglePersonalNotePin = tool({
  description: "Fasta/lossa en personlig anteckning. Fastade anteckningar visas overst.",
  inputSchema: toolInputSchema(z.object({
    noteId: z.string().describe("Anteckningens ID"),
  })),
  execute: async ({ noteId }) => {
    const result = await togglePersonalNotePinAction(noteId);
    if (!result.success) return { error: result.error || "Kunde inte andra fastnalsstatus." };
    return {
      isPinned: result.isPinned,
      message: result.isPinned ? "Anteckningen ar nu fastad." : "Anteckningen ar inte langre fastad.",
    };
  },
});
```

### Lagg till i tool-objektet

Lagg till `unassignTask`, `toggleNotePin`, `togglePersonalNotePin` i `return`-objektet langst ner i `createPersonalTools` (runt rad 2613).

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 8.2: Automation och Notification AI-verktyg

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Lagg till 7 nya AI-verktyg:
1. `getAutomation` (detalj)
2. `updateAutomation`
3. `pauseAutomation`
4. `resumeAutomation`
5. `getNotifications`
6. `markNotificationRead`
7. `markAllNotificationsRead`

### Las forst

- `src/actions/automations.ts` — `getAutomation()`, `updateAutomation()`, `pauseAutomation()`, `resumeAutomation()`
- `src/actions/notifications.ts` — `getNotifications()`, `markNotificationRead()`, `markAllNotificationsRead()`

### Nya verktyg

#### Automationer

```typescript
import {
  getAutomation as getAutomationAction,
  updateAutomation as updateAutomationAction,
  pauseAutomation as pauseAutomationAction,
  resumeAutomation as resumeAutomationAction,
} from "@/actions/automations";

const getAutomation = tool({
  description: "Hamta detaljer for en specifik automation.",
  inputSchema: toolInputSchema(z.object({
    automationId: z.string().describe("Automationens ID"),
  })),
  execute: async ({ automationId }) => {
    const result = await getAutomationAction(automationId);
    if (!result.success) return { error: result.error || "Kunde inte hamta automation." };
    return result.automation;
  },
});

const updateAutomation = tool({
  description: "Uppdatera en automation. Ange de falt som ska andras.",
  inputSchema: toolInputSchema(z.object({
    automationId: z.string().describe("Automationens ID"),
    name: z.string().optional().describe("Nytt namn"),
    description: z.string().optional().describe("Ny beskrivning"),
    trigger: z.string().optional().describe("Ny trigger (JSON)"),
    actions: z.string().optional().describe("Nya actions (JSON)"),
  })),
  execute: async ({ automationId, ...data }) => {
    const result = await updateAutomationAction(automationId, data);
    if (!result.success) return { error: result.error || "Kunde inte uppdatera automation." };
    return { message: "Automation uppdaterad." };
  },
});

const pauseAutomation = tool({
  description: "Pausa en aktiv automation.",
  inputSchema: toolInputSchema(z.object({
    automationId: z.string().describe("Automationens ID"),
  })),
  execute: async ({ automationId }) => {
    const result = await pauseAutomationAction(automationId);
    if (!result.success) return { error: result.error || "Kunde inte pausa automation." };
    return { message: "Automation pausad." };
  },
});

const resumeAutomation = tool({
  description: "Ateruppta en pausad automation.",
  inputSchema: toolInputSchema(z.object({
    automationId: z.string().describe("Automationens ID"),
  })),
  execute: async ({ automationId }) => {
    const result = await resumeAutomationAction(automationId);
    if (!result.success) return { error: result.error || "Kunde inte ateruppta automation." };
    return { message: "Automation ateruppttagen." };
  },
});
```

#### Notifieringar

```typescript
import {
  getNotifications as getNotificationsAction,
  markNotificationRead as markNotificationReadAction,
  markAllNotificationsRead as markAllNotificationsReadAction,
} from "@/actions/notifications";

const getNotifications = tool({
  description: "Hamta anvandares notifieringar. Visar olasta och lasta notifieringar.",
  inputSchema: toolInputSchema(z.object({
    unreadOnly: z.boolean().optional().default(false).describe("Visa bara olasta"),
    limit: z.number().min(1).max(50).optional().default(20).describe("Max antal"),
  })),
  execute: async ({ unreadOnly, limit }) => {
    const result = await getNotificationsAction({ unreadOnly, limit });
    if (!result.success) return { error: result.error || "Kunde inte hamta notifieringar." };
    return {
      notifications: result.notifications,
      unreadCount: result.unreadCount,
    };
  },
});

const markNotificationRead = tool({
  description: "Markera en notifiering som last.",
  inputSchema: toolInputSchema(z.object({
    notificationId: z.string().describe("Notifieringens ID"),
  })),
  execute: async ({ notificationId }) => {
    const result = await markNotificationReadAction(notificationId);
    if (!result.success) return { error: result.error || "Kunde inte markera notifiering." };
    return { message: "Notifiering markerad som last." };
  },
});

const markAllNotificationsRead = tool({
  description: "Markera alla notifieringar som lasta.",
  inputSchema: toolInputSchema(z.object({
    _: z.string().optional().describe("Ignored"),
  })),
  execute: async () => {
    const result = await markAllNotificationsReadAction();
    if (!result.success) return { error: result.error || "Kunde inte markera notifieringar." };
    return { message: "Alla notifieringar markerade som lasta." };
  },
});
```

**VIKTIGT:** Kontrollera Action-signaturerna exakt for `getNotifications`, `markNotificationRead` och `markAllNotificationsRead`. De kan ta andra parametrar an vad som visas har.

### Lagg till i tool-objektet

Lagg till alla 7 verktyg i `return`-objektet.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 8.3: Resterande AI-verktyg + verifiera och committa

- [ ] Klart

**Agenttyp:** Implementation + Verifiering (Gemini 3 Flash)

### Implementation

#### `getMyTimeEntries` (nytt AI-verktyg)

```typescript
import { getMyTimeEntriesCore } from "@/services/time-entry-service";

const getMyTimeEntries = tool({
  description: "Hamta anvandares egna tidsrapporter fran alla projekt.",
  inputSchema: toolInputSchema(z.object({
    limit: z.number().min(1).max(200).optional().default(50).describe("Max antal tidsposter"),
  })),
  execute: async ({ limit }) => {
    const entries = await getMyTimeEntriesCore(
      { tenantId, userId },
      { limit }
    );

    return entries.map((entry) => ({
      id: entry.id,
      taskId: entry.taskId,
      taskTitle: entry.taskTitle,
      projectId: entry.projectId,
      projectName: entry.projectName,
      minutes: entry.minutes,
      hours: Math.floor(entry.minutes / 60),
      remainingMinutes: entry.minutes % 60,
      date: entry.date.toISOString().split("T")[0],
      description: entry.description,
    }));
  },
});
```

#### `getProjectDetail` (nytt AI-verktyg)

```typescript
import { getProjectDetailCore } from "@/services/project-service";

const getProjectDetail = tool({
  description: "Hamta detaljerad information om ett projekt inklusive task-status, medlemmar och tillgangliga medlemmar.",
  inputSchema: toolInputSchema(z.object({
    projectId: z.string().describe("Projektets ID"),
  })),
  execute: async ({ projectId: pid }) => {
    await requireProject(tenantId, pid, userId);

    const detail = await getProjectDetailCore({ tenantId, userId }, pid);
    if (!detail) return { error: "Projektet hittades inte." };

    return {
      id: detail.id,
      name: detail.name,
      description: detail.description,
      status: detail.status,
      address: detail.address,
      createdAt: detail.createdAt.toISOString(),
      taskStatusCounts: detail.taskStatusCounts,
      memberCount: detail.members.length,
      members: detail.members.map((m) => ({
        membershipId: m.membershipId,
        name: m.user.name ?? m.user.email,
        email: m.user.email,
        role: m.role,
      })),
    };
  },
});
```

### Lagg till i tool-objektet

Lagg till `getMyTimeEntries` och `getProjectDetail` i `return`-objektet.

### Verifiering — checklista for hela fas 8

1. [ ] `unassignTask` finns och anropar Action
2. [ ] `toggleNotePin` finns och anropar Action
3. [ ] `togglePersonalNotePin` finns och anropar Action
4. [ ] `getAutomation` finns och anropar Action
5. [ ] `updateAutomation` finns och anropar Action
6. [ ] `pauseAutomation` finns och anropar Action
7. [ ] `resumeAutomation` finns och anropar Action
8. [ ] `getNotifications` finns och anropar Action
9. [ ] `markNotificationRead` finns och anropar Action
10. [ ] `markAllNotificationsRead` finns och anropar Action
11. [ ] `getMyTimeEntries` finns och anvander service-lagret
12. [ ] `getProjectDetail` finns och anvander service-lagret
13. [ ] Alla 12 nya verktyg ar tillagda i `return`-objektet
14. [ ] `npx tsc --noEmit` passerar
15. [ ] `npm run build` passerar

### Efter godkannande

```bash
git add src/lib/ai/tools/personal-tools.ts
git commit -m "feat: add 12 missing AI tools for full CRUD parity"
```
