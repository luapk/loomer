import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';

type Shot = ParsedStoryboard['shots'][number];

/** Renumber shots sequentially, preserving shot_label where present. */
function renumber(shots: Shot[]): Shot[] {
  return shots.map((shot, i) => ({ ...shot, shot_number: i + 1 }));
}

// ---------------------------------------------------------------------------
// POST — insert a manually authored frame at a position
// ---------------------------------------------------------------------------

const InsertSchema = z.object({
  position: z.number().int().min(1), // 1-based shot_number the new frame takes
  prompt: z.string().min(10, 'Describe the frame in at least a few words'),
  characterIds: z.array(z.string()).default([]),
  locationId: z.string().nullable().optional(),
  propIds: z.array(z.string()).default([]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = InsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 422 });
  }

  const db = getDb();
  const row = await db.storyboard.findUnique({ where: { id }, select: { parsed_json: true } });
  if (!row?.parsed_json) {
    return NextResponse.json({ error: 'Storyboard not yet parsed' }, { status: 422 });
  }
  const board = row.parsed_json as unknown as ParsedStoryboard;
  const shots = [...board.shots];
  const position = Math.min(parsed.data.position, shots.length + 1);

  // Neighbour (the shot currently before the insertion point, else the first)
  // seeds continuity defaults so the new frame belongs to its scene.
  const neighbour = shots[Math.max(0, Math.min(position - 2, shots.length - 1))];

  const locationId = parsed.data.locationId
    ?? neighbour?.continuity.location_id
    ?? board.locations[0]?.id
    ?? 'LOC-UNKNOWN';

  // Light entity context appended to the prompt so the model knows who is in
  // frame — appearance itself comes from the conditioning reference images.
  const charNames = parsed.data.characterIds
    .map((cid) => board.characters.find((c) => c.id === cid)?.name.split(/\s[—–]\s/)[0]?.trim())
    .filter((n): n is string => Boolean(n));
  const locationName = board.locations.find((l) => l.id === locationId)?.name;
  const contextBits = [
    charNames.length > 0 ? `Featuring: ${charNames.join(', ')}.` : '',
    locationName ? `Location: ${locationName}.` : '',
  ].filter(Boolean).join(' ');

  const promptText = parsed.data.prompt.trim();
  const descriptor = promptText.split(/\s+/).slice(0, 6).join(' ');

  const newShot: Shot = {
    shot_number: position,
    descriptor,
    function: 'Manually inserted frame',
    grammar: {
      scale: 'MS',
      angle: 'Eye-level',
      triangle_position: neighbour?.grammar.triangle_position ?? 'External reverse',
      camera_move: 'Static',
      lens: board.style_lock.lens_default,
      line_of_interest: neighbour?.grammar.line_of_interest ?? 'Match adjacent shots',
      screen_direction: 'Neutral',
      thirty_degree_check: 'Manually inserted — verify staging against neighbouring shots',
      cut_in: 'Hard cut',
      cut_out: 'Hard cut',
    },
    continuity: {
      characters: parsed.data.characterIds,
      location_id: locationId,
      props_persisting: parsed.data.propIds,
      props_introduced: [],
      light_direction: neighbour?.continuity.light_direction ?? 'Match adjacent shots',
      time_of_day: neighbour?.continuity.time_of_day ?? 'Unspecified',
    },
    action_beat: promptText,
    dialogue_vo: null,
    sound_design: { sfx: null, ambient: null, music: null },
    key_frame_prompt: contextBits ? `${promptText}\n\n${contextBits}` : promptText,
  };

  shots.splice(position - 1, 0, newShot);
  const renumbered = renumber(shots);

  // Shift existing frame rows at/after the insertion point up by one.
  // Descending order avoids unique-constraint collisions mid-transaction.
  const rowsToShift = await db.shotFrame.findMany({
    where: { storyboard_id: id, shot_number: { gte: position } },
    orderBy: { shot_number: 'desc' },
    select: { id: true, shot_number: true },
  });
  await db.$transaction([
    ...rowsToShift.map((r) =>
      db.shotFrame.update({ where: { id: r.id }, data: { shot_number: r.shot_number + 1 } }),
    ),
    db.shotFrame.create({
      data: { storyboard_id: id, shot_number: position, status: 'pending', url: null },
    }),
    db.storyboard.update({
      where: { id },
      data: {
        parsed_json: { ...board, shots: renumbered, total_shots: renumbered.length } as unknown as Prisma.InputJsonValue,
        shot_count: renumbered.length,
      },
    }),
  ]);

  return NextResponse.json({ shotNumber: position, totalShots: renumbered.length });
}

