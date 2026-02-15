# Fas 9: Ta bort duplicerad kod

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 9.1: Ta bort gammal validateDatabaseId och oanvand DB-logik

- [ ] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Ta bort duplicerad kod som nu ar ersatt av service-lagret.

### Andringar

#### 1. Ta bort `validateDatabaseId` fran `personal-tools.ts`

**Sak att ta bort:**
```typescript
// personal-tools.ts rad 78-94
function validateDatabaseId(value: string, fieldName: string): { valid: true } | { valid: false; error: string } {
  // ... hela funktionen ...
}
```

**Ersatt med:** `import { validateDatabaseId } from "@/services/types";`

Verifiera att ALLA anvandningar av `validateDatabaseId` i `personal-tools.ts` nu importerar fran `@/services/types`.

Sok efter: `validateDatabaseId` i `personal-tools.ts` — ska ENBART forekoma som import.

#### 2. Ta bort oanvanda DB-imports fran `personal-tools.ts`

Efter alla migreringar i fas 6 och 7 kan manga imports bli oanvanda. Kontrollera:

```typescript
// Kan dessa tas bort helt eller reduceras?
import { userDb, tenantDb, prisma, type TenantScopedClient } from "@/lib/db";
```

- `db` (fran ctx) — behovs fortfarande for verktyg som INTE migrerarts (t.ex. searchFiles, analyzeDocument, movePersonalFileToProject, etc.)
- `tenantDb` — behovs for kvarvarande skrivoperationer som inte har Actions (t.ex. deleteTask med taskAssignment.deleteMany)
- `prisma` — kontrollera om den anvands nagonannanstans
- `userDb` — behovs for kvarvarande personalfile-operationer

**VIKTIGT:** Ta INTE bort imports som fortfarande anvands! Gor en grundlig sokning forst.

#### 3. Ta bort oanvanda DB-imports fran Actions

Kontrollera varje migrerad Action-fil. Om `tenantDb` inte langre anvands direkt i read-operationerna (men fortfarande i write-operationer), behall den.

#### 4. Ta bort gamla helpers som flyttats till services

- `getWeekStart()` i `time-entries.ts` — om den nu enbart finns i service-lagret
- `toDateKey()` i `time-entries.ts` — om den nu enbart finns i service-lagret
- `noteInclude` och `formatNote` i `notes.ts` — om getNotes nu anvander service
- `mapEntry` i `time-entries.ts` — om den inte langre anvands

**OBS:** Behall helpers som fortfarande anvands av write-operationer! T.ex. `formatNote` anvands av `createNote`, `updateNote` — dessa ar INTE migrerade till services, de ar fortfarande Actions.

### Verifiering

```bash
# Kontrollera att validateDatabaseId bara definieras pa ett stalle
grep -rn "function validateDatabaseId" src/

# Forvantad output: ENBART src/services/types.ts

npx tsc --noEmit
npm run build
```

---

## Block 9.2: Verifiera och committa fas 9

- [ ] Klart

**Agenttyp:** Verifiering (Gemini 3 Flash)

### Checklista

1. [ ] `validateDatabaseId` definieras ENBART i `src/services/types.ts`
2. [ ] `personal-tools.ts` importerar `validateDatabaseId` fran `@/services/types`
3. [ ] Inga oanvanda imports av `tenantDb`, `userDb`, `prisma` i migrerade filer
4. [ ] Inga kvarvarande `db.xxx.findMany` i AI-verktygens lasoperationer (utom icke-migrerade som searchFiles etc.)
5. [ ] Alla write-operationer i AI-verktygen anropar Actions (inte egen DB)
6. [ ] `npx tsc --noEmit` passerar
7. [ ] `npm run build` passerar

### Statistik att rapportera

Kor foljande och rapportera resultatet:

```bash
# Antal findMany i personal-tools.ts (fore vs efter)
grep -c "findMany" src/lib/ai/tools/personal-tools.ts

# Antal Action-anrop i personal-tools.ts
grep -c "Action(" src/lib/ai/tools/personal-tools.ts

# Antal service-anrop i personal-tools.ts
grep -c "Core(" src/lib/ai/tools/personal-tools.ts

# Antal service-anrop i actions/
grep -rn "Core(" src/actions/ | wc -l
```

### Efter godkannande

```bash
git add src/lib/ai/tools/personal-tools.ts src/actions/
git commit -m "refactor: remove duplicated code after service layer migration"
```
