/**
 * Dietary restrictions, allergens and dislikes, checked against ingredient names.
 *
 * Matching is by keyword (French and English) on the product name, so it is a safety net and not a
 * guarantee: a product can carry an explicit `allergens` list (update_product) that overrides the guess.
 */

export const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'gluten_free', 'lactose_free', 'no_pork', 'no_alcohol'] as const;
export type Diet = (typeof DIETS)[number];

/** The 14 allergens of the EU food information regulation. */
export const ALLERGENS = ['gluten', 'crustaceans', 'molluscs', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin'] as const;
export type Allergen = (typeof ALLERGENS)[number];

export type DietSettings = { diets?: Diet[]; allergens?: Allergen[]; avoid?: string[] };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Compound names that would otherwise match the wrong thing ("lait de coco" is not dairy).
const REWRITES: [RegExp, string][] = [
  [/lait de coco|coconut milk|creme de coco|coconut cream|noix de coco/g, 'coco'],
  [/lait d amandes?|almond milk/g, 'amande'],
  [/lait de soja|soy milk|soya milk/g, 'soja'],
  [/lait d avoine|oat milk/g, 'avoine'],
  [/lait de riz|rice milk/g, 'riz'],
  [/beurre de cacahuetes?|peanut butter/g, 'cacahuete'],
  [/beurre de cacao|cocoa butter|beurre de karite/g, 'cacao'],
  [/noix de muscade/g, 'muscade'],
  [/pois chiche/g, 'pois chiche'],
];

const words = (list: string[]) => list.map((w) => new RegExp(`(^| )${w}(s|x)?( |$)`));

const ALLERGEN_WORDS: Record<Allergen, RegExp[]> = {
  gluten: words(['ble', 'farine', 'pain', 'pates?', 'spaghetti', 'penne', 'tagliatelle', 'macaroni', 'fusilli', 'semoule', 'couscous', 'boulgour', 'orge', 'seigle', 'epeautre', 'avoine', 'biscuit', 'brioche', 'baguette', 'tortilla', 'wrap', 'chapelure', 'panure', 'croissant', 'gnocchi', 'lasagne', 'nouilles?', 'seitan', 'flour', 'bread', 'pasta', 'wheat', 'barley', 'rye', 'spelt', 'oat', 'bulgur', 'noodle', 'cracker', 'panko', 'breadcrumb']),
  crustaceans: words(['crevette', 'homard', 'crabe', 'langoustine', 'ecrevisse', 'shrimp', 'prawn', 'lobster', 'crab', 'crayfish']),
  molluscs: words(['moule', 'huitre', 'calamar', 'calmar', 'poulpe', 'seiche', 'escargot', 'saint jacques', 'coquillage', 'mussel', 'oyster', 'squid', 'octopus', 'scallop', 'clam']),
  eggs: words(['oeuf', 'egg', 'mayonnaise', 'meringue']),
  fish: words(['poisson', 'saumon', 'thon', 'cabillaud', 'merlu', 'sardine', 'maquereau', 'truite', 'anchois', 'colin', 'dorade', 'haddock', 'surimi', 'fish', 'salmon', 'tuna', 'cod', 'anchovy', 'trout']),
  peanuts: words(['cacahuete', 'arachide', 'peanut']),
  soy: words(['soja', 'tofu', 'edamame', 'tempeh', 'miso', 'soy', 'soya']),
  milk: words(['lait', 'beurre', 'creme', 'yaourt', 'yogourt', 'fromage', 'gruyere', 'emmental', 'mozzarella', 'parmesan', 'skyr', 'feta', 'ricotta', 'mascarpone', 'comte', 'chevre', 'camembert', 'brie', 'raclette', 'kefir', 'milk', 'butter', 'cream', 'yogurt', 'yoghurt', 'cheese', 'whey']),
  nuts: words(['amande', 'noisette', 'noix', 'pistache', 'cajou', 'pecan', 'macadamia', 'praline', 'almond', 'hazelnut', 'walnut', 'pistachio', 'cashew']),
  celery: words(['celeri', 'celery']),
  mustard: words(['moutarde', 'mustard']),
  sesame: words(['sesame', 'tahini', 'tahin']),
  sulphites: words(['vin', 'wine']),
  lupin: words(['lupin']),
};

const MEAT = words(['boeuf', 'veau', 'porc', 'agneau', 'mouton', 'poulet', 'dinde', 'canard', 'lapin', 'jambon', 'lardon', 'saucisse', 'saucisson', 'bacon', 'steak', 'viande', 'hache', 'merguez', 'chorizo', 'gigot', 'rillettes', 'pate de campagne', 'gelatine', 'beef', 'pork', 'lamb', 'chicken', 'turkey', 'duck', 'ham', 'sausage', 'meat', 'veal', 'rabbit', 'salami', 'prosciutto', 'gelatin', 'lard']);
const PORK = words(['porc', 'jambon', 'lardon', 'bacon', 'saucisson', 'chorizo', 'rillettes', 'lard', 'pork', 'ham', 'salami', 'prosciutto', 'pancetta']);
const HONEY = words(['miel', 'honey']);
const ALCOHOL = words(['vin', 'biere', 'rhum', 'cognac', 'whisky', 'vodka', 'porto', 'champagne', 'cidre', 'liqueur', 'wine', 'beer', 'rum', 'brandy', 'cider']);

const hit = (patterns: RegExp[], n: string) => patterns.some((p) => p.test(n));

/** Which allergens an ingredient name suggests. */
export function guessAllergens(name: string): Allergen[] {
  const n = rewrite(name);
  return ALLERGENS.filter((a) => hit(ALLERGEN_WORDS[a], n));
}

function rewrite(name: string) {
  let n = normalize(name);
  for (const [re, to] of REWRITES) n = n.replace(re, to);
  return n;
}

const FORBIDDEN_BY: Record<Diet, (t: Traits) => boolean> = {
  vegetarian: (t) => t.meat || t.seafood,
  vegan: (t) => t.meat || t.seafood || t.milk || t.eggs || t.honey,
  pescatarian: (t) => t.meat,
  gluten_free: (t) => t.gluten,
  lactose_free: (t) => t.milk,
  no_pork: (t) => t.pork,
  no_alcohol: (t) => t.alcohol,
};

type Traits = { meat: boolean; seafood: boolean; milk: boolean; eggs: boolean; honey: boolean; gluten: boolean; pork: boolean; alcohol: boolean };

/**
 * Why an ingredient does not fit the household: `allergen:milk`, `diet:vegan` or `avoid:olives`.
 * `explicitAllergens` (set on the product) replaces the guess for allergens.
 */
export function conflictsOf(name: string, settings: DietSettings | undefined, explicitAllergens?: Allergen[] | null): string[] {
  if (!settings) return [];
  const n = rewrite(name);
  const allergens = new Set<Allergen>(explicitAllergens ?? guessAllergens(name));
  const traits: Traits = {
    meat: hit(MEAT, n),
    seafood: allergens.has('fish') || allergens.has('crustaceans') || allergens.has('molluscs'),
    milk: allergens.has('milk'),
    eggs: allergens.has('eggs'),
    honey: hit(HONEY, n),
    gluten: allergens.has('gluten'),
    pork: hit(PORK, n),
    alcohol: hit(ALCOHOL, n),
  };
  const out: string[] = [];
  for (const a of settings.allergens ?? []) if (allergens.has(a)) out.push(`allergen:${a}`);
  for (const d of settings.diets ?? []) if (FORBIDDEN_BY[d](traits)) out.push(`diet:${d}`);
  for (const term of settings.avoid ?? []) {
    const t = normalize(term);
    if (t && new RegExp(`(^| )${t}(s|x)?( |$)`).test(normalize(name))) out.push(`avoid:${term}`);
  }
  return out;
}
