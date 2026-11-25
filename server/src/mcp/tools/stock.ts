import { z } from 'zod';
import { today } from '../../domain/dates.js';
import { ValidationError } from '../../domain/errors.js';
import * as c from '../../domain/schemas/catalog.js';
import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerStockTools({ stock, catalog, tool, ro, rw, del }: ToolContext) {
  // --- Stock ---------------------------------------------------------------
  tool(
    'list_stock',
    'List what is currently in stock, soonest expiry first. Optionally filter by location or by upcoming expiry.',
    s.stockList.shape,
    ro,
    (a) => stock.list(a),
  );
  tool(
    'add_stock',
    'Add a quantity of a product to the stock (after shopping, or to record what is at home). Bought in packs ("2 x 500 g", "3 cartons of 200 ml")? Send packCount + packSize + unit instead of a total so both are kept. An already opened jar: opened=true with the quantity left. Use approximate=true (no quantity) for "plenty of it". Send dateKind with expiresOn when the pack says which it is: use_by (to consume by, unsafe after) or best_before (DDM). A free-text note ("for Sunday") can be attached to the line. Bought with a barcode? Send barcode (and no quantity): a known code adds one pack of that product with its size; a new code is looked up in the catalogue (see search_catalog) and attached to the product it matches, or to the one named in name.',
    c.stockAddOrCode.shape,
    rw,
    (a) => {
      if (a.barcode) return catalog.addStock({ ...a, barcode: a.barcode });
      if (!a.name) throw new ValidationError('Give a product name, or a barcode');
      return stock.add({ ...a, name: a.name });
    },
  );
  tool(
    'update_stock_item',
    'Correct a stock line: quantity (or packCount for sealed packs), location, expiry date, dateKind (use_by or best_before), or the opening date of an opened pack (the expiry is then recomputed). Give the line id from list_stock, or the product name when it has a single line. A quantity of 0 deletes the line: the answer says { removed: true }. Several lines to change: update_stock_bulk.',
    s.stockUpdateByRef.shape,
    rw,
    ({ name, id, ...patch }) => {
      const line = stock.resolve({ id, name });
      return stock.update({ ...patch, id: line }) ?? { removed: true, id: line };
    },
  );
  tool(
    'update_stock_bulk',
    'Correct several stock lines in one call (all or nothing): each item is a line id or product name plus what to change, as in update_stock_item. Moving lines to the freezer freezes them, out of it thaws them. Use it to put away a whole freezer shelf or fix many dates at once.',
    s.stockUpdateMany.shape,
    rw,
    (a) => stock.updateMany(a.items),
  );
  tool(
    'open_stock_item',
    'Open one pack of a stock line (a jar, a carton, a can). It becomes its own line with an opening date, what is left, and an expiry from the product opened shelf life (set it with update_product openedShelfLifeDays or the shelfLifeDays argument). Opened packs are used first and listed in get_stock_alerts.',
    s.stockOpenByRef.shape,
    rw,
    ({ name, id, ...rest }) => stock.open({ ...rest, id: stock.resolve({ id, name }, (l) => !l.opened) }),
  );
  tool(
    'freeze_stock_item',
    'Put a stock line in the freezer, or take it out with action=thaw. Freezing: the freezing date replaces the printed date as the clock and the line keeps the product frozen shelf life (update_product frozenShelfLifeDays; a default per category otherwise); a line that was already thawed is refused unless refreeze=true; only part of a line (a pack split before freezing)? Give quantity: the line is split and only that part is frozen. Thawing: the line moves to the fridge, must be used within the product thawed shelf life (update_product thawedShelfLifeDays, 2 days by default for meat, fish and bread) and is flagged use-by. Moving a line in or out of the freezer with update_stock_item location does the same.',
    s.stockFreezeOrThawByRef.shape,
    rw,
    ({ name, id, action, ...rest }) =>
      action === 'thaw'
        ? stock.thaw(stock.resolve({ id, name }, (l) => l.frozen || l.location === 'freezer'))
        : stock.freeze({ ...rest, id: stock.resolve({ id, name }, (l) => !l.frozen) }),
  );
  tool(
    'unopen_stock_item',
    'Undo a mistaken open_stock_item: a pack that is still full becomes sealed again. Fails if part of it was already used.',
    s.stockLineRef.shape,
    rw,
    (a) => stock.unopen(stock.resolve(a, (l) => l.opened)),
  );
  tool(
    'consume_stock',
    'Take a quantity of a product out of stock (used or thrown away), soonest-expiring first. Reports what could not be covered.',
    s.stockConsume.shape,
    rw,
    (a) => stock.consume(a),
  );
  tool('remove_stock_item', 'Delete a stock line entirely. Use the id from list_stock.', s.idParam.shape, del, (a) => stock.remove(a.id));
  tool(
    'get_stock_alerts',
    `Products below their minimum threshold, items that expire soon, toDiscard (past a use-by date) and opened packs. Each item has an expiryState: ok, soon, check (past a best-before date: look and smell) or discard (past a use-by date). Today is ${today()} at server start; dates are YYYY-MM-DD.`,
    { expiringWithinDays: z.number().int().nonnegative().default(3) },
    ro,
    (a) => ({ today: today(), ...stock.alerts(a.expiringWithinDays) }),
  );
}
