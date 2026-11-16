import { z } from 'zod';
import { today } from '../../domain/dates.js';
import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerStockTools({ stock, tool, ro, rw, del }: ToolContext) {
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
    'Add a quantity of a product to the stock (after shopping, or to record what is at home). Bought in packs ("2 x 500 g", "3 cartons of 200 ml")? Send packCount + packSize + unit instead of a total so both are kept. An already opened jar: opened=true with the quantity left. Use approximate=true (no quantity) for "plenty of it".',
    s.stockAdd.shape,
    rw,
    (a) => stock.add(a),
  );
  tool(
    'update_stock_item',
    'Correct a stock line: quantity (or packCount for sealed packs), location or expiry date. Use the id from list_stock. A quantity of 0 deletes the line: the answer says { removed: true }.',
    s.stockUpdate.shape,
    rw,
    (a) => stock.update(a) ?? { removed: true, id: a.id },
  );
  tool(
    'open_stock_item',
    'Open one pack of a stock line (a jar, a carton, a can). It becomes its own line with an opening date, what is left, and an expiry from the product opened shelf life (set it with update_product openedShelfLifeDays or the shelfLifeDays argument). Opened packs are used first and listed in get_stock_alerts.',
    s.stockOpen.shape,
    rw,
    (a) => stock.open(a),
  );
  tool(
    'unopen_stock_item',
    'Undo a mistaken open_stock_item: a pack that is still full becomes sealed again. Fails if part of it was already used.',
    s.idParam.shape,
    rw,
    (a) => stock.unopen(a.id),
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
    `Products below their minimum threshold, and items that are expired or expire soon. Today is ${today()} at server start; dates are YYYY-MM-DD.`,
    { expiringWithinDays: z.number().int().nonnegative().default(3) },
    ro,
    (a) => ({ today: today(), ...stock.alerts(a.expiringWithinDays) }),
  );
}
