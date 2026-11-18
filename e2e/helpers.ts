import { expect, type Page } from '@playwright/test';

export const OWNER = {
  name: 'Alice',
  email: 'alice@example.com',
  password: process.env.E2E_PASSWORD ?? ['correct', 'horse', 'battery'].join('-'),
};

export async function forceEnglish(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mealmcp.lang', 'en');
    } catch {
      /* ignore */
    }
  });
}

export async function signIn(page: Page) {
  await forceEnglish(page);
  await page.goto('/');
  const nav = page.getByRole('navigation').first();
  const heading = page.getByRole('heading', { name: 'Sign in' });
  await expect(nav.or(heading)).toBeVisible();
  if (await heading.isVisible()) {
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(nav).toBeVisible();
  }
}
