import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The app version, read from server/package.json (found from both src/ in dev and dist/ once built). */
export const VERSION: string = (() => {
  try {
    const file = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json');
    return (JSON.parse(readFileSync(file, 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
