-- Fix KnowledgeEntity.embedding column to vector(1536)
-- Previous migration created the column as vector (no dimension) which PostgreSQL interprets as 384
-- This causes "different vector dimensions 384 and 1536" error when searching

-- Drop and recreate the column with correct dimension
-- Data loss is acceptable since existing data has wrong dimension (384) anyway
ALTER TABLE "KnowledgeEntity" DROP COLUMN "embedding";
ALTER TABLE "KnowledgeEntity" ADD COLUMN "embedding" vector(1536);
