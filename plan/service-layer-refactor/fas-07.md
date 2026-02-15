# Fas 7: Fixa skrivavvikelser (AI -> Actions)

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Bakgrund

15 skrivoperationer i AI-verktygen gor egen DB-logik istallet for att anropa befintliga Actions. Dessa ska refaktoreras sa att AI-verktygen delegerar till Actions for att sakerstalla:
- Konsekvent validering
- Korrekt WebSocket-event-emitting (via Prisma auto-emit extension)
- Korrekt revalidatePath for UI-uppdatering
- Notifieringslogik (t.ex. kommentarer notifierar tilldelade)

**OBS om `tenantDb` med event-context:** Manga AI-verktyg skapar `tenantDb(tenantId, { actorUserId: userId, projectId: pid })` for att trigga WebSocket-events via Prisma auto-emit extension. Nar vi migrerar till Actions MASTE vi sakerstalla att Actions ocksaa skickar events. De flesta Actions anvander redan `tenantDb(tenantId, { actorUserId: userId, projectId })` — kontrollera detta for varje migrering.

---

## Block 7.1: Fixa comment-skrivningar (3 verktyg)

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Migrera `createComment`, `updateComment` och `deleteComment` AI-verktyg att anropa Actions.

### Las forst

- `src/lib/ai/tools/personal-tools.ts` rad 495-576 — Nuvarande AI-implementationer
- `src/actions/comments.ts` — `createComment`, `updateComment`, `deleteComment` Actions

### Andringar

#### `createComment` (personal-tools.ts:495-524)

**Fore (egen DB-logik):**
```typescript
execute: async ({ projectId: pid, taskId, content }) => {
  await requireProject(tenantId, pid, userId);
  const task = await db.task.findFirst({ where: { id: taskId, projectId: pid } });
  if (!task) return { error: "..." };
  const comment = await db.comment.create({
    data: { content, authorId: userId, task: { connect: { id: taskId } } },
  });
  return { id: comment.id, message: "..." };
},
```

**Efter (anropa Action):**
```typescript
import { createComment as createCommentAction } from "@/actions/comments";

execute: async ({ projectId: pid, taskId, content }) => {
  const result = await createCommentAction(pid, { taskId, content });
  if (!result.success) return { error: result.error || "Kunde inte skapa kommentar." };
  return { message: `Kommentar skapad pa uppgiften.` };
},
```

**OBS:** Action-versionen av `createComment` skickar notifieringar till tilldelade anvandare — nagot som AI-versionen INTE gjorde. Detta ar en forbattring.

#### `updateComment` (personal-tools.ts:527-553)

**Efter:**
```typescript
import { updateComment as updateCommentAction } from "@/actions/comments";

execute: async ({ projectId: pid, commentId, content }) => {
  const result = await updateCommentAction(pid, { commentId, content });
  if (!result.success) {
    if (result.error === "FORBIDDEN") return { error: "Endast forfattaren kan uppdatera sin egen kommentar." };
    return { error: result.error || "Kunde inte uppdatera kommentar." };
  }
  return { id: commentId, message: "Kommentar uppdaterad." };
},
```

#### `deleteComment` (personal-tools.ts:555-576)

**Efter:**
```typescript
import { deleteComment as deleteCommentAction } from "@/actions/comments";

execute: async ({ projectId: pid, commentId }) => {
  const result = await deleteCommentAction(pid, { commentId });
  if (!result.success) {
    if (result.error === "FORBIDDEN") return { error: "Endast forfattaren kan ta bort sin egen kommentar." };
    return { error: result.error || "Kunde inte ta bort kommentar." };
  }
  return { message: "Kommentar borttagen." };
},
```

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 7.2: Fixa time-entry-skrivningar (3 verktyg)

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Migrera `createTimeEntry`, `updateTimeEntry` och `deleteTimeEntry` AI-verktyg att anropa Actions.

### Las forst

- `src/lib/ai/tools/personal-tools.ts` rad 627-777 — Nuvarande AI-implementationer
- `src/actions/time-entries.ts` — `createTimeEntry`, `updateTimeEntry`, `deleteTimeEntry` Actions

### Andringar

