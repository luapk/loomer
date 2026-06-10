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
    history?: string[]; // previous render URLs, newest-first
    error?: string;
  }
>;

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const WATERCOLOUR_STYLE =
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration. No photorealism, no CGI, no digital art. Naturalistic human anatomy and facial proportions throughout — eyes sized as in real life, iris occupying roughly one-third of visible eye height with natural sclera visible on both sides. No enlarged irises, no anime-style or cartoon-style eye exaggeration, no chibi proportions, no Disney-inflated eyes.';

// Single-frame guard prepended to every shot prompt. A key_frame_prompt that
// carries editorial cross-cut language ("match cut", "intercut", references to
// a parallel timeline) makes Gemini render a diptych. This guard forces a
// single continuous frame regardless of what the prompt text implies.
const SINGLE_FRAME_GUARD =
  'Render ONE single continuous frame — a single photographic moment in a single location. ' +
  'DO NOT produce a split-screen, diptych, side-by-side panels, before/after panels, inset images, ' +
  'picture-in-picture, collage, or any multi-panel layout. DO NOT add text overlays, captions, or labels. ' +
  'If the description below mentions a "match cut", "intercut", "meanwhile", or another shot/timeline, ' +
  'ignore that editorial language entirely and depict ONLY this one shot\'s frozen moment.';

// Restates the shot's cinematic grammar as the compositional authority, so
// framing decisions come from the storyboard skill's grammar — not from the
// perspective/geometry of whichever reference image happens to be attached.
function buildGrammarLine(grammar: ParsedStoryboard['shots'][number]['grammar']): string {
  const bits = [
    `shot size ${grammar.scale}`,
    `camera angle ${grammar.angle}`,
    `lens ${grammar.lens}`,
    `screen direction ${grammar.screen_direction}`,
  ];
  return `CAMERA GRAMMAR (authoritative — the frame's composition, perspective, and camera placement MUST follow this, never the geometry of any reference image): ${bits.join(', ')}.`;
}

function buildShotPrompt(
  keyFramePrompt: string,
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
  grammar?: ParsedStoryboard['shots'][number]['grammar'],
): string {
  const grammarLine = grammar ? `${buildGrammarLine(grammar)}\n\n` : '';
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `${SINGLE_FRAME_GUARD}\n\n${grammarLine}Style: ${WATERCOLOUR_STYLE}\n\n${keyFramePrompt}`;
  }
  if (renderStyle === 'STYLE_REF') {
    // Style declaration is handled via a conditioning image; the prompt just
    // carries the grammar guard and key-frame description.
    return `${SINGLE_FRAME_GUARD}\n\n${grammarLine}${keyFramePrompt}`;
  }
  const styleParts = [styleLock.look];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `${SINGLE_FRAME_GUARD}\n\n${grammarLine}Style: ${styleParts.join(' ')}\n\n${keyFramePrompt}`;
}

// Returns a terse style declaration placed BEFORE reference images so the model
// anchors to the output medium before it sees any photographic references.
// STYLE_REF mode uses a conditioning image for style — see generateOneShot.
function buildStyleDeclaration(
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
): string {
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `OUTPUT STYLE (mandatory): ${WATERCOLOUR_STYLE} Every element in the output MUST conform to this style — including characters and locations taken from reference images.`;
  }
  if (renderStyle === 'STYLE_REF') {
    return 'OUTPUT STYLE (mandatory): Match the visual style of the STYLE REFERENCE image provided — reproduce its colour palette, lighting quality, rendering technique, texture, and overall aesthetic. Every element in the output MUST match this style.';
  }
  const styleParts = [styleLock.look];
  if (styleLock.dp_reference) styleParts.push(`Shot by ${styleLock.dp_reference}.`);
  if (styleLock.film_stock_feel) styleParts.push(`Film: ${styleLock.film_stock_feel}.`);
  styleParts.push(styleLock.colour_grade);
  if (styleLock.lighting_register) styleParts.push(styleLock.lighting_register);
  return `OUTPUT STYLE (mandatory): ${styleParts.join(' ')} Every element in the output MUST conform to this style — including characters and locations taken from reference images.`;
}

// ---------------------------------------------------------------------------
// Scene grouping — consecutive shots sharing the same location_id form a scene.
// Shots in different scenes (different location, temporal cut, flashback) run
// fully in parallel with no prevFrame passed between them.
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
// ---------------------------------------------------------------------------

