/**
 * How long food keeps in the freezer, and how long once thawed in the fridge, by product category (the store aisle
 * names of products.category). Conservative household figures, not a food-safety guarantee: a product's own
 * frozenShelfLifeDays / thawedShelfLifeDays always win.
 */
export const FREEZING_DEFAULTS: Record<string, { frozenDays: number; thawedDays: number }> = {
  meat_fish: { frozenDays: 90, thawedDays: 2 },
  produce: { frozenDays: 240, thawedDays: 2 },
  dairy: { frozenDays: 90, thawedDays: 2 },
  bakery: { frozenDays: 90, thawedDays: 2 },
  pantry: { frozenDays: 90, thawedDays: 3 },
};

/** For a product without a category, or a category not listed above. */
export const FALLBACK_FREEZING = { frozenDays: 90, thawedDays: 2 };

export const freezingDefaults = (category: string | null | undefined) => (category && FREEZING_DEFAULTS[category]) || FALLBACK_FREEZING;
