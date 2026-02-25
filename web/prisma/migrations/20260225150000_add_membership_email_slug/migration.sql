-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "emailSlug" TEXT;

-- CreateIndex (unique per tenant; multiple NULLs allowed)
CREATE UNIQUE INDEX "Membership_tenantId_emailSlug_key" ON "Membership"("tenantId", "emailSlug");
