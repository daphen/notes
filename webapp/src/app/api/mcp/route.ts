import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notes } from '@/lib/db/schema';
import { verifyBearer } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import { embed } from '@/lib/embed';
import { hybridSearch } from '@/lib/search';

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
      'Hybrid semantic + full-text search across the personal notes vault: every note is embedded on save (OpenAI text-embedding-3-small), and this fuses vector cosine similarity with Postgres FTS via reciprocal-rank fusion — so it recalls conceptually-related notes even when they share no keywords, falling back to FTS-only if embeddings are unavailable. Returns top matches with title, path, snippet, and rank. Use it to recall anything the user wrote about — plans, meeting notes, ideas, todos, or saved memories.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language search terms — phrase it by meaning, not just keywords (semantic recall handles paraphrase).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (1-50, default 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'save_memory',
    description:
      "Save a durable memory to the user's vault. Use this for facts about the user, their preferences, project context, or feedback to apply in future conversations. Replaces the old filesystem-local auto-memory — anything saved here is reachable from every Claude session (proart, lovbox, Lovable agent, mobile).",
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Kebab-case slug used as filename. Example: "user-prefers-rust" or "project-q4-launch".',
        },
        description: {
          type: 'string',
          description: 'One-line summary used to decide relevance in future conversations. Be specific.',
        },
        type: {
          type: 'string',
          enum: ['user', 'feedback', 'project', 'reference'],
          description: 'Memory type: user (profile/role), feedback (corrections/preferences), project (work context), reference (external pointers).',
        },
        content: {
          type: 'string',
          description: 'The memory body in markdown. For feedback/project, include why and how-to-apply lines.',
        },
      },
      required: ['name', 'description', 'type', 'content'],
    },
  },
  {
    name: 'save_note',
    description:
      "Save a new note to the user's vault. Use this when the user asks you to write something down — an idea, a plan, a reference. For plans/meetings/references provide a title slug; ad-hoc captures land in inbox/.",
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Markdown body of the note.',
        },
        type: {
          type: 'string',
          enum: ['note', 'plan', 'meeting', 'reference'],
          description: 'Routes to: note → inbox/, plan → plans/, meeting → meetings/, reference → references/.',
        },
        title: {
          type: 'string',
          description: 'Kebab-case slug for filename. Optional for type=note (date-time used). Recommended for plan/meeting/reference.',
        },
      },
      required: ['content', 'type'],
    },
  },
  {
    name: 'add_todo',
    description:
      "Append a checkbox task to today's daily journal. Use this when the user says 'remember to X' or 'I should Y'.",
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The task text. Will be written as `- [ ] {text}` under the ## Tasks section.',
        },
      },
      required: ['text'],
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isoTime() {
  return new Date().toISOString().slice(11, 16).replace(':', '');
}

