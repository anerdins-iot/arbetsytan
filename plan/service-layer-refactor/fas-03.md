# Fas 3: File & Note Services

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 3.1: file-service.ts — getProjectFilesCore

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Skapa `src/services/file-service.ts` med `getProjectFilesCore`.

### Las forst

- `src/actions/files.ts` rad 349-431 — `getProjectFiles()` Action
- `src/lib/ai/tools/personal-tools.ts` rad 1049-1095 — `listFiles` AI-verktyg

### Nuvarande duplicering

**Action (files.ts:349-431):**
```typescript
const files = await db.file.findMany({
  where: { projectId },
  orderBy: { createdAt: "desc" },
});
// + presigned URLs via Promise.allSettled
// + validateDatabaseId-liknande check (rejects filenames as projectId)
```

**AI-verktyg (personal-tools.ts:1049-1095):**
```typescript
const files = await db.file.findMany({
  where: { projectId: pid },
  orderBy: { createdAt: "desc" },
  take: limit,
  select: {
    id: true, name: true, type: true, size: true, createdAt: true,
    ocrText: true, userDescription: true, label: true,
    analyses: { select: { prompt, content, createdAt }, orderBy: { createdAt: "desc" }, take: 5 },
  },
});
// + ocrPreview (forsta 300 tecken)
// + analyses array
```

**Skillnader:**
- Action hamtar ALLA falt, AI har specifik `select`
- Action skapar presigned URLs (consumer-logik, inte service)
- AI har `take: limit` och inkluderar `analyses`
- AI truncerar ocrText till forsta 300 tecken

### Service-funktion att skapa

```typescript
import { tenantDb, userDb } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type FileListItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: Date;
  ocrText: string | null;
  userDescription: string | null;
  label: string | null;
  objectKey: string; // Behovs for presigned URLs i Actions
  analyses: Array<{
    prompt: string;
    content: string;
    createdAt: Date;
  }>;
};

export type GetFilesOptions = {
  includeAnalyses?: boolean; // AI-verktyg behover detta
  analysesLimit?: number;    // Default 5
};

export async function getProjectFilesCore(
  ctx: ServiceContext,
  projectId: string,
  options?: GetFilesOptions & PaginationOptions
): Promise<FileListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const files = await db.file.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: options?.limit,
    include: options?.includeAnalyses
      ? {
          analyses: {
            select: { prompt: true, content: true, createdAt: true },
            orderBy: { createdAt: "desc" as const },
            take: options?.analysesLimit ?? 5,
          },
        }
      : undefined,
  });

  return files.map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    size: f.size,
    createdAt: f.createdAt,
    ocrText: f.ocrText,
    userDescription: f.userDescription,
    label: f.label,
    objectKey: f.objectKey,
    analyses: f.analyses?.map((a: any) => ({
      prompt: a.prompt,
      content: a.content,
      createdAt: a.createdAt,
    })) ?? [],
  }));
}
```

### Uppdatera index.ts

Lagg till `export * from "./file-service";` i `src/services/index.ts`.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 3.2: file-service.ts — getPersonalFilesCore

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Lagg till `getPersonalFilesCore` i `src/services/file-service.ts`.

### Las forst

- `src/actions/personal.ts` rad 255-320 — `getPersonalFiles()` Action
- `src/lib/ai/tools/personal-tools.ts` rad 1119-1163 — `getPersonalFiles` AI-verktyg

### Nuvarande duplicering

**Action (personal.ts:255+):**
- Anvander `userDb(userId)` (user-scoped, inte tenant-scoped)
- Hamtar filer utan presigned URLs (separat funktion `getPersonalFilesWithUrls`)
- `orderBy: { createdAt: "desc" }`

**AI-verktyg (personal-tools.ts:1119-1163):**
- Anvander `userDb(userId)`
- `take: limit` (default 50)
- Inkluderar `analyses` och `ocrPreview`
- select: id, name, type, size, createdAt, ocrText, userDescription, label, analyses

### Service-funktion att skapa

```typescript
/**
 * Karnlogik for personliga filer.
 * OBS: Anvander userDb(userId) istallet for tenantDb.
 */
export async function getPersonalFilesCore(
  ctx: ServiceContext,
  options?: GetFilesOptions & PaginationOptions
): Promise<FileListItem[]> {
  const udb = userDb(ctx.userId);

  const files = await udb.file.findMany({
    orderBy: { createdAt: "desc" },
    take: options?.limit,
    include: options?.includeAnalyses
      ? {
          analyses: {
            select: { prompt: true, content: true, createdAt: true },
            orderBy: { createdAt: "desc" as const },
            take: options?.analysesLimit ?? 5,
          },
        }
      : undefined,
  });

  return files.map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    size: f.size,
    createdAt: f.createdAt,
    ocrText: f.ocrText,
    userDescription: f.userDescription,
    label: f.label,
    objectKey: f.objectKey,
    analyses: f.analyses?.map((a: any) => ({
      prompt: a.prompt,
      content: a.content,
      createdAt: a.createdAt,
    })) ?? [],
  }));
}
```

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 3.3: note-service.ts — getProjectNotesCore och getPersonalNotesCore

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Skapa `src/services/note-service.ts` med tva funktioner.

