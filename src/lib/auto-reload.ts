/**
 * Automatic top-up.
 *
 * When a debit drops the balance below the user's threshold, charge their saved
 * card off-session for their chosen pack. This is what stops a director hitting
 * a paywall in the middle of rendering a board.
 *
 * Two properties matter more than anything else here:
 *
 *  - **It can never fail the generation that triggered it.** Every path returns
 *    rather than throws, and callers fire it without awaiting the result.
 *  - **It never grants credits itself.** The charge is made here; the credit is
 *    granted by the webhook, exactly like a manual purchase, with the same
 *    idempotency. A double-fired reload results in one charge crediting once.
 */

import type { PrismaClient } from '@prisma/client';

/** Stop retrying after a decline until the user does something about it. */
const RETRY_AFTER_FAILURE_MS = 6 * 60 * 60 * 1000; // 6 hours

export type AutoReloadOutcome =
  | { status: 'off' }
  | { status: 'not_needed' }
  | { status: 'charged'; credits: number }
  | { status: 'failed'; reason: string };

/**
 * Charges the saved card if the balance has fallen below the threshold.
 * Safe to call after every debit; cheap when auto-reload is off.
 */
export async function maybeAutoReload(
  db: PrismaClient,
  userId: string,
): Promise<AutoReloadOutcome> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      auto_reload_pack: true,
      auto_reload_threshold: true,
      auto_reload_failed_at: true,
      stripe_customer_id: true,
    },
  });
  if (!user?.auto_reload_pack || !user.stripe_customer_id) return { status: 'off' };

  // A declined card shouldn't be retried on every single debit.
  if (
    user.auto_reload_failed_at &&
    Date.now() - user.auto_reload_failed_at.getTime() < RETRY_AFTER_FAILURE_MS
  ) {
    return { status: 'failed', reason: 'recent failure, backing off' };
  }

  const sum = await db.creditLedger.aggregate({
    where: { user_id: userId },
    _sum: { delta: true },
  });
  const balance = sum._sum.delta ?? 0;
  if (balance >= user.auto_reload_threshold) return { status: 'not_needed' };

  // Imported lazily so the Stripe SDK stays out of every route that debits.
  const { packById, stripe, isConfigured } = await import('@/src/lib/stripe');
  if (!isConfigured()) return { status: 'failed', reason: 'stripe not configured' };

  const pack = packById(user.auto_reload_pack);
  if (!pack) return { status: 'failed', reason: `unknown pack ${user.auto_reload_pack}` };

  try {
    const client = stripe();

    // Use the customer's default saved card.
    const methods = await client.paymentMethods.list({
      customer: user.stripe_customer_id,
      type: 'card',
      limit: 1,
    });
    const paymentMethod = methods.data[0];
    if (!paymentMethod) {
      await markFailed(db, userId);
      return { status: 'failed', reason: 'no saved card' };
    }

    await client.paymentIntents.create({
      amount: pack.pence,
      currency: 'gbp',
      customer: user.stripe_customer_id,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description: `Loomer auto top-up — ${pack.credits} credits`,
      metadata: {
        loomer_user_id: userId,
        pack_id: pack.id,
        credits: String(pack.credits),
        auto_reload: 'true',
      },
    });

    // Credits arrive via payment_intent.succeeded, not here.
    return { status: 'charged', credits: pack.credits };
  } catch (err) {
    await markFailed(db, userId);
    return {
      status: 'failed',
      reason: err instanceof Error ? err.message.slice(0, 200) : 'charge failed',
    };
  }
}

async function markFailed(db: PrismaClient, userId: string): Promise<void> {
  await db.user
    .update({ where: { id: userId }, data: { auto_reload_failed_at: new Date() } })
    .catch(() => { /* best effort */ });
}
