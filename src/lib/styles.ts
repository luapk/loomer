/**
 * Named director styles — reference images plus a written summary, conditioned
 * into every generation so a board can be shot "in the style of" a saved look.
 */

import type { PrismaClient } from '@prisma/client';

/** Images a single style can hold. */
export const MAX_STYLE_IMAGES = 6;

/**
 * Style images attached to a *shot* render.
 *
 * Hard cap, and deliberately small. Shot renders also carry identity
 * references for every character, location and prop in frame; when style
 * images outnumber those, the model starts taking content from the style
 * images and character likeness collapses. The style is carried by the text
 * summary instead — see `styleDirective`.
 */
export const MAX_STYLE_IMAGES_PER_SHOT = 2;

/** Styles a user can save. Deliberately small — this is a shortlist, not a library. */
export const MAX_STYLES_PER_USER = 5;

export type StyleSummary = {
  id: string;
  name: string;
  imageUrls: string[];
  summary: string | null;
};

export async function listStyles(db: PrismaClient, userId: string): Promise<StyleSummary[]> {
  const rows = await db.style.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'asc' },
    select: { id: true, name: true, image_urls: true, summary: true },
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, imageUrls: r.image_urls, summary: r.summary,
  }));
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
  limit?: number,
): Promise<{ data: string; mimeType: string }[]> {
  const urls = await resolveStyleImageUrls(db, storyboard);
  const capped = typeof limit === 'number' ? urls.slice(0, limit) : urls;
  const loaded = await Promise.all(capped.map(fetchAsBase64));
  return loaded.filter((img): img is { data: string; mimeType: string } => img !== null);
}

/** The saved style's written summary, if there is one. */
export async function loadStyleSummary(
  db: PrismaClient,
  storyboard: { style_id: string | null },
): Promise<string | null> {
  if (!storyboard.style_id) return null;
  const style = await db.style.findUnique({
    where: { id: storyboard.style_id },
    select: { summary: true },
  });
  return style?.summary ?? null;
}

/**
 * The mandatory style directive for a shot prompt.
 *
 * Written text does the heavy lifting so shot renders can carry only one or
 * two style images — leaving the identity references to dominate. Without the
 * summary this falls back to pointing at the images alone, which is what the
 * pre-summary behaviour did.
 */
export function styleDirective(summary: string | null): string {
  if (summary) {
    return `OUTPUT STYLE (mandatory): ${summary} The STYLE REFERENCE image(s) show this look — match their colour palette, lighting, rendering technique and texture. Every element in the output MUST be rendered in this style.`;
  }
  return 'OUTPUT STYLE (mandatory): Match the visual style of the STYLE REFERENCE image(s) provided — reproduce their colour palette, lighting quality, rendering technique, texture and overall aesthetic. Every element in the output MUST match this style.';
}
