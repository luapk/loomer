import { NextRequest } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { put } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { RefEntity, ReferenceStills } from '@/src/lib/reference-stills';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const WATERCOLOUR_STYLE =
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration. No photorealism, no CGI, no digital art.';

function buildPrompt(
  entity: RefEntity,
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
): string {
  const base = entity.reference_still_prompt;
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `Style: ${WATERCOLOUR_STYLE}\n\n${base}`;
  }
  const styleParts = [styleLock.look];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `Style: ${styleParts.join(' ')}\n\n${base}`;
}

// Generate one image, retrying on 429/400 with exponential backoff (up to 3 attempts).
// Returns base64 bytes + mime type, or null if the response contains no image part.
// Returns image data, or throws a descriptive error explaining why no image was produced.
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
      // Surface why there's no image: finish reason, safety ratings, or any text the model returned
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
      const isQuotaExceeded = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('billing');
      const isRateLimit = (msg.includes('"code":429') || msg.includes('"code":400')) && !isQuotaExceeded;
      if (isRateLimit && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]!));
        continue;
      }
      if (isQuotaExceeded) {
        throw new Error('Google AI quota exceeded — upgrade your plan at ai.google.dev or try again tomorrow.');
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
): Promise<string> {
  const buffer = Buffer.from(img.data, 'base64');
  const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const blob = await put(
    `${storyboardId}/refs/${entityId}/${index}.${ext}`,
    buffer,
    { access: 'public', contentType: img.mimeType },
  );
  return blob.url;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  // Preserve any entity that already has candidates — only regenerate missing/errored ones.
  const existing = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;
  const entitiesToGenerate = entities.filter(
    (e) => !(existing[e.id]?.candidates.length),
  );

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

        // Process entities SEQUENTIALLY (one at a time) to avoid rate limits.
        // Within each entity, 2 candidates run in parallel — just 2 concurrent
        // calls at any moment, no quota pressure.
        for (let i = 0; i < entitiesToGenerate.length; i++) {
          const entity = entitiesToGenerate[i]!;
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
                const img = await generateOneImage(ai, model, prompt);
                const url = await uploadCandidate(id, entity.id, j, img);
                send({ type: 'entity_candidate', entityId: entity.id, url, index: j });
                return url;
              }),
            );

            const candidates = candidateResults
              .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
              .map((r) => r.value);

            // Collect actual rejection reasons — these are the real API errors
            const rejectionMsgs = candidateResults
              .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
              .map((r) => r.reason instanceof Error ? r.reason.message.slice(0, 200) : String(r.reason));

            const status = candidates.length > 0 ? 'done' : 'error';
            const errorMsg = candidates.length === 0
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
        }

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
