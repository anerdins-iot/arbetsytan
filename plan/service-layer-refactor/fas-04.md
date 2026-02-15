# Fas 4: Comment, Time Entry & Member Services

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 4.1: comment-service.ts — getCommentsCore

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Skapa `src/services/comment-service.ts` med `getCommentsCore`.

### Las forst

- `src/actions/comments.ts` rad 66-116 — `getComments()` Action
- `src/lib/ai/tools/personal-tools.ts` rad 450-493 — `getTaskComments` AI-verktyg

### Nuvarande duplicering

**getComments Action (comments.ts:66-116):**
```typescript
// 1. Verify task belongs to project
const task = await db.task.findFirst({ where: { id: taskId, projectId } });
// 2. Get comments
const comments = await db.comment.findMany({
  where: { taskId },
  orderBy: { createdAt: "asc" },
});
// 3. Fetch authors separately (platform-level users)
const authorIds = [...new Set(comments.map(c => c.authorId))];
const users = await prisma.user.findMany({
  where: { id: { in: authorIds } },
  select: { id, name, email, image },
});
```

**getTaskComments AI (personal-tools.ts:450-493):**
```typescript
// 1. Verify task
const task = await db.task.findFirst({ where: { id: taskId, projectId: pid } });
// 2. Get comments (identisk)
const comments = await db.comment.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
// 3. Fetch authors (identisk men utan image)
const users = await prisma.user.findMany({
  where: { id: { in: authorIds } },
  select: { id, name, email }, // Ingen image
});
```

**Nastan identiskt!** Enda skillnaden ar att Action inkluderar `image` i user select.

### Service-funktion att skapa

```typescript
import { tenantDb, prisma } from "@/lib/db";
import type { ServiceContext } from "./types";

export type CommentListItem = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  author: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

/**
 * Hamta kommentarer for en task.
 * Verifierar att tasken tillhor projektet.
 * Hamtar author-info fran platform-level User-tabellen.
 */
export async function getCommentsCore(
  ctx: ServiceContext,
  projectId: string,
  taskId: string
): Promise<{ comments: CommentListItem[] } | { error: string }> {
  const db = tenantDb(ctx.tenantId);

  // Verifiera att task tillhor projekt
  const task = await db.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true },
  });
  if (!task) return { error: "TASK_NOT_FOUND" };

  const comments = await db.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });

  // Hamta author-info separat (User ar platform-level, inte tenant-level)
  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, email: true, image: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    comments: comments.map((c) => {
      const author = userMap.get(c.authorId);
      return {
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        authorId: c.authorId,
        author: author ?? {
          id: c.authorId,
          name: null,
          email: "unknown",
          image: null,
        },
      };
    }),
  };
}
```

### Uppdatera index.ts

Lagg till `export * from "./comment-service";` i `src/services/index.ts`.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 4.2: time-entry-service.ts — getTimeEntriesCore, getMyTimeEntriesCore, getTimeSummaryCore

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Skapa `src/services/time-entry-service.ts` med tre funktioner.

### Las forst

- `src/actions/time-entries.ts` rad 183-250 — `getTimeEntriesByProject()` och `getMyTimeEntries()`
- `src/actions/time-entries.ts` rad 319-440 — `getProjectTimeSummary()`
- `src/lib/ai/tools/personal-tools.ts` rad 580-625 — `getProjectTimeEntries` AI-verktyg
- `src/lib/ai/tools/personal-tools.ts` rad 779-870 — `getProjectTimeSummary` AI-verktyg

### Nuvarande duplicering

**getTimeEntriesByProject Action (time-entries.ts:183):**
- `where: { projectId }`
- include: task (title), project (name)
- Sorterar pa `date: "desc"`, `createdAt: "desc"`
- Grupperar per dag i `GroupedTimeEntries[]`
- Hamtar user-info via prisma (platform-level)

**getProjectTimeEntries AI (personal-tools.ts:580-625):**
- `where: { projectId: pid }`
- include: task (id, title)
- `take: limit` (default 100)
- Sorterar pa `date: "desc"`, `createdAt: "desc"`
- Hamtar user-info via prisma
- Returnerar flat lista (ingen gruppering)

**getProjectTimeSummary Action (time-entries.ts:319-440):**
- Komplex aggregering: totalMinutes, byTask, byPerson, byDay, byWeek
- Anvander `getWeekStart()` helper

**getProjectTimeSummary AI (personal-tools.ts:779-870):**
- Nastan identisk aggregeringslogik
- Anvander egen variant av vecko-gruppering

### Service-funktioner att skapa

