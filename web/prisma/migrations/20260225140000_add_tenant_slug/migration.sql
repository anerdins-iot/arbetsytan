-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
