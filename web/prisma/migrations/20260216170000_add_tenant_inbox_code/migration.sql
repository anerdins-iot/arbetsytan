-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "inboxCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_inboxCode_key" ON "Tenant"("inboxCode");
