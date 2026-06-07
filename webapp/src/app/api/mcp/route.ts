import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyBearer } from '@/lib/auth';
import { sql } from 'drizzle-orm';

// POST /api/mcp
// MCP HTTP transport. JSON-RPC 2.0 over plain POST.
// Methods implemented:
//   - initialize           handshake
//   - tools/list           lists available tools
//   - tools/call           invokes a tool by name
//   - notifications/*      acknowledged with no body (e.g. notifications/initialized)
//
// Auth: Authorization: Bearer <AUTH_PASSWORD>

const SERVER_INFO = {
  name: 'notes-memory',
  version: '0.1.0',
};

const PROTOCOL_VERSION = '2025-06-18';

const TOOLS = [
  {
    name: 'search_notes',
    description:
      'Full-text search across the personal notes vault. Returns top matches with title, path, snippet, and rank. Use this when you need to recall something the user wrote about — plans, meeting notes, ideas, todos.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language search terms. Stemming applied; stop-words ignored.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (1-50, default 10).',
        },
      },
      required: ['query'],
    },
  },
];

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function searchNotes(args: Record<string, unknown>) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const limit =
    typeof args.limit === 'number' && args.limit > 0 && args.limit <= 50
      ? Math.floor(args.limit)
      : 10;

  if (query.length === 0) {
    return { content: [{ type: 'text', text: 'Error: query is required.' }], isError: true };
  }

  const result = await db.execute(sql`
    SELECT
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

  const rows = result.rows as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    return {
      content: [{ type: 'text', text: `No notes match "${query}".` }],
    };
  }

  const lines = rows.map((row, i) => {
    const date = row.updated_at ? new Date(row.updated_at as string).toISOString().slice(0, 10) : '';
    return `${i + 1}. ${row.title} — ${row.path} (${date})\n   ${row.snippet}`;
  });

  return {
    content: [
      {
        type: 'text',
        text: `Found ${rows.length} match(es) for "${query}":\n\n${lines.join('\n\n')}`,
      },
    ],
  };
}

async function handleRequest(req: JsonRpcRequest) {
  // Notifications (no id) — acknowledged silently per spec.
  if (req.id === undefined || req.id === null) {
    return null;
  }

  switch (req.method) {
    case 'initialize':
      return rpcResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'tools/list':
      return rpcResult(req.id, { tools: TOOLS });

    case 'tools/call': {
      const params = req.params ?? {};
      const name = params.name as string;
      const args = (params.arguments as Record<string, unknown>) ?? {};

      if (name === 'search_notes') {
        try {
          const tool_result = await searchNotes(args);
          return rpcResult(req.id, tool_result);
        } catch (e) {
          console.error('[MCP] search_notes failed:', e);
          return rpcError(req.id, -32000, 'search_notes failed');
        }
      }

      return rpcError(req.id, -32601, `Unknown tool: ${name}`);
    }

    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

export async function POST(request: NextRequest) {
  if (!verifyBearer(request.headers.get('authorization'))) {
    return NextResponse.json(
      rpcError(null, -32001, 'Unauthorized'),
      { status: 401 },
    );
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      rpcError(null, -32700, 'Parse error'),
      { status: 400 },
    );
  }

  // MCP supports batched requests as an array. Handle either form.
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map(handleRequest));
    const filtered = responses.filter((r) => r !== null);
    return NextResponse.json(filtered);
  }

  const response = await handleRequest(body);
  if (response === null) {
    // notification — empty body
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(response);
}
