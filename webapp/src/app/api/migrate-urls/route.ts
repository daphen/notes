import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notes, links } from '@/lib/db/schema';
import { isNull } from 'drizzle-orm';

function isUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchOpenGraph(url: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NotesBot/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    const html = await response.text();

    const getMetaContent = (property: string): string | undefined => {
      const regex = new RegExp(
        `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
        'i'
      );
      const match = html.match(regex);
      return match?.[1] || match?.[2];
    };

    const getTitle = (): string | undefined => {
      const ogTitle = getMetaContent('og:title');
      if (ogTitle) return ogTitle;
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      return titleMatch?.[1];
    };

    const urlObj = new URL(url);
    const favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;

    return {
      title: getTitle(),
      description: getMetaContent('og:description') || getMetaContent('description'),
      image: getMetaContent('og:image'),
      favicon,
    };
  } catch {
    return {};
  }
}

export async function POST() {
  try {
    const allNotes = await db.select().from(notes).where(isNull(notes.deletedAt));

    const migrated: string[] = [];
    const skipped: string[] = [];

    for (const note of allNotes) {
      const content = note.content.trim();

      // Check if content is just a URL (possibly with whitespace/newlines)
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      const uniqueLines = [...new Set(lines)];

      // If all non-empty lines are the same URL
      if (uniqueLines.length === 1 && isUrl(uniqueLines[0])) {
        const url = uniqueLines[0];
        const og = await fetchOpenGraph(url);

        // Create link
        await db.insert(links).values({
          url,
          title: og.title || new URL(url).hostname,
          description: og.description,
          image: og.image,
          favicon: og.favicon,
        });

        // Soft delete the note
        const { eq } = await import('drizzle-orm');
        await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, note.id));

        migrated.push(url);
      } else {
        skipped.push(note.title);
      }
    }

    return NextResponse.json({ migrated, skipped });
  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}
