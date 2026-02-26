-- CreateTable
CREATE TABLE "DiscordProjectChannel" (
    "id" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "discordCategoryId" TEXT,
    "projectId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordProjectChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordProjectChannel_discordChannelId_key" ON "DiscordProjectChannel"("discordChannelId");

-- CreateIndex
CREATE INDEX "DiscordProjectChannel_projectId_idx" ON "DiscordProjectChannel"("projectId");

-- CreateIndex
CREATE INDEX "DiscordProjectChannel_tenantId_idx" ON "DiscordProjectChannel"("tenantId");

-- CreateIndex
CREATE INDEX "DiscordProjectChannel_discordChannelId_idx" ON "DiscordProjectChannel"("discordChannelId");

-- AddForeignKey
ALTER TABLE "DiscordProjectChannel" ADD CONSTRAINT "DiscordProjectChannel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordProjectChannel" ADD CONSTRAINT "DiscordProjectChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