async function generateOneShot(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  styleDeclaration: string,
  // Conditioning images are prefetched once per run (not per shot) and passed
  // in already loaded — see the imageCache in the route handler.
  conditioningEntities: { name: string; img: { data: string; mimeType: string } }[],
  // prevFrameUrl is only used in WATERCOLOUR_SKETCH mode. In photoreal mode the
  // output medium matches the prevFrame medium, so Gemini composites the content
  // rather than reading it as a spatial reference. The style mismatch in
  // watercolour mode acts as a natural barrier against this.
  prevFrameUrl: string | null,
  // styleRefImage is used in STYLE_REF mode — injected first as a style-only
  // conditioning image before any identity references.
  styleRefImage: { data: string; mimeType: string } | null = null,
): Promise<{ data: string; mimeType: string } | null> {
  const prevFrameResult = prevFrameUrl ? await fetchImageAsBase64(prevFrameUrl) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GoogleGenAI Part type varies by version
  const parts: any[] = [];

  // Style declaration comes FIRST — before any images — so the model anchors to
  // the output medium before it sees photographic references.
  parts.push({ text: styleDeclaration });

  // Style reference image (STYLE_REF mode) — injected immediately after the
  // style declaration so the medium is locked before identity refs are shown.
  if (styleRefImage) {
    parts.push({ text: '[STYLE REFERENCE — Match this visual style exactly. Reproduce its colour palette, lighting quality, rendering technique, texture, line quality, and overall aesthetic. This image defines the output medium — do NOT copy any characters, objects, locations, or composition from it.]' });
    parts.push({ inlineData: { data: styleRefImage.data, mimeType: styleRefImage.mimeType } });
  }

  // Spatial continuity reference — only used in watercolour mode where the
  // pencil-sketch output style is sufficiently different from a photographic
  // prevFrame that Gemini reads positions without compositing content.
  if (prevFrameResult) {
    parts.push({ text: '[SPATIAL LAYOUT REFERENCE — DO NOT COPY CONTENT: The image below is the immediately preceding shot in this scene. DO NOT reproduce, embed, overlay, inset, or include ANY visual content from it in your output. DO NOT use it as a source of characters, objects, backgrounds, colours, or style. Read it ONLY for: (1) which screen-side each character occupies (left vs right of frame), (2) eyeline directions, (3) positions of major environmental elements. Your output image must contain ONLY what the following shot description specifies.]' });
    parts.push({ inlineData: { data: prevFrameResult.data, mimeType: prevFrameResult.mimeType } });
  }

  // Named identity references.
  if (conditioningEntities.length > 0) {
    parts.push({ text: '[IDENTITY REFERENCES: The labelled images below define ONLY the visual appearance of each entity — its shape, colour, texture, materials, and distinguishing features. Extract this visual identity and render it in the OUTPUT STYLE declared above. DO NOT copy the spatial position, orientation, camera angle, perspective geometry, or compositional arrangement from any reference image. The shot description governs ALL composition — where entities are placed, which direction they face, how the camera frames the scene. References answer "what does it look like?" only; the shot prompt answers "how is the scene composed?". DISREGARD any colour, material, or appearance adjective in the prompt text for these entities — the reference image overrides it. Do NOT copy the photographic medium of the references.]' });
    for (const { name, img } of conditioningEntities) {
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
      const msgLower = msg.toLowerCase();
      const isSpendingCap = msgLower.includes('spending cap') || (msgLower.includes('monthly') && msgLower.includes('cap'));
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

  // Fetch style reference image once for STYLE_REF mode.
  const styleRefImage = renderStyle === 'STYLE_REF' && storyboard.style_ref_url
    ? await fetchImageAsBase64(storyboard.style_ref_url)
    : null;

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

        // Prefetch every selected reference image ONCE for the whole run.
        // Previously each shot re-fetched all of its conditioning images
        // (~entities × shots redundant fetches), and a failed fetch silently
        // dropped the entity's identity reference with no warning.
        const imageCache = new Map<string, { data: string; mimeType: string } | null>();
        const allRefUrls = new Set<string>();
        for (const entityId of Object.keys(entityNames)) {
          const url = selectedRefUrl(entityId);
          if (url) allRefUrls.add(url);
        }
        await Promise.all(
          [...allRefUrls].map(async (url) => {
            imageCache.set(url, await fetchImageAsBase64(url));
          }),
        );
        for (const entityId of Object.keys(entityNames)) {
          const url = selectedRefUrl(entityId);
          if (url && imageCache.get(url) === null) {
            send({
              type: 'ref_warning',
              entityId,
              message: `Reference image for ${entityNames[entityId]} could not be loaded — shots will generate without it.`,
            });
          }
        }
        const cachedImage = (entityId: string): { data: string; mimeType: string } | null => {
          const url = selectedRefUrl(entityId);
          return url ? (imageCache.get(url) ?? null) : null;
        };

        // Scenes run in parallel; shots within a scene run sequentially so each
        // shot can receive the previous rendered frame for spatial continuity.
        // A scene boundary (different location_id) guarantees prevFrame is never
        // passed across a location cut, temporal flashback, or period jump.
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
                const prompt = buildShotPrompt(shot.key_frame_prompt, renderStyle, parsed.style_lock, shot.grammar);
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
                    const img = cachedImage(entityId);
                    return img ? { name: entityNames[entityId] ?? entityId, img } : null;
                  })
                  .filter((e): e is { name: string; img: { data: string; mimeType: string } } => e !== null);

                // Secondary: props with an approved ref that aren't in this shot's
                // explicit continuity (packshots, hero products, always-present items).
                // Props are safe to add globally — unlike characters, the model won't
                // spontaneously insert a product into a frame it doesn't belong in.
                const secondaryEntities = parsed.props
                  .filter((p) => !continuityIds.has(p.id))
                  .map((p) => {
                    const img = cachedImage(p.id);
                    return img ? { name: p.name, img } : null;
                  })
                  .filter((e): e is { name: string; img: { data: string; mimeType: string } } => e !== null);

                const conditioningEntities = [...primaryEntities, ...secondaryEntities];

                // prevFrame spatial continuity is only safe in watercolour mode —
                // in photoreal mode Gemini composites the image content rather than
                // reading it as a spatial reference.
                const prevFrameForShot = renderStyle === 'WATERCOLOUR_SKETCH' ? prevShotUrl : null;
                const img = await generateOneShot(ai, model, prompt, styleDeclaration, conditioningEntities, prevFrameForShot, styleRefImage);

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
                // Preserve any previous render URL in the history stack (newest-first).
                const prev = shotKeyFrames[shotKey];
                const prevUrl = prev?.url;
                const prevHistory = prev?.history ?? [];
                const history = prevUrl ? [prevUrl, ...prevHistory].slice(0, 10) : prevHistory;
                shotKeyFrames[shotKey] = { status: 'done', url: blob.url, history };
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
