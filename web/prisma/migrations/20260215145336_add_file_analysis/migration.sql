-- CreateTable
CREATE TABLE "FileAnalysis" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "prompt" TEXT,
    "model" TEXT,
    "type" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,

    CONSTRAINT "FileAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileAnalysis_fileId_idx" ON "FileAnalysis"("fileId");

-- CreateIndex
CREATE INDEX "FileAnalysis_tenantId_idx" ON "FileAnalysis"("tenantId");

-- CreateIndex
CREATE INDEX "FileAnalysis_projectId_idx" ON "FileAnalysis"("projectId");

-- CreateIndex
CREATE INDEX "FileAnalysis_createdAt_idx" ON "FileAnalysis"("createdAt");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAnalysis" ADD CONSTRAINT "FileAnalysis_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAnalysis" ADD CONSTRAINT "FileAnalysis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAnalysis" ADD CONSTRAINT "FileAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAnalysis" ADD CONSTRAINT "FileAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
