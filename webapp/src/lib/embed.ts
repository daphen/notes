// Embed text via the Ollama instance running on proart, exposed publicly
// via Tailscale Funnel at OLLAMA_URL. Returns null on any failure so the
// rest of the stack (FTS) keeps working when proart is asleep / unreachable.
//
// Model: nomic-embed-text (768-dim). Must match the vector column dimension
// in schema.ts.

const EMBED_MODEL = 'nomic-embed-text';
const TIMEOUT_MS = 5000;

export async function embed(text: string): Promise<number[] | null> {
  const url = process.env.OLLAMA_URL;
  if (!url) return null;

  // Ollama charges for tokens at the boundary; trim aggressively. nomic
  // supports 8192 tokens (~32KB), but we don't need full notes — title +
  // first paragraph captures the gist for retrieval purposes.
  const input = text.slice(0, 8000).trim();
  if (input.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: input }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[embed] Ollama returned ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(json.embedding) || json.embedding.length !== 768) {
      console.warn('[embed] unexpected response shape', json);
      return null;
    }
    return json.embedding;
  } catch (e) {
    clearTimeout(timeout);
    console.warn('[embed] failed:', (e as Error).message);
    return null;
  }
}

// Used by the SQL layer for vector literal binding.
export function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
