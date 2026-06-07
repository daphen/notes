-- Full-text search over notes.
--
-- search_text is a generated tsvector column that concatenates title +
-- content with title weighted higher. The GIN index makes the @@ match
-- against plainto_tsquery O(log n) instead of O(n).
--
-- Apply once against the live Neon DB:
--   psql "$DATABASE_URL" -f drizzle/0001_add_fts.sql
-- or paste into the Neon console SQL editor.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS search_text tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS notes_search_text_idx
  ON notes USING GIN (search_text);
