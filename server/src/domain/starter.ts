import type { Category } from './categories.js';

/**
 * What a new household can start from: everyday products to tick by aisle and a few simple recipes, in English and
 * French. Recipes name their ingredients by product key, so a recipe and the stock it asks for always use the same
 * names. Nothing here is a copy of anyone's recipe collection: these are plain home dishes written for this project.
 */
export const STARTER_LANGS = ['en', 'fr'] as const;
export type StarterLang = (typeof STARTER_LANGS)[number];
type Text = Record<StarterLang, string>;

export interface StarterProduct {
  name: Text;
  aisle: Category;
  /** g, ml or piece: the unit stock and recipes use for it. */
  unit: 'g' | 'ml' | 'piece';
  where: 'pantry' | 'fridge' | 'freezer';
  /** Always at home (oil, salt): flagged as such instead of counted in stock. */
  staple?: boolean;
}

const PRODUCTS = {
  onion: { name: { en: 'Onion', fr: 'Oignon' }, aisle: 'produce', unit: 'piece', where: 'pantry' },
  garlic: { name: { en: 'Garlic clove', fr: 'Gousse d’ail' }, aisle: 'produce', unit: 'piece', where: 'pantry' },
  potato: { name: { en: 'Potato', fr: 'Pomme de terre' }, aisle: 'produce', unit: 'g', where: 'pantry' },
  carrot: { name: { en: 'Carrot', fr: 'Carotte' }, aisle: 'produce', unit: 'piece', where: 'fridge' },
  tomato: { name: { en: 'Tomato', fr: 'Tomate' }, aisle: 'produce', unit: 'piece', where: 'fridge' },
  zucchini: { name: { en: 'Zucchini', fr: 'Courgette' }, aisle: 'produce', unit: 'piece', where: 'fridge' },
  apple: { name: { en: 'Apple', fr: 'Pomme' }, aisle: 'produce', unit: 'piece', where: 'fridge' },
  milk: { name: { en: 'Milk', fr: 'Lait' }, aisle: 'dairy', unit: 'ml', where: 'fridge' },
  egg: { name: { en: 'Egg', fr: 'Œuf' }, aisle: 'dairy', unit: 'piece', where: 'fridge' },
  butter: { name: { en: 'Butter', fr: 'Beurre' }, aisle: 'dairy', unit: 'g', where: 'fridge' },
  cheese: { name: { en: 'Grated cheese', fr: 'Fromage râpé' }, aisle: 'dairy', unit: 'g', where: 'fridge' },
  cream: { name: { en: 'Cream', fr: 'Crème fraîche' }, aisle: 'dairy', unit: 'ml', where: 'fridge' },
  chicken: { name: { en: 'Chicken breast', fr: 'Blanc de poulet' }, aisle: 'meat_fish', unit: 'g', where: 'fridge' },
  beef: { name: { en: 'Ground beef', fr: 'Viande hachée' }, aisle: 'meat_fish', unit: 'g', where: 'fridge' },
  ham: { name: { en: 'Ham', fr: 'Jambon' }, aisle: 'meat_fish', unit: 'piece', where: 'fridge' },
  bread: { name: { en: 'Bread', fr: 'Pain' }, aisle: 'bakery', unit: 'g', where: 'pantry' },
  rice: { name: { en: 'Rice', fr: 'Riz' }, aisle: 'pantry', unit: 'g', where: 'pantry' },
  pasta: { name: { en: 'Pasta', fr: 'Pâtes' }, aisle: 'pantry', unit: 'g', where: 'pantry' },
  flour: { name: { en: 'Flour', fr: 'Farine' }, aisle: 'pantry', unit: 'g', where: 'pantry' },
  sugar: { name: { en: 'Sugar', fr: 'Sucre' }, aisle: 'pantry', unit: 'g', where: 'pantry' },
  lentils: { name: { en: 'Lentils', fr: 'Lentilles' }, aisle: 'pantry', unit: 'g', where: 'pantry' },
  tuna: { name: { en: 'Canned tuna', fr: 'Thon en boîte' }, aisle: 'pantry', unit: 'g', where: 'pantry' },
  tomatoes: { name: { en: 'Canned tomatoes', fr: 'Tomates concassées' }, aisle: 'pantry', unit: 'g', where: 'pantry' },
  peas: { name: { en: 'Frozen peas', fr: 'Petits pois surgelés' }, aisle: 'frozen', unit: 'g', where: 'freezer' },
  oil: { name: { en: 'Olive oil', fr: 'Huile d’olive' }, aisle: 'pantry', unit: 'ml', where: 'pantry', staple: true },
  salt: { name: { en: 'Salt', fr: 'Sel' }, aisle: 'pantry', unit: 'g', where: 'pantry', staple: true },
  pepper: { name: { en: 'Pepper', fr: 'Poivre' }, aisle: 'pantry', unit: 'g', where: 'pantry', staple: true },
  thyme: { name: { en: 'Thyme', fr: 'Thym' }, aisle: 'pantry', unit: 'g', where: 'pantry', staple: true },
} as const satisfies Record<string, StarterProduct>;
export type StarterProductKey = keyof typeof PRODUCTS;
/** Typed as the wide shape so the optional `staple` can be read on any product. */
export const STARTER_PRODUCTS: Record<StarterProductKey, StarterProduct> = PRODUCTS;

