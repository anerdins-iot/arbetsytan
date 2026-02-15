# Fas 6: Migrera AI-verktyg lasningar till Services

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 6.1: Migrera AI-verktyg for projekt, tasks och filer

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Migrera AI-verktygens lasoperationer for projekt, tasks och filer att anvanda service-lagret istallet for egen DB-logik.

### Las forst

- `src/lib/ai/tools/personal-tools.ts` — Hela filen
- `src/services/project-service.ts` — `getProjectsCore`
- `src/services/task-service.ts` — `getProjectTasksCore`, `getUserTasksCore`
- `src/services/file-service.ts` — `getProjectFilesCore`, `getPersonalFilesCore`

### Andringar i `src/lib/ai/tools/personal-tools.ts`

#### `getProjectList` (rad 101-116)

**Fore:**
```typescript
execute: async () => {
  const projects = await db.project.findMany({
    where: { projectMembers: { some: { membership: { userId } } } },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
  return projects.map((p) => ({ id: p.id, name: p.name, status: p.status }));
},
```

**Efter:**
```typescript
import { getProjectsCore } from "@/services/project-service";

execute: async () => {
  const projects = await getProjectsCore(
    { tenantId, userId },
    { includeTaskCount: false }
  );
  return projects.map((p) => ({ id: p.id, name: p.name, status: p.status }));
},
```

#### `getUserTasks` (rad 237-277)

**Fore:**
```typescript
execute: async ({ limit }) => {
  const projectIds = (await db.projectMember.findMany({ ... })).map(...);
  const tasks = await db.task.findMany({ where: { projectId: { in: projectIds } }, ... });
  return tasks.map(/* ... */);
},
```

**Efter:**
```typescript
import { getUserTasksCore } from "@/services/task-service";

execute: async ({ limit }) => {
  const tasks = await getUserTasksCore({ tenantId, userId }, { limit });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline?.toISOString() ?? null,
    projectName: t.projectName,
    projectId: t.projectId,
    assignees: t.assignments.map((a) => a.user.name ?? a.user.email),
  }));
},
```

#### `getProjectTasks` (rad 279-370)

**Efter:**
```typescript
import { getProjectTasksCore } from "@/services/task-service";

execute: async ({ projectId: pid, limit = 50 }) => {
  await requireProject(tenantId, pid, userId);
  const tasks = await getProjectTasksCore(
    { tenantId, userId },
    pid,
    { includeProject: true, limit }
  );
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline?.toISOString() ?? null,
    projectName: t.projectName,
    assignees: t.assignments.map((a) => ({
      membershipId: a.membershipId,
      name: a.user.name ?? a.user.email,
      email: a.user.email,
    })),
  }));
},
```

#### `listFiles` (rad 1049-1095)

**Efter:**
```typescript
import { getProjectFilesCore } from "@/services/file-service";
import { validateDatabaseId } from "@/services/types";

execute: async ({ projectId: pid, limit = 50 }) => {
  const idCheck = validateDatabaseId(pid, "projectId");
  if (!idCheck.valid) return { error: idCheck.error };
  await requireProject(tenantId, pid, userId);

  const files = await getProjectFilesCore(
    { tenantId, userId },
    pid,
    { includeAnalyses: true, analysesLimit: 5, limit }
  );

  return files.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    size: f.size,
    createdAt: f.createdAt.toISOString(),
    label: f.label,
    userDescription: f.userDescription,
    ocrPreview: f.ocrText ? f.ocrText.slice(0, 300) + (f.ocrText.length > 300 ? "..." : "") : null,
    analyses: f.analyses.map((a) => ({
      prompt: a.prompt,
      content: a.content,
      createdAt: a.createdAt.toISOString(),
    })),
  }));
},
```

#### `getPersonalFiles` (rad 1119-1163)

**Efter:**
```typescript
import { getPersonalFilesCore } from "@/services/file-service";

execute: async ({ limit = 50 }) => {
  const files = await getPersonalFilesCore(
    { tenantId, userId },
    { includeAnalyses: true, analysesLimit: 5, limit }
  );

  return files.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    size: f.size,
    createdAt: f.createdAt.toISOString(),
    label: f.label,
    userDescription: f.userDescription,
    hasOcrText: !!f.ocrText,
    ocrPreview: f.ocrText ? f.ocrText.slice(0, 300) + (f.ocrText.length > 300 ? "..." : "") : null,
    analyses: f.analyses.map((a) => ({
      prompt: a.prompt,
      content: a.content,
      createdAt: a.createdAt.toISOString(),
    })),
  }));
},
```

### KRITISKT: Behall AI-specifik formatering

AI-verktygens returvarden ar anpassade for AI-kontext:
- `toISOString()` for datum (AI forstar ISO-datum battre)
- `ocrPreview` (forsta 300 tecken, inte hela texten)
- `assignees` som strangar (namn/email), inte objekt
- Dessa transformationer STANNAR i AI-verktygen

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 6.2: Migrera AI-verktyg for notes, comments, time entries och members

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Migrera resterande AI-verktygens lasoperationer.

### Andringar i `src/lib/ai/tools/personal-tools.ts`

#### `getTaskComments` (rad 450-493)

**Efter:**
```typescript
import { getCommentsCore } from "@/services/comment-service";

execute: async ({ projectId: pid, taskId }) => {
  await requireProject(tenantId, pid, userId);

  const result = await getCommentsCore({ tenantId, userId }, pid, taskId);
  if ("error" in result) return { error: "Uppgiften hittades inte i detta projekt." };

  return result.comments.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    author: c.author.name
      ? { name: c.author.name, email: c.author.email }
      : { name: "Okand anvandare", email: "unknown" },
  }));
},
```

