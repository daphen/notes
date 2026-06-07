import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyBearer } from '@/lib/auth';
import { sql } from 'drizzle-orm';

// POST /api/search
// Body: { query: string, limit?: number }
// Header: Authorization: Bearer <AUTH_PASSWORD>
//
// Runs Postgres FTS against the notes.search_text generated column.
// ts_rank_cd weights title matches higher (weight 'A' vs 'B' from the
// migration). ts_headline returns a snippet around the matched terms.
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
    const result = await db.execute(sql`
      SELECT
        id,
        path,
        title,
        ts_rank_cd(search_text, q) AS rank,
        ts_headline(
          'english',
          content,
          q,
          'MaxFragments=2, MaxWords=20, MinWords=5, ShortWord=3, HighlightAll=FALSE'
        ) AS snippet,
        updated_at
      FROM notes, plainto_tsquery('english', ${query}) AS q
      WHERE search_text @@ q
        AND deleted_at IS NULL
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    const hits = (result.rows as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      path: row.path as string,
      title: row.title as string,
      snippet: row.snippet as string,
      rank: Number(row.rank),
      updatedAt: row.updated_at as string,
    }));

    return NextResponse.json({ query, hits });
  } catch (error) {
    console.error('[SEARCH] FTS query failed:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 },
    );
  }
}
