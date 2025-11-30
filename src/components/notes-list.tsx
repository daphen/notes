'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useOnClickOutside } from 'usehooks-ts';
import { Plus, X } from 'lucide-react';
import { useNotes } from '@/lib/notes-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Note } from '@/lib/db/schema';

interface NoteWithSync extends Note {
  _syncStatus?: 'synced' | 'syncing' | 'pending' | 'error';
  _tempId?: string;
}

export function NotesList() {
  const { notes, addNote, updateNote } = useNotes();
  const [activeNote, setActiveNote] = useState<NoteWithSync | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref as React.RefObject<HTMLElement>, () => {
    if (activeNote) {
      const hasChanges = editTitle !== activeNote.title || editContent !== activeNote.content;
      if (hasChanges) {
        updateNote(activeNote.id, { title: editTitle, content: editContent });
      }
      setActiveNote(null);
    }
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (activeNote) {
          const hasChanges = editTitle !== activeNote.title || editContent !== activeNote.content;
          if (hasChanges) {
            updateNote(activeNote.id, { title: editTitle, content: editContent });
          }
          setActiveNote(null);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeNote, editTitle, editContent, updateNote]);

  const openNote = (note: NoteWithSync) => {
    setActiveNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  return (
    <>
      <AnimatePresence>
        {activeNote ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 bg-black/20"
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {activeNote ? (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <motion.div
              className="bg-muted flex h-fit w-[500px] cursor-pointer flex-col items-start gap-4 overflow-hidden p-4"
              ref={ref}
              style={{ borderRadius: 12, willChange: 'transform' }}
              layoutId={`card-${activeNote.id}`}
            >
              <div className="flex w-full items-center gap-4">
                <div className="flex grow items-center justify-between">
                  <div className="flex flex-col">
                    <motion.h2
                      layoutId={`title-${activeNote.id}`}
                      className="text-sm font-medium"
                    >
                      {activeNote.title}
                    </motion.h2>
                    <motion.p
                      layoutId={`description-${activeNote.id}`}
                      className="text-muted-foreground text-sm"
                    >
                      {activeNote.content.slice(0, 100) || 'No content'}
                    </motion.p>
                  </div>
                  <motion.span
                    layoutId={`date-${activeNote.id}`}
                    className="text-muted-foreground text-xs"
                  >
                    {new Date(activeNote.updatedAt).toLocaleDateString()}
                  </motion.span>
                </div>
              </div>
              <motion.div
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.05 } }}
                className="flex w-full flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Edit note</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setActiveNote(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="bg-background rounded-md px-3 py-2 font-semibold outline-none"
                  placeholder="Note title..."
                />
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Write your note..."
                  className="bg-background min-h-[200px] resize-none rounded-md font-mono text-sm"
                />
              </motion.div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
      <ul className="relative z-0 m-0 flex w-full flex-col items-center py-4">
        <li
          onClick={() => addNote('New note', '')}
          className="flex w-[386px] cursor-pointer items-center gap-4 p-0 py-2"
        >
          <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
            <Plus className="text-muted-foreground size-5" />
          </div>
          <span className="text-muted-foreground font-medium">New note...</span>
        </li>
        {notes
          .filter((note) => note.id !== activeNote?.id)
          .map((note) => (
            <motion.li
              layoutId={`card-${note.id}`}
              key={note.id}
              onClick={() => openNote(note)}
              className="flex w-[386px] cursor-pointer items-center gap-4 p-0"
              style={{ borderRadius: 8 }}
            >
              <div className="flex grow items-center justify-between border-b border-[#d4d6d861] py-4 last:border-0">
                <div className="flex flex-col">
                  <motion.h2
                    layoutId={`title-${note.id}`}
                    className="text-sm font-medium"
                  >
                    {note.title}
                  </motion.h2>
                  <motion.p
                    layoutId={`description-${note.id}`}
                    className="text-muted-foreground text-sm"
                  >
                    {note.content.slice(0, 100) || 'No content'}
                  </motion.p>
                </div>
                <motion.span
                  layoutId={`date-${note.id}`}
                  className="text-muted-foreground text-xs"
                >
                  {new Date(note.updatedAt).toLocaleDateString()}
                </motion.span>
              </div>
            </motion.li>
          ))}
      </ul>
    </>
  );
}
