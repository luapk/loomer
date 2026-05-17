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
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration. No photorealism, no CGI, no digital art.';

function buildShotPrompt(
  keyFramePrompt: string,
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
): string {
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `Style: ${WATERCOLOUR_STYLE}\n\n${keyFramePrompt}`;
  }
  const styleParts = [styleLock.look];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `Style: ${styleParts.join(' ')}\n\n${keyFramePrompt}`;
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
  conditioningUrls: string[],
): Promise<{ data: string; mimeType: string } | null> {
  const conditioningResults = await Promise.all(
    conditioningUrls.map((url) => fetchImageAsBase64(url)),
  );
  const conditioningImages = conditioningResults.filter(
    (r): r is { data: string; mimeType: string } => r !== null,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GoogleGenAI Part type varies by version
  const parts: any[] = [
    ...conditioningImages.map((img) => ({
      inlineData: { data: img.data, mimeType: img.mimeType },
    })),
    { text: prompt },
  ];

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

  const { shotNumber, variations } = body;
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
  const model = storyboard.image_model ?? 'nano-banana-pro-preview';
  const renderStyle = storyboard.render_style;

  const shot = parsed.shots.find((s) => s.shot_number === shotNumber);
  if (!shot) {
    return NextResponse.json({ error: `Shot ${shotNumber} not found in storyboard` }, { status: 404 });
  }

  // Build prompt — style prefix first, then optional Director's note.
  let prompt = buildShotPrompt(shot.key_frame_prompt, renderStyle, parsed.style_lock);
  if (variations.length > 0) {
    prompt += `\n\nDirector's note: ${variations.join(' ')}`;
  }

  // Collect conditioning ref URLs from the shot's continuity.
  const refStills = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;
  const selectedRefUrl = (entityId: string): string | null =>
    refStills[entityId]?.selected ?? null;

  const entityIds: string[] = [
    ...shot.continuity.characters,
    shot.continuity.location_id,
    ...shot.continuity.props_persisting,
    ...shot.continuity.props_introduced,
  ];
  const conditioningUrls = entityIds
    .map((entityId) => selectedRefUrl(entityId))
    .filter((url): url is string => url !== null);

  const ai = new GoogleGenAI({ apiKey });

  let img: { data: string; mimeType: string } | null;
  try {
    img = await generateOneShot(ai, model, prompt, conditioningUrls);
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
