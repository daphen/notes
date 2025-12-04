'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import type { Note } from '@/lib/db/schema';

type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error';

interface NoteWithSync extends Note {
  _syncStatus?: SyncStatus;
  _tempId?: string;
}

interface NotesContextValue {
  notes: NoteWithSync[];
  addNote: (title: string, content: string) => NoteWithSync;
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => void;
  deleteNote: (id: string) => void;
  syncStatus: SyncStatus;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotes() {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotes must be used within NotesProvider');
  }
  return context;
}

interface NotesProviderProps {
  children: ReactNode;
  initialNotes: Note[];
}

const NOTES_CACHE_KEY = 'notes-offline-cache';

function getCachedNotes(): Note[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(NOTES_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

function setCachedNotes(notes: Note[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(notes));
  } catch {
    // localStorage might be full or unavailable
  }
}

// Sort notes by updatedAt descending (most recent first)
function sortByUpdatedAt(notes: NoteWithSync[]): NoteWithSync[] {
  return [...notes].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function NotesProvider({ children, initialNotes }: NotesProviderProps) {
  // Use cached notes if server notes are empty (offline/slow connection)
  const cachedNotes = getCachedNotes();
  const startingNotes = initialNotes.length > 0 ? initialNotes : cachedNotes;

  const [notes, setNotes] = useState<NoteWithSync[]>(
    sortByUpdatedAt(startingNotes.map((n) => ({ ...n, _syncStatus: 'synced' })))
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');

  // Update notes when initialNotes changes (e.g., after page refresh)
  useEffect(() => {
    if (initialNotes.length === 0) return; // Don't clear cache with empty data

    setNotes((currentNotes) => {
      // Merge server notes with local pending changes
      const pendingNotes = currentNotes.filter(
        (n) => n._syncStatus === 'pending' || n._syncStatus === 'syncing'
      );
      const serverNotes = initialNotes.map((n) => ({ ...n, _syncStatus: 'synced' as SyncStatus }));

      // Keep pending notes that aren't on server yet, add all server notes
      const pendingIds = new Set(pendingNotes.map((n) => n._tempId || n.id));
      const mergedNotes = [
        ...pendingNotes,
        ...serverNotes.filter((n) => !pendingIds.has(n.id)),
      ];

      return sortByUpdatedAt(mergedNotes);
    });

    // Cache server notes for offline use
    setCachedNotes(initialNotes);
  }, [initialNotes]);
  const syncQueueRef = useRef<Map<string, { fn: () => Promise<void>; type: 'create' | 'update' | 'delete'; title: string }>>(new Map());
  const processingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Process sync queue
  const processQueue = useCallback(async () => {
    if (processingRef.current || syncQueueRef.current.size === 0) return;

    processingRef.current = true;
    setSyncStatus('syncing');

    while (syncQueueRef.current.size > 0) {
      const entry = syncQueueRef.current.entries().next().value;
      if (!entry) break;
      const [id, { fn: syncFn, type, title }] = entry;
      syncQueueRef.current.delete(id);

      try {
        await syncFn();

        // Show success toast based on operation type (skip updates to avoid spam)
        if (type === 'create') {
          toast.success('Note created', { description: title });
        } else if (type === 'delete') {
          toast.success('Note deleted', { description: title });
        }
        // Updates sync silently
      } catch (error) {
        console.error('Sync failed:', error);
        toast.error('Sync failed', {
          description: `Failed to ${type} "${title}"`,
        });
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id || n._tempId === id ? { ...n, _syncStatus: 'error' } : n
          )
        );
      }
    }

    processingRef.current = false;
    setSyncStatus('synced');
  }, []);

  // Debounced queue processing for updates
  const processQueueDebounced = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      processQueue();
    }, 500);
  }, [processQueue]);

  // Add note with optimistic update
  const addNote = useCallback(
    (title: string, content: string): NoteWithSync => {
      const tempId = `temp-${Date.now()}`;
      const slug = title.toLowerCase().replace(/\s+/g, '-');
      const path = `${slug}-${Date.now()}.md`;
      const now = new Date();

      const optimisticNote: NoteWithSync = {
        id: tempId,
        title,
        content,
        path,
        checksum: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        _syncStatus: 'pending',
        _tempId: tempId,
      };

      setNotes((prev) => [optimisticNote, ...prev]);

      // Don't auto-sync - wait for user to save
      return optimisticNote;
    },
    [processQueue]
  );

  // Update note with optimistic update
  const updateNote = useCallback(
    (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => {
      const note = notes.find((n) => n.id === id);
      const noteTitle = updates.title || note?.title || 'Untitled';
      const isTemp = id.startsWith('temp-');

      // Update local state and re-sort to move updated note to top
      setNotes((prev) =>
        sortByUpdatedAt(
          prev.map((n) =>
            n.id === id
              ? { ...n, ...updates, updatedAt: new Date(), _syncStatus: 'pending' }
              : n
          )
        )
      );

      if (isTemp) {
        // Create new note on server
        syncQueueRef.current.set(`create-${id}`, {
          type: 'create',
          title: noteTitle,
          fn: async () => {
            const currentNote = await new Promise<NoteWithSync | undefined>((resolve) => {
              setNotes((prev) => {
                resolve(prev.find((n) => n.id === id));
                return prev;
              });
            });

            if (!currentNote) return;

            const res = await fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: currentNote.title,
                content: currentNote.content,
                path: currentNote.path,
              }),
            });

            if (!res.ok) throw new Error('Failed to create note');

            const serverNote: Note = await res.json();

            setNotes((prev) =>
              prev.map((n) =>
                n.id === id
                  ? { ...serverNote, _syncStatus: 'synced', _tempId: n._tempId }
                  : n
              )
            );
          },
        });
      } else {
        // Update existing note on server
        syncQueueRef.current.set(`update-${id}`, {
          type: 'update',
          title: noteTitle,
          fn: async () => {
            const res = await fetch(`/api/notes/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
            });

            if (!res.ok) throw new Error('Failed to update note');

            setNotes((prev) =>
              prev.map((n) => (n.id === id ? { ...n, _syncStatus: 'synced' } : n))
            );
          },
        });
      }

      processQueue();
    },
    [notes, processQueue]
  );

  // Delete note with optimistic update
  const deleteNote = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      const noteTitle = note?.title || 'Untitled';

      setNotes((prev) => prev.filter((n) => n.id !== id));

      // If it's a temp note that hasn't been synced yet, just remove from queue
      if (id.startsWith('temp-')) {
        syncQueueRef.current.delete(id);
        toast.success('Note deleted', { description: noteTitle });
        return;
      }

      syncQueueRef.current.set(`delete-${id}`, {
        type: 'delete',
        title: noteTitle,
        fn: async () => {
          const res = await fetch(`/api/notes/${id}`, {
            method: 'DELETE',
          });

          if (!res.ok) throw new Error('Failed to delete note');
        },
      });

      processQueue();
    },
    [notes, processQueue]
  );

  // Derive overall sync status
  useEffect(() => {
    const hasPending = notes.some((n) => n._syncStatus === 'pending');
    const hasError = notes.some((n) => n._syncStatus === 'error');

    if (hasError) setSyncStatus('error');
    else if (hasPending || processingRef.current) setSyncStatus('syncing');
    else setSyncStatus('synced');
  }, [notes]);

  return (
    <NotesContext.Provider
      value={{ notes, addNote, updateNote, deleteNote, syncStatus }}
    >
      {children}
    </NotesContext.Provider>
  );
}
