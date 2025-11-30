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

export function NotesProvider({ children, initialNotes }: NotesProviderProps) {
  const [notes, setNotes] = useState<NoteWithSync[]>(
    initialNotes.map((n) => ({ ...n, _syncStatus: 'synced' }))
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
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

      // Queue sync
      syncQueueRef.current.set(tempId, {
        type: 'create',
        title,
        fn: async () => {
          const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, path }),
          });

          if (!res.ok) throw new Error('Failed to create note');

          const serverNote: Note = await res.json();

          setNotes((prev) =>
            prev.map((n) =>
              n._tempId === tempId
                ? { ...serverNote, _syncStatus: 'synced' }
                : n
            )
          );
        },
      });

      // Process queue
      processQueue();

      return optimisticNote;
    },
    [processQueue]
  );

  // Update note with optimistic update
  const updateNote = useCallback(
    (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => {
      const note = notes.find((n) => n.id === id);
      const noteTitle = updates.title || note?.title || 'Untitled';

      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, ...updates, updatedAt: new Date(), _syncStatus: 'pending' }
            : n
        )
      );

      // Debounce updates for the same note
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

      // Use debounced processing for updates to avoid spam
      processQueueDebounced();
    },
    [notes, processQueueDebounced]
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
