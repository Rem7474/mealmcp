/**
 * Accent colour, chosen per device. The rest of the palette is derived from --accent in index.css, so a
 * choice only has to give the accent itself and the ink that stays readable on top of it.
 */
export const ACCENTS = [
  { id: 'lavender', color: '#b9a6f0', ink: '#1a1230' },
  { id: 'sage', color: '#a8d672', ink: '#13200a' },
  { id: 'tomato', color: '#ef8354', ink: '#1d0f08' },
  { id: 'ochre', color: '#e8b24a', ink: '#241a05' },
  { id: 'sky', color: '#7cc4e8', ink: '#08202b' },
  { id: 'rose', color: '#f09bb5', ink: '#2b0f19' },
] as const;

export type AccentId = (typeof ACCENTS)[number]['id'];

const STORAGE_KEY = 'mealmcp.accent';
const DEFAULT: AccentId = 'lavender';

const isAccent = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v);

export function savedAccent(): AccentId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isAccent(v)) return v;
  } catch {
    /* storage unavailable: the default accent */
  }
  return DEFAULT;
}

export function applyAccent(id: AccentId, persist = false) {
  const accent = ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]; // lavender, the default
  const root = document.documentElement.style;
  if (accent.id === DEFAULT) {
    root.removeProperty('--accent');
    root.removeProperty('--accent-ink');
  } else {
    root.setProperty('--accent', accent.color);
    root.setProperty('--accent-ink', accent.ink);
  }
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* not persisted: still applies to this visit */
    }
  }
}
