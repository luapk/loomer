import { test, expect } from '@playwright/test';
import {
  signUp, uniqueEmail, seedStoryboard, drainCredits, balanceOf,
} from './helpers';

/**
 * The spending gate. If this breaks, generation runs on the owner's API keys
 * for free — the exact exposure the credit system exists to close.
 */
test.describe('credits', () => {
  test('a new account starts with welcome credits', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);

    const res = await page.request.get('/api/credits');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { balance: number };
    expect(body.balance).toBe(30);
  });

  test('the billing page shows the balance', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    await expect(page.getByText('30', { exact: false }).first()).toBeVisible();
  });

  test('generation is refused at a zero balance', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    const board = await seedStoryboard(email);
    await drainCredits(email);
    expect(await balanceOf(email)).toBe(0);

    const res = await page.request.post(`/api/storyboard/${board.id}/generate-refs`);
    expect(res.status()).toBe(402);
    const body = await res.json() as { code?: string };
    expect(body.code).toBe('INSUFFICIENT_CREDITS');
  });

  test('a refused generation does not charge the account', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    const board = await seedStoryboard(email);
    await drainCredits(email);

    await page.request.post(`/api/storyboard/${board.id}/generate-refs`);
    expect(await balanceOf(email)).toBe(0);
  });

  test('a parse is refused at a zero balance', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    const board = await seedStoryboard(email);
    await drainCredits(email);

    const res = await page.request.post(`/api/storyboard/${board.id}/parse`);
    expect(res.status()).toBe(402);
  });

  test('the admin credit panel is closed to members', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);

    const list = await page.request.get('/api/admin/credits');
    expect(list.status()).toBe(403);

    const grant = await page.request.post('/api/admin/credits', {
      data: { userId: 'someone', amount: 1000 },
    });
    expect(grant.status()).toBe(403);
  });

  test('a member cannot grant themselves credits', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    const before = await balanceOf(email);

    await page.request.post('/api/admin/credits', {
      data: { userId: 'self', amount: 99999 },
    });

    expect(await balanceOf(email)).toBe(before);
  });
});
