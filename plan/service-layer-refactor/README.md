# Service Layer Refactor — DRY mellan Actions och AI-verktyg

## Principer

**Vi har all tid i världen och obegränsade tokens.**

Detta projekt ska goras **100% fardigt och produktionsklart**. Inga genvagar, inga "kan fixas senare", inga halvfardiga losningar.

### Regler:
1. **Ingen teknisk skuld** — Allt ska vara korrekt fran borjan
2. **Fullstandig implementation** — Varje block ska vara komplett innan nasta borjas
3. **Grundlig testning** — Varje fas verifieras innan commit
4. **Dokumentation** — Allt dokumenteras lopande
5. **Kvalitet over hastighet** — Ta den tid som behovs

### Forvantningar pa agenter:
- Las ALL relevant dokumentation innan du borjar
- Fraga hellre an gissa
- Verifiera ditt arbete innan du rapporterar klart
- Om nagot ar oklart i planen, dokumentera avvikelsen

---

## Bakgrund

Nuvarande arkitektur har duplicerad logik mellan:
1. **Server Actions** (`src/actions/*.ts`) — Anvands av UI-komponenter
2. **AI-verktyg** (`src/lib/ai/tools/personal-tools.ts`) — Anvands av AI-agenten

Bada gor samma saker:
- DB-queries (findMany, where, select, include)
- Auth-kontroller (requireProject, requirePermission)
- Validering (projectId, fileId, etc.)
- Data-transformation (toISOString, map, etc.)

### Problemexempel: getProjectFiles

**Actions (src/actions/files.ts:349-431):**
```typescript
const files = await db.file.findMany({
  where: { projectId },
  orderBy: { createdAt: "desc" },
});
// + presigned URLs for UI
```

**AI-verktyg (src/lib/ai/tools/personal-tools.ts:1059-1094):**
```typescript
const files = await db.file.findMany({
  where: { projectId: pid },
  orderBy: { createdAt: "desc" },
  take: limit,
  select: { ..., analyses: { ... } },
});
// + ocrPreview, analyses for AI-kontext
```

**Problem:**
- Om schemat andras maste bada uppdateras
- Validering implementeras olika pa olika stallen
- Buggfixar maste appliceras pa flera stallen
- `validateDatabaseId` definieras i BADE `personal-tools.ts` OCH planeras i `services/types.ts`

---

## Mal

### DEL 1: Service Layer for ALLA lasoperationer
Skapa ett **Service Layer** (`src/services/`) med gemensam karnlogik for alla read-operationer.

### DEL 2: Fixa skrivavvikelser
AI-verktyg som gor egen DB-logik istallet for att anropa Actions ska refaktoreras.

### DEL 3: CRUD-gap
Lagg till saknade AI-verktyg for fullstandig paritet.

---

## Ny arkitektur

```
+---------------------------------------------------------+
|                      Consumers                          |
+----------------------+----------------------------------+
|   Server Actions     |         AI Tools                 |
|   (src/actions/)     |   (src/lib/ai/tools/)            |
|                      |                                  |
|   + presigned URLs   |   + ocrPreview                   |
|   + revalidatePath   |   + analyses array               |
|   + UI-format        |   + AI-optimerat format          |
+----------+-----------+-------------------+--------------+
           |                               |
           v                               v
+---------------------------------------------------------+
|                   Service Layer                         |
|                (src/services/*.ts)                      |
|                                                         |
|   - Gemensamma DB-queries                               |
|   - Gemensam validering (validateDatabaseId)            |
|   - Gemensam felhantering                               |
|   - Returnerar "ra" data (Date, inte ISO-strangar)      |
+---------------------------------------------------------+
```

---

## Fullstandig analys av duplicering

### Lasoperationer som har duplicerad logik (17 funktioner):

