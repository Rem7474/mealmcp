import type { z } from 'zod';
import type { LlmConfig } from '../config.js';
import { TooManyRequestsError } from '../domain/errors.js';

/** Something is wrong with the AI server or its answer. The message is safe to show; the cause goes to the logs. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** `yes` and `no` come from the server; `unknown` is never treated as `no`. */
export type Capability = 'yes' | 'no' | 'unknown';

export interface ModelInfo {
  id: string;
  vision: Capability;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Base64 data URLs (data:image/jpeg;base64,...), only for a vision model. */
  images?: string[];
}

type Fetch = typeof fetch;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The server root without the /v1 suffix, where the native (non OpenAI) endpoints of Ollama, LM Studio and llama.cpp live. */
const rootOf = (base: URL) => {
  const root = new URL(base);
  root.pathname = root.pathname.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  return root.href.replace(/\/+$/, '');
};

/** A model can answer in a fenced block or add words around the JSON: take the first object or array. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1] ?? text;
  const start = fenced.search(/[[{]/);
  if (start < 0) throw new AiError('The model did not answer with JSON');
  const open = fenced[start];
  const close = open === '{' ? '}' : ']';
  const end = fenced.lastIndexOf(close);
  if (end <= start) throw new AiError('The model did not answer with JSON');
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch (err) {
    throw new AiError('The model answered with invalid JSON', err);
  }
}

/** Runs at most `max` jobs at once, the others wait their turn. */
function createQueue(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (running >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
      return await job();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

/**
 * One client for any OpenAI-compatible server (Ollama, LM Studio, llama.cpp...). It only sends text and images in and
 * reads text out: no tools, no fetching. The address comes from the server's own configuration, never from a user.
 */
export function createLlmClient(config: LlmConfig, fetchImpl: Fetch = fetch) {
  const base = config.baseUrl;
  const queue = createQueue(config.maxConcurrent);
  const busy = new Set<number>();
  let cached: { at: number; models: ModelInfo[] } | null = null;

  const call = async (url: string, init: RequestInit = {}): Promise<unknown> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    };
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs) });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new AiError(timedOut ? 'The AI server took too long to answer' : 'The AI server cannot be reached', err);
    }
    if (!res.ok) throw new AiError(`The AI server answered with an error (${res.status})`);
    try {
      return await res.json();
    } catch (err) {
      throw new AiError('The AI server answered with something that is not JSON', err);
    }
  };

  const client = {
    get enabled() {
      return base !== null;
    },
    get config() {
      return config;
    },

    /** Model ids the server lists (`GET /v1/models`). */
    async listIds(): Promise<string[]> {
      if (!base) throw new AiError('The AI server is not configured');
      const body = await call(`${base.href}/models`);
      const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
      return data.flatMap((m) => (isRecord(m) && typeof m.id === 'string' ? [m.id] : []));
    },

    /**
     * Whether a model reads images. Each server family reports it in its own place; anything not recognised is
     * `unknown`, and `LLM_VISION` overrides what was found.
     */
    async visionOf(model: string): Promise<Capability> {
      if (config.vision === 'true') return 'yes';
      if (config.vision === 'false') return 'no';
      if (!base) return 'unknown';
      const root = rootOf(base);
      // Ollama: POST /api/show lists capabilities (completion, vision, tools...).
      try {
        const shown = await call(`${root}/api/show`, { method: 'POST', body: JSON.stringify({ model }) });
        if (isRecord(shown) && Array.isArray(shown.capabilities)) return shown.capabilities.includes('vision') ? 'yes' : 'no';
      } catch {
        /* not Ollama */
      }
      // LM Studio: GET /api/v0/models gives each model a type (llm, vlm, embeddings).
      try {
        const listed = await call(`${root}/api/v0/models`);
        const entries = isRecord(listed) && Array.isArray(listed.data) ? listed.data : [];
        const entry = entries.find((m) => isRecord(m) && m.id === model);
        if (isRecord(entry) && typeof entry.type === 'string') return entry.type === 'vlm' ? 'yes' : 'no';
      } catch {
        /* not LM Studio */
      }
      // llama.cpp serves one model and reports its modalities on /props.
      try {
        const props = await call(`${root}/props`);
        if (isRecord(props) && isRecord(props.modalities) && typeof props.modalities.vision === 'boolean')
          return props.modalities.vision ? 'yes' : 'no';
      } catch {
        /* not llama.cpp */
      }
      return 'unknown';
    },

    async models(): Promise<ModelInfo[]> {
      const ids = await client.listIds();
      return Promise.all(ids.map(async (id) => ({ id, vision: await client.visionOf(id) })));
    },

    /** The same list, kept for a short while: the settings screen and the status check ask often. */
    async cachedModels(ttlMs = 30_000): Promise<ModelInfo[]> {
      if (cached && Date.now() - cached.at < ttlMs) return cached.models;
      const models = await client.models();
      cached = { at: Date.now(), models };
      return models;
    },

    /**
     * One chat completion. A household runs one job at a time and the server runs `maxConcurrent` in all, because local
     * inference is expensive.
     */
    async chat(args: { household: number; model: string; messages: ChatMessage[]; json?: boolean }): Promise<string> {
      if (!base) throw new AiError('The AI server is not configured');
      if (busy.has(args.household)) throw new TooManyRequestsError('An AI request is already running for your household');
      busy.add(args.household);
      try {
        return await queue(async () => {
          const body = {
            model: args.model,
            stream: false,
            temperature: 0.2,
            ...(args.json ? { response_format: { type: 'json_object' } } : {}),
            messages: args.messages.map((m) => ({
              role: m.role,
              content: m.images?.length
                ? [{ type: 'text', text: m.content }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))]
                : m.content,
            })),
          };
          const out = await call(`${base.href}/chat/completions`, { method: 'POST', body: JSON.stringify(body) });
          const content =
            isRecord(out) && Array.isArray(out.choices) && isRecord(out.choices[0]) && isRecord(out.choices[0].message)
              ? out.choices[0].message.content
              : undefined;
          if (typeof content !== 'string' || content.trim() === '') throw new AiError('The model gave an empty answer');
          return content;
        });
      } finally {
        busy.delete(args.household);
      }
    },

    /**
     * Asks for JSON and checks it against a schema. A model that does not honour JSON mode, or that gets a field wrong,
     * gets one more try with the problem spelled out; after that the caller gets an error, never half-valid data.
     */
    async json<S extends z.ZodType>(args: { household: number; model: string; messages: ChatMessage[] }, schema: S): Promise<z.output<S>> {
      let messages = args.messages;
      let lastProblem = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const text = await client.chat({ ...args, messages, json: true });
        try {
          const parsed = schema.safeParse(extractJson(text));
          if (parsed.success) return parsed.data;
          lastProblem = parsed.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
        } catch (err) {
          if (!(err instanceof AiError)) throw err;
          lastProblem = err.message;
        }
        messages = [
          ...args.messages,
          { role: 'assistant', content: text.slice(0, 4000) },
          { role: 'user', content: `That answer was not valid (${lastProblem}). Answer again with only the corrected JSON.` },
        ];
      }
      throw new AiError(`The model did not give a usable answer (${lastProblem})`);
    },
  };
  return client;
}

export type LlmClient = ReturnType<typeof createLlmClient>;
