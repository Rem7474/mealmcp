import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('runs step-by-step cooking mode with timer and step navigation', async ({ page }) => {
  await signIn(page);
  await page.goto('/#recipes');

  await page.getByRole('button', { name: /Tomato Pasta/ }).click();
  await page.getByRole('button', { name: 'Start cooking' }).click();

  const cooking = page.getByRole('dialog', { name: 'Tomato Pasta' });
  await expect(cooking.getByText('Step 1 of 2')).toBeVisible();
  await expect(cooking.getByText('10:00')).toBeVisible();
  await expect(cooking.getByText('100 °C')).toBeVisible();
  await expect(cooking.getByText('Pot')).toBeVisible();
  await expect(cooking.getByText('Pasta', { exact: true })).toBeVisible();

  await cooking.getByRole('button', { name: 'Start' }).click();
  await expect(cooking.getByRole('button', { name: 'Pause' })).toBeVisible();

  await cooking.getByRole('button', { name: 'Next' }).click();
  await expect(cooking.getByText('Step 2 of 2')).toBeVisible();

  await cooking.getByRole('button', { name: 'Finish' }).click();
  await expect(cooking).not.toBeVisible();
});
