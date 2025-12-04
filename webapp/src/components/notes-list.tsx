'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { Plus, Trash2, Check, ArrowLeft, CheckSquare, Hash, Bold, Italic, Link2, List } from 'lucide-react';
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
      className="relative flex w-full cursor-pointer items-center gap-4 overflow-hidden p-0 bg-background"
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
            className="text-muted-foreground text-sm line-clamp-2 max-w-[300px]"
          >
            {(() => {
              // Get first non-empty, non-heading line as preview
              const lines = note.content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
              const preview = lines[0]?.slice(0, 100) || 'No content';
              return preview.length >= 100 ? preview + '…' : preview;
            })()}
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
  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus title input without scrolling when note opens
  useEffect(() => {
    if (activeNote && titleInputRef.current) {
      titleInputRef.current.focus({ preventScroll: true });
    }
  }, [activeNote]);

  // Insert text at cursor position
  const insertAtCursor = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editContent.slice(start, end);
    const newText = editContent.slice(0, start) + before + selectedText + after + editContent.slice(end);

    setEditContent(newText);

    // Set cursor position after insert
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + before.length + selectedText.length + after.length;
      textarea.setSelectionRange(
        selectedText ? newPos : start + before.length,
        selectedText ? newPos : start + before.length
      );
    });
  };

  // Insert at start of current line
  const insertAtLineStart = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = editContent.lastIndexOf('\n', start - 1) + 1;
    const newText = editContent.slice(0, lineStart) + prefix + editContent.slice(lineStart);

    setEditContent(newText);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  };

  // Handle enter key for auto-continuing lists/tasks
  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const textarea = e.currentTarget;
      const cursorPos = textarea.selectionStart;

      // Find the current line
      const lineStart = editContent.lastIndexOf('\n', cursorPos - 1) + 1;
      const lineEnd = editContent.indexOf('\n', cursorPos);
      const line = editContent.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

      // Check for task or list patterns
      const taskMatch = line.match(/^(\s*-\s*\[[ x]\]\s*)/);
      const listMatch = line.match(/^(\s*-\s+)/);

      const prefix = taskMatch ? taskMatch[1].replace(/\[x\]/, '[ ]') : listMatch ? listMatch[1] : null;

      if (prefix) {
        // If the line is empty (just the prefix), remove it instead of continuing
        const lineContent = line.slice(prefix.length).trim();
        if (!lineContent) {
          e.preventDefault();
          const newContent = editContent.slice(0, lineStart) + editContent.slice(lineEnd === -1 ? editContent.length : lineEnd);
          setEditContent(newContent);
          requestAnimationFrame(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          });
          return;
        }

        e.preventDefault();
        const insertPos = lineEnd === -1 ? editContent.length : lineEnd;
        const newContent = editContent.slice(0, insertPos) + '\n' + prefix + editContent.slice(insertPos);
        setEditContent(newContent);

        requestAnimationFrame(() => {
          const newCursorPos = insertPos + 1 + prefix.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        });
      }
    }
  };

  // Handle clicking on checkboxes to toggle them
  const handleContentClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const clickPos = textarea.selectionStart;

    // Find the line containing the click
    const lineStart = editContent.lastIndexOf('\n', clickPos - 1) + 1;
    const lineEnd = editContent.indexOf('\n', clickPos);
    const line = editContent.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

    // Check if it's a checkbox line and click is near the checkbox
    const checkboxMatch = line.match(/^(\s*-\s*\[)([ x])(\])/);
    if (checkboxMatch) {
      const checkboxStartInLine = checkboxMatch[1].length;
      const clickPosInLine = clickPos - lineStart;

      // If click is within the checkbox area ([ ] or [x])
      if (clickPosInLine >= checkboxStartInLine - 1 && clickPosInLine <= checkboxStartInLine + 2) {
        const isChecked = checkboxMatch[2] === 'x';
        const newLine = line.replace(
          /^(\s*-\s*\[)([ x])(\])/,
          `$1${isChecked ? ' ' : 'x'}$3`
        );
        const newContent = editContent.slice(0, lineStart) + newLine + editContent.slice(lineEnd === -1 ? editContent.length : lineEnd);
        setEditContent(newContent);
        e.preventDefault();
      }
    }
  };

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

  // Close editor on Escape key
  useEffect(() => {
    if (!activeNote) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveNote(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [activeNote]);

  return (
    <>
      {/* Full-screen editor */}
      <AnimatePresence>
        {activeNote && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 z-50 flex flex-col bg-background"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  onClick={() => setActiveNote(null)}
                >
                  <ArrowLeft className="size-5" />
                </Button>
                <span className="font-medium">
                  {isNewNote ? 'New Note' : 'Edit Note'}
                </span>
              </div>
              {!isNewNote && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive size-9"
                  onClick={handleDelete}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>

            {/* Editor */}
            <div
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 pb-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            >
              <input
                ref={titleInputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="shrink-0 bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground"
                placeholder="Note title..."
              />
              <Textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onClick={handleContentClick}
                onKeyDown={handleContentKeyDown}
                placeholder="Write your note..."
                className="min-h-[200px] flex-1 resize-none border-0 bg-transparent p-0 font-mono text-base shadow-none focus-visible:ring-0"
              />
            </div>

            {/* Action bar */}
            <div className="shrink-0 flex flex-nowrap items-center gap-1 border-t bg-background px-2 py-2 overflow-x-auto scrollbar-hide">
              <Button
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={handleSave}
              >
                <Check className="size-4 mr-1.5" />
                <span className="text-xs">Save</span>
              </Button>
              <div className="w-px h-6 bg-border mx-1 shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => insertAtLineStart('- [ ] ')}
              >
                <CheckSquare className="size-4 mr-1.5" />
                <span className="text-xs">Task</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => insertAtLineStart('- ')}
              >
                <List className="size-4 mr-1.5" />
                <span className="text-xs">List</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => insertAtLineStart('## ')}
              >
                <Hash className="size-4 mr-1.5" />
                <span className="text-xs">H2</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => insertAtCursor('**', '**')}
              >
                <Bold className="size-4 mr-1.5" />
                <span className="text-xs">Bold</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => insertAtCursor('*', '*')}
              >
                <Italic className="size-4 mr-1.5" />
                <span className="text-xs">Italic</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => insertAtCursor('[', '](url)')}
              >
                <Link2 className="size-4 mr-1.5" />
                <span className="text-xs">Link</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="relative z-0 m-0 flex w-full flex-col px-4 py-4">
        <li
          onClick={createAndOpenNote}
          className="flex w-full cursor-pointer items-center gap-4 p-0 py-2"
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
