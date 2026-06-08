// One-shot script: embed all notes that don't have an embedding yet.
// Run on proart so it can hit localhost:11434 directly — no Funnel needed.
//
//   cd ~/personal/notes/webapp
//   set -a; source .env.production.local; set +a
//   bun run scripts/backfill-embeddings.ts
//
// Re-runnable: only touches notes WHERE embedding IS NULL. Failures on
// individual notes don't abort the loop.

import { Pool } from '@neondatabase/serverless';

const OLLAMA = process.env.OLLAMA_LOCAL_URL || 'http://localhost:11434';
const MODEL = 'nomic-embed-text';
const BATCH_SIZE = 4;

async function embed(text: string): Promise<number[] | null> {
  // Newer /api/embed endpoint; older /api/embeddings ignored num_ctx and
  // capped at 2048 tokens which choked on plans/design-doc notes.
  // ~1.5K tokens at 4 chars/token; safely under default ctx even for
  // token-dense content (code, URLs). Long notes lose the tail from the
  // embedding but are still discoverable via FTS.
  const input = text.slice(0, 3000).trim();
  if (!input) return null;
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input,
      options: { num_ctx: 8192 },
    }),
  });
  if (!res.ok) {
    console.warn(`  ollama ${res.status}`);
    return null;
  }
  const json = (await res.json()) as { embeddings?: number[][] };
  return Array.isArray(json.embeddings?.[0]) ? json.embeddings[0] : null;
}

async function main() {
  const url = process.env.NOTES_POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('NOTES_POSTGRES_URL or DATABASE_URL must be set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });

  // Ping Ollama first so we fail fast if it's not running.
  try {
    const ping = await fetch(`${OLLAMA}/api/tags`);
    if (!ping.ok) throw new Error(`${ping.status}`);
  } catch (e) {
    console.error(`Ollama not reachable at ${OLLAMA}:`, (e as Error).message);
    process.exit(1);
  }

  const { rows } = await pool.query<{ id: string; title: string; content: string }>(
    `SELECT id::text, title, content FROM notes
     WHERE embedding IS NULL AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
  );

  console.log(`Found ${rows.length} notes to embed.`);

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
