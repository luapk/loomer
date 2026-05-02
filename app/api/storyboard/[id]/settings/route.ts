import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/src/lib/db';

const SettingsSchema = z.object({
  render_style: z.enum(['PHOTOREAL', 'WATERCOLOUR_SKETCH']),
  image_model: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const body: unknown = await request.json();
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  await getDb().storyboard.update({
    where: { id },
    data: {
      render_style: parsed.data.render_style,
      image_model: parsed.data.image_model,
    },
  });

  return NextResponse.json({ ok: true });
}
