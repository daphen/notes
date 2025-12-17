import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const [note] = await db
      .update(notes)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json(note);
  } catch (error) {
    console.error('Failed to restore note:', error);
    return NextResponse.json(
      { error: 'Failed to restore note' },
      { status: 500 },
    );
  }
}
