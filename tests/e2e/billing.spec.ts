import { test, expect } from '@playwright/test';
import { signUp, logOut, uniqueEmail, balanceOf, db } from './helpers';

/**
 * Purchase-path guards.
 *
 * Real card flows need Stripe, so these cover what can go wrong on our side:
 * the webhook refusing unsigned requests, and — the expensive one — a replayed
 * webhook crediting twice. Stripe retries deliveries as a matter of course, so
 * that path is exercised in production whether we test it or not.
 */
test.describe('billing', () => {
  test('the webhook rejects a request with no signature', async ({ page }) => {
    const res = await page.request.post('/api/billing/webhook', {
      data: { type: 'checkout.session.completed' },
    });
    // 400 when Stripe is configured (missing signature), 503 when it isn't.
    expect([400, 503]).toContain(res.status());
  });

  test('the webhook rejects a forged signature', async ({ page }) => {
    const res = await page.request.post('/api/billing/webhook', {
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      data: { type: 'checkout.session.completed' },
    });
    expect(res.ok()).toBeFalsy();
  });

  test('a replayed payment credits exactly once', async ({ page }) => {
    // Asserted against the grant primitive the webhook uses, since a genuine
    // signed delivery can't be forged here. The unique payment_ref is what
    // makes a Stripe retry a no-op.
    const email = uniqueEmail();
    await signUp(page, email);
    const user = await db().user.findUnique({ where: { email }, select: { id: true } });
    const before = await balanceOf(email);

    const paymentRef = `stripe:evt_test_${Date.now()}`;
    const row = {
      user_id: user!.id,
      delta: 150,
      reason: 'purchase',
      payment_ref: paymentRef,
      note: '150 credits (small)',
    };

    await db().creditLedger.createMany({ data: [row], skipDuplicates: true });
    await db().creditLedger.createMany({ data: [row], skipDuplicates: true }); // redelivery
    await db().creditLedger.createMany({ data: [row], skipDuplicates: true }); // and again

    expect(await balanceOf(email)).toBe(before + 150);
  });

  test('checkout needs a signed-in user', async ({ page }) => {
    await signUp(page, uniqueEmail());
    await logOut(page.request);
    const res = await page.request.post('/api/billing/checkout', {
      data: { pack: 'small' },
    });
    expect(res.status()).toBe(401);
  });

  test('an unknown pack is refused', async ({ page }) => {
    await signUp(page, uniqueEmail());
    const res = await page.request.post('/api/billing/checkout', {
      data: { pack: 'not-a-pack' },
    });
    // 422 for a bad pack; 503 if Stripe isn't configured here at all.
    expect([422, 503]).toContain(res.status());
  });

  test('auto top-up defaults to off and can be set', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);

    const initial = await page.request.get('/api/billing/auto-reload');
    expect(initial.ok()).toBeTruthy();
    expect((await initial.json()).pack).toBeNull();

    const set = await page.request.post('/api/billing/auto-reload', {
      data: { pack: 'medium', threshold: 40 },
    });
    expect(set.ok()).toBeTruthy();
    const body = await set.json() as { pack: string; threshold: number };
    expect(body.pack).toBe('medium');
    expect(body.threshold).toBe(40);

    const off = await page.request.post('/api/billing/auto-reload', { data: { pack: null } });
    expect((await off.json()).pack).toBeNull();
  });

  test('auto top-up rejects an unknown pack', async ({ page }) => {
    await signUp(page, uniqueEmail());
    const res = await page.request.post('/api/billing/auto-reload', {
      data: { pack: 'gigantic' },
    });
    expect(res.status()).toBe(422);
  });

  test("a member cannot read another member's auto top-up settings", async ({ page }) => {
    const first = uniqueEmail('first');
    await signUp(page, first);
    await page.request.post('/api/billing/auto-reload', { data: { pack: 'large' } });
    await logOut(page.request);

    const second = uniqueEmail('second');
    await signUp(page, second);
    const res = await page.request.get('/api/billing/auto-reload');
    expect((await res.json()).pack).toBeNull();
  });
});
