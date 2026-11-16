import express, { Router } from 'express';
import type { LlmClient } from '../ai/client.js';
import { sessionOnly } from '../auth/http.js';
import { createRateLimiter } from '../auth/rateLimit.js';
import type { Db } from '../db/index.js';
import { ForbiddenError, ValidationError } from '../domain/errors.js';
import { aiChat, aiWeekPlanStart, purchaseText } from '../domain/schemas.js';
import { createAiService } from '../services/ai.js';
import { createAiChat } from '../services/aiChat.js';
import { createAiPurchase } from '../services/aiPurchase.js';
import { createAiWeekPlan } from '../services/aiWeekPlan.js';
import { createServices } from '../services/index.js';
import { MAX_RECEIPT_BYTES, pdfText, RECEIPT_MIME, sniff } from '../services/receipt.js';

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

  // A conversation about the household's own data. Read only: it answers in text and writes nothing; nothing is kept.
  r.post('/ai/chat', sessionOnly, async (req, res) => {
    const { householdId } = req.user!;
    limit.hit(`chat:${householdId}`);
    res.json(await createAiChat(llm, ai(householdId), createServices(db, householdId), householdId).reply(aiChat.parse(req.body)));
  });

  // The same review screen as the typed list, with the model reading the sentences.
  r.post('/shopping/from-text/ai', sessionOnly, async (req, res) => {
    const { householdId } = req.user!;
    limit.hit(`purchase:${householdId}`);
    const services = createServices(db, householdId);
    res.json(await createAiPurchase(llm, ai(householdId), services.purchase, householdId).parse(purchaseText.parse(req.body).text));
  });

  // A receipt, sent as the raw file (a PDF or a picture). Read in memory and never stored; the answer is the same list
  // to review as for typed text. A PDF goes through its text layer; a scanned PDF must be sent as a picture instead.
  r.post(
    '/shopping/receipt',
    sessionOnly,
    express.raw({ type: Object.values(RECEIPT_MIME), limit: MAX_RECEIPT_BYTES }),
    async (req, res) => {
      const { householdId } = req.user!;
      limit.hit(`receipt:${householdId}`);
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0)
        throw new ValidationError('Send a PDF or a picture (JPEG, PNG or WebP) as the request body');
      const kind = sniff(body);
      if (!kind || req.headers['content-type']?.split(';')[0] !== RECEIPT_MIME[kind])
        throw new ValidationError('That file is not a PDF or a JPEG, PNG or WebP picture');
      const reader = createAiPurchase(llm, ai(householdId), createServices(db, householdId).purchase, householdId);
      if (kind === 'pdf') {
        const read = await pdfText(body);
        if ('scan' in read) {
          res.status(422).json({ error: 'This PDF has no text, it is a scan: send a photo of it instead', scan: true });
          return;
        }
        res.json(await reader.receiptText(read.text));
        return;
      }
      res.json(await reader.receiptPhoto(`data:${RECEIPT_MIME[kind]};base64,${body.toString('base64')}`));
    },
  );

  // The AI plan answers at once with the rules' plan, then fills the slots in the background: the page polls GET /plan/week/:id.
  r.post('/plan/week/ai', sessionOnly, async (req, res) => {
    const { householdId, id } = req.user!;
    limit.hit(`plan:${householdId}`);
    const services = createServices(db, householdId);
    const { plan } = await createAiWeekPlan(llm, ai(householdId), services, householdId).start(
      aiWeekPlanStart.parse(req.body),
      id,
      req.log,
    );
    res.status(201).json(plan);
  });

  return r;
}
