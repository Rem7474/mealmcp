/**
 * Seasonal produce calendar, bundled with the app (no network, no tracking).
 *
 * Two calendars cover the supported countries: temperate Europe (FR, BE, CH, GB) and North America
 * (CA, US). They describe the open-field harvest season of a temperate climate; they are a guide for
 * choosing what to cook, not an agronomic reference. The southern hemisphere is the same calendar
 * shifted by six months.
 */

export const COUNTRIES = ['FR', 'BE', 'CH', 'GB', 'CA', 'US'] as const;
export type Country = (typeof COUNTRIES)[number];
export const HEMISPHERES = ['north', 'south'] as const;
export type Hemisphere = (typeof HEMISPHERES)[number];
export type ProduceKind = 'fruit' | 'vegetable' | 'herb';
type CalendarId = 'eu' | 'na';

export const CALENDAR_OF: Record<Country, CalendarId> = { FR: 'eu', BE: 'eu', CH: 'eu', GB: 'eu', CA: 'na', US: 'na' };

/** "5-9" is May to September, "10-3" wraps over the new year, "3-5,9-11" combines ranges. */
function months(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const [from, to = from] = part.split('-').map(Number);
    for (let m = from; ; m = (m % 12) + 1) {
      out.add(m);
      if (m === to) break;
    }
  }
  return [...out].sort((a, b) => a - b);
}

type Entry = { en: string; fr: string; kind: ProduceKind; match: string[]; eu: string; na: string };

