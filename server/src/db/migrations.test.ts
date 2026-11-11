import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';

const folder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

it('0001 renames the French "pièce" unit in existing data', () => {
  // Rebuild the database as it was at v0.1.0 (only the first migration applied).
  const old = mkdtempSync(join(tmpdir(), 'mealmcp-mig-'));
  cpSync(folder, old, { recursive: true });
  const journalPath = join(old, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  journal.entries = journal.entries.slice(0, 1);
  writeFileSync(journalPath, JSON.stringify(journal));

  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: old });
  sqlite.exec(`
    insert into households(name, created_at) values ('h', 1);
    insert into products(household_id, name, name_key, default_unit) values (1, 'Eggs', 'eggs', 'pièce'), (1, 'Rice', 'rice', 'g');
    insert into stock_items(household_id, product_id, quantity, unit, location, added_on) values (1, 1, 6, 'pièce', 'fridge', '2030-01-01'), (1, 2, 500, 'g', 'pantry', '2030-01-01');
    insert into shopping_items(household_id, product_id, quantity, unit, source) values (1, 1, 2, 'pièce', 'manual');
  `);

  // Upgrade with every migration.
  migrate(db, { migrationsFolder: folder });

  const units = (sql: string) => (sqlite.prepare(sql).all() as { unit: string }[]).map((r) => r.unit);
  expect(units('select default_unit as unit from products order by id')).toEqual(['piece', 'g']);
  expect(units('select unit from stock_items order by id')).toEqual(['piece', 'g']);
  expect(units('select unit from shopping_items')).toEqual(['piece']);
  // Nothing was deleted along the way.
  expect(sqlite.prepare('select count(*) as n from stock_items').get()).toEqual({ n: 2 });
  rmSync(old, { recursive: true, force: true });
});
