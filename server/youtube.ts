import { parseHTML } from 'linkedom';
import { safeFetch } from './network.js';
import { HttpError } from './config.js';
import type { Extraction } from './types.js';

export function youtubePageMetadata(html: string): Extraction {
  const { document } = parseHTML(html);
  const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
  const description = (
    document.querySelector('meta[name="description"]')?.getAttribute('content') ||
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''
  ).trim();
  if (!title || title.toLowerCase() === 'youtube') {
    throw new HttpError(422, 'YouTube metadata is unavailable. Bookmark retained; add a title or topic manually.');
  }
  return {
    title,
    text: [title, description].filter(Boolean).join('\n\n'),
    coverage: 'metadata only',
    adapter: 'youtube-public-page',
    details: {
      modalities: description ? ['title', 'description'] : ['title'],
      descriptionMayBeTruncated: true,
      note: 'Public page metadata only; the description may be shortened. No video, audio, or transcript was processed.',
    },
  };
}

export async function youtubePublicMetadata(id: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new HttpError(400, 'Invalid YouTube video ID.');
  const page = await safeFetch(`https://www.youtube.com/watch?v=${id}`);
  return youtubePageMetadata(page.buffer.toString('utf8'));
}
