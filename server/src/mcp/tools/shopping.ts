import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerShoppingTools({ shopping, purchase, tool, ro, rw, del }: ToolContext) {
  // --- Shopping list -------------------------------------------------------
  tool('list_shopping_list', 'List the shopping list (unchecked items first).', {}, ro, () => shopping.list());
  tool(
    'add_shopping_item',
    'Add an item to the shopping list; merges with the same unchecked item if present.',
    s.shoppingAdd.shape,
    rw,
    (a) => shopping.add(a),
  );
  tool(
    'check_shopping_item',
    'Check (bought) or uncheck a shopping list item, optionally updating its price or quantity.',
    s.shoppingCheck.shape,
    rw,
    (a) => shopping.setChecked(a.id, a.checked, a.price, a.quantity),
  );
  tool('remove_shopping_item', 'Remove an item from the shopping list.', s.idParam.shape, del, (a) => shopping.remove(a.id));
  tool(
    'generate_shopping_list',
    'Rebuild the auto-generated part of the shopping list from the meal plan between two dates: ingredients needed by uncooked planned recipes minus current stock, plus restocking of products under their minimum. Manually added items are kept.',
    s.shoppingGenerate.shape,
    rw,
    (a) => shopping.generateFromPlan(a),
  );
  tool(
    'complete_shopping',
    'Shopping done: move every checked item into stock and remove it from the list. If prices were entered on the lines (or a total is given) the purchase is also recorded as an expense.',
    s.shoppingComplete.shape,
    rw,
    (a) => shopping.completePurchase(a.location, { store: a.store, total: a.total, date: a.date }),
  );
  tool(
    'parse_purchase_text',
    'Parse free-text shopping notes into structured lines matched against household products and the shopping list (read-only).',
    s.purchaseText.shape,
    ro,
    (a) => purchase.parse(a.text),
  );
  tool(
    'apply_purchase',
    'Put bought items into stock, remove matching lines from the shopping list and record the expense in one transaction.',
    s.purchaseApply.shape,
    rw,
    (a) => purchase.apply(a),
  );
}
