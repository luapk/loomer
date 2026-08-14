/**
 * Credit accounting.
 *
 * Users buy credits; generation spends them. The ledger is append-only and the
 * balance is always derived, so a failed write can never silently corrupt a
 * balance. See docs/decisions/REVISIT-billing.md for the pricing rationale.
 *
 * This module deliberately knows nothing about payment providers — it only
 * moves credits. Purchases call `grant` once money has settled.
 */

import type { PrismaClient } from '@prisma/client';
import type { Session } from './auth.js';

/**
 * Credits charged per generated image, by model. Roughly 2x the API cost —
 * integers, so cheaper models are slightly better value, which is the nudge
 * we want. Update alongside docs/decisions/REVISIT-billing.md when Google
 * reprices.
 */
export const IMAGE_CREDIT_COST: Record<string, number> = {
  'gemini-2.5-flash-image': 1,
  'gemini-3.1-flash-image-preview': 2,
  'gemini-3-pro-image-preview': 3,
};

/** Fallback for a model we don't have a price for — charge the top rate. */
const DEFAULT_IMAGE_COST = 3;

/** Credits charged for a script parse (~$0.10 of Claude). */
export const PARSE_CREDIT_COST = 2;

/** Credits granted to a new account so the tool can be tried before paying. */
export const SIGNUP_BONUS_CREDITS = 30;

export function imageCost(model: string | null | undefined): number {
  if (!model) return DEFAULT_IMAGE_COST;
  return IMAGE_CREDIT_COST[model] ?? DEFAULT_IMAGE_COST;
}

/** Cost of generating `count` images with `model`. */
export function imagesCost(model: string | null | undefined, count: number): number {
  return imageCost(model) * Math.max(0, count);
}

/**
 * Admins generate for free — it's the owner's own API key. The exemption is
 * still recorded as a zero-delta ledger note so usage stays visible.
 */
export function isExempt(session: Pick<Session, 'role'>): boolean {
  return session.role === 'ADMIN';
}

export async function getBalance(db: PrismaClient, userId: string): Promise<number> {
  const result = await db.creditLedger.aggregate({
    where: { user_id: userId },
    _sum: { delta: true },
  });
  return result._sum.delta ?? 0;
}

export type LedgerReason = 'purchase' | 'grant' | 'signup_bonus' | 'debit' | 'refund';

/** Add credits. `paymentRef` makes the write idempotent for payment webhooks. */
export async function grant(
  db: PrismaClient,
  userId: string,
  amount: number,
  reason: Extract<LedgerReason, 'purchase' | 'grant' | 'signup_bonus'>,
  opts: { paymentRef?: string; note?: string } = {},
): Promise<void> {
  if (amount <= 0) return;
  const data = {
    user_id: userId,
    delta: amount,
    reason,
    ...(opts.paymentRef ? { payment_ref: opts.paymentRef } : {}),
    ...(opts.note ? { note: opts.note } : {}),
  };
  if (opts.paymentRef) {
    // Replayed webhook: the unique constraint on payment_ref makes this a
    // no-op rather than a double credit.
    await db.creditLedger.createMany({ data: [data], skipDuplicates: true });
    return;
  }
  await db.creditLedger.create({ data });
}

export class InsufficientCreditsError extends Error {
  constructor(public required: number, public balance: number) {
    super(`Needs ${required} credits, balance is ${balance}`);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Spend credits up front, before the API call that costs money.
 *
 * Throws InsufficientCreditsError when the balance won't cover it. Admins are
 * exempt and this is a no-op returning 0.
 */
export async function debit(
  db: PrismaClient,
  session: Pick<Session, 'uid' | 'role'>,
  amount: number,
  opts: { storyboardId?: string; note?: string } = {},
): Promise<number> {
  if (isExempt(session) || amount <= 0) return 0;

  const balance = await getBalance(db, session.uid);
  if (balance < amount) {
    throw new InsufficientCreditsError(amount, balance);
  }
  await db.creditLedger.create({
    data: {
      user_id: session.uid,
      delta: -amount,
      reason: 'debit',
      ...(opts.storyboardId ? { storyboard_id: opts.storyboardId } : {}),
      ...(opts.note ? { note: opts.note } : {}),
    },
  });
  return amount;
}

/**
 * Give back credits for work that failed. Users must never pay for an error —
 * a failed render is exactly when someone is least willing to be charged.
 */
export async function refund(
  db: PrismaClient,
  session: Pick<Session, 'uid' | 'role'>,
  amount: number,
  opts: { storyboardId?: string; note?: string } = {},
): Promise<void> {
  if (isExempt(session) || amount <= 0) return;
  await db.creditLedger.create({
    data: {
      user_id: session.uid,
      delta: amount,
      reason: 'refund',
      ...(opts.storyboardId ? { storyboard_id: opts.storyboardId } : {}),
      ...(opts.note ? { note: opts.note } : {}),
    },
  });
}

/** Shape returned to the client when a route refuses for lack of credits. */
export function insufficientPayload(err: InsufficientCreditsError) {
  return {
    error: `Not enough credits — this needs ${err.required}, you have ${err.balance}.`,
    code: 'INSUFFICIENT_CREDITS' as const,
    required: err.required,
    balance: err.balance,
  };
}