// `match` are lowercase, accent-free words found in product names (singular; plural s/x is handled).
const ENTRIES: Entry[] = [
  // Vegetables
  { en: 'Asparagus', fr: 'Asperge', kind: 'vegetable', match: ['asperge', 'asparagus'], eu: '4-6', na: '4-6' },
  { en: 'Artichoke', fr: 'Artichaut', kind: 'vegetable', match: ['artichaut', 'artichoke'], eu: '5-10', na: '3-5' },
  { en: 'Aubergine / eggplant', fr: 'Aubergine', kind: 'vegetable', match: ['aubergine', 'eggplant'], eu: '6-9', na: '7-9' },
  { en: 'Beetroot', fr: 'Betterave', kind: 'vegetable', match: ['betterave', 'beetroot', 'beet'], eu: '6-12', na: '6-10' },
  { en: 'Broccoli', fr: 'Brocoli', kind: 'vegetable', match: ['brocoli', 'broccoli'], eu: '6-11', na: '9-11' },
  {
    en: 'Brussels sprouts',
    fr: 'Chou de Bruxelles',
    kind: 'vegetable',
    match: ['chou de bruxelles', 'brussels sprout'],
    eu: '10-2',
    na: '10-12',
  },
  { en: 'Cabbage', fr: 'Chou', kind: 'vegetable', match: ['chou', 'cabbage'], eu: '10-3', na: '6-10' },
  { en: 'Carrot', fr: 'Carotte', kind: 'vegetable', match: ['carotte', 'carrot'], eu: '5-11', na: '6-11' },
  { en: 'Cauliflower', fr: 'Chou-fleur', kind: 'vegetable', match: ['chou fleur', 'cauliflower'], eu: '9-12', na: '9-11' },
  { en: 'Celeriac', fr: 'Céleri-rave', kind: 'vegetable', match: ['celeri rave', 'celeriac'], eu: '10-3', na: '10-3' },
  { en: 'Chard', fr: 'Blette', kind: 'vegetable', match: ['blette', 'chard'], eu: '6-11', na: '6-10' },
  { en: 'Corn', fr: 'Maïs', kind: 'vegetable', match: ['mais', 'corn', 'sweetcorn'], eu: '7-9', na: '7-9' },
  { en: 'Cucumber', fr: 'Concombre', kind: 'vegetable', match: ['concombre', 'cucumber'], eu: '5-9', na: '6-9' },
  { en: 'Endive / chicory', fr: 'Endive', kind: 'vegetable', match: ['endive', 'chicory'], eu: '11-3', na: '11-3' },
  { en: 'Fennel', fr: 'Fenouil', kind: 'vegetable', match: ['fenouil', 'fennel'], eu: '6-10', na: '9-11' },
  { en: 'Broad beans', fr: 'Fève', kind: 'vegetable', match: ['feve', 'broad bean', 'fava'], eu: '5-7', na: '5-7' },
  { en: 'Green beans', fr: 'Haricot vert', kind: 'vegetable', match: ['haricot vert', 'green bean'], eu: '6-9', na: '7-9' },
  {
    en: 'Jerusalem artichoke',
    fr: 'Topinambour',
    kind: 'vegetable',
    match: ['topinambour', 'jerusalem artichoke'],
    eu: '10-3',
    na: '10-3',
  },
  { en: 'Kale', fr: 'Chou kale', kind: 'vegetable', match: ['kale', 'chou kale', 'chou frise'], eu: '10-3', na: '10-3' },
  { en: 'Lamb’s lettuce', fr: 'Mâche', kind: 'vegetable', match: ['mache', 'lamb s lettuce', 'corn salad'], eu: '10-3', na: '10-3' },
  { en: 'Leek', fr: 'Poireau', kind: 'vegetable', match: ['poireau', 'leek'], eu: '9-4', na: '9-11' },
  {
    en: 'Lettuce',
    fr: 'Salade / laitue',
    kind: 'vegetable',
    match: ['salade', 'laitue', 'lettuce', 'batavia', 'romaine'],
    eu: '4-10',
    na: '5-10',
  },
  { en: 'Parsnip', fr: 'Panais', kind: 'vegetable', match: ['panais', 'parsnip'], eu: '10-3', na: '10-3' },
  { en: 'Peas', fr: 'Petit pois', kind: 'vegetable', match: ['petit pois', 'pea'], eu: '5-7', na: '5-7' },
  { en: 'Bell pepper', fr: 'Poivron', kind: 'vegetable', match: ['poivron', 'bell pepper'], eu: '6-9', na: '7-10' },
  { en: 'Potato', fr: 'Pomme de terre', kind: 'vegetable', match: ['pomme de terre', 'patate', 'potato'], eu: '5-10', na: '7-10' },
  {
    en: 'Pumpkin / squash',
    fr: 'Potiron / courge',
    kind: 'vegetable',
    match: ['potiron', 'citrouille', 'courge', 'butternut', 'potimarron', 'pumpkin', 'squash'],
    eu: '9-12',
    na: '9-12',
  },
  { en: 'Radish', fr: 'Radis', kind: 'vegetable', match: ['radis', 'radish'], eu: '4-9', na: '4-6,9-10' },
  { en: 'Rhubarb', fr: 'Rhubarbe', kind: 'vegetable', match: ['rhubarbe', 'rhubarb'], eu: '4-6', na: '4-6' },
  { en: 'Spinach', fr: 'Épinard', kind: 'vegetable', match: ['epinard', 'spinach'], eu: '3-5,9-11', na: '4-6,9-10' },
  { en: 'Sweet potato', fr: 'Patate douce', kind: 'vegetable', match: ['patate douce', 'sweet potato'], eu: '10-2', na: '9-12' },
  { en: 'Tomato', fr: 'Tomate', kind: 'vegetable', match: ['tomate', 'tomato'], eu: '6-9', na: '7-9' },
  { en: 'Turnip', fr: 'Navet', kind: 'vegetable', match: ['navet', 'turnip'], eu: '10-4', na: '10-3' },
  { en: 'Zucchini / courgette', fr: 'Courgette', kind: 'vegetable', match: ['courgette', 'zucchini'], eu: '6-9', na: '6-9' },
  // Fruits
  { en: 'Apple', fr: 'Pomme', kind: 'fruit', match: ['pomme', 'apple'], eu: '9-3', na: '9-11' },
  { en: 'Apricot', fr: 'Abricot', kind: 'fruit', match: ['abricot', 'apricot'], eu: '6-8', na: '6-8' },
  { en: 'Blackberry', fr: 'Mûre', kind: 'fruit', match: ['mure', 'blackberry'], eu: '8-9', na: '7-9' },
  {
    en: 'Blackcurrant / redcurrant',
    fr: 'Cassis / groseille',
    kind: 'fruit',
    match: ['cassis', 'groseille', 'blackcurrant', 'redcurrant'],
    eu: '6-8',
    na: '6-8',
  },
  { en: 'Blueberry', fr: 'Myrtille', kind: 'fruit', match: ['myrtille', 'blueberry'], eu: '6-9', na: '6-8' },
  { en: 'Cherry', fr: 'Cerise', kind: 'fruit', match: ['cerise', 'cherry'], eu: '5-7', na: '6-7' },
  { en: 'Chestnut', fr: 'Châtaigne', kind: 'fruit', match: ['chataigne', 'marron', 'chestnut'], eu: '10-12', na: '10-12' },
  {
    en: 'Clementine / mandarin',
    fr: 'Clémentine / mandarine',
    kind: 'fruit',
    match: ['clementine', 'mandarine', 'mandarin', 'tangerine'],
    eu: '11-2',
    na: '11-2',
  },
  { en: 'Cranberry', fr: 'Canneberge', kind: 'fruit', match: ['canneberge', 'cranberry'], eu: '10-12', na: '10-12' },
  { en: 'Fig', fr: 'Figue', kind: 'fruit', match: ['figue', 'fig'], eu: '8-10', na: '8-10' },
  { en: 'Grape', fr: 'Raisin', kind: 'fruit', match: ['raisin', 'grape'], eu: '8-10', na: '8-10' },
  { en: 'Grapefruit', fr: 'Pamplemousse', kind: 'fruit', match: ['pamplemousse', 'grapefruit'], eu: '11-4', na: '11-4' },
  { en: 'Hazelnut', fr: 'Noisette', kind: 'fruit', match: ['noisette', 'hazelnut'], eu: '9-11', na: '9-11' },
  { en: 'Kiwi', fr: 'Kiwi', kind: 'fruit', match: ['kiwi'], eu: '11-4', na: '10-4' },
  { en: 'Lemon', fr: 'Citron', kind: 'fruit', match: ['citron', 'lemon'], eu: '11-4', na: '11-4' },
  { en: 'Melon', fr: 'Melon', kind: 'fruit', match: ['melon', 'cantaloupe'], eu: '6-9', na: '7-9' },
  { en: 'Nectarine / peach', fr: 'Pêche / nectarine', kind: 'fruit', match: ['peche', 'nectarine', 'peach'], eu: '6-9', na: '6-9' },
  { en: 'Orange', fr: 'Orange', kind: 'fruit', match: ['orange'], eu: '12-4', na: '11-4' },
  { en: 'Pear', fr: 'Poire', kind: 'fruit', match: ['poire', 'pear'], eu: '8-2', na: '8-11' },
  { en: 'Plum', fr: 'Prune / mirabelle', kind: 'fruit', match: ['prune', 'mirabelle', 'plum'], eu: '7-9', na: '7-9' },
  { en: 'Quince', fr: 'Coing', kind: 'fruit', match: ['coing', 'quince'], eu: '10-12', na: '10-12' },
  { en: 'Raspberry', fr: 'Framboise', kind: 'fruit', match: ['framboise', 'raspberry'], eu: '6-9', na: '6-9' },
  { en: 'Strawberry', fr: 'Fraise', kind: 'fruit', match: ['fraise', 'strawberry'], eu: '4-7', na: '5-7' },
  { en: 'Walnut', fr: 'Noix', kind: 'fruit', match: ['noix', 'walnut'], eu: '9-12', na: '9-12' },
  { en: 'Watermelon', fr: 'Pastèque', kind: 'fruit', match: ['pasteque', 'watermelon'], eu: '7-9', na: '7-9' },
  // Herbs
  { en: 'Basil', fr: 'Basilic', kind: 'herb', match: ['basilic', 'basil'], eu: '6-9', na: '6-9' },
  { en: 'Chives', fr: 'Ciboulette', kind: 'herb', match: ['ciboulette', 'chive'], eu: '4-9', na: '5-9' },
  { en: 'Coriander / cilantro', fr: 'Coriandre', kind: 'herb', match: ['coriandre', 'cilantro', 'coriander'], eu: '5-9', na: '5-9' },
  { en: 'Mint', fr: 'Menthe', kind: 'herb', match: ['menthe', 'mint'], eu: '5-9', na: '5-9' },
  { en: 'Parsley', fr: 'Persil', kind: 'herb', match: ['persil', 'parsley'], eu: '4-10', na: '5-10' },
];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Longest keyword first so "patate douce" wins over "patate", "chou de bruxelles" over "chou".
const matchers = ENTRIES.flatMap((entry, index) =>
  entry.match.map((word) => ({ index, word, re: new RegExp(`(^| )${word}(s|x)?( |$)`) })),
).sort((a, b) => b.word.length - a.word.length);

