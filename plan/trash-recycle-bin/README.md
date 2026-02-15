# Papperskorg (Trash/Recycle Bin)

## Översikt

Allt som "raderas" hamnar i papperskorgen. Inget tas bort direkt. Efter en konfigurerbar period (default 30 dagar) sker fysisk radering via cron-jobb.

## Arkitektur

### 1. Schema-ändringar

**Soft delete-fält** på alla raderbara entiteter:

| Modell | Fält | Beskrivning |
|--------|------|-------------|
| File | `deletedAt DateTime?`, `deletedById String?` | Filen visas inte i listor; MinIO-objektet finns kvar tills expiry |
| Task | `deletedAt DateTime?`, `deletedById String?` | |
| Note | `deletedAt DateTime?`, `deletedById String?` | |
| Comment | `deletedAt DateTime?`, `deletedById String?` | |
| TimeEntry | `deletedAt DateTime?`, `deletedById String?` | |
| Automation | `deletedAt DateTime?`, `deletedById String?` | |
| NoteCategory | `deletedAt DateTime?`, `deletedById String?` | |

**Konfiguration (Tenant):**

```prisma
model Tenant {
  // ... befintliga fält
  trashRetentionDays Int? @default(30)  // null = använd default 30
}
```

**Sökning:** DocumentChunk behöver inte `deletedAt` – vi filtrerar bort filer där `File.deletedAt != null` i alla sökningar. Embeddings finns kvar men filen visas inte i resultat.

### 2. Delete-flöde (nytt)

**Gammalt:** `delete` → fysisk radering direkt  
**Nytt:** `delete` → `deletedAt = now()`, `deletedById = userId`

- **Filer:** MinIO-objektet flyttas INTE – det ligger kvar. Vi uppdaterar bara DB. Vid expiry: ta bort från MinIO + radera File-rad.
- **Övriga:** Bara DB-uppdatering. Vid expiry: hard delete.

### 3. Service Layer

- Alla `get*Core`-funktioner: lägg till `where: { deletedAt: null }` (eller motsvarande)
- Nya funktioner: `getTrashCore(tenantId, entityType?)`, `restoreFromTrashCore(id, entityType)`
- `emptyTrashCore(tenantId)` – töm papperskorg manuellt (fysisk radering av allt i trash)
- `purgeExpiredTrashCore(tenantId)` – cron: radera allt där `deletedAt < now() - retentionDays`

### 4. Actions

- `deleteFile` → soft delete (uppdatera `deletedAt`)
- `restoreFile`, `restoreTask`, etc.
- `getTrash` (lista papperskorg)
- `emptyTrash` (töm papperskorg)
- `updateTrashRetention` (tenant-inställning)

### 5. AI-verktyg

- `deleteFile`, `deleteTask`, etc. → anropar Actions som gör soft delete
- `listTrash` – lista innehåll i papperskorg
- `restoreFromTrash` – återställ specifik post
- `emptyTrash` – töm papperskorg
- `getTrashRetention`, `setTrashRetention` – läsa/sätta kvarhållningstid

### 6. UI

- **Papperskorg-vy:** Lista alla borttagna objekt (filtrera på typ: filer, uppgifter, etc.)
- **Återställ-knapp** per post
- **Töm papperskorg** (med bekräftelse)
- **Inställningar:** Kvarhållningstid (dagar) – tenant-nivå

### 7. Cron-jobb

- Kör dagligen (t.ex. 03:00)
- `purgeExpiredTrashCore` per tenant
- För File: radera MinIO-objekt först, sedan DB-rad

### 8. Sökning (searchFiles, embeddings)

- Alla queries: `where: { file: { deletedAt: null } }` eller motsvarande join-filter
- Borttagna filer dyker inte upp i sökresultat

## Migrationsstrategi

1. Lägg till `deletedAt`, `deletedById` på alla modeller
2. Lägg till `trashRetentionDays` på Tenant
3. Uppdatera alla services att filtrera `deletedAt: null`
4. Ändra delete-actions till soft delete
5. Implementera restore, listTrash, purge

## Filer som påverkas

- `web/prisma/schema.prisma` – nya fält
- `web/src/services/*-service.ts` – filter + nya funktioner
- `web/src/actions/*.ts` – delete → soft, nya restore/listTrash
- `web/src/lib/ai/tools/*.ts` – delete-verktyg + nya trash-verktyg
- `web/src/components/` – papperskorg-vy, inställningar
- Ny: cron/trash-purge (Coolify cron eller Next.js route)
