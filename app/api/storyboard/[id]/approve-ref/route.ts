import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/src/lib/db';
import { getReferenceStills, setReferenceSelected } from '@/src/lib/frame-store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  entityId: z.string().min(1),
  selectedUrl: z.string().url(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 422 });
  }

  const { entityId, selectedUrl } = parsed.data;

  const db = getDb();
  const storyboard = await db.storyboard.findUnique({ where: { id }, select: { id: true } });
  if (!storyboard) {
    return Response.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  // getReferenceStills triggers the lazy backfill for legacy storyboards, so
  // the per-row selected update below always has a row to hit.
  const refStills = await getReferenceStills(db, id);
  if (!refStills[entityId]) {
    return Response.json({ error: 'Entity not found in reference stills' }, { status: 404 });
  }

  // Single-row write — can never clobber concurrent candidate generation.
  await setReferenceSelected(db, id, entityId, selectedUrl);

  return Response.json({ ok: true });
}
