# WebSocket Refaktorering — Automatisk Realtidsuppdatering

> **LÄS FÖRST:** `/workspace/AGENTS.md` och `/workspace/PROJEKT.md` för fullständig projektkontext.

---

## Projektkontext (för nya agenter)

**ArbetsYtan** är en multi-tenant SaaS-plattform för hantverkare (elektriker, VVS, byggare, etc.) med projektledning och AI-assistans.

### Tech Stack
- **Framework:** Next.js 16 (App Router, Server Components, Server Actions)
- **Databas:** PostgreSQL + Prisma 7 + pgvector
- **Realtid:** Socket.IO (webb + mobil)
- **Auth:** Auth.js v5
- **Styling:** Tailwind CSS v4 + shadcn/ui

### Nyckelkoncept
- **Multi-tenant:** Varje företag har isolerad data via `tenantDb(tenantId)`
- **Personliga data:** Användares egna filer/notes via `userDb(userId)`
- **AI-assistent:** Både per-projekt och personlig, med verktyg för CRUD

### Filstruktur
```
/workspace/web/
├── src/
│   ├── actions/          # Server Actions (all CRUD logic)
│   ├── lib/
│   │   ├── db.ts         # Prisma-klienter (tenantDb, userDb)
│   │   ├── socket.ts     # WebSocket emit-funktioner
│   │   └── socket-events.ts  # Event-typer och konstanter
│   ├── hooks/
│   │   └── use-socket.ts # Klient-hook för Socket.IO
│   └── components/       # React-komponenter
├── server.ts             # Custom server med Socket.IO
└── prisma/schema.prisma  # Databasschema
```

---

## Mål

Bygga ett system där WebSocket-events emittas **automatiskt** vid alla databasändringar på relevanta modeller. Utvecklare ska inte behöva komma ihåg att anropa emit-funktioner — det ska vara tekniskt omöjligt att glömma.

---

## Nuvarande problem

### Hur det fungerar idag (DÅLIGT)

```typescript
// actions/tasks.ts — NUVARANDE MÖNSTER
export async function createTask(data: TaskInput) {
  const { tenantId, userId } = await requireAuth();
  const db = tenantDb(tenantId);

  const task = await db.task.create({ data: { ... } });

  // Utvecklaren måste KOMMA IHÅG att anropa detta:
  emitTaskCreated(projectId, { projectId, taskId: task.id, actorUserId: userId });

  return task;
}
```

**Problem:**
1. **Manuella emits** — Utvecklare måste komma ihåg `emitTaskCreated()` etc.
2. **Inkonsistens** — Vissa actions emittar, andra glömmer (t.ex. comments saknar helt)
3. **Duplicering** — Samma emit-logik i actions, API routes, AI-verktyg
4. **Glömda modeller** — Comments, invitations saknar events helt

### Konsekvens

- Användare ser inte uppdateringar i realtid
- Inkonsistent UX — ibland uppdateras det, ibland inte
- Buggar som "filen syns inte efter uppladdning" uppstår

## Lösning: Prisma Extension med Auto-Emit

### Hur det SKA fungera (NYTT)

```typescript
// actions/tasks.ts — NYTT MÖNSTER
export async function createTask(data: TaskInput) {
  const { tenantId, userId } = await requireAuth();

  // Skicka med context — emit sker AUTOMATISKT
  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  const task = await db.task.create({ data: { ... } });

  // INGEN manuell emit behövs! Extension hanterar det.
  return task;
}
```

### Teknisk implementation

Utöka `tenantDb()` och `userDb()` med en extra Prisma extension som:
1. Interceptar `create`, `update`, `delete` på relevanta modeller
2. Automatiskt emittar rätt event till rätt rum
3. Inkluderar relevant payload-data
4. **Tvingar** emit — det är omöjligt att glömma

## Arkitektur

