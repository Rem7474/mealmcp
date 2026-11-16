/** A card never carries text: the client words it, in the user's language, from these facts. */
export type ActionCard =
  | { id: 'getting-started'; target: string; steps: { id: 'stock' | 'recipes' | 'plan'; done: boolean }[] }
  | {
      id: 'cook-today';
      target: string;
      meals: { id: number; name: string; mealType: string; recipeId: number | null; canCook: boolean | null }[];
    }
  | {
      id: 'expiring';
      target: string;
      items: { name: string; expiresOn: string | null; expiryState: string }[];
      total: number;
      recipe: { id: number; name: string; canCook: boolean } | null;
    }
  | { id: 'discard'; target: string; items: { name: string }[]; total: number }
  | { id: 'shopping-put-away'; target: string; count: number }
  | { id: 'open-slots'; target: string; count: number; first: { date: string; mealType: string } }
  | { id: 'shopping-generate'; target: string; meals: number }
  | { id: 'shopping-open'; target: string; count: number }
  | { id: 'low-stock'; target: string; items: { name: string }[]; total: number };
