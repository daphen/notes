import { expect, mock, test } from 'bun:test';

let embedding = Promise.resolve([1, 0]);
let queries = [];
let results = [];

mock.module('./embed', () => ({
  embed: () => embedding,
  vectorLiteral: () => '[1,0]',
}));
mock.module('./db', () => ({
  db: {
    execute: async () => {
      queries.push(results.length);
      return { rows: results.shift() ?? [] };
    },
  },
}));

const { hybridSearch } = await import('./search');
const row = (id) => ({ id, path: `${id}.md`, title: id, snippet: id, rank: 1, similarity: 0.9, updated_at: '2026-09-23' });

test('search starts indexed text lookup while query embedding is pending, then fuses results', async () => {
  let resolveEmbedding;
  embedding = new Promise(resolve => { resolveEmbedding = resolve; });
  queries = [];
  results = [[row('text'), row('both')], [row('both'), row('semantic')]];

  const search = hybridSearch('query', 3);
  expect(queries).toHaveLength(1);
  resolveEmbedding([1, 0]);
  const answer = await search;
  expect(queries).toHaveLength(2);
  expect(answer.mode).toBe('hybrid');
  expect(answer.hits.map(hit => hit.id)).toEqual(['both', 'text', 'semantic']);
});

test('failed embedding reuses the indexed text results without another query', async () => {
  embedding = Promise.resolve(null);
  queries = [];
  results = [[row('first'), row('second'), row('third')]];

  const answer = await hybridSearch('query', 2);
  expect(queries).toHaveLength(1);
  expect(answer.mode).toBe('fts-only');
  expect(answer.hits.map(hit => hit.id)).toEqual(['first', 'second']);
});
