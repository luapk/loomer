import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { put } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ReferenceStills } from '@/src/lib/reference-stills';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Copied from generate-refs/route.ts — do not import from it.
const WATERCOLOUR_STYLE =
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration. No photorealism, no CGI, no digital art.';

function buildPrompt(
  basePrompt: string,
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
): string {
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `Style: ${WATERCOLOUR_STYLE}\n\n${basePrompt}`;
  }
  const styleParts = [styleLock.look];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `Style: ${styleParts.join(' ')}\n\n${basePrompt}`;
}

async function generateOneImage(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
): Promise<{ data: string; mimeType: string }> {
  const delays = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      });
      const candidate = response.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? 'image/png' };
        }
      }
      const finishReason = candidate?.finishReason ?? 'UNKNOWN';
      const textParts = (candidate?.content?.parts ?? [])
        .filter((p) => p.text)
        .map((p) => p.text)
        .join(' ')
        .slice(0, 200);
      const detail = textParts ? `Model said: "${textParts}"` : `Finish reason: ${finishReason}`;
      throw new Error(`No image in response (model: ${model}). ${detail}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = msg.includes('"code":429') || msg.includes('"code":400');
      if (isRetryable && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]!));
        continue;
      }
      throw err;
    }
  }
  throw new Error('generateOneImage: exhausted retries');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const body = await request.json() as { entityId?: unknown; notes?: unknown };
  const entityId = typeof body.entityId === 'string' ? body.entityId : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

  if (!entityId) {
    return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
  }

  const db = getDb();
  const storyboard = await db.storyboard.findUnique({ where: { id } });
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

  // Find entity by id across characters, locations, and props
  let basePrompt: string | null = null;

  const char = parsed.characters.find((c) => c.id === entityId);
  if (char) basePrompt = char.reference_still_prompt;

  if (!basePrompt) {
    const loc = parsed.locations.find((l) => l.id === entityId);
    if (loc) basePrompt = loc.reference_still_prompt;
  }

  if (!basePrompt) {
    const prop = parsed.props.find((p) => p.id === entityId && p.reference_still_prompt);
    if (prop) basePrompt = prop.reference_still_prompt ?? null;
  }

  if (!basePrompt) {
    return NextResponse.json({ error: `Entity ${entityId} not found or has no prompt` }, { status: 404 });
  }

  // Append director's notes
  const enrichedBase = notes
    ? `${basePrompt}\n\nDirector's notes: ${notes}`
    : basePrompt;

  const finalPrompt = buildPrompt(enrichedBase, renderStyle, parsed.style_lock);

  const ai = new GoogleGenAI({ apiKey });

  // Generate 2 candidates sequentially (rate limit safety)
  const newUrls: string[] = [];
  const timestamp = Date.now();

  for (let j = 0; j < 2; j++) {
    try {
      const img = await generateOneImage(ai, model, finalPrompt);
      const buffer = Buffer.from(img.data, 'base64');
      const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const blob = await put(
        `${id}/refs/${entityId}/finetune-${timestamp}-${j}.${ext}`,
        buffer,
        { access: 'public', allowOverwrite: true, contentType: img.mimeType },
      );
      newUrls.push(blob.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Log but don't abort — return whatever succeeded
      console.error(`regen-ref candidate ${j} failed:`, message);
    }
  }

  if (newUrls.length === 0) {
    return NextResponse.json({ error: 'All candidates failed to generate' }, { status: 500 });
  }

  // Merge: prepend new candidates to existing ones
  const existing = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;
  const existingEntry = existing[entityId];
  const mergedCandidates = [...newUrls, ...(existingEntry?.candidates ?? [])];

  const updated: ReferenceStills = {
    ...existing,
    [entityId]: {
      status: 'done',
      candidates: mergedCandidates,
      selected: existingEntry?.selected ?? null,
    },
  };

  await db.storyboard.update({
    where: { id },
    data: { reference_stills: updated as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ candidates: mergedCandidates });
}
