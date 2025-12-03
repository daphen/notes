import {
  pgTable,
  text,
  timestamp,
  uuid,
  serial,
  index,
} from 'drizzle-orm/pg-core';

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    path: text('path').notNull().unique(),
    checksum: text('checksum').notNull(),
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

export const links = pgTable(
  'links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    url: text('url').notNull(),
    title: text('title'),
    description: text('description'),
    image: text('image'), // OpenGraph image URL
    favicon: text('favicon'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [index('links_created_idx').on(table.createdAt)],
);

export const images = pgTable(
  'images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    url: text('url').notNull(), // Vercel Blob URL
    title: text('title'),
    sourceUrl: text('source_url'), // Original source if shared from web
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [index('images_created_idx').on(table.createdAt)],
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type SyncLogEntry = typeof syncLog.$inferSelect;
