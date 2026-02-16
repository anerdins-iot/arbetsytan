-- CreateTable
CREATE TABLE "MessageChunk" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "MessageChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageChunk_messageId_idx" ON "MessageChunk"("messageId");

-- CreateIndex
CREATE INDEX "MessageChunk_conversationId_idx" ON "MessageChunk"("conversationId");

-- CreateIndex
CREATE INDEX "MessageChunk_tenantId_userId_idx" ON "MessageChunk"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "MessageChunk_tenantId_userId_projectId_idx" ON "MessageChunk"("tenantId", "userId", "projectId");

-- AddForeignKey
ALTER TABLE "MessageChunk" ADD CONSTRAINT "MessageChunk_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageChunk" ADD CONSTRAINT "MessageChunk_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageChunk" ADD CONSTRAINT "MessageChunk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageChunk" ADD CONSTRAINT "MessageChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageChunk" ADD CONSTRAINT "MessageChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
