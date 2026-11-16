import { and, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { MEAL_TYPES, proposals } from '../db/schema.js';
import { addDays, today } from '../domain/dates.js';
import { conflictsOf } from '../domain/diet.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import { recipeCreate, type weekPlanStart } from '../domain/schemas.js';
import type { PlannerService } from './planner.js';
import type { ProductService } from './products.js';
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
      /** A recipe the model invented for this slot: it only becomes a recipe of the household when the plan is applied. */
      draft: recipeCreate.nullable().default(null),
      /** `pending` while the model is still working on this slot; the rules' pick stands in meanwhile. */
      ai: z.enum(['none', 'pending', 'done', 'failed']).default('none'),
    }),
  ),
  alreadyPlanned: z.array(z.object({ date: z.string(), mealType: z.enum(MEAL_TYPES) })),
});
type Payload = z.infer<typeof stored>;
type Slot = Payload['slots'][number];
/** How long a slot may stay `pending` before it is considered lost (the server restarted mid-way). */
const GENERATION_GRACE_MS = 15 * 60 * 1000;
/** What the model gave for one slot. */
export type AiSlotResult = { recipeId: number } | { draft: z.output<typeof recipeCreate> } | { failed: true };

const slotKey = (date: string, mealType: string) => `${date}|${mealType}`;

/**
 * Plans a week without any model: the recipes are ranked by what is in the fridge, what expires, taste and season,
 * then spread over the chosen meals without repeating. The result is a proposal the household reviews slot by slot;
 * nothing reaches the plan until `apply`, which checks everything again.
 */