```typescript
import { tenantDb, prisma } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type TimeEntryListItem = {
  id: string;
  description: string | null;
  minutes: number;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string;
  projectName: string;
  userId: string;
  userName: string;
};

export type TimeSummaryData = {
  totalMinutes: number;
  byTask: Array<{ taskId: string; taskTitle: string; totalMinutes: number }>;
  byPerson: Array<{ userId: string; userName: string; totalMinutes: number }>;
  byDay: Array<{ date: string; totalMinutes: number }>;
  byWeek: Array<{ weekStart: string; totalMinutes: number }>;
};

export async function getTimeEntriesCore(
  ctx: ServiceContext,
  projectId: string,
  options?: PaginationOptions
): Promise<TimeEntryListItem[]> {
  // Gemensam findMany for tidsposter i ett projekt
  // Hamta user-info separat via prisma (platform-level)
}

export async function getMyTimeEntriesCore(
  ctx: ServiceContext,
  options?: PaginationOptions
): Promise<TimeEntryListItem[]> {
  // Anvandares egna tidsposter (cross-project)
  // where: { userId: ctx.userId }
  // Saknar AI-verktyg idag — service mojliggor framtida AI-tool (fas 8)
}

export async function getTimeSummaryCore(
  ctx: ServiceContext,
  projectId: string
): Promise<TimeSummaryData> {
  // Aggregeringslogik: byTask, byPerson, byDay, byWeek
  // Flytta getWeekStart()-logiken hit
}
```

**VIKTIGT:** `getWeekStart()` ar en helper som idag finns i `time-entries.ts:73-79`. Flytta den till servicen eller `types.ts`.

### Uppdatera index.ts

Lagg till `export * from "./time-entry-service";` i `src/services/index.ts`.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 4.3: member-service.ts — getProjectMembersCore och getAvailableMembersCore

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Skapa `src/services/member-service.ts` med tva funktioner.

### Las forst

- `src/actions/projects.ts` rad 234-279 — Medlemslogik inuti `getProject()`
- `src/lib/ai/tools/personal-tools.ts` rad 1431-1454 — `listMembers` AI-verktyg
- `src/lib/ai/tools/personal-tools.ts` rad 1456-1487 — `getAvailableMembers` AI-verktyg

### Nuvarande duplicering

**Action (projects.ts:234-258):**
```typescript
const projectMemberRows = await db.projectMember.findMany({
  where: { projectId },
  include: {
    membership: {
      include: { user: { select: { id, name, email, image } } },
    },
  },
});
```

**AI listMembers (personal-tools.ts:1431-1454):**
```typescript
const members = await db.projectMember.findMany({
  where: { projectId: pid },
  include: {
    membership: {
      include: { user: { select: { id, name, email } } },  // Ingen image
    },
  },
});
```

**Identisk query** forutom att Action inkluderar `image`.

### Service-funktioner att skapa

```typescript
import { tenantDb } from "@/lib/db";
import type { ServiceContext } from "./types";

export type ProjectMemberItem = {
  membershipId: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export async function getProjectMembersCore(
  ctx: ServiceContext,
  projectId: string
): Promise<ProjectMemberItem[]> {
  const db = tenantDb(ctx.tenantId);

  const rows = await db.projectMember.findMany({
    where: { projectId },
    include: {
      membership: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  return rows.map((pm) => ({
    membershipId: pm.membership.id,
    role: pm.membership.role,
    user: pm.membership.user,
  }));
}

export async function getAvailableMembersCore(
  ctx: ServiceContext,
  projectId: string
): Promise<ProjectMemberItem[]> {
  const db = tenantDb(ctx.tenantId);

  const allMemberships = await db.membership.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  const existingMembers = await db.projectMember.findMany({
    where: { projectId },
    select: { membershipId: true },
  });
  const existingIds = new Set(existingMembers.map((m) => m.membershipId));

  return allMemberships
    .filter((m) => !existingIds.has(m.id))
    .map((m) => ({
      membershipId: m.id,
      role: m.role,
      user: m.user,
    }));
}
```

### Uppdatera index.ts

Lagg till `export * from "./member-service";` i `src/services/index.ts`.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 4.4: Verifiera och committa fas 4

- [ ] Klart

**Agenttyp:** Verifiering (Gemini 3 Flash)

### Checklista

1. [ ] `src/services/comment-service.ts` exporterar `getCommentsCore`
2. [ ] `src/services/time-entry-service.ts` exporterar `getTimeEntriesCore`, `getMyTimeEntriesCore`, `getTimeSummaryCore`
3. [ ] `src/services/member-service.ts` exporterar `getProjectMembersCore`, `getAvailableMembersCore`
4. [ ] `getCommentsCore` hamtar author-info via `prisma.user.findMany` (platform-level)
5. [ ] `getTimeEntriesCore` hamtar user-info via `prisma.user.findMany`
6. [ ] `getTimeSummaryCore` har korrekt aggregeringslogik (byTask, byPerson, byDay, byWeek)
7. [ ] `getProjectMembersCore` inkluderar user `image`
8. [ ] `getAvailableMembersCore` filtrerar ut befintliga projektmedlemmar
9. [ ] Alla funktioner returnerar raa Date-objekt
10. [ ] `src/services/index.ts` re-exporterar alla services
11. [ ] `npx tsc --noEmit` passerar
12. [ ] `npm run build` passerar

### Efter godkannande

```bash
git add src/services/comment-service.ts src/services/time-entry-service.ts src/services/member-service.ts src/services/index.ts
git commit -m "feat: add comment-service, time-entry-service and member-service"
```
