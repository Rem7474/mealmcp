import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';

const config = loadConfig();
const db = createDb(config.databasePath);

createApp(db, config).listen(config.port, () => {
  console.log(`MealMCP listening on ${config.publicUrl.href} (port ${config.port}, MCP endpoint: /mcp)`);
});
