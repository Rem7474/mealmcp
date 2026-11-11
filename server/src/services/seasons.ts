import { today } from '../domain/dates.js';
import { isInSeason, type Place, type Produce, type ProduceKind, produceFor, seasonalProduce } from '../domain/seasons.js';
import type { SettingsService } from './settings.js';

const monthOf = (isoDate: string) => Number(isoDate.slice(5, 7));

/** What is in season where the household lives (see the `country` and `hemisphere` settings). */
export function createSeasonService(settings: SettingsService) {
  const place = (): Place => {
    const s = settings.get();
    return { country: s.country ?? 'FR', hemisphere: s.hemisphere ?? 'north' };
  };

  const svc = {
    place,

    /** Fruits, vegetables and herbs in season in `month` (default: this month), plus what ends and what starts soon. */
    list({ month, kind }: { month?: number; kind?: ProduceKind } = {}) {
      const p = place();
      const m = month ?? monthOf(today());
      const { inSeason, lastMonth, startingNextMonth } = seasonalProduce(p, m, kind);
      return { ...p, month: m, inSeason, lastMonth, startingNextMonth };
    },

    /** Is this product in season this month? null when it is not a fruit, vegetable or herb we know. */
    statusOf(name: string, month = monthOf(today())): { inSeason: boolean; produce: Produce } | null {
      const produce = produceFor(name, place());
      return produce ? { inSeason: isInSeason(produce, month), produce } : null;
    },

    /** In-season produce of the same kind, as alternatives to something out of season. */
    alternativesTo(produce: Produce, month = monthOf(today()), limit = 3) {
      return seasonalProduce(place(), month, produce.kind)
        .inSeason.filter((p) => p.id !== produce.id)
        .slice(0, limit)
        .map((p) => ({ id: p.id, en: p.en, fr: p.fr }));
    },
  };
  return svc;
}

export type SeasonService = ReturnType<typeof createSeasonService>;
