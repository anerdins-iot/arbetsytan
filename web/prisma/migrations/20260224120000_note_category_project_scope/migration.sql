-- AlterTable: add projectId to NoteCategory (nullable = personal scope)
ALTER TABLE "NoteCategory" ADD COLUMN "projectId" TEXT;

-- CreateIndex: project-scoped categories unique per (tenantId, projectId, slug)
CREATE UNIQUE INDEX "NoteCategory_tenantId_projectId_slug_key" ON "NoteCategory"("tenantId", "projectId", "slug") WHERE "projectId" IS NOT NULL;

-- Drop old unique so we can add personal-scope unique (slug unique per tenant when projectId IS NULL)
DROP INDEX IF EXISTS "NoteCategory_tenantId_slug_key";

-- CreateIndex: personal categories unique per (tenantId, slug) when projectId IS NULL
CREATE UNIQUE INDEX "NoteCategory_tenantId_slug_personal_key" ON "NoteCategory"("tenantId", "slug") WHERE "projectId" IS NULL;

-- CreateIndex: filter by tenant + project
CREATE INDEX "NoteCategory_tenantId_projectId_idx" ON "NoteCategory"("tenantId", "projectId");

-- AddForeignKey
ALTER TABLE "NoteCategory" ADD CONSTRAINT "NoteCategory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