const shift = (list: number[], hemisphere: Hemisphere) =>
  hemisphere === 'south' ? list.map((m) => ((m + 5) % 12) + 1).sort((a, b) => a - b) : list;

export type Produce = {
  id: string;
  en: string;
  fr: string;
  kind: ProduceKind;
  /** Months (1-12) the produce is in season where the household lives. */
  months: number[];
};

export type Place = { country: Country; hemisphere: Hemisphere };

const produce = (entry: Entry, { country, hemisphere }: Place): Produce => ({
  id: entry.match[0].replace(/ /g, '-'),
  en: entry.en,
  fr: entry.fr,
  kind: entry.kind,
  months: shift(months(entry[CALENDAR_OF[country]]), hemisphere),
});

/** The produce a product name refers to (French or English), or null when it is not a fruit, vegetable or herb we know. */
export function produceFor(name: string, place: Place): Produce | null {
  const n = normalize(name);
  for (const { index, re } of matchers) if (re.test(n)) return produce(ENTRIES[index], place);
  return null;
}

export const isInSeason = (p: Produce, month: number) => p.months.includes(month);

const nextMonth = (m: number) => (m % 12) + 1;

/** Everything in season in `month`, with what is at its last month and what starts next month. */
export function seasonalProduce(place: Place, month: number, kind?: ProduceKind) {
  const all = ENTRIES.map((e) => produce(e, place)).filter((p) => !kind || p.kind === kind);
  const inSeason = all.filter((p) => isInSeason(p, month));
  return {
    inSeason,
    lastMonth: inSeason.filter((p) => !isInSeason(p, nextMonth(month))),
    startingNextMonth: all.filter((p) => !isInSeason(p, month) && isInSeason(p, nextMonth(month))),
  };
}
