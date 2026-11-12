import type { Server } from 'node:http';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { createLogger, loggerFor } from './logger.js';
import { VERSION } from './version.js';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (err) {
  // The logger needs the config, so a bad config is reported plainly (and as JSON-safe text) before exiting.
  const bootLogger = createLogger({ level: 'error', format: 'pretty' });
  bootLogger.error(err instanceof ConfigError ? err.message : 'Cannot read the configuration', err instanceof ConfigError ? {} : { err });
  process.exit(1);
}

const logger = loggerFor(config);
const db = createDb(config.databasePath);
const server: Server = createApp(db, config, logger).listen(config.port, () => {
  logger.info('MealMCP started', {
    version: VERSION,
    url: config.publicUrl.href,
    port: config.port,
    mcp: '/mcp',
    logLevel: config.logLevel,
  });
});

server.on('error', (err) => {
  logger.error('Cannot listen', { err, port: config.port });
  process.exit(1);
});

// Docker stops a container with SIGTERM: stop taking connections, let the database flush its WAL, then leave.
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info('shutting down', { signal });
  // Open event streams (SSE) never end by themselves: cut them so close() can complete.
  server.closeAllConnections?.();
  const force = setTimeout(() => {
    logger.error('shutdown timed out, exiting');
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(() => {
    try {
      db.$client.close();
    } catch (err) {
      logger.error('error while closing the database', { err });
    }
    logger.info('stopped');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error('unhandled rejection', { err }));
process.on('uncaughtException', (err) => {
  logger.error('uncaught exception', { err });
  process.exit(1);
});
