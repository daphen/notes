-- pgvector extension + embedding column for semantic search.
--
-- Vector dimension is 768 to match nomic-embed-text (the Ollama embedding
-- model running on proart). Switching providers later means a one-time
-- backfill, not a schema migration — but the dim has to match the model.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS embedding vector(768);

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS embedded_at timestamp;

-- HNSW index for cosine similarity. Far better than IVFFlat at vault
-- scale (<100k rows) and doesn't require periodic re-indexing.
CREATE INDEX IF NOT EXISTS notes_embedding_hnsw_idx
  ON notes USING hnsw (embedding vector_cosine_ops);