#### `createTimeEntry` (personal-tools.ts:627-688)

**Fore (egen DB-logik):**
```typescript
execute: async ({ projectId: pid, taskId, minutes, hours, date, description }) => {
  // ... validateDatabaseId, requireProject, task lookup ...
  const projectDb = tenantDb(tenantId, { actorUserId: userId, projectId: pid });
  const created = await projectDb.timeEntry.create({ ... });
  return { id: created.id, ... };
},
```

**Efter (anropa Action):**
```typescript
import { createTimeEntry as createTimeEntryAction } from "@/actions/time-entries";

execute: async ({ projectId: pid, taskId, minutes, hours, date, description }) => {
  const idCheck = validateDatabaseId(pid, "projectId");
  if (!idCheck.valid) return { error: idCheck.error };
  if (taskId) {
    const taskIdCheck = validateDatabaseId(taskId, "taskId");
    if (!taskIdCheck.valid) return { error: taskIdCheck.error };
  }

  // Konvertera hours till minutes (Action forvantar minutes)
  const totalMinutes = minutes ?? Math.round((hours ?? 0) * 60);
  if (totalMinutes <= 0) return { error: "Tid maste vara storre an 0." };

  const result = await createTimeEntryAction(pid, {
    taskId,
    minutes: totalMinutes,
    date,
    description: description?.trim() || undefined,
  });

  if (!result.success) return { error: result.error || "Kunde inte skapa tidsrapport." };

  return {
    ...result.data,
    message: `Tidsrapport pa ${totalMinutes} min loggad.`,
  };
},
```

**OBS:** `createTimeEntry` Action returnerar `{ success: true, data: TimeEntryItem }` — kontrollera exakt returtyp.

#### `updateTimeEntry` (personal-tools.ts:690-751)

Liknande monster — anropa `updateTimeEntry` Action med konverterade varden.

#### `deleteTimeEntry` (personal-tools.ts:754-777)

Anropa `deleteTimeEntry` Action.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 7.3: Fixa note-skrivningar (6 verktyg) och member-skrivningar (2 verktyg)

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Migrera 8 AI-verktyg att anropa Actions.

### Las forst

- `src/lib/ai/tools/personal-tools.ts` rad 1663-1918 — Note-verktyg
- `src/lib/ai/tools/personal-tools.ts` rad 1489-1550 — Member-verktyg
- `src/actions/notes.ts` — `createNote`, `updateNote`, `deleteNote`
- `src/actions/personal.ts` — `createPersonalNote`, `updatePersonalNote`, `deletePersonalNote`
- `src/actions/projects.ts` — `addProjectMember`, `removeProjectMember`

### Andringar

#### Projektanteckningar (3 verktyg)

**`createProjectNote` (personal-tools.ts:1663-1698) -> anropa `createNote` Action:**
```typescript
import { createNote as createNoteAction } from "@/actions/notes";

execute: async ({ projectId: pid, content, title, category }) => {
  const result = await createNoteAction(pid, { title, content, category });
  if (!result.success) return { error: result.error || "Kunde inte skapa anteckning." };
  return {
    id: result.note.id,
    title: result.note.title,
    content: result.note.content,
    category: result.note.category,
    createdAt: result.note.createdAt,
    message: "Anteckning skapad.",
  };
},
```

**`updateProjectNote` (personal-tools.ts:1701-1742) -> anropa `updateNote` Action**

**`deleteProjectNote` (personal-tools.ts:1745-1763) -> anropa `deleteNote` Action**

#### Personliga anteckningar (3 verktyg)

**`createPersonalNote` (personal-tools.ts:1836-1865) -> anropa `createPersonalNote` Action:**
```typescript
import { createPersonalNote as createPersonalNoteAction } from "@/actions/personal";

execute: async ({ content, title, category }) => {
  const result = await createPersonalNoteAction({ title, content, category });
  if (!result.success) return { error: result.error || "Kunde inte skapa anteckning." };
  return {
    id: result.note.id,
    title: result.note.title,
    content: result.note.content,
    category: result.note.category,
    createdAt: result.note.createdAt,
    message: "Personlig anteckning skapad.",
  };
},
```

