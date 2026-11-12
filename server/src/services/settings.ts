import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { NotFoundError } from '../domain/errors.js';
import { type HouseholdSettings, parseSettings } from '../domain/settings.js';

/** Household preferences (default servings, which meals are planned on which days). */
export function createSettingsService(db: Db, hid: number) {
  const svc = {
    get(): HouseholdSettings {
      const row = db.select({ settings: households.settings }).from(households).where(eq(households.id, hid)).get();
      if (!row) throw new NotFoundError('Household', hid);
      return parseSettings(row.settings);
    },

    /** Merges the given fields into the current settings; `plannedMeals` replaces the whole pattern when given. */
    set(patch: HouseholdSettings): HouseholdSettings {
      const next: HouseholdSettings = { ...svc.get(), ...patch };
      db.update(households)
        .set({ settings: JSON.stringify(next) })
        .where(eq(households.id, hid))
        .run();
      return next;
    },
  };
  return svc;
}

export type SettingsService = ReturnType<typeof createSettingsService>;
