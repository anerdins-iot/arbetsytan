# Fas 1: Infrastructure + Types + ServiceContext

> **INNAN DU BORJAR:** Las `/workspace/plan/service-layer-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 1.1: Skapa service layer struktur och types

- [x] Klart

**Agenttyp:** Implementation (Gemini 3 Flash)

### Uppgift

Skapa grundstrukturen for service layer med gemensamma typer, helpers och `validateDatabaseId`.

### Las forst

- `src/lib/ai/tools/personal-tools.ts` rad 78-94 — nuvarande `validateDatabaseId` (ska flyttas hit)
- `src/lib/db.ts` — forstaa `tenantDb`, `userDb`, `TenantScopedClient`

### Filer att skapa

#### `src/services/types.ts`

```typescript
import type { TenantScopedClient } from "@/lib/db";

/**
 * Kontext som alla service-funktioner behover.
 * Skapas av Actions (fran requireAuth) eller AI-verktyg (fran PersonalToolsContext).
 */
export type ServiceContext = {
  tenantId: string;
  userId: string;
  projectId?: string;
};

/**
 * Sidnumrering for listor.
 */
export type PaginationOptions = {
  limit?: number;
  offset?: number;
};

/**
 * Validera att ett ID ser ut som ett giltigt databasid (cuid eller liknande)
 * och INTE som ett filnamn eller projektnamn.
 *
 * Flyttad fran personal-tools.ts — definieras ENBART har.
 */
export function validateDatabaseId(
  value: string,
  fieldName: string
): { valid: true } | { valid: false; error: string } {
  // Filnamn har filandelser
  if (/\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|txt|csv)$/i.test(value)) {
    return {
      valid: false,
      error: `${fieldName} "${value}" ser ut som ett filnamn. Anvand ID:t (t.ex. fran listProjects eller getPersonalFiles).`,
    };
  }
  // ID:n ar vanligtvis korta alfanumeriska strangar
  if (value.length > 50) {
    return {
      valid: false,
      error: `${fieldName} "${value.slice(0, 30)}..." ar for langt. Anvand det korta ID:t.`,
    };
  }
  // Projektnamn har ofta mellanslag och svenska tecken
  if (/\s/.test(value) || /[aaooAAOO]/.test(value)) {
    return {
      valid: false,
      error: `${fieldName} "${value}" ser ut som ett namn, inte ett ID. Anvand ID:t fran listProjects.`,
    };
  }
  return { valid: true };
}
```

**VIKTIGT:** Kopiera regex exakt fran `personal-tools.ts:80-94`. Den har versionen visar mal-strukturen — jemfor med originalet och anvand den exakta koden.

#### `src/services/index.ts`

```typescript
// Re-exports for enkel import
export * from "./types";
// Fler services laggs till i senare faser
```

### Verifiering

```bash
npx tsc --noEmit
npm run build
```

Kontrollera att `src/services/types.ts` exporterar:
- `ServiceContext`
- `PaginationOptions`
- `validateDatabaseId`

---

## Block 1.2: Verifiera och committa infrastruktur

- [x] Klart

**Agenttyp:** Verifiering (Gemini 3 Flash)

### Uppgift

Verifiera att Block 1.1 ar korrekt implementerat.

### Checklista

1. [ ] `src/services/types.ts` finns och exporterar `ServiceContext`, `PaginationOptions`, `validateDatabaseId`
2. [ ] `src/services/index.ts` finns och re-exporterar fran `types.ts`
3. [ ] `validateDatabaseId` har EXAKT samma logik som `personal-tools.ts:80-94`
4. [ ] `npx tsc --noEmit` passerar utan fel
5. [ ] `npm run build` passerar utan fel

### Rapportering

- GODKANT: Alla punkter uppfyllda
- UNDERKANT: Lista avvikelser

### Efter godkannande

```bash
git add src/services/types.ts src/services/index.ts
git commit -m "feat: add service layer infrastructure with types and validateDatabaseId"
```
