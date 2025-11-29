'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function NewNotePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;

    setSaving(true);
    try {
      const path = `${title.toLowerCase().replace(/\s+/g, '-')}.md`;
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, path }),
      });

      if (res.ok) {
        const note = await res.json();
        router.push(`/notes/${note.id}`);
      }
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container max-w-3xl py-8">
      <header className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">New Note</h1>
        <Button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          size="sm"
          className="ml-auto"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </header>

      <div className="space-y-4">
        <Input
          placeholder="Note title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-lg font-medium"
        />
        <Textarea
          placeholder="Write your note in markdown..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[60vh] resize-none font-mono"
        />
      </div>
    </div>
  );
}
