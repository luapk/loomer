import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/src/lib/db';
import { requireSession } from '@/src/lib/auth';
import { PACKS, packById, stripe, isConfigured, ensureCustomer, siteOrigin } from '@/src/lib/stripe';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  pack: z.string().min(1),
  /** Save the card so auto-reload can charge it later. */
  saveCard: z.boolean().optional(),
});

/** Starts a hosted Stripe Checkout session for a credit pack. */
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Card payment is not configured on this deployment.', code: 'STRIPE_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'pack is required' }, { status: 422 });
  }

  const pack = packById(parsed.data.pack);
  if (!pack) {
    return NextResponse.json(
      { error: `Unknown pack. Choose one of: ${PACKS.map((p) => p.id).join(', ')}` },
      { status: 422 },
    );
  }

  const db = getDb();
  const customerId = await ensureCustomer(db as never, auth.uid);
  const origin = siteOrigin(request.url);

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    // The credit grant is driven by the webhook reading these, never by the
    // browser — the return URL is only where the user lands.
    metadata: {
      loomer_user_id: auth.uid,
      pack_id: pack.id,
      credits: String(pack.credits),
    },
    payment_intent_data: {
      // Saving the card is what makes off-session auto-reload possible later.
      ...(parsed.data.saveCard ? { setup_future_usage: 'off_session' as const } : {}),
      metadata: {
        loomer_user_id: auth.uid,
        pack_id: pack.id,
        credits: String(pack.credits),
      },
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'gbp',
        unit_amount: pack.pence,
        product_data: {
          name: `${pack.credits} Loomer credits`,
          description: pack.note,
        },
      },
    }],
    success_url: `${origin}/billing?purchase=success`,
    cancel_url: `${origin}/billing?purchase=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
  }
  return NextResponse.json({ url: session.url });
}
