import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="container py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notes</h1>
        <Button asChild size="sm">
          <Link href="/new">
            <Plus className="mr-2 h-4 w-4" />
            New Note
          </Link>
        </Button>
      </header>

      <div className="text-muted-foreground py-12 text-center">
        <p>No notes yet. Create your first note!</p>
      </div>
    </div>
  );
}
