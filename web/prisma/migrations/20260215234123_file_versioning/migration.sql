-- AlterTable
ALTER TABLE "File" ADD COLUMN     "parentFileId" TEXT,
ADD COLUMN     "versionNumber" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_parentFileId_fkey" FOREIGN KEY ("parentFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
