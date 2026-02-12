-- Create IVFFlat index for cosine similarity search on DocumentChunk embeddings.
-- This significantly speeds up vector searches for large datasets.
-- lists = 100 is a reasonable default for up to ~1M rows.
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_cosine_idx"
  ON "DocumentChunk"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);

-- SQL function for cosine similarity search within a project, scoped by tenantId.
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_project_id TEXT,
  match_tenant_id TEXT,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10
)
RETURNS TABLE(
  id TEXT,
  content TEXT,
  similarity FLOAT,
  page INT,
  "fileId" TEXT,
  "fileName" TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc."id",
    dc."content",
    (1 - (dc."embedding" <=> query_embedding))::FLOAT AS similarity,
    dc."page",
    dc."fileId",
    f."name" AS "fileName"
  FROM "DocumentChunk" dc
  JOIN "File" f ON f."id" = dc."fileId"
  JOIN "Project" p ON p."id" = dc."projectId"
  WHERE dc."projectId" = match_project_id
    AND p."tenantId" = match_tenant_id
    AND dc."embedding" IS NOT NULL
    AND (1 - (dc."embedding" <=> query_embedding)) > match_threshold
  ORDER BY dc."embedding" <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
