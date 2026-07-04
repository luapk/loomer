import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  render_style: z.enum(['PHOTOREAL', 'WATERCOLOUR_SKETCH', 'STYLE_REF']),
  image_model: z.string().min(1),
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
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    await getDb().storyboard.update({
      where: { id },
      data: {
        render_style: parsed.data.render_style,
        image_model: parsed.data.image_model,
      },
    });
  } catch (err) {
    // P2025 = record not found — avoids a separate existence round-trip.
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2025') {
      return Response.json({ error: 'Storyboard not found' }, { status: 404 });
    }
    throw err;
  }

  return Response.json({ ok: true });
}
