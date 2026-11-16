import { z } from 'zod';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  port: number;
  databasePath: string;
  /** Public origin of the app (no path), used for OAuth metadata, redirects and cookie security. */
  publicUrl: URL;
  /** When false, only the very first account and invited people can register. */
  allowRegistration: boolean;
  /** Express "trust proxy" value: number of reverse-proxy hops in front of the app. */
  trustProxy: number;
  /** Minimum level written to the logs. */
  logLevel: LogLevel;
  /** `json` (one object per line, for log collectors) or `pretty` (readable, for a terminal). */
  logFormat: 'json' | 'pretty';
  /** The optional local AI server (any OpenAI-compatible one).  null means the AI features are off. */
  llm: LlmConfig;
}

export interface LlmConfig {
  /** Root of the OpenAI-compatible API, normally ending in /v1, e.g. http://localhost:11434/v1. Set by whoever deploys the server. */
  baseUrl: URL | null;
  apiKey?: string;
  /** Defaults used when a household has not chosen a model. */
  model?: string;
  visionModel?: string;
  /** "auto" trusts what the server reports about a model, true/false overrides it. */
  vision: 'auto' | 'true' | 'false';
  timeoutMs: number;
  /** How many requests may run at once on the model server, all households together. */
  maxConcurrent: number;
}

/** Raised when the environment is unusable; carries one readable line per problem. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** An unset or empty variable counts as absent, so `PUBLIC_URL=` in a .env file falls back to the default. */
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const flag = (name: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? blank(v.trim().toLowerCase()) : v),
    z.enum(['true', 'false'], { message: `${name} must be "true" or "false"` }).default('false'),
  );

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const schema = z.object({
  PORT: z.preprocess(blank, z.coerce.number({ message: 'PORT must be a number' }).int().min(1).max(65535).default(3000)),
  PUBLIC_URL: z.preprocess(
    blank,
    z.string().refine(isHttpUrl, 'PUBLIC_URL must be an absolute http(s) URL such as https://meals.example.com').optional(),
  ),
  DATABASE_PATH: z.preprocess(blank, z.string().default('./data/mealmcp.db')),
  ALLOW_REGISTRATION: flag('ALLOW_REGISTRATION'),
  TRUST_PROXY: z.preprocess(blank, z.coerce.number({ message: 'TRUST_PROXY must be a number' }).int().min(0).max(10).default(0)),
  LOG_LEVEL: z.preprocess(
    (v) => (typeof v === 'string' ? blank(v.trim().toLowerCase()) : v),
    z.enum(LOG_LEVELS, { message: `LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}` }).default('info'),
  ),
  LOG_FORMAT: z.preprocess(
    (v) => (typeof v === 'string' ? blank(v.trim().toLowerCase()) : v),
    z.enum(['json', 'pretty'], { message: 'LOG_FORMAT must be "json" or "pretty"' }).optional(),
  ),
  LLM_BASE_URL: z.preprocess(
    blank,
    z.string().refine(isHttpUrl, 'LLM_BASE_URL must be an absolute http(s) URL such as http://localhost:11434/v1').optional(),
  ),
  LLM_API_KEY: z.preprocess(blank, z.string().optional()),
  LLM_MODEL: z.preprocess(blank, z.string().max(200).optional()),
  LLM_VISION_MODEL: z.preprocess(blank, z.string().max(200).optional()),
  LLM_VISION: z.preprocess(
    (v) => (typeof v === 'string' ? blank(v.trim().toLowerCase()) : v),
    z.enum(['auto', 'true', 'false'], { message: 'LLM_VISION must be "auto", "true" or "false"' }).default('auto'),
  ),
  LLM_TIMEOUT_MS: z.preprocess(
    blank,
    z.coerce.number({ message: 'LLM_TIMEOUT_MS must be a number' }).int().min(1000).max(1_800_000).default(120_000),
  ),
  LLM_MAX_CONCURRENT: z.preprocess(
    blank,
    z.coerce.number({ message: 'LLM_MAX_CONCURRENT must be a number' }).int().min(1).max(16).default(2),
  ),
  NODE_ENV: z.string().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => i.message));
  }
  const e = parsed.data;
  const publicUrl = new URL(e.PUBLIC_URL ?? `http://localhost:${e.PORT}`);
  publicUrl.pathname = '/';
  publicUrl.search = '';
  publicUrl.hash = '';
  return {
    port: e.PORT,
    databasePath: e.DATABASE_PATH,
    publicUrl,
    allowRegistration: e.ALLOW_REGISTRATION === 'true',
    trustProxy: e.TRUST_PROXY,
    logLevel: e.LOG_LEVEL,
    // Readable by default in development, machine-readable in production.
    logFormat: e.LOG_FORMAT ?? (e.NODE_ENV === 'production' ? 'json' : 'pretty'),
    llm: {
      baseUrl: e.LLM_BASE_URL ? new URL(e.LLM_BASE_URL.replace(/\/+$/, '')) : null,
      apiKey: e.LLM_API_KEY,
      model: e.LLM_MODEL,
      visionModel: e.LLM_VISION_MODEL,
      vision: e.LLM_VISION,
      timeoutMs: e.LLM_TIMEOUT_MS,
      maxConcurrent: e.LLM_MAX_CONCURRENT,
    },
  };
}

export const isSecure = (config: Config) => config.publicUrl.protocol === 'https:';
