-- AlterTable
ALTER TABLE "Note" ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Note_createdById_projectId_idx" ON "Note"("createdById", "projectId");
