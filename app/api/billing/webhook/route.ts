import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getDb } from '@/src/lib/db';
import { grant } from '@/src/lib/credits';
import { stripe, isConfigured } from '@/src/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhook — the ONLY place credits are granted for a payment.
 *
 * Never trust the browser redirect for this: a user who closes the tab must
 * still be credited, and a forged return URL must credit nobody.
 *
 * Idempotency comes from the database, not from bookkeeping here. Every grant
 * carries the Stripe event id as `payment_ref`, which is unique — Stripe
 * retries deliveries, and a retry must not pay out twice.
 *
 * This route is deliberately unauthenticated: the signature IS the auth.
 */
export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Without the secret we cannot verify anything, so we must not act.
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET is not set' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  // Raw body — a parsed-and-reserialised body has different bytes and fails
  // signature verification.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Signature verification failed: ${message}` }, { status: 400 });
  }

  const db = getDb();

  // Both events can complete a purchase: hosted Checkout emits the first,
  // off-session auto-reload charges emit the second.
  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const object = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;

    // A Checkout session that isn't paid yet (async payment methods) is not
    // a purchase — the later payment_intent.succeeded is.
    if ('payment_status' in object && object.payment_status !== 'paid') {
      return NextResponse.json({ received: true, ignored: 'unpaid session' });
    }

    const metadata = object.metadata ?? {};
    const userId = metadata['loomer_user_id'];
    const credits = Number(metadata['credits']);
    const packId = metadata['pack_id'] ?? 'unknown';

    if (!userId || !Number.isInteger(credits) || credits <= 0) {
      // Not one of ours, or missing metadata — acknowledge so Stripe stops
      // retrying, but grant nothing.
      return NextResponse.json({ received: true, ignored: 'no loomer metadata' });
    }

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ received: true, ignored: 'unknown user' });
    }

    await grant(db, userId, credits, 'purchase', {
      // The event id, not the payment id: the unique constraint then makes a
      // redelivery of this exact event a no-op.
      paymentRef: `stripe:${event.id}`,
      note: `${credits} credits (${packId})`,
    });

    // A successful charge clears any earlier auto-reload failure.
    await db.user.update({
      where: { id: userId },
      data: { auto_reload_failed_at: null },
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({ received: true, credited: credits });
  }

  // Everything else is acknowledged and ignored.
  return NextResponse.json({ received: true });
}
