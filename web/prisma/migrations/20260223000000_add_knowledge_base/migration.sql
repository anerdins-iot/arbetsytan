-- CreateTable
CREATE TABLE "KnowledgeEntity" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRelation" (
    "id" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeEntity_tenantId_entityType_entityId_idx" ON "KnowledgeEntity"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "KnowledgeRelation_tenantId_fromEntityId_toEntityId_idx" ON "KnowledgeRelation"("tenantId", "fromEntityId", "toEntityId");
