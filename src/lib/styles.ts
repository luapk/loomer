/**
 * Named director styles — reference images compiled into a structured spec,
 * conditioned into every generation so a board can be shot "in the style of" a
 * saved look.
 *
 * The images teach the look once, at authoring time. Generation reads the
 * compiled spec, not the images — see src/schema/style-spec.ts for why.
 */

import type { PrismaClient } from '@prisma/client';
import { parseStyleSpec, type StyleSpec } from '@/src/schema/style-spec';

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
 * The saved style's compiled spec, plus the one-line reading for the director.
 *
 * Back-fills on first use: styles saved before specs existed have none, and
 * since the spec is the carrier of style in every prompt, leaving it null
 * would quietly degrade every render of that style forever. Compiled once,
 * then read from the row.
 *
 * `summary` is returned alongside so a style whose compile failed — or that
 * predates specs and could not be compiled — still states its look in words
 * rather than falling silent.
 */
export async function loadStyleSpec(
  db: PrismaClient,
  storyboard: { style_id: string | null },
): Promise<{ spec: StyleSpec | null; summary: string | null }> {
  if (!storyboard.style_id) return { spec: null, summary: null };
  const style = await db.style.findUnique({
    where: { id: storyboard.style_id },
    select: { name: true, spec: true, summary: true, image_urls: true },
  });
  if (!style) return { spec: null, summary: null };

  const stored = parseStyleSpec(style.spec);
  if (stored) return { spec: stored, summary: style.summary };
  if (style.image_urls.length === 0) return { spec: null, summary: style.summary };

  // Imported lazily: this module is pulled into client bundles via the style
  // picker's types, and the compiler reaches for the Anthropic SDK.
  const { compileStyleSpec } = await import('@/src/lib/style-compiler');
  const compiled = await compileStyleSpec(style.name, style.image_urls);
  if (!compiled) return { spec: null, summary: style.summary };

  await db.style.update({
    where: { id: storyboard.style_id },
    data: { spec: compiled, summary: compiled.reading },
  });
  return { spec: compiled, summary: compiled.reading };
}
