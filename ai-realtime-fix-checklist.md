# AI Realtime Fix Checklist

**Datum:** 2026-02-15
**Baserat på:** Testresultat från 8 parallella Haiku-agenter (70 verktyg)

---

## Problem 1: Task realtid saknas

**Symptom:** `createTask`, `updateTask`, `deleteTask`, `assignTask` via AI skapar/ändrar data korrekt men UI (Kanban) uppdateras inte utan page refresh.

**Berörda verktyg:** `createTask`, `updateTask`, `deleteTask`, `assignTask`

**Relevant kod:**
- `/workspace/web/src/lib/ai/tools/personal-tools.ts` (AI-verktyg)
- `/workspace/web/src/actions/tasks.ts` (server actions)
- `/workspace/web/src/hooks/use-socket.ts` (frontend listeners)

### Analys (KLAR)

**Emit-sida:**
- [x] Task-verktyg använder `tenantDb(tenantId)` **UTAN** EmitContext
- [x] Ingen `actorUserId` eller `projectId` skickas → auto-emit fungerar inte
- [x] `assignTask` triggar ingen emit alls (TaskAssignment saknas i EMIT_MODELS)
- [x] Jämfört med `createTimeEntry` som korrekt använder `tenantDb(tenantId, { actorUserId, projectId })`

**Listen-sida:**
- [x] Frontend HAR rätt listeners: `task:created`, `task:updated`, `task:deleted`
- [x] `project-view.tsx` anropar `refreshProjectView` vid dessa events
- [x] Problemet är ENDAST på emit-sidan

### Checklista

- [x] **Analys (emit):** KLAR — Task-verktyg saknar EmitContext
- [x] **Analys (listen):** KLAR — Frontend OK, problemet är backend
- [ ] **Åtgärd (emit):** Använd `tenantDb(tenantId, { actorUserId, projectId })` för alla task-operationer
- [ ] **Åtgärd (assignTask):** Trigga `task:updated` efter TaskAssignment.create
- [ ] **Test:** Kör `createTask` via AI-chat, verifiera att Kanban uppdateras i realtid

---

## Problem 2: Project realtid saknas

**Symptom:** `createProject`, `updateProject`, `archiveProject` via AI skapar/ändrar data korrekt men UI (projektlistan) uppdateras inte utan page refresh.

**Berörda verktyg:** `createProject`, `updateProject`, `archiveProject`

**Relevant kod:**
- `/workspace/web/src/actions/projects.ts` (rad 140, 319, 384)
- `/workspace/web/src/lib/socket-events.ts` (saknar projectCreated)
- `/workspace/web/src/app/[locale]/(dashboard)/projects/page.tsx` (Server Component)

### Analys (KLAR)

**Emit-sida:**
- [x] Actions använder rätt `tenantDb(tenantId, { actorUserId, projectId })` kontext
- [x] **MEN:** `projectCreated` saknas i `SOCKET_EVENTS` — emit avbryts för create
- [x] `projectUpdated` finns — update/archive fungerar på backend

**Listen-sida:**
- [x] Projektlistan (`projects/page.tsx`) är Server Component — ingen socket
- [x] Ingen komponent lyssnar på project-events för listan
- [x] Endast `project-view.tsx` (enskilt projekt) har `onProjectUpdated`

### Checklista

- [x] **Analys (emit):** KLAR — `projectCreated` saknas i SOCKET_EVENTS
- [x] **Analys (listen):** KLAR — Projektlistan har ingen socket-anslutning
- [ ] **Åtgärd (emit):** Lägg till `projectCreated` i `socket-events.ts`
- [ ] **Åtgärd (listen):** Skapa client wrapper för projektlistan med `useSocket` + `router.refresh()`
- [ ] **Test:** Kör `createProject` via AI-chat, verifiera att projektlistan uppdateras i realtid

---

## Problem 3: ProjectMember realtid saknas

**Symptom:** `addMember`, `removeMember` via AI sparar data korrekt men Members-fliken uppdateras inte utan page refresh.

**Berörda verktyg:** `addMember`, `removeMember`

**Relevant kod:**
- `/workspace/web/src/lib/ai/tools/personal-tools.ts` (AI-verktyg)
- `/workspace/web/src/actions/projects.ts` (server actions rad 459, 496)
- `/workspace/web/src/hooks/use-socket.ts` (frontend listeners)
- `/workspace/web/src/lib/db-emit-extension.ts` (EMIT_MODELS)

### Analys (KLAR)

