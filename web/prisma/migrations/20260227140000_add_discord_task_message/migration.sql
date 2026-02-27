-- CreateTable
CREATE TABLE "DiscordTaskMessage" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordTaskMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordTaskMessage_discordMessageId_idx" ON "DiscordTaskMessage"("discordMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordTaskMessage_taskId_discordMessageId_key" ON "DiscordTaskMessage"("taskId", "discordMessageId");

-- AddForeignKey
ALTER TABLE "DiscordTaskMessage" ADD CONSTRAINT "DiscordTaskMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
