import { NextRequest } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { put } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { RefEntity, ReferenceStills } from '@/src/lib/reference-stills';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const WATERCOLOUR_STYLE =
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration. No photorealism, no CGI, no digital art. Naturalistic human anatomy and facial proportions throughout — eyes sized as in real life, iris occupying roughly one-third of visible eye height with natural sclera visible on both sides. No enlarged irises, no anime-style or cartoon-style eye exaggeration, no chibi proportions, no Disney-inflated eyes.';

// Prepended to every PHOTOREAL-mode prompt to anchor the output medium regardless
// of what artistic language the style_lock may contain.
const PHOTOREAL_ANCHOR =
  'PHOTOREALISTIC PHOTOGRAPH. Real camera, real lens, real light, real materials. ' +
  'NOT an illustration. NOT a painting. NOT a sketch. NOT watercolour. NOT digital art. NOT anime. NOT cartoon. ' +
  'Naturalistic human anatomy — no exaggerated proportions, no illustrated features.';

// Preamble prepended to every reference still prompt.
// Establishes the output contract before the entity description so the model
// doesn't drift into narrative storyboard mode.
const REF_PREAMBLE =
  'This is a CLEAN REFERENCE IMAGE for a single entity — a neutral-lit portrait or product shot with NO narrative context. ' +
  'Single subject only, plain or simple background, single moment, single viewpoint. ' +
  'DO NOT include: text overlays, captions, labels, scene descriptors, temporal markers ("present day", "1962"), ' +
  'split panels, before/after panels, collages, multiple time periods, or multiple scenes. ' +
  'The image must contain ONLY the entity described below and nothing else that tells a story.';

function buildPrompt(
  entity: RefEntity,
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
  styleRefDescription?: string,
): string {
  const base = entity.reference_still_prompt;
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `${REF_PREAMBLE}\n\nStyle: ${WATERCOLOUR_STYLE}\n\n${base}`;
  }
  if (renderStyle === 'STYLE_REF') {
    const styleNote = styleRefDescription
      ? `Match the visual style of the provided style reference image (${styleRefDescription}).`
      : 'Match the visual style of the provided style reference image.';
    return `${REF_PREAMBLE}\n\nStyle: ${styleNote}\n\n${base}`;
  }
  const styleParts: string[] = [];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `${REF_PREAMBLE}\n\nStyle: ${PHOTOREAL_ANCHOR} ${styleParts.join(' ')}\n\n${base}`;
}

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
    return null;
  }
}

