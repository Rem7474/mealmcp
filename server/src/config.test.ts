import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';

describe('configuration', () => {
  it('has working defaults', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      port: 3000,
      databasePath: './data/mealmcp.db',
      allowRegistration: false,
      trustProxy: 0,
      logLevel: 'info',
      logFormat: 'pretty',
    });
    expect(c.publicUrl.href).toBe('http://localhost:3000/');
  });

  it('treats empty variables (a .env with `PORT=`) as unset', () => {
    expect(loadConfig({ PORT: '', PUBLIC_URL: '', TRUST_PROXY: '', ALLOW_REGISTRATION: '' }).port).toBe(3000);
  });

  it('reads valid values, strips paths and picks json logs in production', () => {
    const c = loadConfig({
      PORT: '8080',
      PUBLIC_URL: 'https://meals.example.com/app?x=1',
      ALLOW_REGISTRATION: 'TRUE',
      TRUST_PROXY: '1',
      NODE_ENV: 'production',
      LOG_LEVEL: 'Debug',
    });
    expect(c).toMatchObject({ port: 8080, allowRegistration: true, trustProxy: 1, logFormat: 'json', logLevel: 'debug' });
    expect(c.publicUrl.href).toBe('https://meals.example.com/');
  });

  it('lists every problem at once instead of failing on the first', () => {
    try {
      loadConfig({ PORT: 'abc', PUBLIC_URL: 'meals.example.com', ALLOW_REGISTRATION: 'yes', TRUST_PROXY: '-1', LOG_LEVEL: 'loud' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const { problems } = err as ConfigError;
      expect(problems).toHaveLength(5);
      expect(problems.join('\n')).toMatch(/PORT/);
      expect(problems.join('\n')).toMatch(/PUBLIC_URL/);
      expect(problems.join('\n')).toMatch(/ALLOW_REGISTRATION/);
    }
  });

  it.each([{ PORT: '0' }, { PORT: '70000' }, { PORT: '3000.5' }, { PUBLIC_URL: 'ftp://x.test' }, { TRUST_PROXY: '99' }])(
    'rejects %o',
    (env) => {
      expect(() => loadConfig(env)).toThrow(ConfigError);
    },
  );
});

describe('logger', () => {
  const capture = (level: 'debug' | 'info' | 'warn' | 'error' | 'silent' = 'info', format: 'json' | 'pretty' = 'json') => {
    const lines: { level: string; line: string }[] = [];
    const logger: Logger = createLogger({ level, format, write: (l, line) => void lines.push({ level: l, line }) });
    return { lines, logger };
  };

  it('writes one JSON object per line with the bindings of child loggers', () => {
    const { lines, logger } = capture();
    logger.child({ reqId: 'r1' }).info('hello', { n: 2 });
    expect(JSON.parse(lines[0].line)).toMatchObject({ level: 'info', msg: 'hello', reqId: 'r1', n: 2 });
    expect(JSON.parse(lines[0].line).time).toMatch(/^\d{4}-/);
  });

  it('filters by level', () => {
    const { lines, logger } = capture('warn');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(lines.map((l) => l.level)).toEqual(['warn', 'error']);
    const silent = capture('silent');
    silent.logger.error('nothing');
    expect(silent.lines).toHaveLength(0);
  });

  it('masks secrets wherever they sit, and serialises errors', () => {
    const { lines, logger } = capture();
    logger.info('x', {
      password: 'hunter2',
      nested: { access_token: 'abc', authorization: 'Bearer zzz', fine: 1 },
      err: new Error('boom'),
    });
    const out = JSON.parse(lines[0].line);
    expect(out.password).toBe('[redacted]');
    expect(out.nested).toEqual({ access_token: '[redacted]', authorization: '[redacted]', fine: 1 });
    expect(out.err).toMatchObject({ name: 'Error', message: 'boom' });
    expect(lines[0].line).not.toContain('hunter2');
  });

  it('has a readable format for terminals', () => {
    const { lines, logger } = capture('info', 'pretty');
    logger.warn('careful', { a: 1 });
    expect(lines[0].line).toMatch(/WARN\s+careful \{"a":1\}$/);
  });
});
