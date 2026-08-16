import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { put } from '@vercel/blob';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';
import { loadStyleSummary, styleDirective } from '@/src/lib/styles';
import { isVoiceOnlyCharacter } from '@/src/lib/character-identity';
import { uniqueVisualLabels, conditioningLabel } from '@/src/lib/entity-labels';
import { getReferenceStills, upsertShotFrame } from '@/src/lib/frame-store';
import { debit, refund, imageCost, InsufficientCreditsError, insufficientPayload } from '@/src/lib/credits';
import type { ParsedStoryboard } from '@/src/schema/storyboard';
import { buildDofLine } from '@/src/lib/photoreal-style';
import { styleTextForShot, buildPhotorealDeclaration } from '@/src/lib/style-lock-prompt';
import { buildStoryStateLine } from '@/src/lib/shot-state';
import { rewriteNegations } from '@/src/lib/positive-phrasing';
import { buildScreenBindingLine } from '@/src/lib/screen-binding';

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
  // Spatial staging comes from the storyboard skill's film grammar — the
  // triangle system, line of interest, and 30-degree adjacency. Stating it
  // explicitly (with the rules it implies) is what keeps character-to-camera
  // and character-to-character geography consistent across cuts.
  const staging = [
    grammar.line_of_interest ? `The line of interest (axis) runs: ${grammar.line_of_interest}.` : '',
    grammar.triangle_position ? `Camera position in the triangle system: ${grammar.triangle_position}.` : '',
    grammar.thirty_degree_check ? `Relation to adjacent shots: ${grammar.thirty_degree_check}.` : '',
  ].filter(Boolean).join(' ');
  return (
    `CAMERA GRAMMAR (authoritative — the frame's composition, perspective, and camera placement MUST follow this, never the geometry of any reference image): ${bits.join(', ')}.\n` +
    `SPATIAL STAGING (authoritative — classical film grammar, obey exactly): ${staging} ` +
    'Apply the 180-degree rule: the camera stays on its established side of the line of interest, so every character holds the SAME screen side (left/right) and the SAME eyeline direction they hold in adjacent shots of this scene. ' +
    'Characters looking at each other must have opposing eyelines (one looks frame-left, the other frame-right). ' +
    'Foreground/background depth, relative distances between characters, and their positions within the set must stay consistent with the described geography — never mirror, flip, or restage the scene.'
  );
}

interface ShotPromptOptions {
  keyFramePrompt: string;
  renderStyle: string;
  styleLock: ParsedStoryboard['style_lock'];
  shotNumber?: number;
  grammar?: ParsedStoryboard['shots'][number]['grammar'];
  storyState?: string;
}

function buildShotPrompt({
  keyFramePrompt,
  renderStyle,
  styleLock,
  shotNumber,
  grammar,
  storyState,
}: ShotPromptOptions): string {
  const grammarLine = grammar ? `${buildGrammarLine(grammar)}\n\n` : '';
  const body = rewriteNegations(keyFramePrompt);
  const stateBlock = storyState ? `\n\n${storyState}` : '';

  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `${SINGLE_FRAME_GUARD}\n\n${grammarLine}Style: ${WATERCOLOUR_STYLE}\n\n${body}${stateBlock}`;
  }
  if (renderStyle === 'STYLE_REF') {
    // Style comes from the named style's written summary. Emitting a photoreal
    // block here would contradict it outright.
    return `${SINGLE_FRAME_GUARD}\n\n${grammarLine}${body}${stateBlock}`;
  }
  const dofLine = grammar ? `${buildDofLine(grammar.scale)} ` : '';
  const styleText = styleTextForShot(styleLock, shotNumber);
  return `${SINGLE_FRAME_GUARD}\n\n${grammarLine}Style: ${styleText} ${dofLine}\n\n${body}${stateBlock}`;
}

