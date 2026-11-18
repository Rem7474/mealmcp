import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('runs step-by-step cooking mode with persistent timer banner', async ({ page }) => {
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

  // Moving to step 2 keeps step 1's timer visible in the header banner and clickable.
  await cooking.getByRole('button', { name: 'Next' }).click();
  await expect(cooking.getByText('Step 2 of 2')).toBeVisible();
  const pill = cooking.getByRole('button', { name: /Step 1: (10:00|09:5\d)/ });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(cooking.getByText('Step 1 of 2')).toBeVisible();
  await expect(cooking.getByRole('button', { name: 'Pause' })).toBeVisible();

  await cooking.getByRole('button', { name: 'Next' }).click();
  await cooking.getByRole('button', { name: 'Finish' }).click();
  await expect(cooking).not.toBeVisible();
});

test('opens cooking mode from a planned meal and marks it cooked on finish', async ({ page }) => {
  await signIn(page);
  await page.goto('/#planning');

  await page.getByRole('button', { name: 'Plan a meal' }).first().click();
  const addDialog = page.getByRole('dialog', { name: 'Plan a meal' });
  await addDialog.getByLabel('Recipe').selectOption({ label: 'Tomato Pasta' });
  await addDialog.getByRole('button', { name: 'Plan' }).click();

  const mealLink = page.getByRole('link', { name: 'Tomato Pasta' }).first();
  await expect(mealLink).toHaveAttribute('href', /\/cook\?servings=\d+&mealId=\d+/);
  await mealLink.click();

  const cooking = page.getByRole('dialog', { name: 'Tomato Pasta' });
  await expect(cooking.getByText('Step 1 of 2')).toBeVisible();
  await cooking.getByRole('button', { name: 'Next' }).click();
  await cooking.getByRole('button', { name: 'Finish & mark cooked' }).click();
  await expect(cooking).not.toBeVisible();
  await expect(page.getByText('Meal cooked, stock updated.')).toBeVisible();

  // Return to Planning and verify the meal is marked cooked (link no longer opens /cook).
  await page.goto('/#planning');
  await expect(page.getByRole('link', { name: 'Tomato Pasta' }).first()).not.toHaveAttribute('href', /\/cook/);
});
