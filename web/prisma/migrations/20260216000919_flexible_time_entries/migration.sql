-- CreateEnum
CREATE TYPE "TimeEntryType" AS ENUM ('WORK', 'VACATION', 'SICK', 'VAB', 'PARENTAL', 'EDUCATION', 'OTHER');

-- AlterTable: Add columns with safe defaults first
ALTER TABLE "TimeEntry"
ADD COLUMN "entryType" "TimeEntryType" NOT NULL DEFAULT 'WORK',
ADD COLUMN "tenantId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- Backfill tenantId from project or task relationship
UPDATE "TimeEntry" te
SET "tenantId" = COALESCE(
  (SELECT p."tenantId" FROM "Project" p WHERE p."id" = te."projectId"),
  (SELECT p."tenantId" FROM "Task" t JOIN "Project" p ON t."projectId" = p."id" WHERE t."id" = te."taskId")
)
WHERE te."tenantId" IS NULL;

-- Make tenantId required after backfill
ALTER TABLE "TimeEntry" ALTER COLUMN "tenantId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