// Generate one image, retrying on 429/400 with exponential backoff (up to 3 attempts).
// Returns base64 bytes + mime type, or null if the response contains no image part.
// Returns image data, or throws a descriptive error explaining why no image was produced.
async function generateOneImage(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  // styleRefImage is passed as the first conditioning part in STYLE_REF mode.
  styleRefImage: { data: string; mimeType: string } | null = null,
): Promise<{ data: string; mimeType: string }> {
  const delays = [5000, 15000, 30000];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GoogleGenAI Part type varies by version
  const contents: any = styleRefImage
    ? [{
        role: 'user',
        parts: [
          { text: '[STYLE REFERENCE: Match this visual style exactly — colour palette, lighting, rendering technique, texture. Do NOT copy any subject, character, or composition from it.]' },
          { inlineData: { data: styleRefImage.data, mimeType: styleRefImage.mimeType } },
          { text: prompt },
        ],
      }]
    : prompt;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      // IMAGE-only modality prevents Gemini from producing annotated
      // storyboard-style frames with text overlays burned into the image.
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { responseModalities: [Modality.IMAGE] },
      });
      const candidate = response.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? 'image/png' };
        }
      }
      // No image returned — surface finish reason for debugging
      const finishReason = candidate?.finishReason ?? 'UNKNOWN';
      throw new Error(`No image in response (model: ${model}). Finish reason: ${finishReason}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const msgLower = msg.toLowerCase();
      // Spending cap / billing block — 429 with cap message, not retryable.
      const isSpendingCap = msgLower.includes('spending cap') || msgLower.includes('monthly') && msgLower.includes('cap');
      const is403 = msg.includes('"code":403') || msg.includes('status: 403') || msg.includes('HTTP 403');
      const mentionsBilling = msgLower.includes('billing') || msgLower.includes('payment');
      const isHardBlock = is403 || mentionsBilling || isSpendingCap;
      const is429 = msg.includes('"code":429') || msg.includes('status: 429') || msg.includes('HTTP 429');
      const isRateLimit = is429 && !isHardBlock;
      if (isRateLimit && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]!));
        continue;
      }
      if (isHardBlock) {
        const hint = isSpendingCap
          ? 'Monthly spending cap exceeded — raise or remove the cap at aistudio.google.com (Billing → Manage spending).'
          : 'Google AI quota/billing error — check your plan at ai.google.dev.';
        throw new Error(`${hint} Raw: ${msg}`);
      }
      throw err;
    }
  }
  // Unreachable but required for TypeScript
  throw new Error('generateOneImage: exhausted retries');
}

// Upload a single candidate image to Vercel Blob and return its public URL.
async function uploadCandidate(
  storyboardId: string,
  entityId: string,
  index: number,
  img: { data: string; mimeType: string },
  runId: number,
): Promise<string> {
  const buffer = Buffer.from(img.data, 'base64');
  const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const blob = await put(
    `${storyboardId}/refs/${entityId}/${runId}-${index}.${ext}`,
    buffer,
    { access: 'public', allowOverwrite: true, contentType: img.mimeType },
  );
  return blob.url;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const force = new URL(request.url).searchParams.get('force') === 'true';

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return new Response(JSON.stringify({ error: 'Storyboard not found' }), { status: 404 });
  }
  if (!storyboard.parsed_json) {
    return new Response(JSON.stringify({ error: 'Storyboard not yet parsed' }), { status: 422 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_AI_API_KEY not set' }), { status: 503 });
  }

  const parsed = storyboard.parsed_json as unknown as ParsedStoryboard;
  const model = storyboard.image_model ?? 'gemini-2.5-flash-image';
  const renderStyle = storyboard.render_style;

  // For STYLE_REF mode, fetch the style reference image once to be injected
  // as a conditioning image alongside every entity prompt.
  const styleRefImage = renderStyle === 'STYLE_REF' && storyboard.style_ref_url
    ? await fetchImageAsBase64(storyboard.style_ref_url)
    : null;

  const entities: RefEntity[] = [
    ...parsed.characters.map((c) => ({
      id: c.id, name: c.name, type: 'character' as const,
      reference_still_prompt: c.reference_still_prompt, aspectRatio: '3:4' as const,
    })),
    ...parsed.locations.map((l) => ({
      id: l.id, name: l.name, type: 'location' as const,
      reference_still_prompt: l.reference_still_prompt, aspectRatio: '16:9' as const,
    })),
    ...parsed.props
      .filter((p) => p.generates_reference_still && p.reference_still_prompt)
      .map((p) => ({
        id: p.id, name: p.name, type: 'prop' as const,
        reference_still_prompt: p.reference_still_prompt!, aspectRatio: '1:1' as const,
      })),
  ];

  const encoder = new TextEncoder();
  const ai = new GoogleGenAI({ apiKey });
  const runId = Date.now();

  // On force (redo), regenerate all entities. Otherwise skip ones that already have candidates.
  const existing = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;
  const entitiesToGenerate = force
    ? entities
    : entities.filter((e) => !(existing[e.id]?.candidates.length));

  const refStills: ReferenceStills = { ...existing };
  for (const entity of entitiesToGenerate) {
    refStills[entity.id] = { status: 'pending', candidates: [], selected: existing[entity.id]?.selected ?? null };
  }
  await getDb().storyboard.update({
    where: { id },
    data: { reference_stills: refStills as unknown as Prisma.InputJsonValue, status: 'REFS_PENDING' },
  });

  const readable = new ReadableStream({
    async start(controller) {
      // Silent send — if browser disconnects the enqueue throws; we swallow it
      // so background DB writes continue regardless of client connection state.
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* disconnected */ }
      };

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
      }, 10000);

      try {
        send({ type: 'start', total: entitiesToGenerate.length });

        // Process up to 3 entities concurrently (6 Gemini calls max in flight).
        // generateOneImage already retries on 429 with backoff, so transient
        // rate-limit pressure degrades gracefully rather than failing the run.
        const ENTITY_CONCURRENCY = 3;
        const processEntity = async (entity: RefEntity, i: number) => {
          const entityStart = Date.now();
          send({ type: 'entity_start', entityId: entity.id, entityName: entity.name, entityType: entity.type, index: i, total: entitiesToGenerate.length });

          refStills[entity.id] = { status: 'generating', candidates: [], selected: existing[entity.id]?.selected ?? null };
          await getDb().storyboard.update({ where: { id }, data: { reference_stills: refStills as unknown as Prisma.InputJsonValue } });

          try {
            const prompt = buildPrompt(entity, renderStyle, parsed.style_lock);

            // 2 candidates in parallel per entity: small enough fan-out (2 concurrent
            // calls max) that rate limiting is not a concern.
            const candidateResults = await Promise.allSettled(
              [0, 1].map(async (j) => {
                const img = await generateOneImage(ai, model, prompt, styleRefImage);
                const url = await uploadCandidate(id, entity.id, j, img, runId);
                send({ type: 'entity_candidate', entityId: entity.id, url, index: j });
                return url;
              }),
            );

            const aiCandidates = candidateResults
              .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
              .map((r) => r.value);

            // If the entity had a user-uploaded selected image, keep it in the
            // candidates list so it remains visible and selectable after redo.
            const prevSelected = existing[entity.id]?.selected ?? null;
            const candidates = (prevSelected && !aiCandidates.includes(prevSelected))
              ? [...aiCandidates, prevSelected]
              : aiCandidates;

            // Collect actual rejection reasons — these are the real API errors
            const rejectionMsgs = candidateResults
              .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
              .map((r) => r.reason instanceof Error ? r.reason.message.slice(0, 200) : String(r.reason));

            const status = aiCandidates.length > 0 ? 'done' : 'error';
            const errorMsg = aiCandidates.length === 0
              ? rejectionMsgs[0] ?? 'All candidates failed with unknown error.'
              : undefined;
            refStills[entity.id] = { status, candidates, selected: existing[entity.id]?.selected ?? null, ...(errorMsg ? { error: errorMsg } : {}) };
            await getDb().storyboard.update({ where: { id }, data: { reference_stills: refStills as unknown as Prisma.InputJsonValue } });

            if (candidates.length > 0) {
              send({ type: 'entity_done', entityId: entity.id, candidates, durationMs: Date.now() - entityStart });
            } else {
              send({ type: 'entity_error', entityId: entity.id, message: errorMsg!, durationMs: Date.now() - entityStart });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            refStills[entity.id] = { status: 'error', candidates: [], selected: existing[entity.id]?.selected ?? null, error: message };
            await getDb().storyboard.update({ where: { id }, data: { reference_stills: refStills as unknown as Prisma.InputJsonValue } });
            send({ type: 'entity_error', entityId: entity.id, message, durationMs: Date.now() - entityStart });
          }
        };

        // Simple worker pool: ENTITY_CONCURRENCY workers pull from a shared index.
        let nextIndex = 0;
        await Promise.all(
          Array.from({ length: Math.min(ENTITY_CONCURRENCY, entitiesToGenerate.length) }, async () => {
            while (nextIndex < entitiesToGenerate.length) {
              const i = nextIndex++;
              await processEntity(entitiesToGenerate[i]!, i);
            }
          }),
        );

        await getDb().storyboard.update({ where: { id }, data: { status: 'REFS_PENDING' } });
        send({ type: 'done', total: entitiesToGenerate.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'error', message });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
