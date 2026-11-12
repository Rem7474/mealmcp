import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Config, LogLevel } from './config.js';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

type Fields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  /** A logger that adds `fields` to every line (a request id, a component name...). */
  child(fields: Fields): Logger;
}

/** Keys whose values must never reach the logs, whatever calls the logger. */
const SECRET = /pass(word)?|token|secret|authorization|cookie|code(_verifier)?$|client_secret/i;

/** Errors become plain objects, secrets are masked, and long strings are cut. */
function clean(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (value === null || typeof value !== 'object') return value;
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1));
  const out: Fields = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET.test(k) ? '[redacted]' : clean(v, depth + 1);
  return out;
}

interface Options {
  level: LogLevel;
  format: 'json' | 'pretty';
  /** Where lines go; stdout for info and below, stderr for warnings and errors. Replaceable in tests. */
  write?: (level: Exclude<LogLevel, 'silent'>, line: string) => void;
}

const defaultWrite: NonNullable<Options['write']> = (level, line) =>
  void (level === 'warn' || level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);

export function createLogger({ level, format, write = defaultWrite }: Options, bindings: Fields = {}): Logger {
  const emit = (lvl: Exclude<LogLevel, 'silent'>, msg: string, fields: Fields = {}) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const time = new Date().toISOString();
    const data = clean({ ...bindings, ...fields }) as Fields;
    if (format === 'json') return write(lvl, JSON.stringify({ time, level: lvl, msg, ...data }));
    const extra = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
    write(lvl, `${time} ${lvl.toUpperCase().padEnd(5)} ${msg}${extra}`);
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger({ level, format, write }, { ...bindings, ...fields }),
  };
}

export const loggerFor = (config: Config, write?: Options['write']) =>
  createLogger({ level: config.logLevel, format: config.logFormat, write });

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlates the lines logged for one request (also sent back as `X-Request-Id`). */
    id?: string;
    log?: Logger;
  }
}

/** Logs one line per request (method, route, status, duration, user) and gives handlers `req.log`. */
export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    // The health check is polled constantly: keep it out of the logs unless debugging.
    const quiet = req.path === '/health';
    const supplied = req.headers['x-request-id'];
    req.id = typeof supplied === 'string' && /^[\w-]{8,64}$/.test(supplied) ? supplied : randomUUID();
    req.log = logger.child({ reqId: req.id });
    res.setHeader('X-Request-Id', req.id);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const status = res.statusCode;
      const lvl = status >= 500 ? 'error' : status >= 400 ? 'warn' : quiet ? 'debug' : 'info';
      req.log![lvl]('request', {
        method: req.method,
        // The path without its query string, which can carry search text.
        path: req.originalUrl.split('?')[0],
        status,
        ms: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100,
        ip: req.ip,
        userId: req.user?.id,
      });
    });
    next();
  };
}
