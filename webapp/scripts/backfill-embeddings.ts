// One-shot: embed all notes that don't yet have a 1536-dim vector. Run
// after the 0003 migration to populate the new column.
//
//   cd ~/personal/notes/webapp
//   set -a; source .env.production.local; set +a
//   export OPENAI_API_KEY=sk-...
//   bun run scripts/backfill-embeddings.ts
//
// Re-runnable: only touches notes WHERE embedding IS NULL.

import { Pool } from '@neondatabase/serverless';

const MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;
const BATCH_SIZE = 10;

async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('OPENAI_API_KEY not set');
    process.exit(1);
  }
  const input = text.slice(0, 30000).trim();
  if (!input) return null;

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODEL, input }),
  });
  if (!res.ok) {
    console.warn(`  openai ${res.status}`);
    return null;
  }
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const vec = json.data?.[0]?.embedding;
  return Array.isArray(vec) && vec.length === EMBED_DIM ? vec : null;
}

async function main() {
  const url = process.env.NOTES_POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('NOTES_POSTGRES_URL or DATABASE_URL must be set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });

  const { rows } = await pool.query<{ id: string; title: string; content: string }>(
    `SELECT id::text, title, content FROM notes
     WHERE embedding IS NULL AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
  );

  console.log(`Found ${rows.length} notes to embed via OpenAI.`);

  let ok = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      const vec = await embed(`${row.title}\n\n${row.content}`);
      if (!vec) { failed++; return; }
      const literal = `[${vec.join(',')}]`;
      await pool.query(
        `UPDATE notes SET embedding = $1::vector, embedded_at = now() WHERE id = $2`,
        [literal, row.id],
      );
      ok++;
      process.stdout.write(`\r  embedded ${ok + failed}/${rows.length}`);
    }));
  }

  console.log(`\nDone: ${ok} embedded, ${failed} failed.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
