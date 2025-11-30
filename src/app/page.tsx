import { RefreshButton } from '@/components/refresh-button';
import { db } from '@/lib/db';
import { notes, links, images } from '@/lib/db/schema';
import { isNull, desc } from 'drizzle-orm';
import { HomeContent } from '@/components/home-content';
import { NotesProvider } from '@/lib/notes-store';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [allNotes, allLinks, allImages] = await Promise.all([
    db.select().from(notes).where(isNull(notes.deletedAt)).orderBy(desc(notes.updatedAt)),
    db.select().from(links).where(isNull(links.deletedAt)).orderBy(desc(links.createdAt)),
    db.select().from(images).where(isNull(images.deletedAt)).orderBy(desc(images.createdAt)),
  ]);

  return (
    <div className="container py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Notes</h1>
          <RefreshButton />
        </div>
      </header>

      <NotesProvider initialNotes={allNotes}>
        <HomeContent notes={allNotes} links={allLinks} images={allImages} />
      </NotesProvider>
    </div>
  );
}