// ---------------------------------------------------------------------------
// DELETE — remove the shot at ?shotNumber= (1-based) and close the gap
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;

  const shotNumber = Number(request.nextUrl.searchParams.get('shotNumber'));
  if (!Number.isInteger(shotNumber) || shotNumber < 1) {
    return NextResponse.json({ error: 'shotNumber must be a positive integer' }, { status: 422 });
  }

  const db = getDb();
  const row = await db.storyboard.findUnique({ where: { id }, select: { parsed_json: true } });
  if (!row?.parsed_json) {
    return NextResponse.json({ error: 'Storyboard not yet parsed' }, { status: 422 });
  }
  const board = row.parsed_json as unknown as ParsedStoryboard;
  const shots = [...board.shots];
  if (shotNumber > shots.length) {
    return NextResponse.json({ error: 'No such shot' }, { status: 404 });
  }
  if (shots.length === 1) {
    return NextResponse.json({ error: 'A storyboard needs at least one frame' }, { status: 422 });
  }

  shots.splice(shotNumber - 1, 1);
  const renumbered = renumber(shots);

  // Drop the frame row, then pull everything above it down one. Ascending order
  // means each slot is already free by the time the next row moves into it.
  const rowsToShift = await db.shotFrame.findMany({
    where: { storyboard_id: id, shot_number: { gt: shotNumber } },
    orderBy: { shot_number: 'asc' },
    select: { id: true, shot_number: true },
  });
  await db.$transaction([
    db.shotFrame.deleteMany({ where: { storyboard_id: id, shot_number: shotNumber } }),
    ...rowsToShift.map((r) =>
      db.shotFrame.update({ where: { id: r.id }, data: { shot_number: r.shot_number - 1 } }),
    ),
    db.storyboard.update({
      where: { id },
      data: {
        parsed_json: { ...board, shots: renumbered, total_shots: renumbered.length } as unknown as Prisma.InputJsonValue,
        shot_count: renumbered.length,
      },
    }),
  ]);

  // The blob itself is left in place — deletes are cheap to skip and the URL is
  // no longer referenced by anything.
  return NextResponse.json({ ok: true, totalShots: renumbered.length });
}

// ---------------------------------------------------------------------------
// PATCH — reorder: move the shot at `from` to position `to` (both 1-based)
// ---------------------------------------------------------------------------

const ReorderSchema = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'from and to must be positive integers' }, { status: 422 });
  }

  const db = getDb();
  const row = await db.storyboard.findUnique({ where: { id }, select: { parsed_json: true } });
  if (!row?.parsed_json) {
    return NextResponse.json({ error: 'Storyboard not yet parsed' }, { status: 422 });
  }
  const board = row.parsed_json as unknown as ParsedStoryboard;
  const shots = [...board.shots];
  const from = parsed.data.from;
  const to = Math.min(parsed.data.to, shots.length);
  if (from > shots.length || from === to) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const [moved] = shots.splice(from - 1, 1);
  shots.splice(to - 1, 0, moved!);

  // Mapping: each shot's pre-move number → its new sequential position.
  const mapping = new Map<number, number>();
  shots.forEach((shot, i) => mapping.set(shot.shot_number, i + 1));
  const renumbered = renumber(shots);

  // Remap frame rows in two phases inside one transaction: park everything at
  // +100000 (collision-free), then set final numbers.
  const frameRows = await db.shotFrame.findMany({
    where: { storyboard_id: id },
    select: { id: true, shot_number: true },
  });
  const OFFSET = 100000;
  await db.$transaction([
    ...frameRows.map((r) =>
      db.shotFrame.update({ where: { id: r.id }, data: { shot_number: r.shot_number + OFFSET } }),
    ),
    ...frameRows.map((r) =>
      db.shotFrame.update({
        where: { id: r.id },
        data: { shot_number: mapping.get(r.shot_number) ?? r.shot_number },
      }),
    ),
    db.storyboard.update({
      where: { id },
      data: { parsed_json: { ...board, shots: renumbered } as unknown as Prisma.InputJsonValue },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
