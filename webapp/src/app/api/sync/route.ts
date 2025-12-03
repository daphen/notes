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

    console.log(`[SYNC GET] Returning ${changedNotes.length} notes:`);
    changedNotes.forEach((note) => {
      console.log(`[SYNC GET]   - ${note.path} (${note.title})`);
    });

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

    // Process changes one at a time with explicit commits
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const { path, title, content, checksum, action } = change;

      try {
        console.log(`[SYNC ${i + 1}/${changes.length}] Processing ${path} (action: ${action})`);
        console.log(`[SYNC] Title: "${title}", Content length: ${content?.length || 0}, Checksum: ${checksum}`);

        if (action === 'delete') {
          // Soft delete
          const result = await db
            .update(notes)
            .set({ deletedAt: new Date() })
            .where(eq(notes.path, path));
          console.log(`[SYNC] Delete result:`, result);
        } else {
          // Use onConflictDoUpdate which should work with Neon HTTP
          const result = await db
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
                deletedAt: null, // Clear deleted flag on upsert!
                updatedAt: new Date(),
              },
            })
            .returning();
          console.log(`[SYNC] Upsert result for ${path}:`, result);
        }

        accepted.push(path);
        console.log(`[SYNC] Successfully accepted ${path}`);

        // Log sync action (batch these at the end)
      } catch (error) {
        console.error(`[SYNC ERROR] Failed to sync ${path}:`, error);
        console.error(`[SYNC ERROR] Error details:`, JSON.stringify(error, null, 2));
        conflicts.push(path);
      }
    }

    // Batch insert sync logs
    if (accepted.length > 0) {
      try {
        await db.insert(syncLog).values(
          accepted.map((path) => ({
            action: 'update',
            clientId,
          })),
        );
      } catch (error) {
        console.error('[SYNC] Failed to log sync actions:', error);
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
