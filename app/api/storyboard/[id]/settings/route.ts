import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  render_style: z.enum(['PHOTOREAL', 'WATERCOLOUR_SKETCH']),
  image_model: z.string().min(1),
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

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return Response.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  await getDb().storyboard.update({
    where: { id },
    data: {
      render_style: parsed.data.render_style,
      image_model: parsed.data.image_model,
    },
  });

  return Response.json({ ok: true });
}