**Emit-sida:**
- [x] `projectMember` saknas i `EMIT_MODELS` — inga events skickas
- [x] Actions använder `tenantDb(tenantId)` utan `projectId` kontext

**Listen-sida:**
- [x] Inga events för `projectMember:created/deleted` definierade
- [x] Inga callbacks i `use-socket.ts` för projektmedlemskap
- [x] `project-view.tsx` har ingen listener för medlemsändringar

### Checklista

- [x] **Analys (emit):** KLAR — `projectMember` saknas i EMIT_MODELS
- [x] **Analys (listen):** KLAR — Inga events/callbacks finns
- [ ] **Åtgärd (emit):** Lägg till `projectMember` i EMIT_MODELS + använd `tenantDb(tenantId, { actorUserId, projectId })`
- [ ] **Åtgärd (listen):** Lägg till `projectMember:created/deleted` events + callbacks i `use-socket.ts` + `project-view.tsx`
- [ ] **Test:** Kör `addMember` via AI-chat, verifiera att Members-fliken uppdateras i realtid

---

## Problem 4: updateNote serverfel

**Symptom:** `updateNote` (projektanteckningar) returnerar "Something went wrong. Try again."

**Berörda verktyg:** `updateNote` (exponeras som `updateNote`, impl: `updateProjectNote`)

**Relevant kod:**
- `/workspace/web/src/lib/ai/tools/personal-tools.ts` (rad 1575–1613)
- `/workspace/web/src/actions/notes.ts` (server action med korrekt felhantering)

### Analys (KLAR)

**Orsak:**
- [x] AI-verktyget `updateProjectNote` **saknar try/catch**
- [x] Verktyget använder direkt Prisma istället för server action
- [x] Undantag propageras → generisk "Something went wrong" visas
- [x] Server action `updateNote` har korrekt felhantering men används inte

### Checklista

- [x] **Analys:** KLAR — Saknar try/catch, använder direkt Prisma
- [ ] **Åtgärd:** Lägg till try/catch i `updateProjectNote` ELLER anropa server action istället
- [ ] **Test:** Kör `updateNote` via AI-chat, verifiera att anteckningen uppdateras

---

## Problem 5: deleteNote serverfel

**Symptom:** `deleteNote` (projektanteckningar) returnerar "Something went wrong. Try again."

**Berörda verktyg:** `deleteNote`

**Relevant kod:**
- `/workspace/web/src/lib/ai/tools/personal-tools.ts` (AI-verktyg)
- `/workspace/web/src/actions/notes.ts` (server actions)

### Analys (KLAR)

**Orsak:**
- [x] AI-verktyget `deleteProjectNote` **saknar try/catch**
- [x] Verktyget använder direkt Prisma istället för server action
- [x] Undantag propageras → generisk "Something went wrong" visas
- [x] Samma mönster som updateNote

### Checklista

- [x] **Analys:** KLAR — Saknar try/catch, använder direkt Prisma
- [ ] **Åtgärd:** Lägg till try/catch i `deleteProjectNote` ELLER anropa server action istället
- [ ] **Test:** Kör `deleteNote` via AI-chat, verifiera att anteckningen raderas

---

## Verifierade OK (ingen åtgärd krävs)

| Kategori | Verktyg | Emit | Listen | Status |
|----------|---------|------|--------|--------|
| Comment | create/update/delete | ✅ | ✅ | Realtid OK |
| TimeEntry | create/update/delete | ✅ | ✅ | Realtid OK |
| PersonalNote | create/update/delete | ✅ | ✅ | Realtid OK |
| NoteCategory | create/update/delete | ✅ | ✅ | Realtid OK |
| Invitation | send/cancel | ✅ | ✅ | Realtid OK |

---

## Arbetsordning

1. **Problem 4 & 5** (serverfel) — Enklast, troligen enkla buggar
2. **Problem 1** (Task) — Kritiskt, kärnfunktionalitet
3. **Problem 2** (Project) — Kritiskt, kärnfunktionalitet
4. **Problem 3** (ProjectMember) — Mindre kritiskt

---

## Relevant kod

| Fil | Innehåll |
|-----|----------|
| `/workspace/web/src/lib/ai/tools/personal-tools.ts` | AI-verktyg (emit-sidan) |
| `/workspace/web/src/lib/db.ts` | `tenantDb()` och EmitContext |
| `/workspace/web/src/lib/db-emit-extension.ts` | Auto-emit Prisma extension |
| `/workspace/web/src/hooks/use-socket.ts` | Frontend WebSocket-lyssnare (listen-sidan) |
| `/workspace/web/src/lib/socket-events.ts` | Event-typer och rum-routing |
