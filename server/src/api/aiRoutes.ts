import { Router } from 'express';
import type { LlmClient } from '../ai/client.js';
import { sessionOnly } from '../auth/http.js';
import { createRateLimiter } from '../auth/rateLimit.js';
import type { Db } from '../db/index.js';
import { ForbiddenError } from '../domain/errors.js';
import { createAiService } from '../services/ai.js';
import { createServices } from '../services/index.js';

/**
 * The optional local AI server: what it offers and which models this household uses. These routes are for a person
 * in a browser (`sessionOnly`): an MCP client is itself a model and has no use for them. Only the owner picks the model.
 */
export function createAiRoutes(db: Db, llm: LlmClient) {
  const r = Router();
  const ai = (household: number) => createAiService(llm, createServices(db, household).settings, household);
  // Listing models and testing hit the model server: keep one household from hammering it.
  const limit = createRateLimiter(20, 60_000, 'Too many requests to the AI server, try again in a minute');

  r.get('/ai/status', sessionOnly, async (req, res) => void res.json(await ai(req.user!.householdId).status()));

  r.get('/ai/models', sessionOnly, async (req, res) => {
    limit.hit(`models:${req.user!.householdId}`);
    res.json(
      await ai(req.user!.householdId)
        .models()
        .catch(() => []),
    );
  });

  r.put('/ai/model', sessionOnly, async (req, res) => {
    if (req.user!.role !== 'owner') throw new ForbiddenError('Only the household owner can choose the AI model');
    limit.hit(`models:${req.user!.householdId}`);
    res.json(await ai(req.user!.householdId).choose(req.body));
  });

  r.post('/ai/test', sessionOnly, async (req, res) => {
    limit.hit(`test:${req.user!.householdId}`);
    res.json(await ai(req.user!.householdId).test(req.log));
  });

  return r;
}
