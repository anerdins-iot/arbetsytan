# Fas 5: Migrera Actions till Services

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 5.1: Migrera project + task Actions

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Migrera `getProjects()`, `getProject()` och `getTasks()` Actions att anvanda service-lagret.

### Las forst

- `src/actions/projects.ts` — `getProjects()` (rad 62-114) och `getProject()` (rad 206-298)
- `src/actions/tasks.ts` — `getTasks()` (rad 95-155)
- `src/services/project-service.ts` — `getProjectsCore`, `getProjectDetailCore`
- `src/services/task-service.ts` — `getProjectTasksCore`

### Andringar

#### `src/actions/projects.ts` — `getProjects()`

**Fore:**
```typescript
export async function getProjects(options?: {
  search?: string;
  status?: ProjectStatus;
}): Promise<GetProjectsResult> {
  const { tenantId, userId } = await requireAuth();
  const db = tenantDb(tenantId);
  const membership = await db.membership.findFirst({ ... });
  // ... 50 rader DB-logik ...
  return { projects: projects as ProjectWithCounts[] };
}
```

**Efter:**
```typescript
import { getProjectsCore } from "@/services/project-service";

export async function getProjects(options?: {
  search?: string;
  status?: ProjectStatus;
}): Promise<GetProjectsResult> {
  const { tenantId, userId } = await requireAuth();

  const projects = await getProjectsCore(
    { tenantId, userId },
    { search: options?.search, status: options?.status, includeTaskCount: true }
  );

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status as ProjectStatus,
      address: p.address,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      _count: { tasks: p.taskCount },
    })),
  };
}
```

**VIKTIGT:** Returtypen `GetProjectsResult` med `ProjectWithCounts` (som har `_count.tasks`) maste behallas identisk for att inte bryta UI-komponenter.

#### `src/actions/projects.ts` — `getProject()`

**After:**
```typescript
import { getProjectDetailCore } from "@/services/project-service";
import { hasPermission } from "@/lib/auth";

export async function getProject(projectId: string): Promise<GetProjectResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const detail = await getProjectDetailCore({ tenantId, userId }, projectId);
  if (!detail) return { success: false, error: "PROJECT_NOT_FOUND" };

  const canManageTeam = await hasPermission(userId, tenantId, "canManageTeam");

  return {
    success: true,
    project: {
      id: detail.id,
      name: detail.name,
      description: detail.description,
      status: detail.status as ProjectStatus,
      address: detail.address,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      taskStatusCounts: detail.taskStatusCounts,
      members: detail.members.map((m) => ({
        id: m.membershipId,
        role: m.role,
        user: m.user,
      })),
      availableMembers: detail.availableMembers.map((m) => ({
        id: m.membershipId,
        role: m.role,
        user: m.user,
      })),
      canManageTeam,
    },
  };
}
```

#### `src/actions/tasks.ts` — `getTasks()`

**After:**
```typescript
import { getProjectTasksCore } from "@/services/task-service";

export async function getTasks(projectId: string): Promise<GetTasksResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const tasks = await getProjectTasksCore({ tenantId, userId }, projectId);

  return {
    success: true,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status as TaskStatus,
      priority: t.priority as Priority,
      deadline: t.deadline?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      projectId: t.projectId,
      assignments: t.assignments.map((a) => ({
        membershipId: a.membershipId,
        user: a.user,
      })),
    })),
  };
}
```

### KRITISKT: Behall returtyper

Actions returtyper (`GetProjectsResult`, `GetProjectResult`, `GetTasksResult`, `TaskItem`) anvands av UI-komponenter. **ANDRA ALDRIG dessa typer.** Transformera service-data till befintlig typ-struktur.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

Kontrollera att:
- Import av `tenantDb` ar borttagen fran anvandda funktioner (inte fran hela filen — den behovs for write-operationer)
- `getProjectsCore`, `getProjectDetailCore`, `getProjectTasksCore` importeras korrekt

---

## Block 5.2: Migrera file, note, comment, time-entry, member Actions

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Migrera resterande read-operationer i Actions till services.

### Andringar

#### `src/actions/files.ts` — `getProjectFiles()`

Migrera till `getProjectFilesCore`. Behall presigned URL-logik som consumer-specifik kod.

**After-monster:**
```typescript
import { getProjectFilesCore } from "@/services/file-service";

export async function getProjectFiles(projectId: string) {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const files = await getProjectFilesCore(
    { tenantId, userId },
    projectId,
    { includeAnalyses: false }
  );

  // Presigned URLs — consumer-specifikt, stannar i Actions
  const withUrls = await Promise.allSettled(
    files.map(async (f) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
      url: await getPresignedGetUrl(/* ... */),
    }))
  );
  // ... resten av presigned URL-logiken
}
```

#### `src/actions/notes.ts` — `getNotes()`

Migrera till `getProjectNotesCore`.

#### `src/actions/personal.ts` — `getPersonalNotes()` och `getPersonalFiles()`

Migrera till `getPersonalNotesCore` och `getPersonalFilesCore`.

#### `src/actions/comments.ts` — `getComments()`

Migrera till `getCommentsCore`.

#### `src/actions/time-entries.ts` — `getTimeEntriesByProject()`, `getMyTimeEntries()`, `getProjectTimeSummary()`

Migrera till `getTimeEntriesCore`, `getMyTimeEntriesCore`, `getTimeSummaryCore`.

**OBS for time-entries:** `toDateKey()` och `getWeekStart()` helpers kan behova finnas kvar i Actions for grupperingslogiken, ELLER flyttas helt till servicen. Bestam en plats och var konsekvent.

#### Member-logik i `getProject()`

Redan hanterad i Block 5.1 via `getProjectDetailCore`.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 5.3: Verifiera och committa fas 5

- [ ] Klart

**Agenttyp:** Verifiering (Gemini 3 Flash)

### Checklista

1. [ ] `getProjects()` anvander `getProjectsCore` och returnerar korrekt `GetProjectsResult`
2. [ ] `getProject()` anvander `getProjectDetailCore` + `hasPermission` for `canManageTeam`
3. [ ] `getTasks()` anvander `getProjectTasksCore`
4. [ ] `getProjectFiles()` anvander `getProjectFilesCore` + behaller presigned URL-logik
5. [ ] `getNotes()` anvander `getProjectNotesCore`
6. [ ] `getPersonalNotes()` anvander `getPersonalNotesCore`
7. [ ] `getPersonalFiles()` anvander `getPersonalFilesCore`
8. [ ] `getComments()` anvander `getCommentsCore`
9. [ ] `getTimeEntriesByProject()` anvander `getTimeEntriesCore`
10. [ ] `getMyTimeEntries()` anvander `getMyTimeEntriesCore`
11. [ ] `getProjectTimeSummary()` anvander `getTimeSummaryCore`
12. [ ] Alla returtyper ar IDENTISKA med fore (inget UI-brott)
13. [ ] `npx tsc --noEmit` passerar
14. [ ] `npm run build` passerar

### Efter godkannande

```bash
git add src/actions/projects.ts src/actions/tasks.ts src/actions/files.ts src/actions/notes.ts src/actions/personal.ts src/actions/comments.ts src/actions/time-entries.ts
git commit -m "refactor: migrate Action read operations to service layer"
```
