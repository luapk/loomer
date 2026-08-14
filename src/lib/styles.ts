/**
 * Named director styles — reference images plus a written summary, conditioned
 * into every generation so a board can be shot "in the style of" a saved look.
 */

import type { PrismaClient } from '@prisma/client';

/** Images a single style can hold. */
export const MAX_STYLE_IMAGES = 6;

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

/**
 * The saved style's written summary.
 *
 * Back-fills on first use: styles saved before summaries existed have none,
 * and since the summary is now the *only* carrier of style in a shot prompt,
 * leaving it null would quietly degrade every render of that style forever.
 * Written once, then read from the row.
 */
export async function loadStyleSummary(
  db: PrismaClient,
  storyboard: { style_id: string | null },
): Promise<string | null> {
  if (!storyboard.style_id) return null;
  const style = await db.style.findUnique({
    where: { id: storyboard.style_id },
    select: { name: true, summary: true, image_urls: true },
  });
  if (!style) return null;
  if (style.summary) return style.summary;
  if (style.image_urls.length === 0) return null;

  // Imported lazily: this module is pulled into client bundles via the style
  // picker types, and the summariser reaches for the Anthropic SDK.
  const { summariseStyle } = await import('@/src/lib/style-summary');
  const summary = await summariseStyle(style.name, style.image_urls);
  if (summary) {
    await db.style.update({ where: { id: storyboard.style_id }, data: { summary } });
  }
  return summary;
}

/**
 * The mandatory style directive for a shot prompt.
 *
 * Text only. Shot prompts carry no style images at all: alongside identity
 * references the model kept sourcing content from them and character likeness
 * collapsed. The look reaches the frame through this sentence and through the
 * reference stills, which were themselves generated in the style.
 */
export function styleDirective(summary: string | null): string {
  if (summary) {
    return `OUTPUT STYLE (mandatory): ${summary} Render every element of this frame in that style — including any character, location or object taken from a reference image. The references define WHO and WHAT appears; this directive defines HOW it is drawn.`;
  }
  // No summary yet (the style was saved before summaries, or Claude was
  // unreachable). The identity references still carry the look, since they were
  // themselves generated in this style.
  return 'OUTPUT STYLE (mandatory): Match the visual style established by the reference images provided — their rendering medium, colour palette, lighting quality and texture. Render every element of this frame in that same style.';
}
