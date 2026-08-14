import { test, expect } from '@playwright/test';
import { signUp, logIn, logOut, uniqueEmail, PASSWORD } from './helpers';

test.describe('authentication', () => {
  test('a signed-out visitor is redirected to login', async ({ page }) => {
    await page.goto('/list');
    await expect(page).toHaveURL(/\/login/);
  });

  test('sign up, land signed in, sign out again', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);

    await page.goto('/list');
    await expect(page).toHaveURL(/\/list/);
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    await logOut(page.request);
    await page.goto('/list');
    await expect(page).toHaveURL(/\/login/);
  });

  test('the same email cannot register twice', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    const res = await page.request.post('/api/auth/signup', {
      data: { email, password: PASSWORD },
    });
    expect(res.status()).toBe(409);
  });

  test('a wrong password is rejected', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    const res = await page.request.post('/api/auth/login', {
      data: { email, password: 'not-the-password' },
    });
    expect(res.ok()).toBeFalsy();
  });

  test('a short password is rejected at signup', async ({ page }) => {
    const res = await page.request.post('/api/auth/signup', {
      data: { email: uniqueEmail(), password: 'short' },
    });
    expect(res.status()).toBe(422);
  });

  test('logging back in restores access', async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email);
    await logOut(page.request);
    await logIn(page, email);
    await page.goto('/list');
    await expect(page).toHaveURL(/\/list/);
  });
});
