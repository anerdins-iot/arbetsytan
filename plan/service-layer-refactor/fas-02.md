# Fas 2: Project & Task Services

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 2.1: project-service.ts — getProjectsCore

- [x] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Skapa `src/services/project-service.ts` med `getProjectsCore` som gemensam lasningslogik for projektlistor.

### Las forst

- `src/actions/projects.ts` rad 62-114 — `getProjects()` Action
- `src/lib/ai/tools/personal-tools.ts` rad 101-116 — `getProjectList` AI-verktyg
- `src/services/types.ts` — ServiceContext

### Nuvarande duplicering

**Action (projects.ts:62-114):**
- Hamtar alla projekt med `_count: { tasks: true }`
- Rollbaserad filtrering (ADMIN ser allt, andra ser bara sina projekt)
- Stodjer search och status-filter
- Sorterar pa `updatedAt: "desc"`

**AI-verktyg (personal-tools.ts:101-116):**
- Hamtar projekt dar anvandaren ar medlem
- Enklare select: `{ id, name, status }`
- Sorterar pa `name: "asc"`
- Ingen search/status-filtrering

### Service-funktion att skapa

```typescript
import { tenantDb } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string; // ProjectStatus
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  taskCount: number;
};

export type GetProjectsOptions = {
  search?: string;
  status?: string;
  includeTaskCount?: boolean;
};

/**
 * Karnlogik for att hamta projektlistor.
 * Actions anvander med includeTaskCount=true.
 * AI-verktyg anvander med includeTaskCount=false.
 */
export async function getProjectsCore(
  ctx: ServiceContext,
  options?: GetProjectsOptions & PaginationOptions
): Promise<ProjectListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const membership = await db.membership.findFirst({
    where: { userId: ctx.userId },
    select: { id: true, role: true },
  });
  if (!membership) return [];

  const where: Record<string, unknown> = {};

  if (membership.role !== "ADMIN") {
    where.projectMembers = {
      some: { membershipId: membership.id },
    };
  }

  if (options?.status) where.status = options.status;

  if (options?.search?.trim()) {
    const term = options.search.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { address: { contains: term, mode: "insensitive" } },
    ];
  }

  const projects = await db.project.findMany({
    where,
    include: options?.includeTaskCount
      ? { _count: { select: { tasks: true } } }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take: options?.limit,
  });

  return projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    address: p.address,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    taskCount: p._count?.tasks ?? 0,
  }));
}
```

### Uppdatera index.ts

Lagg till `export * from "./project-service";` i `src/services/index.ts`.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 2.2: project-service.ts — getProjectDetailCore

- [x] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Lagg till `getProjectDetailCore` i `src/services/project-service.ts`. Denna funktion extraherar karnlogiken fran `getProject()` Action (projects.ts:206-298).

### Las forst

- `src/actions/projects.ts` rad 163-298 — `getProject()` och typer (`TaskStatusCounts`, `ProjectMember`, `ProjectDetail`)

### Nuvarande logik (projects.ts:206-298)

1. `db.project.findUnique({ where: { id: projectId } })`
2. 3x `db.task.count` for TODO, IN_PROGRESS, DONE
3. `db.projectMember.findMany` med membership + user
4. `db.membership.findMany` och filtrera ut tillgangliga
5. `hasPermission(userId, tenantId, "canManageTeam")`

### Service-funktion att skapa

```typescript
export type ProjectDetailData = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  taskStatusCounts: { TODO: number; IN_PROGRESS: number; DONE: number };
  members: Array<{
    membershipId: string;
    role: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  }>;
  availableMembers: Array<{
    membershipId: string;
    role: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  }>;
};

export async function getProjectDetailCore(
  ctx: ServiceContext,
  projectId: string
): Promise<ProjectDetailData | null> {
  // Extrahera logiken fran projects.ts:206-298
  // Returnera raa Date-objekt, INTE toISOString()
  // Inkludera INTE canManageTeam — det ar consumer-logik
}
```

