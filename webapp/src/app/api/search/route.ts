import { NextRequest, NextResponse } from 'next/server';
import { verifyBearer } from '@/lib/auth';
import { hybridSearch } from '@/lib/search';

// POST /api/search
// Body: { query: string, limit?: number }
// Header: Authorization: Bearer <AUTH_PASSWORD>
//
// Runs hybrid (FTS + vector) search via lib/search.ts. Falls back to
// FTS-only when proart's Ollama is unreachable.
export async function POST(request: NextRequest) {
  if (!verifyBearer(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { query?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const limit =
    typeof body.limit === 'number' && body.limit > 0 && body.limit <= 50
      ? Math.floor(body.limit)
      : 10;

  if (query.length === 0) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  try {
    const { hits, mode } = await hybridSearch(query, limit);
    return NextResponse.json({ query, mode, hits });
  } catch (error) {
    console.error('[SEARCH] failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
