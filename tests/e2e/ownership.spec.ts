import { test, expect } from '@playwright/test';
import { signUp, logOut, logIn, uniqueEmail, seedStoryboard } from './helpers';

/**
 * The rule that protects both privacy and the API bill: a member may only
 * touch their own boards. A regression here exposes client work and lets
 * anyone spend the owner's Gemini budget.
 */
test.describe('storyboard ownership', () => {
  test("a member cannot read another member's board", async ({ page }) => {
    const owner = uniqueEmail('owner');
    const intruder = uniqueEmail('intruder');
    await signUp(page, owner);
    const board = await seedStoryboard(owner, 'Private board');
    await logOut(page.request);

    await signUp(page, intruder);
    const res = await page.request.get(`/api/storyboard/${board.id}`);
    expect(res.status()).toBe(403);
  });

  test("a member cannot mutate another member's board", async ({ page }) => {
    const owner = uniqueEmail('owner');
    const intruder = uniqueEmail('intruder');
    await signUp(page, owner);
    const board = await seedStoryboard(owner, 'Private board');
    await logOut(page.request);

    await signUp(page, intruder);

    const renamed = await page.request.patch(`/api/storyboard/${board.id}`, {
      data: { title: 'Hijacked' },
    });
    expect(renamed.status()).toBe(403);

    const deleted = await page.request.delete(`/api/storyboard/${board.id}`);
    expect(deleted.status()).toBe(403);
  });

  test("a member cannot spend another member's credits on generation", async ({ page }) => {
    const owner = uniqueEmail('owner');
    const intruder = uniqueEmail('intruder');
    await signUp(page, owner);
    const board = await seedStoryboard(owner, 'Private board');
    await logOut(page.request);

    await signUp(page, intruder);
    // Ownership is checked before anything reaches Gemini, so this never bills.
    const res = await page.request.post(`/api/storyboard/${board.id}/generate-refs`);
    expect(res.status()).toBe(403);
  });

  test('the owner can read and rename their own board', async ({ page }) => {
    const owner = uniqueEmail('owner');
    await signUp(page, owner);
    const board = await seedStoryboard(owner, 'My board');

    const read = await page.request.get(`/api/storyboard/${board.id}`);
    expect(read.ok()).toBeTruthy();

    const renamed = await page.request.patch(`/api/storyboard/${board.id}`, {
      data: { title: 'Renamed board' },
    });
    expect(renamed.ok()).toBeTruthy();
  });

  test("another member's board is absent from the projects list", async ({ page }) => {
    const owner = uniqueEmail('owner');
    const other = uniqueEmail('other');
    await signUp(page, owner);
    await seedStoryboard(owner, 'Owner Only Board');
    await logOut(page.request);

    await signUp(page, other);
    await page.goto('/list');
    await expect(page.getByText('Owner Only Board')).toHaveCount(0);
  });

  test('a signed-out request is rejected before ownership is even considered', async ({ page }) => {
    const owner = uniqueEmail('owner');
    await signUp(page, owner);
    const board = await seedStoryboard(owner);
    await logOut(page.request);

    const res = await page.request.get(`/api/storyboard/${board.id}`);
    expect(res.status()).toBe(401);
  });

  test('signing back in restores access to the owner', async ({ page }) => {
    const owner = uniqueEmail('owner');
    await signUp(page, owner);
    const board = await seedStoryboard(owner);
    await logOut(page.request);
    await logIn(page, owner);

    const res = await page.request.get(`/api/storyboard/${board.id}`);
    expect(res.ok()).toBeTruthy();
  });
});
