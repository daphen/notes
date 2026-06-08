// Embed text via OpenAI's embeddings API. text-embedding-3-small returns
// 1536-dim vectors at ~$0.02/M tokens. Server-side only — the API key
// never leaves Vercel's function runtime.
//
// Returns null on any failure so the rest of the stack (FTS) keeps
// working when OpenAI is unreachable or the key isn't set.

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;
const TIMEOUT_MS = 10_000;

export async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn('[embed] OPENAI_API_KEY not set');
    return null;
  }

  // OpenAI's model supports 8191 tokens (~30K chars); truncate as a
  // safety belt. The cut tail is still FTS-searchable.
  const input = text.slice(0, 30000).trim();
  if (input.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[embed] OpenAI returned ${res.status}: ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = json.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
      console.warn('[embed] unexpected response shape', { dim: vec?.length });
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
