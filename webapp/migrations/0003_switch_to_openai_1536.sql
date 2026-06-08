-- Switch embedding column from 768-dim (nomic-embed-text) to 1536-dim
-- (OpenAI text-embedding-3-small). The dim change requires dropping the
-- HNSW index, NULLing existing values (different vector space, can't
-- coexist), altering the column type, and rebuilding the index.
--
-- After applying, run scripts/backfill-embeddings.ts to populate the
-- new 1536-dim vectors via OpenAI.

DROP INDEX IF EXISTS notes_embedding_hnsw_idx;

UPDATE notes SET embedding = NULL, embedded_at = NULL;

ALTER TABLE notes
  ALTER COLUMN embedding TYPE vector(1536) USING NULL;

CREATE INDEX notes_embedding_hnsw_idx
  ON notes USING hnsw (embedding vector_cosine_ops);