#### `getProjectTimeEntries` (rad 580-625)

**Efter:**
```typescript
import { getTimeEntriesCore } from "@/services/time-entry-service";

execute: async ({ projectId: pid, limit = 100 }) => {
  await requireProject(tenantId, pid, userId);

  const entries = await getTimeEntriesCore(
    { tenantId, userId },
    pid,
    { limit }
  );

  return entries.map((entry) => ({
    id: entry.id,
    taskId: entry.taskId,
    taskTitle: entry.taskTitle,
    minutes: entry.minutes,
    hours: Math.floor(entry.minutes / 60),
    remainingMinutes: entry.minutes % 60,
    date: entry.date.toISOString().split("T")[0],
    description: entry.description,
    userName: entry.userName,
    userId: entry.userId,
    createdAt: entry.createdAt.toISOString(),
  }));
},
```

#### `getProjectTimeSummary` (rad 779-870)

**Efter:**
```typescript
import { getTimeSummaryCore } from "@/services/time-entry-service";

execute: async ({ projectId: pid }) => {
  await requireProject(tenantId, pid, userId);

  const summary = await getTimeSummaryCore({ tenantId, userId }, pid);

  return {
    totalMinutes: summary.totalMinutes,
    totalHours: `${Math.floor(summary.totalMinutes / 60)}h ${summary.totalMinutes % 60}min`,
    byTask: summary.byTask.map((t) => ({
      ...t,
      hours: `${Math.floor(t.totalMinutes / 60)}h ${t.totalMinutes % 60}min`,
    })),
    byPerson: summary.byPerson.map((p) => ({
      ...p,
      hours: `${Math.floor(p.totalMinutes / 60)}h ${p.totalMinutes % 60}min`,
    })),
    byWeek: summary.byWeek,
  };
},
```

#### `getProjectNotes` (rad 1627-1661)

**Efter:**
```typescript
import { getProjectNotesCore } from "@/services/note-service";

execute: async ({ projectId: pid, category, limit = 20 }) => {
  await requireProject(tenantId, pid, userId);

  const notes = await getProjectNotesCore(
    { tenantId, userId },
    pid,
    { category, limit }
  );

  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    isPinned: n.isPinned,
    createdBy: n.createdBy.name ?? n.createdBy.email,
    createdAt: n.createdAt.toISOString(),
  }));
},
```

#### `getPersonalNotes` (rad 1806-1833)

**Efter:**
```typescript
import { getPersonalNotesCore } from "@/services/note-service";

execute: async ({ category, limit = 20 }) => {
  const notes = await getPersonalNotesCore(
    { tenantId, userId },
    { category, limit }
  );

  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    isPinned: n.isPinned,
    createdAt: n.createdAt.toISOString(),
  }));
},
```

#### `listMembers` (rad 1431-1454)

**Efter:**
```typescript
import { getProjectMembersCore } from "@/services/member-service";

execute: async ({ projectId: pid }) => {
  await requireProject(tenantId, pid, userId);

  const members = await getProjectMembersCore({ tenantId, userId }, pid);
  return members.map((m) => ({
    membershipId: m.membershipId,
    userName: m.user.name ?? m.user.email,
    email: m.user.email,
  }));
},
```

#### `getAvailableMembers` (rad 1456-1487)

**Efter:**
```typescript
import { getAvailableMembersCore } from "@/services/member-service";

execute: async ({ projectId: pid }) => {
  await requireProject(tenantId, pid, userId);

  const available = await getAvailableMembersCore({ tenantId, userId }, pid);
  return available.map((m) => ({
    membershipId: m.membershipId,
    userName: m.user.name ?? m.user.email,
    email: m.user.email,
  }));
},
```

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 6.3: Verifiera och committa fas 6

- [ ] Klart

**Agenttyp:** Verifiering (Gemini 3 Flash)

### Checklista

1. [ ] `getProjectList` anvander `getProjectsCore`
2. [ ] `getUserTasks` anvander `getUserTasksCore`
3. [ ] `getProjectTasks` anvander `getProjectTasksCore`
4. [ ] `listFiles` anvander `getProjectFilesCore` + `validateDatabaseId` fran services
5. [ ] `getPersonalFiles` anvander `getPersonalFilesCore`
6. [ ] `getTaskComments` anvander `getCommentsCore`
7. [ ] `getProjectTimeEntries` anvander `getTimeEntriesCore`
8. [ ] `getProjectTimeSummary` anvander `getTimeSummaryCore`
9. [ ] `getProjectNotes` anvander `getProjectNotesCore`
10. [ ] `getPersonalNotes` anvander `getPersonalNotesCore`
11. [ ] `listMembers` anvander `getProjectMembersCore`
12. [ ] `getAvailableMembers` anvander `getAvailableMembersCore`
13. [ ] Ingen `db.xxx.findMany` kvar i AI-verktygens read-operationer
14. [ ] AI-specifik formatering (toISOString, ocrPreview, etc.) bevarad
15. [ ] `npx tsc --noEmit` passerar
16. [ ] `npm run build` passerar

### Efter godkannande

```bash
git add src/lib/ai/tools/personal-tools.ts
git commit -m "refactor: migrate AI tool read operations to service layer"
```