| # | Operation | Actions | AI-verktyg | Service att skapa |
|---|-----------|---------|------------|-------------------|
| 1 | getProjects | `projects.ts:62` | `personal-tools.ts:101` (getProjectList) | `project-service.ts` |
| 2 | getProject (detalj) | `projects.ts:206` | *saknas i AI* | `project-service.ts` |
| 3 | getTasks (projekt) | `tasks.ts:95` | `personal-tools.ts:279` (getProjectTasks) | `task-service.ts` |
| 4 | getUserTasks (cross-project) | *saknas i Actions* | `personal-tools.ts:237` (getUserTasks) | `task-service.ts` |
| 5 | getProjectFiles | `files.ts:349` | `personal-tools.ts:1049` (listFiles) | `file-service.ts` |
| 6 | getPersonalFiles | `personal.ts:255` | `personal-tools.ts:1119` (getPersonalFiles) | `file-service.ts` |
| 7 | getNotes (projekt) | `notes.ts:124` | `personal-tools.ts:1627` (getProjectNotes) | `note-service.ts` |
| 8 | getPersonalNotes | `personal.ts:74` | `personal-tools.ts:1806` (getPersonalNotes) | `note-service.ts` |
| 9 | getComments | `comments.ts:66` | `personal-tools.ts:450` (getTaskComments) | `comment-service.ts` |
| 10 | getTimeEntries (projekt) | `time-entries.ts:183` | `personal-tools.ts:580` (getProjectTimeEntries) | `time-entry-service.ts` |
| 11 | getMyTimeEntries | `time-entries.ts:203` | *saknas i AI* | `time-entry-service.ts` |
| 12 | getProjectTimeSummary | `time-entries.ts:319` | `personal-tools.ts:779` (getProjectTimeSummary) | `time-entry-service.ts` |
| 13 | listMembers | `projects.ts:234` (inuti getProject) | `personal-tools.ts:1431` (listMembers) | `member-service.ts` |
| 14 | getAvailableMembers | `projects.ts:260` (inuti getProject) | `personal-tools.ts:1456` (getAvailableMembers) | `member-service.ts` |
| 15 | listAutomations | `automations.ts:222` | `personal-tools.ts:1994` (via Action) | redan DRY |
| 16 | getInvitations | `invitations.ts:208` | `personal-tools.ts:1588` (via Action) | redan DRY |
| 17 | getNoteCategories | `note-categories.ts:72` | `personal-tools.ts` (via Action) | redan DRY |

### Skrivavvikelser (AI gor egen DB-logik istallet for att anropa Actions):

| # | Operation | AI gor | Borde gora |
|---|-----------|--------|------------|
| 1 | assignTask | Egen DB-logik (personal-tools.ts:381-413) | Anropa `assignTask` Action |
| 2 | createComment | Egen DB-create (personal-tools.ts:503-524) | Anropa `createComment` Action |
| 3 | updateComment | Egen DB-logik (personal-tools.ts:535-552) | Anropa `updateComment` Action |
| 4 | deleteComment | Egen DB-logik (personal-tools.ts:562-575) | Anropa `deleteComment` Action |
| 5 | createTimeEntry | Egen DB-logik (personal-tools.ts:627-688) | Anropa `createTimeEntry` Action |
| 6 | updateTimeEntry | Egen DB-logik (personal-tools.ts:690-751) | Anropa `updateTimeEntry` Action |
| 7 | deleteTimeEntry | Egen DB-logik (personal-tools.ts:754-777) | Anropa `deleteTimeEntry` Action |
| 8 | createProjectNote | Egen DB-logik (personal-tools.ts:1663-1698) | Anropa `createNote` Action |
| 9 | updateProjectNote | Egen DB-logik (personal-tools.ts:1701-1742) | Anropa `updateNote` Action |
| 10 | deleteProjectNote | Egen DB-logik (personal-tools.ts:1745-1763) | Anropa `deleteNote` Action |
| 11 | createPersonalNote | Egen DB-logik (personal-tools.ts:1836-1865) | Anropa `createPersonalNote` Action |
| 12 | updatePersonalNote | Egen DB-logik (personal-tools.ts:1868-1901) | Anropa `updatePersonalNote` Action |
| 13 | deletePersonalNote | Egen DB-logik (personal-tools.ts:1904-1918) | Anropa `deletePersonalNote` Action |
| 14 | addMember | Egen DB-logik (personal-tools.ts:1489-1521) | Anropa `addProjectMember` Action |
| 15 | removeMember | Egen DB-logik (personal-tools.ts:1524-1550) | Anropa `removeProjectMember` Action |

### CRUD-gap (saknade AI-verktyg):

