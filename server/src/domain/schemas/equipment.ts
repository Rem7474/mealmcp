import { z } from 'zod';
import { id } from './shared.js';

export const EQUIPMENT_KINDS = ['appliance', 'utensil'] as const;
const equipmentName = z.string().trim().min(1).max(60);
export const equipmentList = z
  .array(equipmentName)
  .max(50)
  .describe('Appliances/utensils the recipe needs, e.g. "air fryer", "mandoline". Appliances named in steps are added automatically');

export const equipmentAdd = z.object({
  name: equipmentName,
  kind: z.enum(EQUIPMENT_KINDS).default('utensil'),
  owned: z.boolean().default(true).describe('False for something a recipe needs but the household does not have'),
});
export const equipmentUpdate = z.object({
  id,
  name: equipmentName.optional(),
  kind: z.enum(EQUIPMENT_KINDS).optional(),
  owned: z.boolean().optional(),
});