export function createWeekPlanService(
  db: Db,
  hid: number,
  recipes: RecipeService,
  planner: PlannerService,
  settings: SettingsService,
  products: ProductService,
) {
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

  /** Why a drafted recipe cannot be cooked by this household (allergen, diet, dislike), checked on every ingredient. */
  const draftConflicts = (draft: z.output<typeof recipeCreate>) => [
    ...new Set(draft.ingredients.flatMap((i) => (i.toTaste ? [] : conflictsOf(i.name, settings.get().diet)))),
  ];

  const draftView = (draft: z.output<typeof recipeCreate>, reasons: string[]) => ({
    id: null,
    name: draft.name,
    prepMinutes: draft.prepMinutes ?? null,
    cookMinutes: draft.cookMinutes ?? null,
    reasons,
    missing: [] as string[],
    dietConflicts: draftConflicts(draft),
    draft: {
      ingredients: draft.ingredients.map((i) => ({
        name: i.name,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
        toTaste: i.toTaste,
        isNew: !products.findByName(i.name),
      })),
      steps: draft.steps.map((s) => s.text),
    },
  });

  const view = (id: number) => {
    const { row, payload } = load(id);
    const fresh = Date.now() - row.createdAt < GENERATION_GRACE_MS;
    return {
      id: row.id,
      status: row.status,
      source: row.source,
      expiresAt: row.expiresAt,
      /** The model is still working on some slots; ask again in a moment. */
      generating: fresh && payload.slots.some((s) => s.ai === 'pending'),
      alreadyPlanned: payload.alreadyPlanned,
      slots: payload.slots.map((s) => {
        const recipe = s.draft ? draftView(s.draft, s.reasons) : s.recipeId ? recipeView(s.recipeId, s.servings, s.reasons) : null;
        return {
          key: s.key,
          date: s.date,
          mealType: s.mealType,
          servings: s.servings,
          status: recipe || s.status === 'refused' ? s.status : ('empty' as const),
          recipe,
          alternatives: s.alternatives.length,
          thinking: fresh && s.ai === 'pending',
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

    /** The meals asked for that are still free, in order, and the ones that already have something planned. */
    open(input: Pick<z.infer<typeof weekPlanStart>, 'meals'>) {
      const wanted = new Map<string, { date: string; mealType: (typeof MEAL_TYPES)[number] }>();
      for (const m of input.meals) wanted.set(slotKey(m.date, m.mealType), m);
      const dates = [...wanted.values()].map((m) => m.date).sort();
      const taken = new Set(planner.list({ from: dates[0], to: dates.at(-1)! }).map((m) => slotKey(m.date, m.mealType)));
      const open = [...wanted.values()]
        .filter((m) => !taken.has(slotKey(m.date, m.mealType)))
        .sort((a, b) => a.date.localeCompare(b.date) || MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType));
      const alreadyPlanned = [...wanted.values()].filter((m) => taken.has(slotKey(m.date, m.mealType)));
      return { open, alreadyPlanned };
    },

    /**
     * The rules pick a recipe per meal at once. With `source: 'llm'` every slot is also marked as waiting for the model,
     * which fills them one by one through `fill`: the rules' pick is what the person sees, and falls back to, meanwhile.
     */
    start(input: z.infer<typeof weekPlanStart>, userId: number | null, source: 'rules' | 'llm' = 'rules') {
      const { open, alreadyPlanned } = svc.open(input);

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
        const ai = source === 'llm' ? ('pending' as const) : ('none' as const);
        if (!best) return { ...base, status: 'empty', recipeId: null, reasons: [], alternatives: [], draft: null, ai };
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
          draft: null,
          ai,
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
            source,
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
      if (!slot.recipeId && !slot.draft) throw new ValidationError('This slot has no recipe to accept');
      slot.status = 'accepted';
      // What the person kept is final: a late answer from the model must not replace it.
      if (slot.ai === 'pending') slot.ai = 'done';
      save(id, payload);
      return view(id);
    },

    /** "Not this one": moves on to the next candidate, or leaves the slot empty when there are none. */
    refuse(id: number, key: string) {
      const { payload } = pending(id);
      const slot = slotOf(payload, key);
      const next = slot.alternatives.shift();
      slot.draft = null;
      slot.reasons = [];
      if (next) {
        slot.recipeId = next;
        slot.status = 'proposed';
      } else {
        slot.recipeId = null;
        slot.status = 'refused';
      }
      if (slot.ai === 'pending') slot.ai = 'done';
      save(id, payload);
      return view(id);
    },

    /** The household picked a recipe itself for this slot (any recipe of the household). */
    choose(id: number, key: string, recipeId: number) {
      const { payload } = pending(id);
      const slot = slotOf(payload, key);
      recipes.get(recipeId); // the household's own recipe, or NotFound
      slot.recipeId = recipeId;
      slot.draft = null;
      slot.reasons = [];
      slot.status = 'accepted';
      if (slot.ai === 'pending') slot.ai = 'done';
      save(id, payload);
      return view(id);
    },

    acceptAll(id: number) {
      const { payload } = pending(id);
      for (const s of payload.slots)
        if (s.status === 'proposed' && (s.recipeId || s.draft)) {
          s.status = 'accepted';
          if (s.ai === 'pending') s.ai = 'done';
        }
      save(id, payload);
      return view(id);
    },

    /**
     * The model's answer for one slot. It replaces the rules' pick (which becomes the first alternative) only while the
     * person has not touched the slot; otherwise it is dropped. Never throws for a plan that is gone: the job just stops.
     */
    fill(id: number, key: string, result: AiSlotResult) {
      const { payload } = pending(id);
      const slot = slotOf(payload, key);
      if (slot.ai !== 'pending') return false;
      if ('failed' in result) {
        slot.ai = 'failed';
      } else if (slot.status === 'accepted' || slot.status === 'refused') {
        slot.ai = 'done';
      } else {
        if ('draft' in result) {
          const conflicts = draftConflicts(result.draft);
          if (conflicts.length > 0) throw new ValidationError(`The drafted recipe does not fit the household (${conflicts.join(', ')})`);
        } else recipes.get(result.recipeId); // the household's own recipe, or NotFound
        const previous = slot.recipeId;
        if ('draft' in result) {
          slot.draft = result.draft;
          slot.recipeId = null;
          slot.reasons = ['aiDraft'];
        } else {
          slot.draft = null;
          slot.recipeId = result.recipeId;
          slot.reasons = ['aiPick'];
        }
        const rest = slot.alternatives.filter((a) => a !== slot.recipeId && a !== previous);
        slot.alternatives = [...(previous && previous !== slot.recipeId ? [previous] : []), ...rest].slice(0, ALTERNATIVES);
        slot.status = 'proposed';
        slot.ai = 'done';
      }
      save(id, payload);
      return true;
    },

    /**
     * Writes the accepted meals into the plan. Everything is checked again: a recipe deleted meanwhile, a slot
     * someone filled in the meantime or a drafted recipe the diet now rules out is skipped and reported, never forced.
     * Drafted recipes are created here, and only here.
     */
    apply(id: number) {
      const { payload } = pending(id);
      const accepted = payload.slots.filter((s) => s.status === 'accepted' && (s.recipeId || s.draft));
      const skipped: { key: string; reason: 'recipeGone' | 'slotTaken' | 'dietConflict' }[] = [];
      const planned = db.transaction(() => {
        const dates = accepted.map((s) => s.date).sort();
        const taken = new Set(
          accepted.length ? planner.list({ from: dates[0], to: dates.at(-1)! }).map((m) => slotKey(m.date, m.mealType)) : [],
        );
        const toAdd: { slot: Slot; recipeId: number }[] = [];
        for (const s of accepted) {
          if (taken.has(s.key)) skipped.push({ key: s.key, reason: 'slotTaken' });
          else if (s.draft) {
            if (draftConflicts(s.draft).length > 0) skipped.push({ key: s.key, reason: 'dietConflict' });
            else toAdd.push({ slot: s, recipeId: recipes.create(s.draft).id });
          } else if (!recipeView(s.recipeId as number, s.servings, [])) skipped.push({ key: s.key, reason: 'recipeGone' });
          else toAdd.push({ slot: s, recipeId: s.recipeId as number });
        }
        const meals = planner.addMany(
          toAdd.map(({ slot, recipeId }) => ({ date: slot.date, mealType: slot.mealType, recipeId, servings: slot.servings })),
        );
        save(id, payload, 'applied');
        return meals;
      });
      const days = planned.map((m) => m.date).sort();
      return { planned, skipped, from: days[0] ?? today(), to: days.at(-1) ?? addDays(today(), 0) };
    },
  };
  return svc;
}

export type WeekPlanService = ReturnType<typeof createWeekPlanService>;