| # | Operation | Finns i Actions | Saknas i AI |
|---|-----------|-----------------|-------------|
| 1 | unassignTask | `tasks.ts:456` | Ja |
| 2 | toggleNotePin | `notes.ts:259` | Ja |
| 3 | togglePersonalNotePin | `personal.ts:233` | Ja |
| 4 | updateAutomation | `automations.ts:280` | Ja |
| 5 | pauseAutomation | `automations.ts:366` | Ja |
| 6 | resumeAutomation | `automations.ts:400` | Ja |
| 7 | getAutomation (detalj) | `automations.ts:254` | Ja |
| 8 | getNotifications | `notifications.ts:80` | Ja |
| 9 | markNotificationRead | `notifications.ts:159` | Ja |
| 10 | markAllNotificationsRead | `notifications.ts:179` | Ja |
| 11 | getMyTimeEntries | `time-entries.ts:203` | Ja |
| 12 | getProject (detalj) | `projects.ts:206` | Ja |

---

## Scope per service-fil

### Nya service-filer att skapa:

| Service | Funktioner |
|---------|-----------|
| `src/services/types.ts` | `ServiceContext`, `PaginationOptions`, `validateDatabaseId` |
| `src/services/project-service.ts` | `getProjectsCore`, `getProjectDetailCore` |
| `src/services/task-service.ts` | `getProjectTasksCore`, `getUserTasksCore` |
| `src/services/file-service.ts` | `getProjectFilesCore`, `getPersonalFilesCore` |
| `src/services/note-service.ts` | `getProjectNotesCore`, `getPersonalNotesCore` |
| `src/services/comment-service.ts` | `getCommentsCore` |
| `src/services/time-entry-service.ts` | `getTimeEntriesCore`, `getMyTimeEntriesCore`, `getTimeSummaryCore` |
| `src/services/member-service.ts` | `getProjectMembersCore`, `getAvailableMembersCore` |
| `src/services/index.ts` | Re-exports |

---

## Faser

| Fas | Beskrivning | Block |
|-----|-------------|-------|
| 1   | Infrastructure + types + ServiceContext | 2 |
| 2   | Project & Task services | 4 |
| 3   | File & Note services | 4 |
| 4   | Comment, Time, Member services | 4 |
| 5   | Migrera Actions till services | 3 |
| 6   | Migrera AI-verktyg lasningar till services | 3 |
| 7   | Fixa skrivavvikelser (AI -> Actions) | 4 |
| 8   | Lagg till saknade AI-verktyg | 3 |
| 9   | Ta bort duplicerad kod (validateDatabaseId m.m.) | 2 |
| 10  | Test och verifiering | 3 |

**Totalt:** ~32 block

---

## Regler for agenter

### ALLA agenter MASTE lasa:
1. `/workspace/plan/service-layer-refactor/README.md` (denna fil)
2. `/workspace/plan/service-layer-refactor/fas-XX.md` (aktuell fas)
3. `/workspace/AGENTS.md` (projektregler)
4. `/workspace/DEVLOG.md` (dokumenterade problem)

### Implementationsagenter:
- Las relevant Actions-fil och AI-verktyg INNAN du borjar
- Behall exakt samma beteende — detta ar refaktorering, inte ny funktionalitet
- `npm run build` maste passera efter varje block
- Andra ALDRIG beteende — samma input ska ge samma output

### Verifieringsagenter:
- Du ar en GRANSKARE. Du far INTE andra nagra filer
- Las, analysera och rapportera GODKANT/UNDERKANT
- Kor `npm run build` och `npx tsc --noEmit`
- Verifiera med grep att duplicerad kod ar borttagen

### Sekventiellt arbetsflode:
```
Implementation -> Verifiering -> Commit -> Nasta block
```

---

## Framgangskriterier

1. `npm run build` utan fel
2. `npx tsc --noEmit` utan fel
3. Ingen duplicerad `findMany`-logik for lasoperationer
4. `validateDatabaseId` definieras ENBART i `services/types.ts`
5. Alla AI-skrivoperationer anropar Actions (inte egen DB-logik)
6. Alla saknade AI-verktyg implementerade
7. E2E-test: UI och AI fungerar som forut
