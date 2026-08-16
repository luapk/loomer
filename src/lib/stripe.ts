/**
 * Stripe wiring for credit purchases.
 *
 * Two rules everything else follows from:
 *
 *  1. **Credits are granted by webhook, never by the browser redirect.** A user
 *     who closes the tab after paying must still get what they paid for, and a
 *     user who forges a redirect must get nothing.
 *  2. **Every grant carries the Stripe event's id as `payment_ref`**, which is
 *     unique in the database. Stripe retries webhooks; without that constraint
 *     a retry would credit twice.
 *
 * Prices are GBP, defined here in pence. VAT is not currently collected — see
 * docs/decisions/REVISIT-billing.md.
 */

import Stripe from 'stripe';

/** Credit packs. `id` is stored on the user for auto-reload, so don't rename. */
export const PACKS = [
  { id: 'small', credits: 150, pence: 1000, label: '£10', note: 'about three storyboards' },
  { id: 'medium', credits: 400, pence: 2500, label: '£25', note: '7% bonus credits' },
  { id: 'large', credits: 850, pence: 5000, label: '£50', note: '13% bonus credits' },
] as const;

export type PackId = (typeof PACKS)[number]['id'];

export function packById(id: string) {
  return PACKS.find((p) => p.id === id) ?? null;
}

export function isConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  client = new Stripe(key);
  return client;
}

/**
 * The Stripe customer for this user, created on first use.
 *
 * A stable customer is what makes auto-reload possible: the card saved during
 * checkout is attached to it and can be charged off-session later.
 */
export async function ensureCustomer(
  db: { user: { findUnique: (a: unknown) => Promise<{ stripe_customer_id: string | null; email: string } | null>; update: (a: unknown) => Promise<unknown> } },
  userId: string,
): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { stripe_customer_id: true, email: true },
  } as unknown);
  if (!user) throw new Error(`ensureCustomer: no user ${userId}`);
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe().customers.create({
    email: user.email,
    metadata: { loomer_user_id: userId },
  });
  await db.user.update({
    where: { id: userId },
    data: { stripe_customer_id: customer.id },
  } as unknown);
  return customer.id;
}

/** Absolute origin for Stripe's return URLs. */
export function siteOrigin(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}
