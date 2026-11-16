import { and, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { MEAL_TYPES, proposals } from '../db/schema.js';
import { addDays, today } from '../domain/dates.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { weekPlanStart } from '../domain/schemas.js';
import type { PlannerService } from './planner.js';
import type { RecipeService } from './recipes.js';
import type { SettingsService } from './settings.js';

const TTL_MS = 24 * 60 * 60 * 1000;
/** How many other recipes are kept per slot, for "not this one". */
const ALTERNATIVES = 3;
/** A recipe cooked within this many days is ranked down: a menu should not repeat last week's. */
const RECENT_PENALTY = 8;
/** Once an earlier meal uses up an expiring product, the next ones get no credit for it. */
const USES_WEIGHT = 10;

const stored = z.object({
  slots: z.array(
    z.object({
      key: z.string(),
      date: z.string(),
      mealType: z.enum(MEAL_TYPES),
      servings: z.number().int().positive(),
      status: z.enum(['proposed', 'accepted', 'refused', 'empty']),
      recipeId: z.number().int().positive().nullable(),
      reasons: z.array(z.string()),
      alternatives: z.array(z.number().int().positive()),
    }),
  ),
  alreadyPlanned: z.array(z.object({ date: z.string(), mealType: z.enum(MEAL_TYPES) })),
});
type Payload = z.infer<typeof stored>;
type Slot = Payload['slots'][number];

const slotKey = (date: string, mealType: string) => `${date}|${mealType}`;

/**
 * Plans a week without any model: the recipes are ranked by what is in the fridge, what expires, taste and season,
 * then spread over the chosen meals without repeating. The result is a proposal the household reviews slot by slot;
 * nothing reaches the plan until `apply`, which checks everything again.
 */
export function createWeekPlanService(db: Db, hid: number, recipes: RecipeService, planner: PlannerService, settings: SettingsService) {
  const mine = and(eq(proposals.householdId, hid), eq(proposals.kind, 'week_plan'));

  const load = (id: number) => {
    const row = db
      .select()
      .from(proposals)
      .where(and(mine, eq(proposals.id, id)))
      .get();
    if (!row || row.expiresAt < Date.now()) throw new NotFoundError('Week plan', id);
    return { row, payload: stored.parse(JSON.parse(row.payload)) };
  };
  const save = (id: number, payload: Payload, status?: 'applied') =>
    db
      .update(proposals)
      .set({ payload: JSON.stringify(payload), ...(status ? { status } : {}) })
      .where(and(mine, eq(proposals.id, id)))
      .run();

  const slotOf = (payload: Payload, key: string) => {
    const slot = payload.slots.find((s) => s.key === key);
    if (!slot) throw new NotFoundError('Slot', key);
    return slot;
  };
  const pending = (id: number) => {
    const found = load(id);
    if (found.row.status !== 'pending') throw new ValidationError('This plan was already applied');
    return found;
  };

  const recipeView = (recipeId: number, servings: number, reasons: string[]) => {
    try {
      const r = recipes.get(recipeId);
      const availability = recipes.availability({ id: recipeId, servings });
      return {
        id: r.id,
        name: r.name,
        prepMinutes: r.prepMinutes,
        cookMinutes: r.cookMinutes,
        reasons,
        missing: availability.ingredients.filter((i) => i.missing > 0).map((i) => i.name),
        dietConflicts: r.dietConflicts,
      };
    } catch (err) {
      if (err instanceof NotFoundError) return null; // deleted since: shown as an empty slot
      throw err;
    }
  };

  const view = (id: number) => {
    const { row, payload } = load(id);
    return {
      id: row.id,
      status: row.status,
      source: row.source,
      expiresAt: row.expiresAt,
      alreadyPlanned: payload.alreadyPlanned,
      slots: payload.slots.map((s) => {
        const recipe = s.recipeId ? recipeView(s.recipeId, s.servings, s.reasons) : null;
        return {
          key: s.key,
          date: s.date,
          mealType: s.mealType,
          servings: s.servings,
          status: recipe || s.status === 'refused' ? s.status : ('empty' as const),
          recipe,
          alternatives: s.alternatives.length,
        };
      }),
    };
  };

  const svc = {
    /** The plan under review, if any (one per household at a time). */
    current() {
      const row = db
        .select({ id: proposals.id, expiresAt: proposals.expiresAt })
        .from(proposals)
        .where(and(mine, eq(proposals.status, 'pending')))
        .orderBy(proposals.id)
        .all()
        .filter((r) => r.expiresAt >= Date.now())
        .at(-1);
      return row ? view(row.id) : null;
    },

    start(input: z.infer<typeof weekPlanStart>, userId: number | null) {
      const wanted = new Map<string, { date: string; mealType: (typeof MEAL_TYPES)[number] }>();
      for (const m of input.meals) wanted.set(slotKey(m.date, m.mealType), m);
      const dates = [...wanted.values()].map((m) => m.date).sort((a, b) => a.localeCompare(b));
      const taken = new Set(planner.list({ from: dates[0], to: dates.at(-1)! }).map((m) => slotKey(m.date, m.mealType)));
      const open = [...wanted.values()]
        .filter((m) => !taken.has(slotKey(m.date, m.mealType)))
        .sort((a, b) => a.date.localeCompare(b.date) || MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType));
      const alreadyPlanned = [...wanted.values()].filter((m) => taken.has(slotKey(m.date, m.mealType)));

      const servings = input.servings ?? settings.get().defaultServings ?? 4;
      const recent = new Set(planner.history({ days: input.avoidRepeatDays }).recipes.map((r) => r.recipeId));
      const ranked = recipes
        .rank({ targets: recipes.expiringTargets(5), tag: input.tag, servings })
        .filter((r) => r.dietConflicts.length === 0)
        .filter((r) => !input.maxMinutes || (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) <= input.maxMinutes);

      const used = new Set<number>();
      const covered = new Set<string>();
      const slots: Slot[] = open.map((m) => {
        const scored = ranked
          .filter((r) => !used.has(r.recipeId))
          .map((r) => ({
            r,
            score:
              r.score -
              r.usesExpiring.filter((u) => covered.has(u.name)).length * USES_WEIGHT -
              (recent.has(r.recipeId) ? RECENT_PENALTY : 0),
          }))
          .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));
        const best = scored[0]?.r;
        const base = { key: slotKey(m.date, m.mealType), date: m.date, mealType: m.mealType, servings };
        if (!best) return { ...base, status: 'empty', recipeId: null, reasons: [], alternatives: [] };
        used.add(best.recipeId);
        for (const u of best.usesExpiring) covered.add(u.name);
        const reasons = [
          ...(best.usesExpiring.length ? ['usesExpiring'] : []),
          ...(best.canCook ? ['canCook'] : []),
          ...(best.favorite ? ['favorite'] : []),
          ...(best.inSeason.length ? ['inSeason'] : []),
          ...((best.prepMinutes ?? 0) + (best.cookMinutes ?? 0) > 0 && (best.prepMinutes ?? 0) + (best.cookMinutes ?? 0) <= 30
            ? ['quick']
            : []),
        ];
        return {
          ...base,
          status: 'proposed',
          recipeId: best.recipeId,
          reasons,
          alternatives: scored.slice(1, 1 + ALTERNATIVES).map((s) => s.r.recipeId),
        };
      });

      const now = Date.now();
      return db.transaction(() => {
        // One plan under review per household, and nothing left to rot.
        db.delete(proposals)
          .where(and(mine, eq(proposals.status, 'pending')))
          .run();
        db.delete(proposals)
          .where(and(mine, lt(proposals.expiresAt, now)))
          .run();
        const row = db
          .insert(proposals)
          .values({
            householdId: hid,
            userId,
            kind: 'week_plan',
            source: 'rules',
            payload: JSON.stringify({ slots, alreadyPlanned } satisfies Payload),
            createdAt: now,
            expiresAt: now + TTL_MS,
          })
          .returning({ id: proposals.id })
          .get();
        return view(row.id);
      });
    },

    get: view,

    accept(id: number, key: string) {
      const { payload } = pending(id);
      const slot = slotOf(payload, key);
      if (!slot.recipeId) throw new ValidationError('This slot has no recipe to accept');
      slot.status = 'accepted';
      save(id, payload);
      return view(id);
    },

    /** "Not this one": moves on to the next candidate, or leaves the slot empty when there are none. */
    refuse(id: number, key: string) {
      const { payload } = pending(id);
      const slot = slotOf(payload, key);
      const next = slot.alternatives.shift();
      if (next) {
        slot.recipeId = next;
        slot.reasons = [];
        slot.status = 'proposed';
      } else {
        slot.recipeId = null;
        slot.reasons = [];
        slot.status = 'refused';
      }
      save(id, payload);
      return view(id);
    },

    /** The household picked a recipe itself for this slot (any recipe of the household). */
    choose(id: number, key: string, recipeId: number) {
      const { payload } = pending(id);
      const slot = slotOf(payload, key);
      recipes.get(recipeId); // the household's own recipe, or NotFound
      slot.recipeId = recipeId;
      slot.reasons = [];
      slot.status = 'accepted';
      save(id, payload);
      return view(id);
    },

    acceptAll(id: number) {
      const { payload } = pending(id);
      for (const s of payload.slots) if (s.status === 'proposed' && s.recipeId) s.status = 'accepted';
      save(id, payload);
      return view(id);
    },

    /**
     * Writes the accepted meals into the plan. Everything is checked again: a recipe deleted meanwhile or a slot
     * someone filled in the meantime is skipped and reported, never overwritten.
     */
    apply(id: number) {
      const { payload } = pending(id);
      const accepted = payload.slots.filter((s) => s.status === 'accepted' && s.recipeId);
      const skipped: { key: string; reason: 'recipeGone' | 'slotTaken' }[] = [];
      const planned = db.transaction(() => {
        const dates = accepted.map((s) => s.date).sort((a, b) => a.localeCompare(b));
        const taken = new Set(
          accepted.length ? planner.list({ from: dates[0], to: dates.at(-1)! }).map((m) => slotKey(m.date, m.mealType)) : [],
        );
        const toAdd: Slot[] = [];
        for (const s of accepted) {
          if (taken.has(s.key)) skipped.push({ key: s.key, reason: 'slotTaken' });
          else if (!recipeView(s.recipeId!, s.servings, [])) skipped.push({ key: s.key, reason: 'recipeGone' });
          else toAdd.push(s);
        }
        const meals = planner.addMany(
          toAdd.map((s) => ({ date: s.date, mealType: s.mealType, recipeId: s.recipeId, servings: s.servings })),
        );
        save(id, payload, 'applied');
        return meals;
      });
      const days = planned.map((m) => m.date).sort((a, b) => a.localeCompare(b));
      return { planned, skipped, from: days[0] ?? today(), to: days.at(-1) ?? addDays(today(), 0) };
    },
  };
  return svc;
}

export type WeekPlanService = ReturnType<typeof createWeekPlanService>;
