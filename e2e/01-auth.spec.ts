import { expect, test } from '@playwright/test';
import { forceEnglish, OWNER } from './helpers';

test('registers the first owner, updates profile, signs out and signs back in', async ({ page }) => {
  await forceEnglish(page);
  await page.goto('/');

  // Open the registration form and register the first household owner.
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await page.getByLabel('Your name').fill(OWNER.name);
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('navigation').first()).toBeVisible();

  // Edit profile display name in Account.
  await page.goto('/#account');
  const nameInput = page.getByLabel('Name', { exact: true });
  await expect(nameInput).toBeVisible();
  await nameInput.fill('Alice Martin');
  await nameInput.locator('..').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Profile updated.')).toBeVisible();

  // Sign out and sign back in; verify updated name persisted in SQLite.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.goto('/#account');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Alice Martin');
});
