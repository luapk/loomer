import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { put } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ReferenceStills } from '@/src/lib/reference-stills';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Style helpers (duplicated from generate-shots — do NOT import from there)
// ---------------------------------------------------------------------------

const WATERCOLOUR_STYLE =
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration. No photorealism, no CGI, no digital art. Naturalistic human anatomy and facial proportions throughout — eyes sized as in real life, iris occupying roughly one-third of visible eye height with natural sclera visible on both sides. No enlarged irises, no anime-style or cartoon-style eye exaggeration, no chibi proportions, no Disney-inflated eyes.';

// Single-frame guard — see generate-shots/route.ts for rationale.
const SINGLE_FRAME_GUARD =
  'Render ONE single continuous frame — a single photographic moment in a single location. ' +
  'DO NOT produce a split-screen, diptych, side-by-side panels, before/after panels, inset images, ' +
  'picture-in-picture, collage, or any multi-panel layout. DO NOT add text overlays, captions, or labels. ' +
  'If the description below mentions a "match cut", "intercut", "meanwhile", or another shot/timeline, ' +
  'ignore that editorial language entirely and depict ONLY this one shot\'s frozen moment.';

function buildShotPrompt(
  keyFramePrompt: string,
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
): string {
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `${SINGLE_FRAME_GUARD}\n\nStyle: ${WATERCOLOUR_STYLE}\n\n${keyFramePrompt}`;
  }
  const styleParts = [styleLock.look];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `${SINGLE_FRAME_GUARD}\n\nStyle: ${styleParts.join(' ')}\n\n${keyFramePrompt}`;
}

function buildStyleDeclaration(
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
): string {
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `OUTPUT STYLE (mandatory): ${WATERCOLOUR_STYLE} Every element in the output MUST conform to this style — including characters and locations taken from reference images.`;
  }
  const styleParts = [styleLock.look];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `OUTPUT STYLE (mandatory): ${styleParts.join(' ')} Every element in the output MUST conform to this style — including characters and locations taken from reference images.`;
}

// ---------------------------------------------------------------------------
// Conditioning image helper (duplicated from generate-shots)
// ---------------------------------------------------------------------------

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const mimeType = contentType.split(';')[0]?.trim() ?? 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString('base64');
    return { data, mimeType };
  } catch {
    // Don't fail the whole shot if a ref fetch fails.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shot generation (duplicated from generate-shots)
// ---------------------------------------------------------------------------

async function generateOneShot(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  styleDeclaration: string,
  conditioningEntities: { name: string; url: string }[],
): Promise<{ data: string; mimeType: string } | null> {
  const entityResults = await Promise.all(
    conditioningEntities.map((e) => fetchImageAsBase64(e.url)),
  );

  const loadedEntities = conditioningEntities
    .map((e, i) => ({ name: e.name, img: entityResults[i] ?? null }))
    .filter((e): e is { name: string; img: { data: string; mimeType: string } } => e.img !== null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GoogleGenAI Part type varies by version
  const parts: any[] = [];

  // Style declaration first — anchors the output medium before the model sees
  // any photographic reference images.
  parts.push({ text: styleDeclaration });

  if (loadedEntities.length > 0) {
    parts.push({ text: '[IDENTITY REFERENCES: The labelled images below are the SOLE visual specification for each entity. DISREGARD any colour, material, or appearance adjective used to describe these entities in the prompt text — those reflect the original brief and may be outdated. The reference image is always correct. If the prompt says "blue button" but the reference shows a yellow button, render it yellow. Extract identity and translate it into the OUTPUT STYLE declared above. Do NOT copy the photographic medium of the references.]' });
    for (const { name, img } of loadedEntities) {
      // Strip appearance descriptor (everything after " — ") from the label so the
      // label text does not contradict the reference image.
      const labelName = name.split(/\s[—–]\s/)[0]?.trim() ?? name;
      parts.push({ text: `[Reference — ${labelName}:]` });
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }
  }
  parts.push({ text: prompt });

  const delays = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { responseModalities: [Modality.IMAGE] },
      });
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return {
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType ?? 'image/jpeg',
          };
        }
      }
      return null;
    } catch (err) {
      const is429or400 =
        err instanceof Error &&
        (err.message.includes('"code":429') || err.message.includes('"code":400'));
      if (is429or400 && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]!));
        continue;
      }
      throw err;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Request body type
// ---------------------------------------------------------------------------

