import { RefreshButton } from '@/components/refresh-button';
import { db } from '@/lib/db';
import { notes } from '@/lib/db/schema';
import { isNull, desc } from 'drizzle-orm';
import { NotesList } from '@/components/notes-list';
import { NotesProvider } from '@/lib/notes-store';
import { Terminal } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const allNotes = await db
    .select()
    .from(notes)
    .where(isNull(notes.deletedAt))
    .orderBy(desc(notes.updatedAt));

  return (
    <div className="container py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Notes</h1>
          <RefreshButton />
        </div>
        <Link
          href="/cli"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          title="Install CLI"
        >
          <Terminal className="h-4 w-4" />
          <span className="hidden sm:inline">CLI</span>
        </Link>
      </header>

      <NotesProvider initialNotes={allNotes}>
        <NotesList />
      </NotesProvider>
    </div>
  );
}
