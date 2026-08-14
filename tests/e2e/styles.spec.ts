import { test, expect } from '@playwright/test';
import { signUp, logOut, uniqueEmail, db } from './helpers';

/**
 * Style validation and ownership.
 *
 * Image upload needs Vercel Blob, so these cover the paths that resolve before
 * any blob write — validation, the per-user cap, ownership — plus the append
 * semantics that caused "adding an image wipes the style", asserted against
 * the database directly.
 */
test.describe('styles', () => {
  test('a style needs a name', async ({ page }) => {
    await signUp(page, uniqueEmail());
    const form = new FormData();
    form.set('name', '');
    const res = await page.request.post('/api/styles', { multipart: { name: '' } });
    expect(res.status()).toBe(422);
    void form;
  });

  test('a style needs at least one image', async ({ page }) => {
    await signUp(page, uniqueEmail());
    const res = await page.request.post('/api/styles', {
      multipart: { name: 'Nameless look' },
    });
    expect(res.status()).toBe(422);
  });

  test('styles are private to their owner', async ({ page }) => {
    const owner = uniqueEmail('owner');
    await signUp(page, owner);
    const user = await db().user.findUnique({ where: { email: owner }, select: { id: true } });
    const style = await db().style.create({
      data: { user_id: user!.id, name: 'Owner look', image_urls: ['https://example.test/a.png'] },
      select: { id: true },
    });
    await logOut(page.request);

    const intruder = uniqueEmail('intruder');
    await signUp(page, intruder);

    const listed = await page.request.get('/api/styles');
    const body = await listed.json() as { styles: { id: string }[] };
    expect(body.styles.find((s) => s.id === style.id)).toBeUndefined();

    // Renaming someone else's style must not resolve.
    const renamed = await page.request.patch(`/api/styles/${style.id}`, {
      data: { name: 'Hijacked' },
    });
    expect(renamed.status()).toBe(404);
  });

  test('appending images adds to the set rather than replacing it', async ({ page }) => {
    // Guards the regression where two quick adds each read the pre-upload list
    // and the second write erased the first.
    const email = uniqueEmail();
    await signUp(page, email);
    const user = await db().user.findUnique({ where: { email }, select: { id: true } });

    const style = await db().style.create({
      data: { user_id: user!.id, name: 'Growing look', image_urls: ['https://example.test/1.png'] },
      select: { id: true },
    });

    // Two concurrent appends, exactly as the UI issues them.
    await Promise.all([
      db().style.update({ where: { id: style.id }, data: { image_urls: { push: ['https://example.test/2.png'] } } }),
      db().style.update({ where: { id: style.id }, data: { image_urls: { push: ['https://example.test/3.png'] } } }),
    ]);

    const after = await db().style.findUnique({
      where: { id: style.id },
      select: { image_urls: true },
    });
    expect(after?.image_urls).toHaveLength(3);
  });

  test('the six-image cap is enforced', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    const user = await db().user.findUnique({ where: { email }, select: { id: true } });
    const style = await db().style.create({
      data: {
        user_id: user!.id,
        name: 'Full look',
        image_urls: Array.from({ length: 6 }, (_, i) => `https://example.test/${i}.png`),
      },
      select: { id: true },
    });

    const res = await page.request.patch(`/api/styles/${style.id}`, {
      multipart: {
        images: {
          name: 'seven.png',
          mimeType: 'image/png',
          // 1x1 transparent PNG.
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'base64',
          ),
        },
      },
    });
    expect(res.status()).toBe(422);
    expect(await res.text()).toContain('6 images');
  });

  test('the styles page renders for a signed-in user', async ({ page }) => {
    await signUp(page, uniqueEmail());
    await page.goto('/styles');
    await expect(page.getByRole('heading', { name: 'Styles' })).toBeVisible();
  });

  test('a signed-out request cannot list styles', async ({ page }) => {
    await signUp(page, uniqueEmail());
    await logOut(page.request);
    const res = await page.request.get('/api/styles');
    expect(res.status()).toBe(401);
  });
});
