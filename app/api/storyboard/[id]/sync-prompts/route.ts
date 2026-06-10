import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ReferenceStills } from '@/src/lib/reference-stills';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const mimeType = contentType.split(';')[0]?.trim() ?? 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    return { data: Buffer.from(arrayBuffer).toString('base64'), mimeType };
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // force=true re-syncs every approved entity; the default only syncs entities
  // whose selected reference changed since the last sync (dirty tracking).
  const force = new URL(request.url).searchParams.get('force') === 'true';

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return new Response(JSON.stringify({ error: 'Storyboard not found' }), { status: 404 });
  }
  if (!storyboard.parsed_json) {
    return new Response(JSON.stringify({ error: 'Storyboard not yet parsed' }), { status: 422 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 503 });
  }

  const parsed = storyboard.parsed_json as unknown as ParsedStoryboard;
  const refStills = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;

  const allEntities = [
    ...parsed.characters.map((c) => ({ id: c.id, name: c.name })),
    ...parsed.locations.map((l) => ({ id: l.id, name: l.name })),
    ...parsed.props.map((p) => ({ id: p.id, name: p.name })),
  ];

  const allApproved = allEntities.filter((e) => Boolean(refStills[e.id]?.selected));
  if (allApproved.length === 0) {
    return new Response(JSON.stringify({ error: 'No approved reference images found' }), { status: 422 });
  }

  // Dirty = the selected ref changed since this entity was last synced.
  const approvedEntities = force
    ? allApproved
    : allApproved.filter((e) => refStills[e.id]!.selected !== refStills[e.id]!.synced_url);

  const anthropic = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  // Nothing dirty — short-circuit with an SSE stream the client already understands.
  if (approvedEntities.length === 0) {
    const body = `data: ${JSON.stringify({ type: 'start', entityCount: 0, shotCount: parsed.shots.length })}\n\n` +
      `data: ${JSON.stringify({ type: 'done', updatedShots: 0, totalShots: parsed.shots.length, alreadyInSync: true })}\n\n`;
    return new Response(body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  }

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* disconnected */ }
      };
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
      }, 10000);

      try {
        send({ type: 'start', entityCount: approvedEntities.length, shotCount: parsed.shots.length });

        // ── Step 1: Analyse each approved reference image in parallel ──────────
        // Ask Haiku to describe the visual appearance of the entity in the image.
        // This replaces the stale appearance descriptor from the original script.
        const entityAppearances = new Map<string, string>(); // entityId → description

        await Promise.all(approvedEntities.map(async (entity) => {
          const selectedUrl = refStills[entity.id]!.selected!;
          const imgData = await fetchImageAsBase64(selectedUrl);
          if (!imgData) return;

          const strippedName = entity.name.split(/\s[—–]\s/)[0]?.trim() ?? entity.name;

          try {
            const msg = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 60,
              messages: [{
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: imgData.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                      data: imgData.data,
                    },
                  },
                  {
                    type: 'text',
                    text: `Describe the visual appearance of "${strippedName}" in this image in 12 words or fewer. Colour, shape, material, key details only. No quality adjectives. Return ONLY the description.`,
                  },
                ],
              }],
            });
            const description = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : null;
            if (description) {
              entityAppearances.set(entity.id, description);
              const oldAppearance = entity.name.split(/\s[—–]\s/)[1]?.trim() ?? null;
              send({ type: 'entity_analysed', entityId: entity.id, name: strippedName, oldAppearance, newAppearance: description });
            }
          } catch {
            send({ type: 'entity_skipped', entityId: entity.id, name: strippedName });
          }
        }));

        if (entityAppearances.size === 0) {
          send({ type: 'error', message: 'Could not extract appearance from any reference images' });
          return;
        }

        // ── Step 2: Rewrite only affected shots ──────────────────────────────
        // A shot is affected if an entity with a new appearance description
        // appears in its continuity fields OR by name in its key_frame_prompt.
        const updatedShots = parsed.shots.map((s) => ({ ...s }));
        let updatedCount = 0;

        for (let i = 0; i < parsed.shots.length; i++) {
          const shot = parsed.shots[i]!;

          const continuityIds = new Set<string>([
            ...shot.continuity.characters,
            shot.continuity.location_id,
            ...shot.continuity.props_persisting,
            ...shot.continuity.props_introduced,
          ].filter(Boolean));

          // Collect which approved entities are relevant to this shot
          const relevantUpdates: Array<{
            strippedName: string;
            oldAppearance: string | undefined;
            newAppearance: string;
          }> = [];

          for (const [entityId, newAppearance] of entityAppearances) {
            const entity = approvedEntities.find((e) => e.id === entityId);
            if (!entity) continue;
            const strippedName = entity.name.split(/\s[—–]\s/)[0]?.trim() ?? entity.name;
            const oldAppearance = entity.name.split(/\s[—–]\s/)[1]?.trim();
            const inContinuity = continuityIds.has(entityId);
            const namedInPrompt = shot.key_frame_prompt.toLowerCase().includes(strippedName.toLowerCase());
            if (inContinuity || namedInPrompt) {
              relevantUpdates.push({ strippedName, oldAppearance, newAppearance });
            }
          }

          if (relevantUpdates.length === 0) {
            send({ type: 'shot_unchanged', shotNumber: shot.shot_number });
            continue;
          }

          // Build a single rewrite request for all appearance changes in this shot
          const changeList = relevantUpdates.map((u) =>
            `• "${u.strippedName}": was "${u.oldAppearance ?? 'unspecified'}", confirmed as "${u.newAppearance}"`
          ).join('\n');

          try {
            const msg = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 500,
              messages: [{
                role: 'user',
                content: `Rewrite this storyboard shot description to correct entity appearances. Update ONLY appearance adjectives (colour, material, texture) for the listed entities. Keep everything else — composition, action, positions, mood, camera direction — word-for-word identical. If an entity's appearance isn't explicitly mentioned, do not add new appearance text.

Appearance corrections:
${changeList}

Original shot description:
${shot.key_frame_prompt}

Return ONLY the corrected description, no preamble or explanation.`,
              }],
            });

            const newPrompt = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : null;
            if (newPrompt && newPrompt !== shot.key_frame_prompt) {
              updatedShots[i] = { ...shot, key_frame_prompt: newPrompt };
              updatedCount++;
              send({ type: 'shot_updated', shotNumber: shot.shot_number, descriptor: shot.descriptor });
            } else {
              send({ type: 'shot_unchanged', shotNumber: shot.shot_number });
            }
          } catch {
            send({ type: 'shot_unchanged', shotNumber: shot.shot_number });
          }
        }

        // ── Step 3: Persist updated parsed_json + mark synced entities clean ──
        const updatedRefStills: ReferenceStills = { ...refStills };
        for (const entityId of entityAppearances.keys()) {
          const state = updatedRefStills[entityId];
          if (state) updatedRefStills[entityId] = { ...state, synced_url: state.selected };
        }
        await getDb().storyboard.update({
          where: { id },
          data: {
            parsed_json: { ...parsed, shots: updatedShots } as unknown as Prisma.InputJsonValue,
            reference_stills: updatedRefStills as unknown as Prisma.InputJsonValue,
          },
        });

        send({ type: 'done', updatedShots: updatedCount, totalShots: parsed.shots.length });
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
