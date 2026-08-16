import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/src/lib/db';
import { requireSession } from '@/src/lib/auth';
import { PACKS, packById } from '@/src/lib/stripe';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  /** Pack id to recharge with, or null to switch auto-reload off. */
  pack: z.string().nullable(),
  threshold: z.number().int().min(1).max(10000).optional(),
});

/** Current auto-reload settings. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const user = await getDb().user.findUnique({
    where: { id: auth.uid },
    select: {
      auto_reload_pack: true,
      auto_reload_threshold: true,
      auto_reload_failed_at: true,
      stripe_customer_id: true,
    },
  });

  return NextResponse.json({
    pack: user?.auto_reload_pack ?? null,
    threshold: user?.auto_reload_threshold ?? 25,
    failedAt: user?.auto_reload_failed_at ?? null,
    hasCustomer: Boolean(user?.stripe_customer_id),
    packs: PACKS.map((p) => ({ id: p.id, label: p.label, credits: p.credits })),
  });
}

/** Turn auto-reload on (with a pack) or off (pack: null). */
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'pack must be a pack id or null' }, { status: 422 });
  }

  if (parsed.data.pack !== null && !packById(parsed.data.pack)) {
    return NextResponse.json({ error: 'Unknown pack' }, { status: 422 });
  }

  const saved = await getDb().user.update({
    where: { id: auth.uid },
    data: {
      auto_reload_pack: parsed.data.pack,
      ...(parsed.data.threshold !== undefined ? { auto_reload_threshold: parsed.data.threshold } : {}),
      // Changing the setting is an explicit act — give a declined card another go.
      auto_reload_failed_at: null,
    },
    select: { auto_reload_pack: true, auto_reload_threshold: true },
  });

  return NextResponse.json({
    pack: saved.auto_reload_pack,
    threshold: saved.auto_reload_threshold,
  });
}
