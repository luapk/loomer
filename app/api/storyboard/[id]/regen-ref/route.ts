import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { put } from '@vercel/blob';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';
import { getReferenceStills, upsertReferenceStill } from '@/src/lib/frame-store';
import { loadStyleImages } from '@/src/lib/styles';
import { debit, refund, imagesCost, InsufficientCreditsError, insufficientPayload } from '@/src/lib/credits';
import type { ParsedStoryboard } from '@/src/schema/storyboard';
import { PHOTOREAL_STYLE } from '@/src/lib/photoreal-style';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Copied from generate-refs/route.ts — do not import from it.
const WATERCOLOUR_STYLE =
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration. No photorealism, no CGI, no digital art.';


function buildPrompt(
  basePrompt: string,
  renderStyle: string,
  _styleLock: ParsedStoryboard['style_lock'],
): string {
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `Style: ${WATERCOLOUR_STYLE}\n\n${basePrompt}`;
  }
  if (renderStyle === 'STYLE_REF') {
    // Style is carried by the conditioning image — see generateOneImage.
    return basePrompt;
  }
  return `Style: ${PHOTOREAL_STYLE}\n\n${basePrompt}`;
}

async function generateOneImage(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  styleRefImages: { data: string; mimeType: string }[] = [],
): Promise<{ data: string; mimeType: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GoogleGenAI Part type varies by version
  const parts: any[] = [];
  if (styleRefImages.length > 0) {
    parts.push({ text: '[STYLE REFERENCE — Match this visual style exactly. Reproduce its colour palette, lighting quality, rendering technique, texture, line quality, and overall aesthetic. This image defines the output medium — do NOT copy any characters, objects, locations, or composition from it.]' });
    for (const img of styleRefImages) {
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
      // Only 429 (rate limit) is transient — 400s are deterministic and
      // retrying them just wastes up to 50s per attempt chain.
      const isRetryable = msg.includes('"code":429');
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
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  const body = await request.json() as { entityId?: unknown; notes?: unknown };
  const entityId = typeof body.entityId === 'string' ? body.entityId : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

  if (!entityId) {
    return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
  }

  const db = getDb();
  const storyboard = await db.storyboard.findUnique({
    where: { id },
    select: { parsed_json: true, image_model: true, render_style: true, style_ref_url: true, style_id: true },
  });
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

  // STYLE_REF mode: fetch the style's images so fine-tuned alts match the
  // saved style instead of falling back to the house photoreal look.
  const styleRefImages = renderStyle === 'STYLE_REF'
    ? await loadStyleImages(db, storyboard)
    : [];

  // Charge for both candidates up front; whichever fails is refunded below.
  const CANDIDATES = 2;
  let chargedCredits = 0;
  try {
    chargedCredits = await debit(db, auth, imagesCost(model, CANDIDATES), {
      storyboardId: id,
      note: `Fine-tune reference ${entityId}`,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(insufficientPayload(err), { status: 402 });
    }
    throw err;
  }

  // Generate both candidates in parallel — halves user-facing latency; each
  // has its own 429 retry chain inside generateOneImage.
  const timestamp = Date.now();
  const results = await Promise.allSettled(
    [0, 1].map(async (j) => {
      const img = await generateOneImage(ai, model, finalPrompt, styleRefImages);
      const buffer = Buffer.from(img.data, 'base64');
      const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const blob = await put(
        `${id}/refs/${entityId}/finetune-${timestamp}-${j}.${ext}`,
        buffer,
        { access: 'public', allowOverwrite: true, contentType: img.mimeType },
      );
      return blob.url;
    }),
  );
  const newUrls: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') newUrls.push(r.value);
    else console.error('regen-ref candidate failed:', r.reason instanceof Error ? r.reason.message : String(r.reason));
  }

  if (chargedCredits > 0 && newUrls.length < CANDIDATES) {
    const unrendered = CANDIDATES - newUrls.length;
    await refund(db, auth, imagesCost(model, unrendered), {
      storyboardId: id,
      note: `${unrendered} fine-tune candidate${unrendered === 1 ? '' : 's'} did not render`,
    }).catch(() => { /* best effort */ });
  }

  if (newUrls.length === 0) {
    return NextResponse.json({ error: 'All candidates failed to generate' }, { status: 500 });
  }

  // Merge: prepend new candidates to this entity's existing ones — a single-
  // row write that cannot affect any other entity's state.
  const refStills = await getReferenceStills(db, id);
  const existingEntry = refStills[entityId];
  const mergedCandidates = [...newUrls, ...(existingEntry?.candidates ?? [])];

  await upsertReferenceStill(db, id, entityId, {
    ...(existingEntry ?? {}),
    status: 'done',
    candidates: mergedCandidates,
    selected: existingEntry?.selected ?? null,
  });

  return NextResponse.json({ candidates: mergedCandidates });
}
