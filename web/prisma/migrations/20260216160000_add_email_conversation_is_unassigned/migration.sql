-- AlterTable
ALTER TABLE "EmailConversation" ADD COLUMN IF NOT EXISTS "isUnassigned" BOOLEAN NOT NULL DEFAULT false;
