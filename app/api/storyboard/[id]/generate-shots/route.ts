import { NextRequest } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { put } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ReferenceStills } from '@/src/lib/reference-stills';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShotKeyFrames = Record<
  string, // key = shot_number as string
  {
    status: 'pending' | 'generating' | 'done' | 'error';
    url: string | null;
    error?: string;
  }
>;

// ---------------------------------------------------------------------------
// Style helpers
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
// Scene grouping — consecutive shots sharing the same location_id form a scene
// ---------------------------------------------------------------------------

function groupByScene(
  shots: ParsedStoryboard['shots'],
): ParsedStoryboard['shots'][] {
  const scenes: ParsedStoryboard['shots'][] = [];
  let current: ParsedStoryboard['shots'] = [];
  for (const shot of shots) {
    if (
      current.length === 0 ||
      current[current.length - 1]!.continuity.location_id === shot.continuity.location_id
    ) {
      current.push(shot);
    } else {
      scenes.push(current);
      current = [shot];
    }
  }
  if (current.length > 0) scenes.push(current);
  return scenes;
}

// ---------------------------------------------------------------------------
// Conditioning image helper
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
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shot generation
//
// prevFrameUrl — the rendered frame of the immediately preceding shot in the
// same scene. Passed as the first conditioning image so the model can maintain
// spatial continuity: character screen-sides, eyeline directions, room geography.
// ---------------------------------------------------------------------------

async function generateOneShot(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  conditioningUrls: string[],
  prevFrameUrl: string | null,
): Promise<{ data: string; mimeType: string } | null> {
  const [prevFrameResult, ...entityResults] = await Promise.all([
    prevFrameUrl ? fetchImageAsBase64(prevFrameUrl) : Promise.resolve(null),
    ...conditioningUrls.map((url) => fetchImageAsBase64(url)),
  ]);

  const conditioningImages = entityResults.filter(
    (r): r is { data: string; mimeType: string } => r !== null,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GoogleGenAI Part type varies by version
  const parts: any[] = [];

  // Prev frame comes first — most contextually relevant for spatial continuity.
  if (prevFrameResult) {
    parts.push({ inlineData: { data: prevFrameResult.data, mimeType: prevFrameResult.mimeType } });
  }
  // Style-override notice before entity references: the conditioning images define
  // appearance (face, costume, location geography) but must not bleed their
  // photographic or artistic style into the output — that is governed solely by
  // the text prompt below.
  if (conditioningImages.length > 0) {
    parts.push({ text: '[APPEARANCE REFERENCE: The following image(s) define character/location appearance ONLY. Do NOT adopt their visual style or medium. Apply strictly the style described in the text prompt.]' });
  }
  parts.push(
    ...conditioningImages.map((img) => ({
      inlineData: { data: img.data, mimeType: img.mimeType },
    })),
  );

  // Tell the model what the first image is when a prev frame is present.
  const fullPrompt = prevFrameResult
    ? `[CONTINUITY: The first image is the immediately preceding shot in this scene. Maintain spatial consistency — preserve character screen-side positions, eyeline directions, and room geography from that frame.]\n\n${prompt}`
    : prompt;

  parts.push({ text: fullPrompt });

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
  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

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

  const refStills = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;
  const selectedRefUrl = (entityId: string): string | null =>
    refStills[entityId]?.selected ?? null;

  const encoder = new TextEncoder();
  const ai = new GoogleGenAI({ apiKey });

  // Initialise all shots as pending before streaming starts.
  const shotKeyFrames: ShotKeyFrames = {};
  for (const shot of parsed.shots) {
    shotKeyFrames[String(shot.shot_number)] = { status: 'pending', url: null };
  }
  await getDb().storyboard.update({
    where: { id },
    data: {
      shot_key_frames: shotKeyFrames as unknown as Prisma.InputJsonValue,
      status: 'SHOTS_GENERATING',
    },
  });

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* disconnected */ }
      };

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
      }, 10000);

      try {
        send({ type: 'start', total: parsed.shots.length });

        // Scenes run in parallel; shots within each scene run sequentially.
        // This lets each shot receive the previous frame as a conditioning image
        // for spatial continuity, without blocking shots in other scenes.
        const scenes = groupByScene(parsed.shots);

        await Promise.all(
          scenes.map(async (scene) => {
            let prevShotUrl: string | null = null;

            for (const shot of scene) {
              const shotKey = String(shot.shot_number);
              const shotStart = Date.now();

              send({ type: 'shot_start', shotNumber: shot.shot_number, descriptor: shot.descriptor });

              shotKeyFrames[shotKey] = { status: 'generating', url: null };
              await getDb().storyboard.update({
                where: { id },
                data: { shot_key_frames: shotKeyFrames as unknown as Prisma.InputJsonValue },
              });

              try {
                const prompt = buildShotPrompt(shot.key_frame_prompt, renderStyle, parsed.style_lock);

                const entityIds: string[] = [
                  ...shot.continuity.characters,
                  shot.continuity.location_id,
                  ...shot.continuity.props_persisting,
                  ...shot.continuity.props_introduced,
                ];
                const conditioningUrls = entityIds
                  .map((entityId) => selectedRefUrl(entityId))
                  .filter((url): url is string => url !== null);

                const img = await generateOneShot(ai, model, prompt, conditioningUrls, prevShotUrl);

                if (!img) {
                  const durationMs = Date.now() - shotStart;
                  shotKeyFrames[shotKey] = { status: 'error', url: null, error: 'No image returned from model' };
                  await getDb().storyboard.update({
                    where: { id },
                    data: { shot_key_frames: shotKeyFrames as unknown as Prisma.InputJsonValue },
                  });
                  send({ type: 'shot_error', shotNumber: shot.shot_number, message: 'No image returned from model', durationMs });
                  prevShotUrl = null;
                  continue;
                }

                const buffer = Buffer.from(img.data, 'base64');
                const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
                const blob = await put(
                  `${id}/shots/${shot.shot_number}.${ext}`,
                  buffer,
                  { access: 'public', allowOverwrite: true, contentType: img.mimeType },
                );

                const durationMs = Date.now() - shotStart;
                shotKeyFrames[shotKey] = { status: 'done', url: blob.url };
                await getDb().storyboard.update({
                  where: { id },
                  data: { shot_key_frames: shotKeyFrames as unknown as Prisma.InputJsonValue },
                });

                send({ type: 'shot_done', shotNumber: shot.shot_number, url: blob.url, durationMs });
                prevShotUrl = blob.url;
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const durationMs = Date.now() - shotStart;
                shotKeyFrames[shotKey] = { status: 'error', url: null, error: message };
                await getDb().storyboard.update({
                  where: { id },
                  data: { shot_key_frames: shotKeyFrames as unknown as Prisma.InputJsonValue },
                });
                send({ type: 'shot_error', shotNumber: shot.shot_number, message, durationMs });
                prevShotUrl = null;
              }
            }
          }),
        );

        await getDb().storyboard.update({
          where: { id },
          data: { status: 'COMPLETE' },
        });
        send({ type: 'done', total: parsed.shots.length });
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
      Connection: 'keep-alive',
    },
  });
}
