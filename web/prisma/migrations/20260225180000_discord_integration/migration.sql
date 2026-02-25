-- CreateEnum
CREATE TYPE "DiscordCategoryType" AS ENUM ('PROJECTS', 'SUPPORT', 'GENERAL', 'WELCOME', 'CUSTOM');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "discordGuildId" TEXT,
ADD COLUMN "discordBotEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_discordGuildId_key" ON "Tenant"("discordGuildId");

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "discordChannelId" TEXT,
ADD COLUMN "discordChannelName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_discordChannelId_key" ON "Project"("discordChannelId");

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "discordChannelId" TEXT,
ADD COLUMN "discordUserId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_discordChannelId_idx" ON "Conversation"("discordChannelId");
CREATE INDEX "Conversation_discordUserId_idx" ON "Conversation"("discordUserId");

-- CreateTable
CREATE TABLE "DiscordCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discordCategoryId" TEXT,
    "type" "DiscordCategoryType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordMessage" (
    "id" TEXT NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordRoleMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemRole" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "discordRoleName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordCategory_tenantId_type_key" ON "DiscordCategory"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordMessage_discordMessageId_key" ON "DiscordMessage"("discordMessageId");
CREATE INDEX "DiscordMessage_discordChannelId_idx" ON "DiscordMessage"("discordChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordRoleMapping_tenantId_systemRole_key" ON "DiscordRoleMapping"("tenantId", "systemRole");
CREATE INDEX "DiscordRoleMapping_discordRoleId_idx" ON "DiscordRoleMapping"("discordRoleId");

-- AddForeignKey
ALTER TABLE "DiscordCategory" ADD CONSTRAINT "DiscordCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordMessage" ADD CONSTRAINT "DiscordMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordRoleMapping" ADD CONSTRAINT "DiscordRoleMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
