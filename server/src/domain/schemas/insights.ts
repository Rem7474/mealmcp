import { z } from 'zod';
import { id, isoDate, num } from './shared.js';

export const seasonList = z.object({
  month: num().int().min(1).max(12).optional().describe('Month number 1-12; defaults to the current month'),
  kind: z.enum(['fruit', 'vegetable', 'herb']).optional().describe('Only fruits, vegetables or herbs'),
});

export const mealHistory = z.object({
  days: num().int().positive().max(365).default(60).describe('How many days back to look'),
  recipeId: id.optional().describe('Only the times this recipe was made'),
});

export const wasteSummary = z.object({
  from: isoDate.optional().describe('First day, inclusive; defaults to 30 days ago'),
  to: isoDate.optional().describe('Last day, inclusive; defaults to today'),
});

export const mealContext = z.object({
  days: num().int().positive().max(60).default(14).describe('How many days ahead to look for open slots and planned meals'),
  historyDays: num().int().positive().max(365).default(30).describe('How many days back to look for recent meals'),
});
