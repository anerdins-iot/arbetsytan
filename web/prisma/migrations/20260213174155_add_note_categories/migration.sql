-- CreateTable
CREATE TABLE "NoteCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteCategory_tenantId_idx" ON "NoteCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteCategory_tenantId_slug_key" ON "NoteCategory"("tenantId", "slug");

-- AddForeignKey
ALTER TABLE "NoteCategory" ADD CONSTRAINT "NoteCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
