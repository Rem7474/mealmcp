import { z } from 'zod';
import { AiError, type Capability, type LlmClient, type ModelInfo } from '../ai/client.js';
import { ValidationError } from '../domain/errors.js';
import type { SettingsService } from './settings.js';

/** A 1x1 PNG: enough to learn whether the server accepts an image at all. */
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const aiModelChoice = z.object({
  model: z.string().trim().min(1).max(200).nullable().optional(),
  visionModel: z.string().trim().min(1).max(200).nullable().optional(),
});

export interface AiStatus {
  /** The deployer set LLM_BASE_URL. */
  enabled: boolean;
  /** The server answered the last model listing. */
  reachable: boolean;
  textModel: string | null;
  /** The model used for images, when there is one. */
  visionModel: string | null;
  /** Can this household use free text with a model? */
  text: boolean;
  /** Can it send images? `unknown` is shown as possible and left to the test. */
  vision: Capability;
}

/**
 * What the household can do with the AI server: which models it uses and whether the server is usable.
 * The server address and key are global (the deployer's); only the model choice belongs to a household.
 */
export function createAiService(llm: LlmClient, settings: SettingsService, household: number) {
  const chosen = () => {
    const ai = settings.get().ai ?? {};
    const defaults = llm.config;
    const textModel = ai.model ?? defaults.model ?? null;
    return { textModel, visionModel: ai.visionModel ?? defaults.visionModel ?? null };
  };

  const svc = {
    /** A pure read apart from the (cached) call to the model server. Never throws: a down server is a status. */
    async status(): Promise<AiStatus> {
      const { textModel, visionModel } = chosen();
      const off: AiStatus = { enabled: false, reachable: false, textModel, visionModel, text: false, vision: 'no' };
      if (!llm.enabled) return off;
      let models: ModelInfo[];
      try {
        models = await llm.cachedModels();
      } catch {
        return { ...off, enabled: true };
      }
      const has = (id: string | null) => id !== null && models.some((m) => m.id === id);
      const text = has(textModel);
      const visionId = visionModel ?? textModel;
      const vision: Capability = !has(visionId) ? 'no' : (models.find((m) => m.id === visionId)?.vision ?? 'unknown');
      return { enabled: true, reachable: true, textModel, visionModel: visionModel ?? null, text, vision };
    },

    async models(): Promise<ModelInfo[]> {
      return llm.enabled ? llm.cachedModels() : [];
    },

    /** The owner picks from what the server lists: a typed name is refused. `null` clears a choice. */
    async choose(input: z.input<typeof aiModelChoice>) {
      const pick = aiModelChoice.parse(input);
      const listed = await llm.cachedModels().catch(() => {
        throw new ValidationError('The AI server cannot be reached, so models cannot be listed');
      });
      for (const name of [pick.model, pick.visionModel])
        if (name && !listed.some((m) => m.id === name)) throw new ValidationError('That model is not offered by the AI server');
      const current = settings.get().ai ?? {};
      const next = { ...current };
      if (pick.model === null) delete next.model;
      else if (pick.model !== undefined) next.model = pick.model;
      if (pick.visionModel === null) delete next.visionModel;
      else if (pick.visionModel !== undefined) next.visionModel = pick.visionModel;
      settings.set({ ai: next });
      return svc.status();
    },

    /** A real round trip: model present, valid JSON back, and an image accepted when vision is claimed. */
    async test(log?: { warn: (message: string, fields?: Record<string, unknown>) => void }) {
      const { textModel, visionModel } = chosen();
      const result = { reachable: false, model: false, json: false, vision: 'skipped' as 'skipped' | 'ok' | 'failed' };
      if (!llm.enabled || !textModel) return result;
      try {
        const ids = await llm.listIds();
        result.reachable = true;
        result.model = ids.includes(textModel);
        if (!result.model) return result;
        const answer = await llm.json(
          {
            household,
            model: textModel,
            messages: [{ role: 'user', content: 'Reply with the JSON object {"ok": true} and nothing else.' }],
          },
          z.object({ ok: z.boolean() }),
        );
        result.json = answer.ok;
      } catch (err) {
        log?.warn('AI test failed', { err: err instanceof AiError ? (err.cause ?? err) : err });
        return result;
      }
      const imageModel = visionModel ?? textModel;
      if ((await llm.visionOf(imageModel)) !== 'no') {
        try {
          await llm.chat({
            household,
            model: imageModel,
            messages: [{ role: 'user', content: 'What colour is this image? Answer in one word.', images: [TINY_PNG] }],
          });
          result.vision = 'ok';
        } catch (err) {
          log?.warn('AI vision test failed', { err: err instanceof AiError ? (err.cause ?? err) : err });
          result.vision = 'failed';
        }
      }
      return result;
    },
  };
  return svc;
}

export type AiService = ReturnType<typeof createAiService>;
