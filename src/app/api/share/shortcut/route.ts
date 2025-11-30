import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notes, links, images } from '@/lib/db/schema';
import { put } from '@vercel/blob';
import { createHash } from 'crypto';

function checksum(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

function generatePath(): string {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `shared/${timestamp}.md`;
}

function isUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isBase64Image(text: string): boolean {
  return text.startsWith('data:image/') || /^[A-Za-z0-9+/=]{100,}$/.test(text.slice(0, 200));
}

async function fetchOpenGraph(url: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NotesBot/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    const html = await response.text();

    const getMetaContent = (property: string): string | undefined => {
      const regex = new RegExp(
        `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
        'i'
      );
      const match = html.match(regex);
      return match?.[1] || match?.[2];
    };

    const getTitle = (): string | undefined => {
      const ogTitle = getMetaContent('og:title');
      if (ogTitle) return ogTitle;
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      return titleMatch?.[1];
    };

    const urlObj = new URL(url);
    const favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;

    return {
      title: getTitle(),
      description: getMetaContent('og:description') || getMetaContent('description'),
      image: getMetaContent('og:image'),
      favicon,
    };
  } catch (error) {
    console.error('Failed to fetch OpenGraph:', error);
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Received body keys:', Object.keys(body));
    console.log('Image field exists:', !!body.image);
    console.log('Image field type:', typeof body.image);
    console.log('Image field length:', body.image?.length || 0);
    const { title, text, url, image: imageData } = body;

    // Check if we have image data (base64)
    if (imageData && isBase64Image(imageData)) {
      // Extract base64 data
      let base64Data = imageData;
      let contentType = 'image/jpeg';

      if (imageData.startsWith('data:')) {
        const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          contentType = matches[1];
          base64Data = matches[2];
        }
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const id = crypto.randomUUID();
      const extension = contentType.split('/')[1] || 'jpg';

      // Upload to Vercel Blob
      const blob = await put(`images/${id}.${extension}`, buffer, {
        access: 'public',
        contentType,
      });

      // Save to database
      const [img] = await db
        .insert(images)
        .values({
          url: blob.url,
          title: title || null,
          sourceUrl: url || null,
        })
        .returning();

      return NextResponse.json({ success: true, type: 'image', id: img.id });
    }

    // Determine the actual content/URL
    const sharedContent = (text || url || '').trim();

    // Check if it's a URL
    if (isUrl(sharedContent)) {
      // Save as a link with OpenGraph metadata
      const og = await fetchOpenGraph(sharedContent);

      const [link] = await db
        .insert(links)
        .values({
          url: sharedContent,
          title: og.title || title || new URL(sharedContent).hostname,
          description: og.description,
          image: og.image,
          favicon: og.favicon,
        })
        .returning();

      return NextResponse.json({ success: true, type: 'link', id: link.id });
    }

    // Save as a note
    let content = '';
    if (text) content += text;
    if (url && url !== text) content += content ? `\n\n${url}` : url;

    const noteTitle = title || 'Shared Note';
    const noteContent = content || '';

    const [note] = await db
      .insert(notes)
      .values({
        title: noteTitle,
        content: noteContent,
        path: generatePath(),
        checksum: checksum(noteContent),
      })
      .returning();

    return NextResponse.json({ success: true, type: 'note', id: note.id });
  } catch (error) {
    console.error('Failed to create shared item:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
