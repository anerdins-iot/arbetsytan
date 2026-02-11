-- Enable pgvector extension for semantic search (see AI.md)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to DocumentChunk for OpenAI embeddings (1536 dimensions for text-embedding-3-small)
ALTER TABLE "DocumentChunk" ADD COLUMN "embedding" vector(1536);
