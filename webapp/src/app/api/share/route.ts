import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notes } from '@/lib/db/schema';
import { createHash } from 'crypto';

function checksum(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

function generatePath(): string {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `shared/${timestamp}.md`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const title = formData.get('title') as string | null;
    const text = formData.get('text') as string | null;
    const url = formData.get('url') as string | null;

    // Build content from shared data
    let content = '';
    if (text) content += text;
    if (url) content += content ? `\n\n${url}` : url;

    const noteTitle = title || 'Shared Note';
    const noteContent = content || '';

    const [note] = await db
      .insert(notes)
      .values({
        title: noteTitle,
        content: noteContent,
        path: generatePath(),
        checksum: checksum(noteContent),
      })
      .returning();

    // Redirect to the note editor after sharing
    return NextResponse.redirect(
      new URL(`/notes/${note.id}`, request.url),
      303,
    );
  } catch (error) {
    console.error('Failed to create shared note:', error);
    return NextResponse.redirect(new URL('/?error=share-failed', request.url));
  }
}
