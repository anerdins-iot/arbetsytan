-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutomationCreator" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "AutomationLogStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerAt" TIMESTAMP(3) NOT NULL,
    "recurrence" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Stockholm',
    "actionTool" TEXT NOT NULL,
    "actionParams" JSONB NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'PENDING',
    "projectId" TEXT,
    "createdBy" "AutomationCreator" NOT NULL DEFAULT 'USER',
    "sourceConversationId" TEXT,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL,
    "status" "AutomationLogStatus" NOT NULL,
    "result" JSONB,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "automationId" TEXT NOT NULL,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Automation_tenantId_status_triggerAt_idx" ON "Automation"("tenantId", "status", "triggerAt");

-- CreateIndex
CREATE INDEX "Automation_userId_tenantId_idx" ON "Automation"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "Automation_projectId_idx" ON "Automation"("projectId");

-- CreateIndex
CREATE INDEX "AutomationLog_automationId_executedAt_idx" ON "AutomationLog"("automationId", "executedAt");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
