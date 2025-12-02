import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notes, syncLog } from '@/lib/db/schema';
import { eq, gt, isNull } from 'drizzle-orm';

// GET: Pull changes since timestamp
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');

    let query = db
      .select()
      .from(notes)
      .where(isNull(notes.deletedAt));

    if (since) {
      const sinceDate = new Date(since);
      query = db
        .select()
        .from(notes)
        .where(gt(notes.updatedAt, sinceDate));
    }

    const changedNotes = await query;

    return NextResponse.json({
      changes: changedNotes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to fetch sync changes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch changes' },
      { status: 500 },
    );
  }
}

// POST: Push local changes
// Pure CRUD - accepts pre-processed data from client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, changes } = body;

    if (!clientId || !changes) {
      return NextResponse.json(
        { error: 'clientId and changes are required' },
        { status: 400 },
      );
    }

    const accepted: string[] = [];
    const conflicts: string[] = [];

    for (const change of changes) {
      const { path, title, content, checksum, action } = change;

      try {
        if (action === 'delete') {
          // Soft delete
          await db
            .update(notes)
            .set({ deletedAt: new Date() })
            .where(eq(notes.path, path));
        } else {
          // Simple upsert - client sends all processed data
          await db
            .insert(notes)
            .values({
              title: title || 'Untitled',
              content: content || '',
              path,
              checksum: checksum || '',
            })
            .onConflictDoUpdate({
              target: notes.path,
              set: {
                title: title || 'Untitled',
                content: content || '',
                checksum: checksum || '',
                updatedAt: new Date(),
              },
            });
        }

        accepted.push(path);

        // Log sync action
        await db.insert(syncLog).values({
          action: action || 'update',
          clientId,
        });
      } catch (error) {
        console.error(`Failed to sync ${path}:`, error);
        conflicts.push(path);
      }
    }

    return NextResponse.json({ accepted, conflicts });
  } catch (error) {
    console.error('Failed to process sync:', error);
    return NextResponse.json(
      { error: 'Failed to process sync' },
      { status: 500 },
    );
  }
}