### Las forst

- `src/actions/notes.ts` rad 124-160 — `getNotes()` Action
- `src/actions/personal.ts` rad 74-120 — `getPersonalNotes()` Action
- `src/lib/ai/tools/personal-tools.ts` rad 1627-1661 — `getProjectNotes` AI-verktyg
- `src/lib/ai/tools/personal-tools.ts` rad 1806-1833 — `getPersonalNotes` AI-verktyg

### Nuvarande duplicering

**getNotes Action (notes.ts:124-160):**
```typescript
const notes = await db.note.findMany({
  where, // projectId + optional category + optional search (OR: title/content contains)
  include: { createdBy: { select: { id, name, email } } },
  orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  take: options?.limit ?? 50,
});
// Returnerar NoteItem med toISOString() for createdAt/updatedAt
```

**getProjectNotes AI (personal-tools.ts:1627-1661):**
```typescript
const notes = await db.note.findMany({
  where: { projectId: pid, ...(category ? { category } : {}) },
  include: { createdBy: { select: { id, name, email } } },
  orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  take: limit, // default 20
});
// Returnerar med toISOString(), createdBy som name/email strang
```

**Nastan identiska!** Skillnader:
- Action har search-stod (OR: title/content contains)
- Action default limit 50, AI default 20
- Action returnerar createdBy som objekt, AI som strang

### Service-funktioner att skapa

```typescript
import { tenantDb, userDb } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type NoteListItem = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
};

export type GetNotesOptions = {
  category?: string;
  search?: string;
};

export async function getProjectNotesCore(
  ctx: ServiceContext,
  projectId: string,
  options?: GetNotesOptions & PaginationOptions
): Promise<NoteListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const where: Record<string, unknown> = { projectId };
  if (options?.category) where.category = options.category;
  if (options?.search) {
    where.AND = [{
      OR: [
        { title: { contains: options.search, mode: "insensitive" } },
        { content: { contains: options.search, mode: "insensitive" } },
      ],
    }];
  }

  const notes = await db.note.findMany({
    where,
    include: { createdBy: { select: { id: true, name: true, email: true } } },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
  });

  return notes.map((n: any) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    isPinned: n.isPinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    createdBy: n.createdBy,
  }));
}

export async function getPersonalNotesCore(
  ctx: ServiceContext,
  options?: GetNotesOptions & PaginationOptions
): Promise<NoteListItem[]> {
  const udb = userDb(ctx.userId);

  const where: Record<string, unknown> = {};
  if (options?.category) where.category = options.category;
  if (options?.search) {
    where.AND = [{
      OR: [
        { title: { contains: options.search, mode: "insensitive" } },
        { content: { contains: options.search, mode: "insensitive" } },
      ],
    }];
  }

  const notes = await udb.note.findMany({
    where,
    include: { createdBy: { select: { id: true, name: true, email: true } } },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
  });

  return notes.map((n: any) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    isPinned: n.isPinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    createdBy: n.createdBy,
  }));
}
```

### Uppdatera index.ts

Lagg till `export * from "./note-service";` i `src/services/index.ts`.

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

---

## Block 3.4: Verifiera och committa fas 3

- [ ] Klart

**Agenttyp:** Verifiering (Gemini 3 Flash)

### Checklista

1. [ ] `src/services/file-service.ts` exporterar `getProjectFilesCore`, `getPersonalFilesCore`
2. [ ] `src/services/note-service.ts` exporterar `getProjectNotesCore`, `getPersonalNotesCore`
3. [ ] `getProjectFilesCore` stodjer `includeAnalyses` option
4. [ ] `getPersonalFilesCore` anvander `userDb(ctx.userId)` (inte tenantDb)
5. [ ] `getProjectNotesCore` stodjer category och search-filtrering
6. [ ] `getPersonalNotesCore` anvander `userDb(ctx.userId)`
7. [ ] Alla funktioner returnerar raa Date-objekt
8. [ ] `src/services/index.ts` re-exporterar alla services
9. [ ] `npx tsc --noEmit` passerar
10. [ ] `npm run build` passerar

### Efter godkannande

```bash
git add src/services/file-service.ts src/services/note-service.ts src/services/index.ts
git commit -m "feat: add file-service and note-service with core read functions"
```
