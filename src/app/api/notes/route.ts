import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notes } from '@/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';

function checksum(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

export async function GET() {
  try {
    const allNotes = await db
      .select()
      .from(notes)
      .where(isNull(notes.deletedAt))
      .orderBy(notes.updatedAt);

    return NextResponse.json(allNotes);
  } catch (error) {
    console.error('Failed to fetch notes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, path } = body;

    if (!title || !path) {
      return NextResponse.json(
        { error: 'Title and path are required' },
        { status: 400 },
      );
    }

    const noteContent = content || '';
    const [note] = await db
      .insert(notes)
      .values({
        title,
        content: noteContent,
        path,
        checksum: checksum(noteContent),
      })
      .returning();

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Failed to create note:', error);
    return NextResponse.json(
      { error: 'Failed to create note' },
      { status: 500 },
    );
  }
}
