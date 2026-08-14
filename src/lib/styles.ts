/**
 * Named director styles — up to 4 reference images conditioned into every
 * generation, so a board can be shot "in the style of" a saved look.
 */

import type { PrismaClient } from '@prisma/client';

/** Images a single style can hold. */
export const MAX_STYLE_IMAGES = 4;

/** Styles a user can save. Deliberately small — this is a shortlist, not a library. */
export const MAX_STYLES_PER_USER = 5;

export type StyleSummary = {
  id: string;
  name: string;
  imageUrls: string[];
};

export async function listStyles(db: PrismaClient, userId: string): Promise<StyleSummary[]> {
  const rows = await db.style.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'asc' },
    select: { id: true, name: true, image_urls: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, imageUrls: r.image_urls }));
}

/**
 * The style images to condition a storyboard's generation on.
 *
 * Prefers the named style; falls back to the legacy single style_ref_url for
 * boards created before named styles existed.
 */
export async function resolveStyleImageUrls(
  db: PrismaClient,
  storyboard: { style_id: string | null; style_ref_url: string | null },
): Promise<string[]> {
  if (storyboard.style_id) {
    const style = await db.style.findUnique({
      where: { id: storyboard.style_id },
      select: { image_urls: true },
    });
    if (style && style.image_urls.length > 0) {
      return style.image_urls.slice(0, MAX_STYLE_IMAGES);
    }
  }
  return storyboard.style_ref_url ? [storyboard.style_ref_url] : [];
}

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    return {
      data: Buffer.from(await res.arrayBuffer()).toString('base64'),
      mimeType: contentType.split(';')[0]?.trim() ?? 'image/jpeg',
    };
  } catch {
    return null;
  }
}

/**
 * Style images loaded as inline conditioning data, ready to hand to Gemini.
 * Fetched once per run, not per image. Anything that fails to load is dropped
 * rather than failing the run — a missing style image degrades the look, it
 * doesn't warrant losing the whole board.
 */
export async function loadStyleImages(
  db: PrismaClient,
  storyboard: { style_id: string | null; style_ref_url: string | null },
): Promise<{ data: string; mimeType: string }[]> {
  const urls = await resolveStyleImageUrls(db, storyboard);
  const loaded = await Promise.all(urls.map(fetchAsBase64));
  return loaded.filter((img): img is { data: string; mimeType: string } => img !== null);
}