**OBS:** `canManageTeam` ar en permission-kontroll som tillhor Action-lagret, inte service-lagret. Action-koden behaller sin `hasPermission`-check och lagger till det i sitt returvarde.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 2.3: task-service.ts — getProjectTasksCore och getUserTasksCore

- [x] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Skapa `src/services/task-service.ts` med tva funktioner.

### Las forst

- `src/actions/tasks.ts` rad 95-155 — `getTasks()` Action
- `src/lib/ai/tools/personal-tools.ts` rad 237-277 — `getUserTasks` AI-verktyg
- `src/lib/ai/tools/personal-tools.ts` rad 279-370 — `getProjectTasks` AI-verktyg

### Nuvarande duplicering

**getTasks Action (tasks.ts:95):**
- `where: { projectId }`
- include: assignments → membership → user (med `image`)
- `orderBy: { createdAt: "desc" }`
- Ingen limit

**getProjectTasks AI (personal-tools.ts:279):**
- `where: { projectId: pid }`
- include: project + assignments → membership → user (utan `image`)
- `orderBy: [{ deadline: "asc" }, { createdAt: "desc" }]`
- `take: limit` (default 50)

**getUserTasks AI (personal-tools.ts:237):**
- Hamtar alla projektId via `projectMember.findMany`
- `where: { projectId: { in: projectIds } }`
- include: project + assignments → membership → user (utan `image`)
- `orderBy: [{ deadline: "asc" }, { createdAt: "desc" }]`
- `take: limit` (default 30)

### Service-funktioner att skapa

```typescript
import { tenantDb } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type TaskListItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  projectName?: string;
  assignments: Array<{
    membershipId: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  }>;
};

export type GetTasksOptions = {
  includeProject?: boolean;
};

export async function getProjectTasksCore(
  ctx: ServiceContext,
  projectId: string,
  options?: GetTasksOptions & PaginationOptions
): Promise<TaskListItem[]> {
  // Gemensam findMany med dynamisk include for project
  // Inkludera alltid image i user select (Actions behover det)
  // AI-verktygen ignorerar helt enkelt faltet
}

export async function getUserTasksCore(
  ctx: ServiceContext,
  options?: PaginationOptions
): Promise<TaskListItem[]> {
  // 1. Hamta projectIds via projectMember.findMany
  // 2. findMany med where: { projectId: { in: projectIds } }
  // 3. Alltid includeProject=true
}
```

### Uppdatera index.ts

Lagg till `export * from "./task-service";` i `src/services/index.ts`.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 2.4: Verifiera och committa fas 2

- [x] Klart

**Agenttyp:** Verifiering (Gemini 3 Flash)

### Checklista

1. [ ] `src/services/project-service.ts` exporterar `getProjectsCore`, `getProjectDetailCore`
2. [ ] `src/services/task-service.ts` exporterar `getProjectTasksCore`, `getUserTasksCore`
3. [ ] `src/services/index.ts` re-exporterar bada
4. [ ] `getProjectsCore` hanterar ADMIN vs icke-ADMIN rollfiltrering
5. [ ] `getProjectsCore` stodjer search + status-filter
6. [ ] `getProjectDetailCore` returnerar taskStatusCounts, members, availableMembers
7. [ ] `getProjectTasksCore` inkluderar assignments med user-data
8. [ ] `getUserTasksCore` hamtar tasks fran alla anvandares projekt
9. [ ] Alla funktioner tar `ServiceContext` som forsta parameter
10. [ ] Alla funktioner returnerar raa Date-objekt (inte ISO-strangar)
11. [ ] `npx tsc --noEmit` passerar
12. [ ] `npm run build` passerar

### Efter godkannande

```bash
git add src/services/project-service.ts src/services/task-service.ts src/services/index.ts
git commit -m "feat: add project-service and task-service with core read functions"
```