**`updatePersonalNote` (personal-tools.ts:1868-1901) -> anropa `updatePersonalNote` Action**

**`deletePersonalNote` (personal-tools.ts:1904-1918) -> anropa `deletePersonalNote` Action**

#### Medlemshantering (2 verktyg)

**`addMember` (personal-tools.ts:1489-1521) -> anropa `addProjectMember` Action:**
```typescript
import { addProjectMember as addProjectMemberAction } from "@/actions/projects";

execute: async ({ projectId: pid, membershipId }) => {
  const result = await addProjectMemberAction(pid, membershipId);
  if (!result.success) return { error: result.error || "Kunde inte lagga till medlem." };
  return { success: true, message: "Medlemmen har lagts till i projektet." };
},
```

**OBS:** AI-verktyget gor idag egen `logActivity` — kontrollera att Action-versionen ocksaa loggar aktivitet. Om inte, behover Action utoekas (eller logga aktivitet i AI-verktyget efter Action-anropet).

**`removeMember` (personal-tools.ts:1524-1550) -> anropa `removeProjectMember` Action**

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 7.4: Fixa assignTask + verifiera och committa fas 7

- [ ] Klart

**Agenttyp:** Implementation + Verifiering (Gemini 3 Flash)

### Implementation: assignTask

#### `assignTask` (personal-tools.ts:381-413)

**Fore (egen DB-logik):**
```typescript
execute: async ({ projectId: pid, taskId, membershipId }) => {
  await requireProject(tenantId, pid, userId);
  const task = await db.task.findFirst({ ... });
  const membership = await db.membership.findFirst({ ... });
  const existing = await db.taskAssignment.findFirst({ ... });
  if (existing) return { error: "..." };
  const projectDb = tenantDb(tenantId, { actorUserId: userId, projectId: pid });
  await projectDb.taskAssignment.create({ data: { taskId, membershipId } });
  // Dummy-uppdatering for realtid
  await projectDb.task.update({ where: { id: taskId }, data: { updatedAt: new Date() } });
  return { id: task.id, message: "..." };
},
```

**Efter (anropa Action):**
```typescript
import { assignTask as assignTaskAction } from "@/actions/tasks";

execute: async ({ projectId: pid, taskId, membershipId }) => {
  const result = await assignTaskAction(pid, taskId, membershipId);
  if (!result.success) return { error: result.error || "Kunde inte tilldela uppgiften." };
  return { message: "Uppgiften har tilldelats." };
},
```

**OBS:** Kontrollera att `assignTask` Action har ratt signatur. Den tar (projectId, taskId, membershipId) — verifiera i `src/actions/tasks.ts`.

### Verifiering — checklista for hela fas 7

1. [ ] `createComment` anropar `createComment` Action
2. [ ] `updateComment` anropar `updateComment` Action
3. [ ] `deleteComment` anropar `deleteComment` Action
4. [ ] `createTimeEntry` anropar `createTimeEntry` Action (med hours->minutes konvertering)
5. [ ] `updateTimeEntry` anropar `updateTimeEntry` Action
6. [ ] `deleteTimeEntry` anropar `deleteTimeEntry` Action
7. [ ] `createProjectNote` anropar `createNote` Action
8. [ ] `updateProjectNote` anropar `updateNote` Action
9. [ ] `deleteProjectNote` anropar `deleteNote` Action
10. [ ] `createPersonalNote` anropar `createPersonalNote` Action
11. [ ] `updatePersonalNote` anropar `updatePersonalNote` Action
12. [ ] `deletePersonalNote` anropar `deletePersonalNote` Action
13. [ ] `addMember` anropar `addProjectMember` Action
14. [ ] `removeMember` anropar `removeProjectMember` Action
15. [ ] `assignTask` anropar `assignTask` Action
16. [ ] Ingen direkt `db.xxx.create/update/delete` i nagon av dessa verktyg
17. [ ] `npx tsc --noEmit` passerar
18. [ ] `npm run build` passerar

### Efter godkannande

```bash
git add src/lib/ai/tools/personal-tools.ts
git commit -m "refactor: migrate AI write operations to use Actions instead of direct DB"
```