function buildStyleDeclaration(
  renderStyle: string,
  styleLock: ParsedStoryboard['style_lock'],
  shotNumber?: number,
  grammar?: ParsedStoryboard['shots'][number]['grammar'],
  styleSummary: string | null = null,
): string {
  if (renderStyle === 'WATERCOLOUR_SKETCH') {
    return `OUTPUT STYLE (mandatory): ${WATERCOLOUR_STYLE} Every element in the output MUST conform to this style — including characters and locations taken from reference images.`;
  }
  if (renderStyle === 'STYLE_REF') {
    return styleDirective(styleSummary);
  }
  return buildPhotorealDeclaration(styleLock, shotNumber, grammar?.scale);
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
  _prevFrameResult: null = null,
  styleRefImages: { data: string; mimeType: string }[] = [],
  screenBinding: string | null = null,
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

  // Style reference image (STYLE_REF mode) — injected after the style declaration.
  if (styleRefImages.length > 0) {
    parts.push({ text: '[STYLE REFERENCE — LOOK ONLY, LOWEST CONTENT PRIORITY. Reproduce the colour palette, lighting quality, rendering technique, texture, line quality and overall aesthetic of the image(s) below. They define HOW the frame is rendered and NOTHING about what it contains. Do NOT take any character, face, body, costume, object, location or composition from them. Where a style image and an identity reference disagree about how something LOOKS AS A THING, the identity reference always wins; the style images only govern the medium.]' });
    for (const img of styleRefImages) {
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }
  }

  if (loadedEntities.length > 0) {
    parts.push({ text: '[IDENTITY REFERENCES: The labelled images below define ONLY the visual appearance of each entity — its shape, colour, texture, materials, and distinguishing features. Extract this visual identity and render it in the OUTPUT STYLE declared above. DO NOT copy the spatial position, orientation, camera angle, perspective geometry, or compositional arrangement from any reference image. The shot description governs ALL composition — where entities are placed, which direction they face, how the camera frames the scene. References answer "what does it look like?" only; the shot prompt answers "how is the scene composed?". DISREGARD any colour, material, or appearance adjective in the prompt text for these entities — the reference image overrides it. Do NOT copy the photographic medium of the references.]' });
    for (const { name, img } of loadedEntities) {
      parts.push({ text: `[Reference — ${conditioningLabel(name)}:]` });
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }
  }

  // Immediately after the references, while their labels are still the most
  // recent thing in context.
  if (screenBinding) parts.push({ text: screenBinding });

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
      // Only 429 (rate limit) is transient — 400s are deterministic and
      // retrying them just wastes up to 50s per attempt chain.
      const is429 = err instanceof Error && err.message.includes('"code":429');
      if (is429 && attempt < delays.length) {
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
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


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

  const shot = parsed.shots.find((s) => s.shot_number === shotNumber);
  if (!shot) {
    return NextResponse.json({ error: `Shot ${shotNumber} not found in storyboard` }, { status: 404 });
  }

  // Build entity name lookup early — needed for character-context injection below.
  const entityNames: Record<string, string> = {};
  for (const c of parsed.characters) entityNames[c.id] = c.name;
  for (const l of parsed.locations) entityNames[l.id] = l.name;
  for (const p of parsed.props) entityNames[p.id] = p.name;

  // Build IP-safe visual labels for conditioning — use reference_still_prompt excerpts
  // so known brand/franchise names (e.g. "Wolverine", "Sabretooth") never appear in
  // the conditioning label text sent to the image model.
  // Labels must be unique: they are the only thing telling the model which
  // conditioning image is which entity, and two guises of one performer share
  // their physical description verbatim by design. See src/lib/entity-labels.ts.
  const entityVisualLabels = uniqueVisualLabels([
    ...parsed.characters.map((c) => ({ id: c.id, prompt: c.reference_still_prompt })),
    ...parsed.locations.map((l) => ({ id: l.id, prompt: l.reference_still_prompt })),
    ...parsed.props.map((p) => ({ id: p.id, prompt: p.name })),
  ]);

  // Build prompt — use override text if provided, otherwise the storyboard key frame prompt.
  // Style prefix always comes first; Director's note variations are appended regardless.
  const keyFrameText = overridePrompt?.trim() ? overridePrompt.trim() : shot.key_frame_prompt;
  // Omit the authoritative grammar line when variations are selected — a
  // cinematographic variation (POV, low angle, OTS…) deliberately departs
  // from the storyboard's grammar and must not be contradicted by it.
  const grammarForRegen = variations.length > 0 ? undefined : shot.grammar;
  let prompt = buildShotPrompt({
    keyFramePrompt: keyFrameText,
    renderStyle,
    styleLock: parsed.style_lock,
    shotNumber: shot.shot_number,
    grammar: grammarForRegen,
    storyState: buildStoryStateLine(parsed, shot),
  });
  if (variations.length > 0) {
    // For OTS / dirty-single variations, inject the shot's character names so the model
    // knows which character to blur vs keep in focus.
    // Strip the appearance descriptor after the em-dash — the reference image
    // is the appearance authority and text descriptions compete with it.
    const shotCharacterNames = shot.continuity.characters
      .map((charId: string) => entityNames[charId])
      .filter((n): n is string => Boolean(n))
      .map((n) => n.split(/\s[—–]\s/)[0]?.trim() ?? n);
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
  const refStills = await getReferenceStills(db, id);
  const selectedRefUrl = (entityId: string): string | null =>
    refStills[entityId]?.selected ?? null;

  const visibleCharacterIds = shot.continuity.characters.filter(
    (cid) => !isVoiceOnlyCharacter(cid, entityNames[cid] ?? ''),
  );
  const continuityIds = new Set<string>([
    ...visibleCharacterIds,
    shot.continuity.location_id,
    ...shot.continuity.props_persisting,
    ...shot.continuity.props_introduced,
  ]);
  const excluded = new Set(excludedEntityIds ?? []);

  const primaryEntities = [...continuityIds]
    .filter((entityId) => !excluded.has(entityId))
    .map((entityId) => {
      const url = selectedRefUrl(entityId);
      return url ? { name: entityVisualLabels[entityId] ?? entityNames[entityId] ?? entityId, url } : null;
    })
    .filter((e): e is { name: string; url: string } => e !== null);

  const secondaryEntities = parsed.props
    .filter((p) => !continuityIds.has(p.id) && !excluded.has(p.id))
    .map((p) => {
      const url = selectedRefUrl(p.id);
      return url ? { name: entityVisualLabels[p.id] ?? p.name, url } : null;
    })
    .filter((e): e is { name: string; url: string } => e !== null);

  const conditioningEntities = [...primaryEntities, ...secondaryEntities];

  // Only characters whose reference actually got attached can be bound to a
  // position — naming a reference that isn't there would point at nothing.
  const boundCharacterIds = visibleCharacterIds.filter(
    (cid) => !excluded.has(cid) && selectedRefUrl(cid),
  );
  const screenBinding = buildScreenBindingLine(
    boundCharacterIds,
    (cid) => conditioningLabel(entityVisualLabels[cid] ?? entityNames[cid] ?? cid),
    shot.continuity.screen_positions,
  );

  const ai = new GoogleGenAI({ apiKey });

  // Fetch the style's images once for STYLE_REF mode.
  // Capped hard: style images compete with identity references inside the same
  // prompt, and past ~2 the model starts taking content from them. The written
  // summary carries the rest of the style.
  // Deliberately empty — see generate-shots. Style travels as text in
  // STYLE_REF mode so identity references are the only images in the prompt.
  const styleRefImages: { data: string; mimeType: string }[] = [];
  const styleSummary = renderStyle === 'STYLE_REF'
    ? await loadStyleSummary(db, storyboard)
    : null;

  const styleDeclaration = buildStyleDeclaration(
    renderStyle,
    parsed.style_lock,
    shot.shot_number,
    shot.grammar,
    styleSummary,
  );

  // Charge for the one image, refunded below if the model doesn't deliver.
  let chargedCredits = 0;
  try {
    chargedCredits = await debit(db, auth, imageCost(model), {
      storyboardId: id,
      note: `Regenerate shot ${shotNumber}`,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(insufficientPayload(err), { status: 402 });
    }
    throw err;
  }
  const refundCharge = (note: string) =>
    refund(db, auth, chargedCredits, { storyboardId: id, note }).catch(() => { /* best effort */ });

  let img: { data: string; mimeType: string } | null;
  try {
    img = await generateOneShot(ai, model, prompt, styleDeclaration, conditioningEntities, null, styleRefImages, screenBinding);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await refundCharge(`Shot ${shotNumber} regen failed`);
    return NextResponse.json({ error: `Image generation failed: ${message}` }, { status: 502 });
  }

  if (!img) {
    await refundCharge(`Shot ${shotNumber} regen returned no image`);
    return NextResponse.json({ error: 'No image returned from model' }, { status: 502 });
  }

  const buffer = Buffer.from(img.data, 'base64');
  const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const blobPath = `${id}/shots/${shotNumber}-regen-${Date.now()}.${ext}`;

  const blob = await put(blobPath, buffer, { access: 'public', contentType: img.mimeType });

  // Push the previous render URL into history (newest-first) and write ONLY
  // this shot's row — a concurrent board run can no longer be clobbered, and
  // this regen can no longer be overwritten by it.
  const prevRow = await db.shotFrame.findUnique({
    where: { storyboard_id_shot_number: { storyboard_id: id, shot_number: shotNumber } },
    select: { url: true, history: true },
  });
  const prevUrl = prevRow?.url ?? null;
  const prevHistory = prevRow?.history ?? [];
  const history = prevUrl ? [prevUrl, ...prevHistory].slice(0, 10) : prevHistory;
  await upsertShotFrame(db, id, shotNumber, { status: 'done', url: blob.url, history });

  return NextResponse.json({ url: blob.url, history });
}
