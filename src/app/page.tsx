import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { notes } from '@/lib/db/schema';
import { isNull } from 'drizzle-orm';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const allNotes = await db
    .select()
    .from(notes)
    .where(isNull(notes.deletedAt))
    .orderBy(desc(notes.updatedAt));

  return (
    <div className="container py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notes</h1>
        <Button asChild size="sm">
          <Link href="/new">
            <Plus className="mr-2 h-4 w-4" />
            New Note
          </Link>
        </Button>
      </header>

      {allNotes.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <p>No notes yet. Create your first note!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {allNotes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="border-border hover:bg-muted/50 block rounded-lg border p-4 transition-colors"
            >
              <h2 className="font-semibold">{note.title}</h2>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                {note.content.slice(0, 150)}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                {new Date(note.updatedAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