function checksum(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// Upsert a note row by path. Computes embedding inline so MCP-written
// notes are semantically searchable right away (rather than waiting for
// the backfill cron). Embedding failures degrade gracefully — note still
// saves, FTS still works, backfill picks up null embeddings later.
async function upsertNote(path: string, title: string, content: string) {
  const embedding = await embed(`${title}\n\n${content}`);

  const result = await db
    .insert(notes)
    .values({
      title,
      content,
      path,
      checksum: checksum(content),
      embedding: embedding ?? undefined,
      embeddedAt: embedding ? new Date() : undefined,
    })
    .onConflictDoUpdate({
      target: notes.path,
      set: {
        title,
        content,
        checksum: checksum(content),
        deletedAt: null,
        updatedAt: new Date(),
        ...(embedding ? { embedding, embeddedAt: new Date() } : {}),
      },
    })
    .returning({ id: notes.id, createdAt: notes.createdAt, updatedAt: notes.updatedAt });

  const row = result[0];
  const created = row.createdAt.getTime() === row.updatedAt.getTime();
  return { path, created, embedded: embedding !== null };
}

async function saveMemory(args: Record<string, unknown>) {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const description = typeof args.description === 'string' ? args.description.trim() : '';
  const type = typeof args.type === 'string' ? args.type : '';
  const content = typeof args.content === 'string' ? args.content : '';

  if (!name || !description || !type || !content) {
    return { content: [{ type: 'text', text: 'Error: name, description, type, and content are all required.' }], isError: true };
  }
  if (!['user', 'feedback', 'project', 'reference'].includes(type)) {
    return { content: [{ type: 'text', text: `Error: type must be one of user|feedback|project|reference, got "${type}".` }], isError: true };
  }

  const slug = slugify(name);
  const path = `memory/${slug}.md`;
  const body = `---
name: ${slug}
description: ${description}
metadata:
  type: ${type}
---

${content.trimEnd()}
`;

  const result = await upsertNote(path, description, body);
  return {
    content: [{
      type: 'text',
      text: `${result.created ? 'Saved' : 'Updated'} memory at ${result.path}. It will appear in the vault on next sync and be searchable via search_notes.`,
    }],
  };
}

async function saveNote(args: Record<string, unknown>) {
  const content = typeof args.content === 'string' ? args.content : '';
  const type = typeof args.type === 'string' ? args.type : 'note';
  const titleArg = typeof args.title === 'string' ? args.title.trim() : '';

  if (!content) {
    return { content: [{ type: 'text', text: 'Error: content is required.' }], isError: true };
  }
  if (!['note', 'plan', 'meeting', 'reference'].includes(type)) {
    return { content: [{ type: 'text', text: `Error: type must be one of note|plan|meeting|reference, got "${type}".` }], isError: true };
  }

  const folder = type === 'note' ? 'inbox' : `${type}s`;
  const date = isoDate();
  const slug = titleArg ? slugify(titleArg) : `${date}-${isoTime()}`;
  const filename = type === 'note' && !titleArg
    ? `${date}-${isoTime()}.md`
    : type === 'meeting'
      ? `${date}-${slug}.md`
      : `${slug}.md`;
  const path = `${folder}/${filename}`;

  // Derive a title from the first heading or first non-blank line.
  let displayTitle = titleArg || slug;
  const firstHeading = content.match(/^#\s+(.+)/m);
  if (firstHeading) displayTitle = firstHeading[1].trim();

  const frontmatter = `---
type: ${type}
created: ${date}
tags: [${type}]
---

`;
  const body = content.startsWith('---') ? content : frontmatter + content.trimStart();

  const result = await upsertNote(path, displayTitle, body);
  return {
    content: [{
      type: 'text',
      text: `${result.created ? 'Saved' : 'Updated'} note at ${result.path}.`,
    }],
  };
}

async function addTodo(args: Record<string, unknown>) {
  const text = typeof args.text === 'string' ? args.text.trim() : '';
  if (!text) {
    return { content: [{ type: 'text', text: 'Error: text is required.' }], isError: true };
  }

  const date = isoDate();
  const path = `journal/${date}.md`;
  const existing = await db.select().from(notes).where(eq(notes.path, path)).limit(1);

  let body: string;
  if (existing.length === 0) {
    body = `---
type: daily
created: ${date}
tags: [daily]
---

# ${date}

## Focus

-

## Tasks

- [ ] ${text}

## Notes

`;
  } else {
    const current = existing[0].content;
    if (current.match(/^## Tasks\s*$/m)) {
      // Insert a new task line right after "## Tasks".
      body = current.replace(/^(## Tasks\s*)$/m, `$1\n\n- [ ] ${text}`);
      // Avoid duplicating the leading "- [ ]" placeholder if present.
      body = body.replace(/^## Tasks\s*\n\n- \[ \] \n\n- \[ \] /m, '## Tasks\n\n- [ ] ');
    } else {
      body = current.trimEnd() + `\n\n## Tasks\n\n- [ ] ${text}\n`;
    }
  }

  const result = await upsertNote(path, date, body);
  return {
    content: [{
      type: 'text',
      text: `Added todo "${text}" to ${result.path}.`,
    }],
  };
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

  const { hits, mode } = await hybridSearch(query, limit);

  if (hits.length === 0) {
    return {
      content: [{ type: 'text', text: `No notes match "${query}".` }],
    };
  }

  const modeNote = mode === 'fts-only'
    ? ' (FTS only — semantic embedder unreachable)'
    : '';
  const lines = hits.map((hit, i) => {
    const date = hit.updatedAt ? new Date(hit.updatedAt).toISOString().slice(0, 10) : '';
    return `${i + 1}. ${hit.title} — ${hit.path} (${date})\n   ${hit.snippet}`;
  });

  return {
    content: [
      {
        type: 'text',
        text: `Found ${hits.length} match(es) for "${query}"${modeNote}:\n\n${lines.join('\n\n')}`,
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

      const handlers: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {
        search_notes: searchNotes,
        save_memory: saveMemory,
        save_note: saveNote,
        add_todo: addTodo,
      };

      const handler = handlers[name];
      if (!handler) {
        return rpcError(req.id, -32601, `Unknown tool: ${name}`);
      }

      try {
        const tool_result = await handler(args);
        return rpcResult(req.id, tool_result);
      } catch (e) {
        console.error(`[MCP] ${name} failed:`, e);
        return rpcError(req.id, -32000, `${name} failed`);
      }
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