```
┌─────────────────────────────────────────────────────────────┐
│  Server Action / API Route / AI Tool / Background Job      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  tenantDb(tenantId, { actorUserId, projectId })            │
│  userDb(userId)                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Prisma Extension: Auto-Emit Layer                          │
│  - Interceptar create/update/delete                         │
│  - Bestäm event-typ baserat på modell                       │
│  - Bestäm rum baserat på context (project/user/tenant)      │
│  - Emit via Socket.IO                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Socket.IO Server (globalThis.ioServer)                     │
│  - Redis adapter för multi-instans                          │
│  - Rum: tenant:X, project:X, user:X                         │
└─────────────────────────────────────────────────────────────┘
```

## Modeller som ska ha auto-emit

| Modell | Event-typer | Rum |
|--------|-------------|-----|
| Task | created, updated, deleted | project:X |
| File | created, updated, deleted | project:X eller user:X |
| Note | created, updated, deleted | project:X eller user:X |
| Comment | created, updated, deleted | project:X (via task) |
| TimeEntry | created, updated, deleted | project:X |
| Notification | new | user:X |
| NoteCategory | created, updated, deleted | project:X eller user:X |
| Project | updated | tenant:X |

## Faser

| Fas | Beskrivning | Fil |
|-----|-------------|-----|
| 1 | Design och grundstruktur | `fas-01.md` |
| 2 | Implementation av auto-emit extension | `fas-02.md` |
| 3 | Migrera befintliga manuella emits | `fas-03.md` |
| 4 | Lägg till saknade events (Comments, etc.) | `fas-04.md` |
| 5 | Frontend-lyssnare och verifiering | `fas-05.md` |

## Testmetodik

### MCP Playwright (INTE spec-filer)

Vi kör **inte** `npx playwright test`. Istället använder vi **MCP Playwright-verktyg** via sub-agenter:

| Verktyg | Användning |
|---------|-----------|
| `browser_navigate` | Navigera till URL |
| `browser_snapshot` | Accessibility snapshot (hitta element) |
| `browser_click` | Klicka på element (ref från snapshot) |
| `browser_type` | Skriv text i fält |
| `browser_fill_form` | Fyll i formulär |
| `browser_take_screenshot` | Ta screenshot |
| `browser_wait_for` | Vänta på text/element |

### Modellval för test-agenter
**Provider:** Claude | **Modell:** haiku (snabb och billig)

### Server-livscykel
- **Dirigenten** startar servern innan test: `bash /workspace/web/scripts/start-server.sh`
- **Dirigenten** stoppar servern efter test: `bash /workspace/web/scripts/stop-server.sh`
- **Test-agenten** förutsätter att servern redan körs på `http://localhost:3000`

### Testanvändare (från seed)
| E-post | Lösenord | Roll |
|--------|----------|------|
| `admin@example.com` | `password123` | ADMIN |
| `fredrik@anerdins.se` | `password123` | ADMIN |
| `pm@example.com` | `password123` | PROJECT_MANAGER |
| `montor@example.com` | `password123` | WORKER |

---

## Tidsuppskattning

Varje fas: 1-2 block à 30-60 min implementation + verifiering.

## Beroenden

- Socket.IO server måste köras (`server.ts`)
- Redis adapter för produktion (redan implementerad)
- Prisma 7 med extensions-stöd (redan på plats)

## Risker

1. **Cirkulära imports** — db.ts importerar socket.ts som kan importera db.ts
2. **Performance** — Extra overhead vid varje DB-operation
3. **Payload-storlek** — Stora objekt i events kan vara ineffektiva

## Framgångskriterier

- [ ] Alla CRUD-operationer på listade modeller emittar automatiskt
- [ ] Inga manuella emit-anrop behövs
- [ ] E2E-tester bekräftar realtidsuppdatering (via MCP Playwright)
- [ ] Bygger utan fel
- [ ] Mobilapp får events (Socket.IO fungerar)
