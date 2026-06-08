// Hybrid search: FTS rank + semantic cosine similarity combined via
// Reciprocal Rank Fusion (RRF). Falls back to FTS-only when Ollama is
// unreachable (embed() returns null).
//
// RRF formula: score(d) = Σ 1 / (k + rank_i(d))
// where rank_i is the rank of doc d under ranker i (FTS or vector).
// k=60 is the canonical choice — robust to relative score magnitudes.

import { db } from './db';
import { embed, vectorLiteral } from './embed';
import { sql } from 'drizzle-orm';

const RRF_K = 60;

export type SearchHit = {
  id: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
  updatedAt: string;
};

export async function hybridSearch(
  query: string,
  limit: number = 10,
): Promise<{ hits: SearchHit[]; mode: 'hybrid' | 'fts-only' }> {
  // Pull a wider pool from each ranker than the requested limit so RRF
  // can find overlaps. 3× is a reasonable default.
  const pool = limit * 3;

  const queryVec = await embed(query);

  if (!queryVec) {
    // FTS-only path: Ollama unreachable, just return text matches.
    const fts = await ftsSearch(query, limit);
    return { hits: fts, mode: 'fts-only' };
  }

  // Hybrid path: run FTS and vector queries, fuse via RRF.
  const [fts, semantic] = await Promise.all([
    ftsRankList(query, pool),
    vectorRankList(queryVec, pool),
  ]);

  const fused = new Map<string, { hit: SearchHit; score: number }>();

  fts.forEach((hit, i) => {
    const score = 1 / (RRF_K + i + 1);
    fused.set(hit.id, { hit, score });
  });
  semantic.forEach((hit, i) => {
    const score = 1 / (RRF_K + i + 1);
    const existing = fused.get(hit.id);
    if (existing) {
      existing.score += score;
    } else {
      fused.set(hit.id, { hit, score });
    }
  });

  const ranked = Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, score }));

  return { hits: ranked, mode: 'hybrid' };
}

// FTS path that returns hits with snippets (for FTS-only fallback).
async function ftsSearch(query: string, limit: number): Promise<SearchHit[]> {
  const result = await db.execute(sql`
    SELECT
      id::text AS id,
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

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    path: row.path as string,
    title: row.title as string,
    snippet: row.snippet as string,
    score: Number(row.rank),
    updatedAt: String(row.updated_at),
  }));
}

// FTS ranked-list (no snippet — used inside the hybrid path; snippets
// regenerated below after the fusion picks winners).
async function ftsRankList(query: string, limit: number): Promise<SearchHit[]> {
  const result = await db.execute(sql`
    SELECT
      id::text AS id,
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

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    path: row.path as string,
    title: row.title as string,
    snippet: row.snippet as string,
    score: Number(row.rank),
    updatedAt: String(row.updated_at),
  }));
}

// Vector ranked-list. Uses pgvector's <=> operator for cosine distance
// (smaller = more similar). The HNSW index handles this in O(log n).
async function vectorRankList(queryVec: number[], limit: number): Promise<SearchHit[]> {
  const vecLit = vectorLiteral(queryVec);
  const result = await db.execute(sql`
    SELECT
      id::text AS id,
      path,
      title,
      1 - (embedding <=> ${vecLit}::vector) AS similarity,
      LEFT(content, 240) AS snippet,
      updated_at
    FROM notes
    WHERE embedding IS NOT NULL
      AND deleted_at IS NULL
    ORDER BY embedding <=> ${vecLit}::vector
    LIMIT ${limit}
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    path: row.path as string,
    title: row.title as string,
    snippet: row.snippet as string,
    score: Number(row.similarity),
    updatedAt: String(row.updated_at),
  }));
}
