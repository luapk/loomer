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
    return `${base}\n\nStyle: ${WATERCOLOUR_STYLE}`;
  }
  const styleParts = [styleLock.look];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `${base}\n\nStyle: ${styleParts.join(' ')}`;
}

// Generate one image, retrying on 429/400 with exponential backoff (up to 3 attempts).
// Returns base64 bytes + mime type, or null if the response contains no image part.
async function generateOneImage(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
): Promise<{ data: string; mimeType: string } | null> {
  const delays = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseModalities: [Modality.IMAGE] },
      });
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? 'image/png' };
        }
      }
      // Model responded but returned no image (content blocked / text-only response)
      return null;
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
  return null;
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
  const model = storyboard.image_model ?? 'nano-banana-pro-preview';
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

  const refStills: ReferenceStills = {};
  for (const entity of entities) {
    refStills[entity.id] = { status: 'pending', candidates: [], selected: null };
  }
  await getDb().storyboard.update({
    where: { id },
    data: { reference_stills: refStills as unknown as Prisma.InputJsonValue, status: 'REFS_PENDING' },
  });

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
      }, 10000);

      try {
        send({ type: 'start', total: entities.length });

        // All entities generate in parallel — drops N×15s to ~15s flat.
        // Each entity independently updates refStills and writes to DB as it completes.
        await Promise.all(
          entities.map(async (entity, i) => {
            const entityStart = Date.now();
            send({ type: 'entity_start', entityId: entity.id, entityName: entity.name, entityType: entity.type, index: i, total: entities.length });

            refStills[entity.id] = { status: 'generating', candidates: [], selected: null };
            await getDb().storyboard.update({ where: { id }, data: { reference_stills: refStills as unknown as Prisma.InputJsonValue } });

            try {
              const prompt = buildPrompt(entity, renderStyle, parsed.style_lock);

              // Generate candidates SEQUENTIALLY within each entity so we don't
              // fire N-entities × 4-candidates = 44+ simultaneous API calls that
              // all hit the per-minute rate limit. Entities remain parallel (each
              // entity is its own async task), but candidates within an entity are
              // serial. This caps concurrent calls at entity-count (e.g. 11), not
              // entity-count × 4.
              const candidates: string[] = [];
              for (let j = 0; j < 4; j++) {
                try {
                  const img = await generateOneImage(ai, model, prompt);
                  if (img) {
                    const url = await uploadCandidate(id, entity.id, j, img);
                    candidates.push(url);
                    // Stream each candidate as it arrives so the UI can show it immediately
                    send({ type: 'entity_candidate', entityId: entity.id, url, index: j });
                  }
                } catch (candidateErr) {
                  // Log but continue — one bad candidate shouldn't abort the rest
                  const msg = candidateErr instanceof Error ? candidateErr.message.slice(0, 120) : String(candidateErr);
                  send({ type: 'entity_candidate_error', entityId: entity.id, index: j, message: msg });
                }
              }

              const status = candidates.length > 0 ? 'done' : 'error';
              const errorMsg = candidates.length === 0 ? 'All candidates returned no image. The model may have blocked the prompt or hit a quota limit.' : undefined;
              refStills[entity.id] = { status, candidates, selected: null, ...(errorMsg ? { error: errorMsg } : {}) };
              await getDb().storyboard.update({ where: { id }, data: { reference_stills: refStills as unknown as Prisma.InputJsonValue } });

              if (candidates.length > 0) {
                send({ type: 'entity_done', entityId: entity.id, candidates, durationMs: Date.now() - entityStart });
              } else {
                send({ type: 'entity_error', entityId: entity.id, message: errorMsg!, durationMs: Date.now() - entityStart });
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              refStills[entity.id] = { status: 'error', candidates: [], selected: null, error: message };
              await getDb().storyboard.update({ where: { id }, data: { reference_stills: refStills as unknown as Prisma.InputJsonValue } });
              send({ type: 'entity_error', entityId: entity.id, message, durationMs: Date.now() - entityStart });
            }
          }),
        );

        await getDb().storyboard.update({ where: { id }, data: { status: 'REFS_PENDING' } });
        send({ type: 'done', total: entities.length });
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
