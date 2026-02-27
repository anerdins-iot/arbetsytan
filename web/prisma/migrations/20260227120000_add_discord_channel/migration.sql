-- CreateTable
CREATE TABLE "DiscordChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discordChannelId" TEXT,
    "channelType" TEXT NOT NULL DEFAULT 'text',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordChannel_discordChannelId_key" ON "DiscordChannel"("discordChannelId");

-- CreateIndex
CREATE INDEX "DiscordChannel_categoryId_idx" ON "DiscordChannel"("categoryId");

-- CreateIndex
CREATE INDEX "DiscordChannel_tenantId_idx" ON "DiscordChannel"("tenantId");

-- CreateIndex
CREATE INDEX "DiscordChannel_discordChannelId_idx" ON "DiscordChannel"("discordChannelId");

-- AddForeignKey
ALTER TABLE "DiscordChannel" ADD CONSTRAINT "DiscordChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordChannel" ADD CONSTRAINT "DiscordChannel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DiscordCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
