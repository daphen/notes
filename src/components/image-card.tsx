'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import type { Image as ImageType } from '@/lib/db/schema';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ImageCardProps {
  image: ImageType;
}

export function ImageCard({ image }: ImageCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm('Delete this image?')) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/images/${image.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group relative">
      <a
        href={image.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Card className="overflow-hidden transition-colors hover:ring-2 hover:ring-primary">
          <div className="aspect-square w-full overflow-hidden">
            <img
              src={image.url}
              alt={image.title || ''}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
          {image.title && (
            <div className="p-2">
              <p className="text-sm text-muted-foreground line-clamp-1">{image.title}</p>
            </div>
          )}
        </Card>
      </a>
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={handleDelete}
        disabled={deleting}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
