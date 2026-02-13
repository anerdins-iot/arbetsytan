-- Steg 1: Lägg till nya kolumner (tenantId tillfälligt nullable för backfill)
ALTER TABLE "DocumentChunk" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "DocumentChunk" ADD COLUMN "userId" TEXT;

-- Steg 2: Backfill tenantId från Project för befintliga rader
UPDATE "DocumentChunk" dc
SET "tenantId" = p."tenantId"
FROM "Project" p
WHERE dc."projectId" = p."id" AND dc."tenantId" IS NULL;

-- Steg 3: Gör projectId nullable
ALTER TABLE "DocumentChunk" ALTER COLUMN "projectId" DROP NOT NULL;

-- Steg 4: Säkerställ NOT NULL på tenantId (efter backfill)
ALTER TABLE "DocumentChunk" ALTER COLUMN "tenantId" SET NOT NULL;

-- Steg 5: CHECK: exakt en av projectId eller userId ska vara satt
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_scope_check"
  CHECK (
    ("projectId" IS NOT NULL AND "userId" IS NULL) OR
    ("projectId" IS NULL AND "userId" IS NOT NULL)
  );

-- Steg 6: Foreign keys
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
