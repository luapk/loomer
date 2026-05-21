import { NextRequest } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { put } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ReferenceStills } from '@/src/lib/reference-stills';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

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

// Returns a terse style declaration placed BEFORE reference images so the model
// anchors to the output medium before it sees any photographic references.
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
  styleDeclaration: string,
  conditioningEntities: { name: string; url: string }[],
  prevFrameUrl: string | null,
): Promise<{ data: string; mimeType: string } | null> {
  const [prevFrameResult, ...entityResults] = await Promise.all([
    prevFrameUrl ? fetchImageAsBase64(prevFrameUrl) : Promise.resolve(null),
    ...conditioningEntities.map((e) => fetchImageAsBase64(e.url)),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GoogleGenAI Part type varies by version
  const parts: any[] = [];

  // Style declaration comes FIRST — before any images — so the model anchors to
  // the output medium before it sees photographic references.
  parts.push({ text: styleDeclaration });

  // Prev frame for spatial continuity within the scene.
  if (prevFrameResult) {
    parts.push({ text: '[CONTINUITY REFERENCE: The following image is the immediately preceding shot in this scene. Maintain spatial consistency — character screen-side positions, eyeline directions, room geography — but render in the OUTPUT STYLE declared above.]' });
    parts.push({ inlineData: { data: prevFrameResult.data, mimeType: prevFrameResult.mimeType } });
  }

  // Named identity references. Each ref is labelled so the model knows which
  // entity it represents. The model must extract identity (face, features,
  // clothing) and render it in the declared output style — NOT copy the
  // photographic medium of the reference.
  const loadedEntities = conditioningEntities
    .map((e, i) => ({ name: e.name, img: entityResults[i] ?? null }))
    .filter((e): e is { name: string; img: { data: string; mimeType: string } } => e.img !== null);

  if (loadedEntities.length > 0) {
    parts.push({ text: '[IDENTITY REFERENCES: The labelled images below are the SOLE visual specification for each entity. DISREGARD any colour, material, or appearance adjective used to describe these entities in the prompt text — those reflect the original brief and may be outdated. The reference image is always correct. If the prompt says "blue button" but the reference shows a yellow button, render it yellow. Extract identity and translate it into the OUTPUT STYLE declared above. Do NOT copy the photographic medium of the references.]' });
    for (const { name, img } of loadedEntities) {
      // Strip appearance descriptor (everything after " — ") from the label so the
      // label text does not contradict the reference image (e.g. "Speech button —
      // mid-blue" → "Speech button" avoids the model anchoring on "mid-blue").
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

  // Build entity name lookup for labelled conditioning
  const entityNames: Record<string, string> = {};
  for (const c of parsed.characters) entityNames[c.id] = c.name;
  for (const l of parsed.locations) entityNames[l.id] = l.name;
  for (const p of parsed.props) entityNames[p.id] = p.name;

  const encoder = new TextEncoder();
  const ai = new GoogleGenAI({ apiKey });
  const runId = Date.now();

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
                const styleDeclaration = buildStyleDeclaration(renderStyle, parsed.style_lock);

                // Primary: entities explicitly in this shot's continuity.
                const continuityIds = new Set<string>([
                  ...shot.continuity.characters,
                  shot.continuity.location_id,
                  ...shot.continuity.props_persisting,
                  ...shot.continuity.props_introduced,
                ]);
                const primaryEntities = [...continuityIds]
                  .map((entityId) => {
                    const url = selectedRefUrl(entityId);
                    return url ? { name: entityNames[entityId] ?? entityId, url } : null;
                  })
                  .filter((e): e is { name: string; url: string } => e !== null);

                // Secondary: props with an approved ref that aren't in this shot's
                // explicit continuity (packshots, hero products, always-present items).
                // Props are safe to add globally — unlike characters, the model won't
                // spontaneously insert a product into a frame it doesn't belong in.
                const secondaryEntities = parsed.props
                  .filter((p) => !continuityIds.has(p.id))
                  .map((p) => {
                    const url = selectedRefUrl(p.id);
                    return url ? { name: p.name, url } : null;
                  })
                  .filter((e): e is { name: string; url: string } => e !== null);

                const conditioningEntities = [...primaryEntities, ...secondaryEntities];

                const img = await generateOneShot(ai, model, prompt, styleDeclaration, conditioningEntities, prevShotUrl);

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
                  `${id}/shots/${shot.shot_number}-${runId}.${ext}`,
                  buffer,
                  { access: 'public', contentType: img.mimeType },
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
