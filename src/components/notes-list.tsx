'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { Plus, Trash2, Check } from 'lucide-react';
import { useNotes } from '@/lib/notes-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
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

  const openNote = (note: NoteWithSync) => {
    setActiveNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const createAndOpenNote = () => {
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

  const handleSave = () => {
    if (!activeNote) return;
    const isNewNote = !notes.some(n => n.id === activeNote.id);
    if (isNewNote) {
      const newNote = addNote(editTitle || 'Untitled', editContent);
      updateNote(newNote.id, { title: editTitle || 'Untitled', content: editContent });
    } else {
      updateNote(activeNote.id, { title: editTitle, content: editContent });
    }
    setActiveNote(null);
  };

  const handleDelete = () => {
    if (!activeNote) return;
    if (notes.some(n => n.id === activeNote.id)) {
      deleteNote(activeNote.id);
    }
    setActiveNote(null);
  };

  const isNewNote = activeNote ? !notes.some(n => n.id === activeNote.id) : false;

  return (
    <>
      <Drawer open={!!activeNote} onOpenChange={(open) => !open && setActiveNote(null)}>
        <DrawerContent className="max-h-[96vh]">
          <DrawerHeader className="flex flex-row items-center justify-between">
            <div>
              <DrawerTitle>{isNewNote ? 'New Note' : 'Edit Note'}</DrawerTitle>
              <DrawerDescription className="sr-only">
                {isNewNote ? 'Create a new note' : 'Edit your note'}
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-1">
              {!isNewNote && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive size-8"
                  onClick={handleDelete}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-green-500 hover:text-green-500"
                onClick={handleSave}
              >
                <Check className="size-4" />
              </Button>
            </div>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-4 pb-8">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="bg-muted rounded-md px-3 py-3 text-lg font-semibold outline-none"
              placeholder="Note title..."
              autoFocus
            />
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Write your note..."
              className="bg-muted min-h-[300px] resize-none rounded-md font-mono text-base"
            />
          </div>
        </DrawerContent>
      </Drawer>
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
