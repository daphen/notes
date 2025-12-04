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

// Minimum size for a valid image (10KB) - prevents empty/tiny placeholder images
const MIN_IMAGE_SIZE = 10 * 1024;

function isInstagramUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'instagram.com' || urlObj.hostname === 'www.instagram.com';
  } catch {
    return false;
  }
}

async function fetchInstagramEmbed(url: string): Promise<{
  title?: string;
  description?: string;
  image?: string;
}> {
  try {
    // Use Instagram's oEmbed API (no auth required for basic info)
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    return {
      title: data.title || data.author_name,
      description: data.author_name ? `@${data.author_name} on Instagram` : undefined,
      image: data.thumbnail_url,
    };
  } catch (error) {
    console.error('Failed to fetch Instagram embed:', error);
    return {};
  }
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

    // Determine the actual content/URL first
    const sharedContent = (text || url || '').trim();
    const hasUrl = isUrl(sharedContent);

    // Helper to process image data
    const processImageData = (imgData: string) => {
      let base64Data = imgData;
      let contentType = 'image/jpeg';

      if (imgData.startsWith('data:')) {
        const matches = imgData.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          contentType = matches[1];
          base64Data = matches[2];
        }
      }

      const buffer = Buffer.from(base64Data, 'base64');
      return { buffer, contentType };
    };

    // Detect actual image type from magic bytes
    const getImageType = (buf: Buffer, fallbackContentType: string): { mime: string; ext: string } => {
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return { mime: 'image/jpeg', ext: 'jpg' };
      }
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return { mime: 'image/png', ext: 'png' };
      }
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
        return { mime: 'image/gif', ext: 'gif' };
      }
      if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
        return { mime: 'image/webp', ext: 'webp' };
      }
      // HEIC/HEIF detection (ftyp box at offset 4)
      if (buf.length > 12 && buf.slice(4, 8).toString() === 'ftyp') {
        const brand = buf.slice(8, 12).toString();
        if (['heic', 'heix', 'hevc', 'hevx', 'mif1'].includes(brand)) {
          return { mime: 'image/heic', ext: 'heic' };
        }
      }
      console.log('Unknown image format, first 16 bytes:', buf.slice(0, 16));
      return { mime: fallbackContentType, ext: fallbackContentType.split('/')[1] || 'jpg' };
    };

    // Check if we have substantial image data (and no URL, or URL + large image)
    let hasSubstantialImage = false;
    let imageBuffer: Buffer | null = null;
    let imageContentType = 'image/jpeg';

    if (imageData && isBase64Image(imageData)) {
      const { buffer, contentType } = processImageData(imageData);
      imageBuffer = buffer;
      imageContentType = contentType;
      hasSubstantialImage = buffer.length >= MIN_IMAGE_SIZE;
      console.log('Image buffer size:', buffer.length, 'Min required:', MIN_IMAGE_SIZE, 'Is substantial:', hasSubstantialImage);
    }

    // PRIORITY 1: If there's a URL, save as link (even if there's a small image attached)
    // Only save as image if there's NO URL and we have substantial image data
    if (hasUrl) {
      // Save as a link with OpenGraph metadata
      let og: { title?: string; description?: string; image?: string; favicon?: string };

      // Use Instagram oEmbed for Instagram URLs
      if (isInstagramUrl(sharedContent)) {
        const igData = await fetchInstagramEmbed(sharedContent);
        og = {
          ...igData,
          favicon: `https://www.google.com/s2/favicons?domain=instagram.com&sz=64`,
        };
      } else {
        og = await fetchOpenGraph(sharedContent);
      }

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

    // PRIORITY 2: If we have substantial image data (and no URL), save as image
    if (hasSubstantialImage && imageBuffer) {
      const imageType = getImageType(imageBuffer, imageContentType);
      console.log('Detected image type:', imageType, 'Buffer size:', imageBuffer.length);

      const id = crypto.randomUUID();
      const extension = imageType.ext;

      // Upload to Vercel Blob
      const blob = await put(`images/${id}.${extension}`, imageBuffer, {
        access: 'public',
        contentType: imageType.mime,
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
