/*
  Warnings:

  - Added the required column `tenantId` to the `TimeEntry` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TimeEntryType" AS ENUM ('WORK', 'VACATION', 'SICK', 'VAB', 'PARENTAL', 'EDUCATION', 'OTHER');

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "entryType" "TimeEntryType" NOT NULL DEFAULT 'WORK',
ADD COLUMN     "tenantId" TEXT NOT NULL,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