const TAGS = {
  quick: { en: 'quick', fr: 'rapide' },
  vegetarian: { en: 'vegetarian', fr: 'végétarien' },
  oven: { en: 'oven', fr: 'four' },
  dessert: { en: 'dessert', fr: 'dessert' },
  budget: { en: 'budget', fr: 'économique' },
  cold: { en: 'cold', fr: 'froid' },
} as const satisfies Record<string, Text>;
type TagKey = keyof typeof TAGS;

/** A quantity in the product's own unit; `null` is "to taste" (a pinch, not counted). */
type Ingredient = [product: StarterProductKey, quantity: number | null];

export interface StarterRecipe {
  key: string;
  name: Text;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  tags: TagKey[];
  ingredients: Ingredient[];
  /** One text per step, per language, the same number of steps in each. */
  steps: Record<StarterLang, string[]>;
}

export const STARTER_RECIPES: StarterRecipe[] = [
  {
    key: 'tomato-pasta',
    name: { en: 'Tomato pasta', fr: 'Pâtes à la tomate' },
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    tags: ['quick', 'vegetarian', 'budget'],
    ingredients: [
      ['pasta', 200],
      ['tomatoes', 400],
      ['onion', 1],
      ['garlic', 1],
      ['oil', 15],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Cook the pasta in salted boiling water.',
        'Soften the chopped onion and garlic in the oil, then add the tomatoes, salt and pepper.',
        'Simmer the sauce for 10 minutes, then toss with the drained pasta.',
      ],
      fr: [
        'Faites cuire les pâtes dans de l’eau bouillante salée.',
        'Faites revenir l’oignon et l’ail hachés dans l’huile, puis ajoutez les tomates, le sel et le poivre.',
        'Laissez mijoter la sauce 10 minutes, puis mélangez avec les pâtes égouttées.',
      ],
    },
  },
  {
    key: 'ham-cream-pasta',
    name: { en: 'Creamy ham pasta', fr: 'Pâtes crème et jambon' },
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 12,
    tags: ['quick'],
    ingredients: [
      ['pasta', 200],
      ['ham', 3],
      ['cream', 150],
      ['cheese', 40],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Cook the pasta in salted boiling water.',
        'Warm the cream with the diced ham and pepper.',
        'Toss with the pasta and sprinkle with the cheese.',
      ],
      fr: [
        'Faites cuire les pâtes dans de l’eau bouillante salée.',
        'Réchauffez la crème avec le jambon en dés et le poivre.',
        'Mélangez avec les pâtes et parsemez de fromage.',
      ],
    },
  },
  {
    key: 'bolognese',
    name: { en: 'Spaghetti bolognese', fr: 'Spaghetti bolognaise' },
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 30,
    tags: ['budget'],
    ingredients: [
      ['pasta', 350],
      ['beef', 400],
      ['tomatoes', 400],
      ['onion', 1],
      ['carrot', 1],
      ['garlic', 2],
      ['oil', 15],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Brown the chopped onion, carrot and garlic in the oil, then add the beef and cook until browned.',
        'Add the tomatoes, salt and pepper and simmer for 25 minutes.',
        'Cook the pasta in salted boiling water and serve with the sauce.',
      ],
      fr: [
        'Faites revenir l’oignon, la carotte et l’ail hachés dans l’huile, puis ajoutez la viande et faites-la dorer.',
        'Ajoutez les tomates, le sel et le poivre et laissez mijoter 25 minutes.',
        'Faites cuire les pâtes dans de l’eau bouillante salée et servez avec la sauce.',
      ],
    },
  },
  {
    key: 'fried-rice',
    name: { en: 'Egg fried rice', fr: 'Riz sauté aux œufs' },
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
    tags: ['quick', 'vegetarian'],
    ingredients: [
      ['rice', 200],
      ['egg', 3],
      ['peas', 150],
      ['onion', 1],
      ['oil', 15],
      ['salt', null],
    ],
    steps: {
      en: [
        'Cook the rice, drain it and let it cool a little.',
        'Fry the chopped onion and the peas in the oil for 5 minutes.',
        'Add the rice, then push it aside and scramble the eggs in the pan. Mix everything and season.',
      ],
      fr: [
        'Faites cuire le riz, égouttez-le et laissez-le tiédir.',
        'Faites revenir l’oignon haché et les petits pois dans l’huile pendant 5 minutes.',
        'Ajoutez le riz, poussez-le sur le côté et brouillez les œufs dans la poêle. Mélangez le tout et assaisonnez.',
      ],
    },
  },
  {
    key: 'cheese-omelette',
    name: { en: 'Cheese omelette', fr: 'Omelette au fromage' },
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 5,
    tags: ['quick', 'vegetarian'],
    ingredients: [
      ['egg', 4],
      ['cheese', 40],
      ['butter', 10],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Beat the eggs with salt and pepper.',
        'Melt the butter in a pan and pour in the eggs.',
        'When almost set, add the cheese, fold and serve.',
      ],
      fr: [
        'Battez les œufs avec le sel et le poivre.',
        'Faites fondre le beurre dans une poêle et versez les œufs.',
        'Quand l’omelette est presque prise, ajoutez le fromage, repliez-la et servez.',
      ],
    },
  },
  {
    key: 'potato-gratin',
    name: { en: 'Potato gratin', fr: 'Gratin de pommes de terre' },
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 50,
    tags: ['vegetarian', 'oven'],
    ingredients: [
      ['potato', 1000],
      ['cream', 200],
      ['milk', 150],
      ['cheese', 80],
      ['garlic', 1],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Peel and slice the potatoes thinly. Rub a baking dish with the garlic.',
        'Layer the potatoes in the dish with salt and pepper, then pour over the cream mixed with the milk.',
        'Sprinkle with the cheese and bake for 50 minutes at 180°C.',
      ],
      fr: [
        'Épluchez et coupez les pommes de terre en fines tranches. Frottez un plat avec l’ail.',
        'Disposez les pommes de terre dans le plat avec le sel et le poivre, puis versez la crème mélangée au lait.',
        'Parsemez de fromage et enfournez 50 minutes à 180 °C.',
      ],
    },
  },
  {
    key: 'lentil-soup',
    name: { en: 'Lentil soup', fr: 'Soupe de lentilles' },
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ['vegetarian', 'budget'],
    ingredients: [
      ['lentils', 250],
      ['carrot', 2],
      ['onion', 1],
      ['potato', 200],
      ['oil', 15],
      ['salt', null],
      ['thyme', null],
    ],
    steps: {
      en: [
        'Soften the chopped onion and carrots in the oil.',
        'Add the lentils, the diced potato, thyme, salt and 1.2 litres of water. Simmer for 30 minutes.',
        'Blend part of the soup for a creamier texture if you like.',
      ],
      fr: [
        'Faites revenir l’oignon et les carottes coupés dans l’huile.',
        'Ajoutez les lentilles, la pomme de terre en dés, le thym, le sel et 1,2 litre d’eau. Laissez mijoter 30 minutes.',
        'Mixez une partie de la soupe pour la rendre plus onctueuse si vous le souhaitez.',
      ],
    },
  },
  {
    key: 'chicken-rice',
    name: { en: 'Chicken and rice', fr: 'Poulet au riz' },
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 25,
    tags: ['budget'],
    ingredients: [
      ['chicken', 300],
      ['rice', 200],
      ['onion', 1],
      ['carrot', 2],
      ['oil', 15],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Brown the diced chicken in the oil, then add the chopped onion and carrots.',
        'Add the rice, salt, pepper and twice its volume of water.',
        'Cover and cook gently for 20 minutes until the rice is tender.',
      ],
      fr: [
        'Faites dorer le poulet en dés dans l’huile, puis ajoutez l’oignon et les carottes coupés.',
        'Ajoutez le riz, le sel, le poivre et deux fois son volume d’eau.',
        'Couvrez et laissez cuire doucement 20 minutes, jusqu’à ce que le riz soit tendre.',
      ],
    },
  },
  {
    key: 'roast-chicken-potatoes',
    name: { en: 'Roast chicken and potatoes', fr: 'Poulet rôti et pommes de terre' },
    servings: 2,
    prepMinutes: 15,
    cookMinutes: 40,
    tags: ['oven'],
    ingredients: [
      ['chicken', 400],
      ['potato', 600],
      ['garlic', 2],
      ['oil', 30],
      ['thyme', null],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Heat the oven to 200°C. Cut the potatoes into chunks.',
        'Mix the chicken and potatoes with the oil, garlic, thyme, salt and pepper in a baking dish.',
        'Roast for 40 minutes, turning once, until golden.',
      ],
      fr: [
        'Préchauffez le four à 200 °C. Coupez les pommes de terre en morceaux.',
        'Mélangez le poulet et les pommes de terre avec l’huile, l’ail, le thym, le sel et le poivre dans un plat.',
        'Faites rôtir 40 minutes en retournant une fois, jusqu’à ce que ce soit doré.',
      ],
    },
  },
  {
    key: 'shepherds-pie',
    name: { en: 'Shepherd’s pie', fr: 'Hachis parmentier' },
    servings: 4,
    prepMinutes: 25,
    cookMinutes: 30,
    tags: ['oven', 'budget'],
    ingredients: [
      ['beef', 400],
      ['potato', 700],
      ['onion', 1],
      ['milk', 100],
      ['butter', 30],
      ['cheese', 40],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Boil the potatoes, then mash them with the milk, butter, salt and pepper.',
        'Brown the chopped onion and the beef in a pan, season, and spread in a baking dish.',
        'Cover with the mash, sprinkle with cheese and bake for 25 minutes at 200°C.',
      ],
      fr: [
        'Faites cuire les pommes de terre, puis écrasez-les avec le lait, le beurre, le sel et le poivre.',
        'Faites dorer l’oignon haché et la viande dans une poêle, assaisonnez et étalez dans un plat.',
        'Recouvrez de purée, parsemez de fromage et enfournez 25 minutes à 200 °C.',
      ],
    },
  },
  {
    key: 'zucchini-gratin',
    name: { en: 'Zucchini and tomato bake', fr: 'Gratin de courgettes et tomates' },
    servings: 3,
    prepMinutes: 15,
    cookMinutes: 35,
    tags: ['vegetarian', 'oven'],
    ingredients: [
      ['zucchini', 3],
      ['tomato', 2],
      ['onion', 1],
      ['cream', 100],
      ['cheese', 60],
      ['oil', 15],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Slice the zucchini and tomatoes and soften the chopped onion in the oil.',
        'Layer everything in a baking dish, season, and pour the cream over.',
        'Sprinkle with the cheese and bake for 35 minutes at 190°C.',
      ],
      fr: [
        'Coupez les courgettes et les tomates en rondelles et faites revenir l’oignon haché dans l’huile.',
        'Disposez le tout dans un plat, assaisonnez et versez la crème.',
        'Parsemez de fromage et enfournez 35 minutes à 190 °C.',
      ],
    },
  },
  {
    key: 'vegetable-soup',
    name: { en: 'Vegetable soup', fr: 'Soupe de légumes' },
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 30,
    tags: ['vegetarian', 'budget'],
    ingredients: [
      ['potato', 400],
      ['carrot', 3],
      ['zucchini', 1],
      ['onion', 1],
      ['oil', 15],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Peel and dice all the vegetables.',
        'Soften the onion in the oil, add the other vegetables and cover with water.',
        'Simmer for 30 minutes, season, and blend until smooth.',
      ],
      fr: [
        'Épluchez et coupez tous les légumes en dés.',
        'Faites revenir l’oignon dans l’huile, ajoutez les autres légumes et couvrez d’eau.',
        'Laissez mijoter 30 minutes, assaisonnez et mixez jusqu’à obtenir une soupe lisse.',
      ],
    },
  },
  {
    key: 'tuna-pasta-salad',
    name: { en: 'Tuna pasta salad', fr: 'Salade de pâtes au thon' },
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 10,
    tags: ['quick', 'cold'],
    ingredients: [
      ['pasta', 200],
      ['tuna', 160],
      ['tomato', 2],
      ['oil', 15],
      ['salt', null],
      ['pepper', null],
    ],
    steps: {
      en: [
        'Cook the pasta, drain and let it cool.',
        'Dice the tomatoes and flake the tuna.',
        'Mix everything with the oil, salt and pepper.',
      ],
      fr: [
        'Faites cuire les pâtes, égouttez-les et laissez-les refroidir.',
        'Coupez les tomates en dés et émiettez le thon.',
        'Mélangez le tout avec l’huile, le sel et le poivre.',
      ],
    },
  },
  {
    key: 'pancakes',
    name: { en: 'Pancakes', fr: 'Crêpes' },
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ['vegetarian', 'dessert', 'budget'],
    ingredients: [
      ['flour', 250],
      ['egg', 3],
      ['milk', 500],
      ['butter', 30],
      ['sugar', 20],
    ],
    steps: {
      en: [
        'Whisk the flour, sugar and eggs, then add the milk little by little and the melted butter.',
        'Let the batter rest for 30 minutes if you can.',
        'Cook thin pancakes in a hot, lightly greased pan, about 1 minute on each side.',
      ],
      fr: [
        'Fouettez la farine, le sucre et les œufs, puis ajoutez le lait petit à petit et le beurre fondu.',
        'Laissez reposer la pâte 30 minutes si possible.',
        'Faites cuire de fines crêpes dans une poêle chaude légèrement huilée, environ 1 minute de chaque côté.',
      ],
    },
  },
  {
    key: 'french-toast',
    name: { en: 'French toast', fr: 'Pain perdu' },
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 10,
    tags: ['quick', 'vegetarian', 'dessert'],
    ingredients: [
      ['bread', 200],
      ['egg', 2],
      ['milk', 200],
      ['sugar', 20],
      ['butter', 20],
    ],
    steps: {
      en: [
        'Whisk the eggs with the milk and sugar.',
        'Soak the bread slices in the mixture.',
        'Fry them in the butter until golden on both sides.',
      ],
      fr: [
        'Fouettez les œufs avec le lait et le sucre.',
        'Trempez les tranches de pain dans le mélange.',
        'Faites-les dorer des deux côtés dans le beurre.',
      ],
    },
  },
  {
    key: 'apple-compote',
    name: { en: 'Apple compote', fr: 'Compote de pommes' },
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ['vegetarian', 'dessert', 'budget'],
    ingredients: [
      ['apple', 6],
      ['sugar', 30],
    ],
    steps: {
      en: [
        'Peel the apples and cut them into pieces.',
        'Cook them with the sugar and a few spoonfuls of water for 20 minutes.',
        'Mash with a fork and serve warm or cold.',
      ],
      fr: [
        'Épluchez les pommes et coupez-les en morceaux.',
        'Faites-les cuire avec le sucre et quelques cuillères d’eau pendant 20 minutes.',
        'Écrasez à la fourchette et servez tiède ou froid.',
      ],
    },
  },
];

/** Products shown by aisle, in the order of a shop, for the "what is at home" picker. */
export const STARTER_AISLES: Category[] = ['produce', 'dairy', 'meat_fish', 'bakery', 'pantry', 'frozen'];

export const starterName = (key: StarterProductKey, lang: StarterLang) => STARTER_PRODUCTS[key].name[lang];
export const starterTag = (key: TagKey, lang: StarterLang) => TAGS[key][lang];
