'use client';

import type { Note, Link as LinkType, Image as ImageType } from '@/lib/db/schema';
import { AnimatedTabs } from '@/components/animated-tabs';
import { LinkCard } from '@/components/link-card';
import { ImageCard } from '@/components/image-card';
import { NotesList } from '@/components/notes-list';
import { useNotes } from '@/lib/notes-store';
import { StickyNote, Link2, ImageIcon } from 'lucide-react';

interface HomeContentProps {
  notes: Note[];
  links: LinkType[];
  images: ImageType[];
}

export function HomeContent({ links, images }: HomeContentProps) {
  const { notes } = useNotes();

  const tabs = [
    {
      value: 'notes',
      label: 'Notes',
      icon: StickyNote,
      count: notes.length,
      content: <NotesList />,
    },
    {
      value: 'links',
      label: 'Links',
      icon: Link2,
      count: links.length,
      content: links.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <p>No links saved yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} />
          ))}
        </div>
      ),
    },
    {
      value: 'images',
      label: 'Images',
      icon: ImageIcon,
      count: images.length,
      content: images.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          <p>No images saved yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <ImageCard key={image.id} image={image} />
          ))}
        </div>
      ),
    },
  ];

  return <AnimatedTabs tabs={tabs} defaultValue="notes" />;
}
