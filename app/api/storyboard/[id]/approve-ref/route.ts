import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ReferenceStills } from '@/src/lib/reference-stills';

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

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return Response.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  const refStills = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;
  const entity = refStills[entityId];
  if (!entity) {
    return Response.json({ error: 'Entity not found in reference_stills' }, { status: 404 });
  }

  refStills[entityId] = { ...entity, selected: selectedUrl };

  await getDb().storyboard.update({
    where: { id },
    data: { reference_stills: refStills as unknown as Prisma.InputJsonValue },
  });

  return Response.json({ ok: true });
}
