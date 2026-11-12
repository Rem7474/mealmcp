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
  };
}

export const isSecure = (config: Config) => config.publicUrl.protocol === 'https:';