interface RegenShotBody {
  shotNumber: number;
  variations: string[];
  overridePrompt?: string;
  excludedEntityIds?: string[];
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: RegenShotBody;
  try {
    body = (await request.json()) as RegenShotBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { shotNumber, variations, overridePrompt, excludedEntityIds } = body;
  if (typeof shotNumber !== 'number' || !Number.isInteger(shotNumber)) {
    return NextResponse.json({ error: 'shotNumber must be an integer' }, { status: 400 });
  }
  if (!Array.isArray(variations)) {
    return NextResponse.json({ error: 'variations must be an array' }, { status: 400 });
  }

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }
  if (!storyboard.parsed_json) {
    return NextResponse.json({ error: 'Storyboard not yet parsed' }, { status: 422 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not set' }, { status: 503 });
  }

  const parsed = storyboard.parsed_json as unknown as ParsedStoryboard;
  const model = storyboard.image_model ?? 'gemini-2.5-flash-image';
  const renderStyle = storyboard.render_style;

  const shot = parsed.shots.find((s) => s.shot_number === shotNumber);
  if (!shot) {
    return NextResponse.json({ error: `Shot ${shotNumber} not found in storyboard` }, { status: 404 });
  }

  // Build entity name lookup early — needed for character-context injection below.
  const entityNames: Record<string, string> = {};
  for (const c of parsed.characters) entityNames[c.id] = c.name;
  for (const l of parsed.locations) entityNames[l.id] = l.name;
  for (const p of parsed.props) entityNames[p.id] = p.name;

  // Build prompt — use override text if provided, otherwise the storyboard key frame prompt.
  // Style prefix always comes first; Director's note variations are appended regardless.
  const keyFrameText = overridePrompt?.trim() ? overridePrompt.trim() : shot.key_frame_prompt;
  let prompt = buildShotPrompt(keyFrameText, renderStyle, parsed.style_lock);
  if (variations.length > 0) {
    // For OTS / dirty-single variations, inject the shot's character names so the model
    // knows which character to blur vs keep in focus.
    const shotCharacterNames = shot.continuity.characters
      .map((charId: string) => entityNames[charId])
      .filter((n): n is string => Boolean(n));
    const enhancedVariations = variations.map((v) => {
      if (
        shotCharacterNames.length >= 2 &&
        (v.includes('dirty single') || v.includes('Over-the-shoulder'))
      ) {
        return `${v} Characters in this shot: ${shotCharacterNames.join(', ')}. The shot description identifies who is primary (in focus) and who is the blurred foreground presence.`;
      }
      return v;
    });
    prompt += `\n\nDirector's note: ${enhancedVariations.join(' ')}`;
  }

  // Collect named conditioning refs.
  const refStills = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;
  const selectedRefUrl = (entityId: string): string | null =>
    refStills[entityId]?.selected ?? null;

  const continuityIds = new Set<string>([
    ...shot.continuity.characters,
    shot.continuity.location_id,
    ...shot.continuity.props_persisting,
    ...shot.continuity.props_introduced,
  ]);
  const excluded = new Set(excludedEntityIds ?? []);

  const primaryEntities = [...continuityIds]
    .filter((entityId) => !excluded.has(entityId))
    .map((entityId) => {
      const url = selectedRefUrl(entityId);
      return url ? { name: entityNames[entityId] ?? entityId, url } : null;
    })
    .filter((e): e is { name: string; url: string } => e !== null);

  const secondaryEntities = parsed.props
    .filter((p) => !continuityIds.has(p.id) && !excluded.has(p.id))
    .map((p) => {
      const url = selectedRefUrl(p.id);
      return url ? { name: p.name, url } : null;
    })
    .filter((e): e is { name: string; url: string } => e !== null);

  const conditioningEntities = [...primaryEntities, ...secondaryEntities];

  const styleDeclaration = buildStyleDeclaration(renderStyle, parsed.style_lock);
  const ai = new GoogleGenAI({ apiKey });

  let img: { data: string; mimeType: string } | null;
  try {
    img = await generateOneShot(ai, model, prompt, styleDeclaration, conditioningEntities);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Image generation failed: ${message}` }, { status: 502 });
  }

  if (!img) {
    return NextResponse.json({ error: 'No image returned from model' }, { status: 502 });
  }

  const buffer = Buffer.from(img.data, 'base64');
  const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const blobPath = `${id}/shots/${shotNumber}-regen-${Date.now()}.${ext}`;

  const blob = await put(blobPath, buffer, { access: 'public', contentType: img.mimeType });

  // Update shot_key_frames in DB.
  const existing = (storyboard.shot_key_frames ?? {}) as Record<
    string,
    { status: string; url: string | null; error?: string }
  >;
  const updated = {
    ...existing,
    [String(shotNumber)]: { status: 'done', url: blob.url },
  };
  await getDb().storyboard.update({
    where: { id },
    data: { shot_key_frames: updated as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ url: blob.url });
}
