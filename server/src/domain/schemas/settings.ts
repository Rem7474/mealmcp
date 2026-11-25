import { householdSettings } from '../settings.js';

/** What an API or MCP caller may change: the AI model is the owner's choice, made through its own route. */
export const settingsSet = householdSettings.omit({ ai: true });
