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

  // ~750 tokens at 4 chars/token; safe even for token-dense content
  // (code, URLs). The truncated tail is still FTS-searchable.
  const input = text.slice(0, 3000).trim();
  if (input.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input,
        // nomic-embed-text supports 8192 tokens; default ctx is 2048 which
        // truncates long notes silently. Override so plans/design docs fit.
        options: { num_ctx: 8192 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[embed] Ollama returned ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { embeddings?: number[][] };
    const vec = json.embeddings?.[0];
    if (!Array.isArray(vec) || vec.length !== 768) {
      console.warn('[embed] unexpected response shape', json);
      return null;
    }
    return vec;
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
