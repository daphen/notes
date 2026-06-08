import {
  pgTable,
  text,
  timestamp,
  uuid,
  serial,
  index,
  customType,
} from 'drizzle-orm/pg-core';

// pgvector column. 768-dim to match nomic-embed-text (the Ollama
// embedding model running on proart). Stored as a JSON-encoded array
// string, parsed back to number[] on read.
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string) {
    return JSON.parse(value) as number[];
  },
});

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    path: text('path').notNull().unique(),
    checksum: text('checksum').notNull(),
    embedding: vector('embedding'),
    embeddedAt: timestamp('embedded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [index('notes_path_idx').on(table.path)],
);

export const syncLog = pgTable(
  'sync_log',
  {
    id: serial('id').primaryKey(),
    noteId: uuid('note_id').references(() => notes.id),
    action: text('action').notNull(), // 'create', 'update', 'delete'
    clientId: text('client_id').notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => [index('sync_log_timestamp_idx').on(table.timestamp)],
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type SyncLogEntry = typeof syncLog.$inferSelect;
