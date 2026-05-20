import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';

interface PatchShotBody {
  shotNumber: number;
  dialogue_vo?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: PatchShotBody;
  try {
    body = (await request.json()) as PatchShotBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { shotNumber, dialogue_vo } = body;
  if (typeof shotNumber !== 'number' || !Number.isInteger(shotNumber)) {
    return NextResponse.json({ error: 'shotNumber must be an integer' }, { status: 400 });
  }

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }
  if (!storyboard.parsed_json) {
    return NextResponse.json({ error: 'Storyboard not yet parsed' }, { status: 422 });
  }

  const parsed = storyboard.parsed_json as unknown as ParsedStoryboard;
  const shotIndex = parsed.shots.findIndex((s) => s.shot_number === shotNumber);
  if (shotIndex === -1) {
    return NextResponse.json({ error: `Shot ${shotNumber} not found` }, { status: 404 });
  }

  const updatedShots = parsed.shots.map((s, i) => {
    if (i !== shotIndex) return s;
    const updated = { ...s };
    if (dialogue_vo !== undefined) updated.dialogue_vo = dialogue_vo || null;
    return updated;
  });

  const updatedParsed = { ...parsed, shots: updatedShots };

  await getDb().storyboard.update({
    where: { id },
    data: { parsed_json: updatedParsed as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ ok: true });
}
