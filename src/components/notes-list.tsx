'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { useOnClickOutside } from 'usehooks-ts';
import { Plus, X, Trash2, Check } from 'lucide-react';
import { useNotes } from '@/lib/notes-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Note } from '@/lib/db/schema';

interface NoteWithSync extends Note {
  _syncStatus?: 'synced' | 'syncing' | 'pending' | 'error';
  _tempId?: string;
}

const SPRING_OPTIONS = { stiffness: 900, damping: 80 };

function SwipeableNoteItem({
  note,
  onOpen,
  onDelete,
}: {
  note: NoteWithSync;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemWidth = useRef(0);
  const swipeStartX = useRef(0);
  const swipeStartOffset = useRef(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const isFullySwiped = useRef(false);

  const swipeAmount = useMotionValue(0);
  const swipeAmountSpring = useSpring(swipeAmount, SPRING_OPTIONS);
  const deleteOpacity = useTransform(swipeAmountSpring, [-200, -80, 0], [1, 1, 0]);
  const deleteScale = useTransform(swipeAmountSpring, [-200, -100, -80], [1.2, 1, 0.8]);

  useEffect(() => {
    const updateWidth = () => {
      const width = containerRef.current?.getBoundingClientRect().width;
      if (width) itemWidth.current = width;
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isSwiping) return;
      const delta = e.clientX - swipeStartX.current + swipeStartOffset.current;
      const clamped = Math.min(0, Math.max(-itemWidth.current, delta));

      if (clamped < -itemWidth.current * 0.5) {
        isFullySwiped.current = true;
        swipeAmount.set(-itemWidth.current);
      } else {
        isFullySwiped.current = false;
        swipeAmount.set(clamped);
      }
    };

    const handlePointerUp = () => {
      if (!isSwiping) return;
      setIsSwiping(false);

      if (isFullySwiped.current) {
        onDelete();
        isFullySwiped.current = false;
        return;
      }

      const current = swipeAmount.get();
      // Show delete button if swiped more than 15%
      if (current < -itemWidth.current * 0.15) {
        swipeAmount.set(-itemWidth.current * 0.3);
        justSwipedRef.current = true;
      } else if (Math.abs(current) > 5) {
        // Only mark as swiped if there was actual movement
        swipeAmount.set(0);
        justSwipedRef.current = true;
      }
      // If no significant movement, don't set justSwipedRef - allow click to open
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isSwiping, swipeAmount, onDelete]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsSwiping(true);
    swipeStartX.current = e.clientX;
    swipeStartOffset.current = swipeAmount.get();
  };

  const justSwipedRef = useRef(false);

  const handleClick = () => {
    // Don't do anything if we just finished swiping
    if (justSwipedRef.current) {
      justSwipedRef.current = false;
      return;
    }

    if (Math.abs(swipeAmount.get()) < 5) {
      onOpen();
    } else {
      // Tapping on a swiped item resets it
      swipeAmount.set(0);
    }
  };

  return (
    <motion.li
      layoutId={`card-${note.id}`}
      className="relative flex w-[386px] cursor-pointer items-center gap-4 overflow-hidden p-0 bg-background"
      style={{ borderRadius: 8, touchAction: 'pan-y' }}
      layout
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, layout: { duration: 0.2 } }}
    >
      {/* Delete action behind */}
      <motion.div
        className="absolute inset-y-0 right-0 flex w-full items-center justify-end bg-red-500 cursor-pointer"
        style={{ opacity: deleteOpacity }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <motion.div
          className="flex items-center gap-2 pr-4 text-white"
          style={{ scale: deleteScale }}
        >
          <Trash2 className="size-5" />
          <span className="text-sm font-medium">Delete</span>
        </motion.div>
      </motion.div>

      {/* Swipeable content */}
      <motion.div
        ref={containerRef}
        className="relative z-10 flex w-full grow items-center justify-between border-b border-[#d4d6d861] bg-background py-4 select-none"
        style={{ x: swipeAmountSpring }}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
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
      </motion.div>
    </motion.li>
  );
}

export function NotesList() {
  const { notes, addNote, updateNote, deleteNote } = useNotes();
  const [activeNote, setActiveNote] = useState<NoteWithSync | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref as React.RefObject<HTMLElement>, () => {
    if (activeNote) {
      // Close without saving - user must click save button
      setActiveNote(null);
    }
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (activeNote) {
          // Close without saving - user must click save button
          setActiveNote(null);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeNote]);

  const openNote = (note: NoteWithSync) => {
    setActiveNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const createAndOpenNote = () => {
    // Create a temporary note object for the editor (not added to list yet)
    const tempNote: NoteWithSync = {
      id: `temp-${Date.now()}`,
      title: '',
      content: '',
      path: '',
      checksum: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      _syncStatus: 'pending',
      _tempId: `temp-${Date.now()}`,
    };
    setActiveNote(tempNote);
    setEditTitle('');
    setEditContent('');
  };

  return (
    <>
      <AnimatePresence>
        {activeNote ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-10 bg-black/20"
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {activeNote ? (
          <motion.div
            className="absolute inset-0 z-10 grid place-items-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <motion.div
              className="bg-muted flex h-fit w-[500px] max-w-[96vw] cursor-pointer flex-col items-start gap-4 overflow-hidden p-4"
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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive size-8"
                      onClick={() => {
                        deleteNote(activeNote.id);
                        setActiveNote(null);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-green-500 hover:text-green-500"
                      onClick={() => {
                        const isNewNote = !notes.some(n => n.id === activeNote.id);
                        if (isNewNote) {
                          // Create new note and sync
                          const newNote = addNote(editTitle || 'Untitled', editContent);
                          updateNote(newNote.id, { title: editTitle || 'Untitled', content: editContent });
                        } else {
                          // Update existing note
                          updateNote(activeNote.id, { title: editTitle, content: editContent });
                        }
                        setActiveNote(null);
                      }}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setActiveNote(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
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
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ul className="relative z-0 m-0 flex w-full flex-col items-center py-4">
        <li
          onClick={createAndOpenNote}
          className="flex w-[386px] cursor-pointer items-center gap-4 p-0 py-2"
        >
          <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
            <Plus className="text-muted-foreground size-5" />
          </div>
          <span className="text-muted-foreground font-medium">New note...</span>
        </li>
        <AnimatePresence mode="popLayout">
          {notes
            .filter((note) => note.id !== activeNote?.id)
            .map((note) => (
              <SwipeableNoteItem
                key={note._tempId || note.id}
                note={note}
                onOpen={() => openNote(note)}
                onDelete={() => deleteNote(note.id)}
              />
            ))}
        </AnimatePresence>
      </ul>
    </>
  );
}
