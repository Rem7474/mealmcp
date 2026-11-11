/** Store aisles a product can be filed under. Free text is still allowed; these are the ones the UI knows. */
export const CATEGORIES = ['produce', 'dairy', 'meat_fish', 'bakery', 'pantry', 'frozen', 'drinks', 'household', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// First match wins, so the more specific aisles come first ("lait de coco" stays an unavoidable edge case).
const KEYWORDS: [Category, string[]][] = [
  ['household', ['papier toilette', 'essuie tout', 'lessive', 'liquide vaisselle', 'eponge', 'sac poubelle', 'savon', 'shampoing', 'dentifrice', 'detergent', 'nettoyant', 'dish soap', 'laundry', 'trash bag', 'paper towel']],
  ['frozen', ['surgele', 'glace', 'frozen', 'ice cream']],
  ['drinks', ['eau', 'jus', 'vin', 'biere', 'soda', 'cafe', 'the', 'sirop', 'boisson', 'limonade', 'water', 'juice', 'wine', 'beer', 'coffee', 'tea']],
  ['dairy', ['lait', 'beurre', 'creme', 'yaourt', 'yogourt', 'fromage', 'gruyere', 'emmental', 'mozzarella', 'parmesan', 'oeuf', 'skyr', 'feta', 'ricotta', 'mascarpone', 'milk', 'butter', 'cream', 'yogurt', 'cheese', 'egg']],
  ['meat_fish', ['poulet', 'boeuf', 'porc', 'veau', 'agneau', 'dinde', 'jambon', 'lardon', 'saucisse', 'steak', 'viande', 'hache', 'bacon', 'saumon', 'thon', 'cabillaud', 'poisson', 'crevette', 'merlu', 'filet', 'chicken', 'beef', 'pork', 'lamb', 'turkey', 'ham', 'sausage', 'salmon', 'tuna', 'fish', 'shrimp']],
  ['bakery', ['pain', 'baguette', 'brioche', 'croissant', 'tortilla', 'wrap', 'bread', 'bun']],
  ['produce', ['pomme', 'poire', 'banane', 'orange', 'citron', 'tomate', 'carotte', 'oignon', 'ail', 'echalote', 'patate', 'courgette', 'aubergine', 'poivron', 'salade', 'laitue', 'epinard', 'brocoli', 'chou', 'champignon', 'concombre', 'haricot vert', 'poireau', 'persil', 'basilic', 'coriandre', 'ciboulette', 'menthe', 'fruit', 'legume', 'avocat', 'fraise', 'framboise', 'myrtille', 'raisin', 'mangue', 'gingembre', 'radis', 'navet', 'betterave', 'celeri', 'fenouil', 'courge', 'potiron', 'apple', 'pear', 'banana', 'lemon', 'tomato', 'carrot', 'onion', 'garlic', 'potato', 'zucchini', 'eggplant', 'pepper', 'lettuce', 'spinach', 'broccoli', 'cabbage', 'mushroom', 'cucumber', 'leek', 'parsley', 'basil', 'cilantro', 'mint', 'avocado', 'strawberry', 'ginger']],
  ['pantry', ['riz', 'pate', 'spaghetti', 'farine', 'sucre', 'sel', 'huile', 'vinaigre', 'conserve', 'lentille', 'pois chiche', 'haricot', 'semoule', 'quinoa', 'cereale', 'sauce', 'moutarde', 'ketchup', 'mayonnaise', 'epice', 'chocolat', 'biscuit', 'miel', 'confiture', 'noix', 'amande', 'levure', 'bouillon', 'concentre', 'rice', 'pasta', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'lentil', 'chickpea', 'spice', 'honey', 'jam', 'nut', 'yeast', 'stock']],
];

const matchers = KEYWORDS.map(([category, words]) => [category, words.map((w) => new RegExp(`(^| )${w}(s|x)?( |$)`))] as const);

/** A best guess at the aisle from the product name (French and English), or null when nothing matches. */
export function guessCategory(name: string): Category | null {
  const n = normalize(name);
  for (const [category, patterns] of matchers) if (patterns.some((p) => p.test(n))) return category;
  return null;
}
