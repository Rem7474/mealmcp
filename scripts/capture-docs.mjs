// Usage: npm run build && npm run docs:screens
//
// Starts the compiled server against a temporary SQLite database, seeds realistic demo data via the API,
// and captures all 20 desktop + mobile screenshots (EN & FR) into docs/screens/.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'docs', 'screens');
const port = 3101;
const baseUrl = `http://127.0.0.1:${port}`;
const dbDir = join(tmpdir(), `mealmcp-docs-${process.pid}-${Date.now()}`);
const dbPath = join(dbDir, 'demo.db');

mkdirSync(outDir, { recursive: true });
mkdirSync(dbDir, { recursive: true });

const server = spawn(process.execPath, ['server/dist/index.js'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    PUBLIC_URL: baseUrl,
    DATABASE_PATH: dbPath,
    LOG_LEVEL: 'warn',
  },
});

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      /* server starting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not become healthy in time');
}

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function seedDemoData() {
  const jar = new Map();
  async function api(method, path, body) {
    const headers = { 'content-type': 'application/json' };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const set of res.headers.getSetCookie()) {
      const [pair] = set.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  await api('POST', '/auth/register', {
    name: 'Alice',
    email: 'alice@mealmcp.demo',
    password: ['demo', 'kitchen', 'pass'].join('-'),
    householdName: 'Home',
  });

  await api('PUT', '/settings', {
    currency: 'EUR',
    defaultServings: 2,
    shoppingGroupBy: 'aisle',
    nutrition: { enabled: true },
  });
  await api('PUT', '/budget', { monthly: 450 });

  // Stock items across locations and expiry states.
  const stockInputs = [
    { name: 'Pasta', quantity: 500, unit: 'g', location: 'pantry', expiresOn: isoDate(120), price: 1.45 },
    { name: 'Cherry tomatoes', quantity: 250, unit: 'g', location: 'fridge', expiresOn: isoDate(2), price: 2.3 },
    { name: 'Mozzarella', quantity: 125, unit: 'g', location: 'fridge', expiresOn: isoDate(4), price: 1.65 },
    { name: 'Olive oil', approximate: true, location: 'pantry' },
    { name: 'Chicken breast', quantity: 400, unit: 'g', location: 'freezer', expiresOn: isoDate(45), price: 5.8 },
    { name: 'Milk', quantity: 1000, unit: 'ml', location: 'fridge', opened: true, expiresOn: isoDate(3), price: 1.15 },
    { name: 'Greek yogurt', quantity: 4, unit: 'piece', location: 'fridge', expiresOn: isoDate(6), price: 2.9 },
  ];
  for (const s of stockInputs) await api('POST', '/stock', s);

  // Set nutrition per 100g on main ingredients so RecipeNutrition renders a complete breakdown.
  const nutritionByName = {
    Pasta: { kcal: 355, protein: 12.5, carbs: 71, fat: 1.5, fiber: 3.2 },
    'Cherry tomatoes': { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
    Mozzarella: { kcal: 280, protein: 18, carbs: 2.2, fat: 22, fiber: 0 },
    'Chicken breast': { kcal: 120, protein: 23, carbs: 0, fat: 2.6, fiber: 0 },
  };
  const products = await api('GET', '/products');
  for (const p of products) {
    const n = nutritionByName[p.name];
    if (n) await api('PUT', `/products/${p.id}/nutrition`, { per100g: n });
  }

  // Recipes with structured steps.
  const pasta = await api('POST', '/recipes', {
    name: 'Tomato & Mozzarella Pasta',
    description: 'Quick weeknight pasta with roasted cherry tomatoes and fresh mozzarella.',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    favorite: true,
    rating: 5,
    tags: ['quick', 'vegetarian'],
    ingredients: [
      { name: 'Pasta', quantity: 200, unit: 'g' },
      { name: 'Cherry tomatoes', quantity: 250, unit: 'g' },
      { name: 'Mozzarella', quantity: 125, unit: 'g' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp', toTaste: true },
    ],
    steps: [
      { text: 'Boil salted water and cook the pasta al dente.', durationMinutes: 10, appliance: 'Pot' },
      { text: 'Roast cherry tomatoes with olive oil until blistered.', durationMinutes: 12, temperatureC: 200, appliance: 'Oven' },
      { text: 'Toss pasta with tomatoes and torn mozzarella, serve warm.' },
    ],
  });
  const chicken = await api('POST', '/recipes', {
    name: 'Herb Roast Chicken',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 25,
    rating: 4,
    tags: ['dinner'],
    ingredients: [
      { name: 'Chicken breast', quantity: 350, unit: 'g' },
      { name: 'Garlic', quantity: 2, unit: 'piece' },
    ],
    steps: [{ text: 'Season chicken and roast until golden.', durationMinutes: 25, temperatureC: 190, appliance: 'Oven' }],
  });

  // Plan meals for this week & generate shopping list.
  await api('POST', '/plan', { date: isoDate(0), mealType: 'dinner', recipeId: pasta.id, servings: 2 });
  await api('POST', '/plan', { date: isoDate(1), mealType: 'dinner', recipeId: chicken.id, servings: 2 });
  await api('POST', '/shopping/generate', { from: isoDate(0), to: isoDate(6), includeLowStock: true });
  await api('POST', '/shopping', { name: 'Fresh basil', quantity: 1, unit: 'piece' });
  await api('POST', '/shopping', { name: 'Parmesan', quantity: 150, unit: 'g' });

  // Record a couple of expenses for Budget charts.
  await api('POST', '/expenses', {
    date: isoDate(-4),
    store: 'Fresh Market',
    total: 42.6,
    items: [
      { name: 'Cherry tomatoes', quantity: 500, unit: 'g', price: 4.6 },
      { name: 'Chicken breast', quantity: 800, unit: 'g', price: 11.6 },
    ],
  });
  await api('POST', '/expenses', { date: isoDate(-1), store: 'Bakery', total: 6.4 });
}

async function capture() {
  await waitForHealth();
  await seedDemoData();

  const browser = await chromium.launch();
  try {
    for (const lang of ['en', 'fr']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.addInitScript((l) => {
        localStorage.setItem('mealmcp.lang', l);
      }, lang);

      await page.goto(baseUrl);
      await page.getByLabel(/Email|Adresse e-mail/i).fill('alice@mealmcp.demo');
      await page.getByLabel(/Password|Mot de passe/i).fill(['demo', 'kitchen', 'pass'].join('-'));
      await page.getByRole('button', { name: /Sign in|Se connecter/i }).click();
      await page.getByRole('navigation').first().waitFor();

      const desktopTabs = ['planning', 'recipes', 'shopping', 'stock', 'budget'];
      for (const tab of desktopTabs) {
        await page.goto(`${baseUrl}/#${tab}`);
        await page.waitForTimeout(600);
        await page.screenshot({ path: join(outDir, `${tab}-${lang}.jpg`), type: 'jpeg', quality: 95 });
      }

      // Nutrition screenshot: open first recipe and scroll nutrition card into view.
      await page.goto(`${baseUrl}/#recipes/1`);
      await page.waitForTimeout(600);
      await page.mouse.wheel(0, 320);
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(outDir, `nutrition-${lang}.jpg`), type: 'jpeg', quality: 95 });

      // Mobile screenshots (390x844 @2x -> 780x1688).
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        storageState: await context.storageState(),
      });
      const mPage = await mobileContext.newPage();
      await mPage.addInitScript((l) => {
        localStorage.setItem('mealmcp.lang', l);
      }, lang);
      for (const tab of ['planning', 'shopping', 'stock', 'budget']) {
        await mPage.goto(`${baseUrl}/#${tab}`);
        await mPage.waitForTimeout(600);
        await mPage.screenshot({ path: join(outDir, `m-${tab}-${lang}.jpg`), type: 'jpeg', quality: 95 });
      }
      await mobileContext.close();
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

try {
  await capture();
  console.log('Captured 20 screenshots in docs/screens/');
} finally {
  server.kill();
  await new Promise((r) => server.once('exit', r));
  try {
    rmSync(dbDir, { recursive: true, force: true });
  } catch {
    /* ignore temp cleanup errors */
  }
}
