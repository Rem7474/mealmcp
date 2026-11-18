import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('adds stock, creates a structured recipe, and completes a shopping item', async ({ page }) => {
  await signIn(page);

  // 1. Add Pasta to Stock.
  await page.goto('/#stock');
  await page.getByRole('button', { name: 'Add to stock' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to stock' });
  await dialog.getByRole('combobox', { name: 'Product' }).fill('Pasta');
  await dialog.getByLabel('Quantity').fill('500');
  await dialog.getByRole('combobox', { name: 'Unit' }).fill('g');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Pasta').first()).toBeVisible();

  // 2. Create a recipe with structured steps.
  await page.goto('/#recipes');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByPlaceholder('Recipe name').fill('Tomato Pasta');

  const ingGroup = page.getByRole('group', { name: 'Ingredients' });
  await ingGroup.getByPlaceholder('Qty').fill('200');
  await ingGroup.getByRole('combobox', { name: 'Unit' }).fill('g');
  await ingGroup.getByRole('combobox', { name: 'Ingredient' }).fill('Pasta');

  const stepGroup = page.getByRole('group', { name: 'Steps' });
  await stepGroup.getByRole('button', { name: '+ Step' }).click();
  await stepGroup.getByLabel('Step', { exact: true }).nth(0).fill('Boil pasta in salted water.');
  await stepGroup.getByLabel('Min').nth(0).fill('10');
  await stepGroup.getByLabel('°C').nth(0).fill('100');
  await stepGroup.getByLabel('Appliance').nth(0).fill('Pot');

  await stepGroup.getByRole('button', { name: '+ Step' }).click();
  await stepGroup.getByLabel('Step', { exact: true }).nth(1).fill('Drain and serve hot.');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Tomato Pasta').first()).toBeVisible();

  // 3. Add a shopping item and mark it checked.
  await page.goto('/#shopping');
  await page.getByRole('combobox', { name: 'Item' }).fill('Parmesan');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Parmesan')).toBeVisible();
});
